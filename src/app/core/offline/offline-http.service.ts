import { Injectable, inject, signal, effect } from '@angular/core';
import {
  HttpClient, HttpContext, HttpContextToken, HttpErrorResponse, HttpEvent, HttpHandlerFn,
  HttpHeaders, HttpRequest, HttpResponse,
} from '@angular/common/http';
import { Observable, catchError, from, of, switchMap, tap, throwError } from 'rxjs';
import Dexie, { Table } from 'dexie';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

/** Marca las solicitudes que el propio sincronizador envía, para no volver a encolarlas. */
export const SKIP_OFFLINE = new HttpContextToken<boolean>(() => false);

export interface CachedResponse { key: string; body: unknown; savedAt: string; }
export interface OutboxEntry {
  seq?: number;
  idempotencyKey: string;
  method: string;
  path: string;             // relativo a environment.apiUrl, con query
  body: unknown;
  tempId: number | null;    // id provisional negativo para un POST que crea un registro
  label: string;
  status: 'pending' | 'failed';
  error: string | null;
  createdAt: string;
}

class OfflineHttpDatabase extends Dexie {
  responses!: Table<CachedResponse, string>;
  outbox!: Table<OutboxEntry, number>;
  idmap!: Table<{ tempId: number; realId: number }, number>;
  constructor(userId: number) {
    super(`FashionStoreHttp_u${userId}`);
    this.version(1).stores({ responses: 'key', outbox: '++seq, &idempotencyKey, status', idmap: 'tempId' });
  }
}

// Operaciones que nunca se encolan: dinero en línea, credenciales, IA, archivos y el flujo
// de caja offline que ya tiene su propia cola (/sync/operations).
const ONLINE_ONLY = [
  /^\/auth\//, /^\/payments\//, /^\/orders(\/|$|\?)/, /^\/sync\//, /^\/ai(\/|$)/, /^\/analytics\//,
  /^\/reports\//, /^\/saas\/my-subscription\/(checkout|payments|change-plan|renew)/, /tryon/, /upload/,
];
const OFFLINE_MESSAGE = 'Sin conexión: esta acción requiere internet (pagos, IA, inicio de sesión o archivos).';
const NOT_CACHED = 'Sin conexión: esta información todavía no se guardó en el dispositivo. Ábrela una vez con internet.';

@Injectable({ providedIn: 'root' })
export class OfflineHttpService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private dbs = new Map<number, OfflineHttpDatabase>();
  private running = false;
  readonly pending = signal(0);
  readonly failed = signal<OutboxEntry[]>([]);
  readonly syncing = signal(false);
  /** false cuando hay red pero el servidor no responde (p. ej. VM caída o sin internet real). */
  readonly serverReachable = signal(true);

  constructor() {
    // Al cambiar de usuario: recalcular contadores y sincronizar (fuera del efecto para no escribir señales en él).
    effect(() => { this.auth.currentUser(); queueMicrotask(() => this.refresh().then(() => this.sync())); });
    window.addEventListener('online', () => this.sync());
    setInterval(() => this.sync(), 30000);
  }

  // ─── Contexto ──────────────────────────────────────────────────────────────
  private db(): OfflineHttpDatabase | null {
    const id = this.auth.currentUser()?.id;
    if (!id || !this.auth.getToken()) return null;
    let db = this.dbs.get(id);
    if (!db) { db = new OfflineHttpDatabase(id); this.dbs.set(id, db); }
    return db;
  }

  private relative(url: string): string | null {
    const base = environment.apiUrl.replace(/\/$/, '');
    if (url.startsWith(base)) return url.slice(base.length) || '/';
    try {
      const absolute = new URL(base, window.location.origin).href.replace(/\/$/, '');
      if (url.startsWith(absolute)) return url.slice(absolute.length) || '/';
    } catch { /* base no es una URL */ }
    return null;
  }

  handles(req: HttpRequest<unknown>): boolean {
    return !req.context.get(SKIP_OFFLINE) && this.relative(req.urlWithParams) !== null && !!this.db();
  }

  private queueable(req: HttpRequest<unknown>, path: string): boolean {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return false;
    if (req.body instanceof FormData || req.body instanceof Blob || req.body instanceof ArrayBuffer) return false;
    if (typeof req.body === 'string') return false;  // formularios urlencoded (login)
    return !ONLINE_ONLY.some(rule => rule.test(path));
  }

  private offlineError(detail: string, url: string) {
    return new HttpErrorResponse({ status: 0, statusText: 'Offline', url, error: { detail } });
  }

  // ─── Lecturas ──────────────────────────────────────────────────────────────
  get(req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
    // Información confidencial o de administración: nunca se guarda en el dispositivo.
    if (/^\/(audit|backups)(\/|\?|$)/.test(this.relative(req.urlWithParams) || '')) return next(req);
    const db = this.db()!;
    const key = this.relative(req.urlWithParams)!;
    const fromCache = () => from(db.responses.get(key)).pipe(switchMap(row => row
      ? from(this.overlay(db, key, row.body)).pipe(switchMap(body => of(new HttpResponse({
          status: 200, url: req.urlWithParams, body,
          headers: new HttpHeaders({ 'X-Offline-Cache': row.savedAt }) }))))
      : throwError(() => this.offlineError(NOT_CACHED, req.urlWithParams))));
    if (!navigator.onLine) return fromCache();
    return next(req).pipe(
      tap(event => { if (event instanceof HttpResponse) this.serverReachable.set(true); }),
      switchMap(event => {
        if (!(event instanceof HttpResponse) || event.status !== 200 || event.body === null || typeof event.body !== 'object') return of(event);
        return from(db.responses.put({ key, body: event.body, savedAt: new Date().toISOString() })
          .catch(() => undefined)
          .then(() => this.overlay(db, key, event.body))).pipe(switchMap(body => of(event.clone({ body }))));
      }),
      catchError(err => {
        if (err instanceof HttpErrorResponse && err.status === 0) { this.serverReachable.set(false); return fromCache(); }
        this.serverReachable.set(true);
        return throwError(() => err);
      }),
    );
  }

  /** Aplica los cambios aún no sincronizados sobre una respuesta (lista o detalle) para que se vean al instante. */
  private async overlay(db: OfflineHttpDatabase, key: string, body: unknown): Promise<unknown> {
    const entries = await db.outbox.where('status').equals('pending').sortBy('seq');
    if (!entries.length) return body;
    const path = key.split('?')[0];
    let result: any = Array.isArray(body) ? [...body] : (body && typeof body === 'object' ? { ...body as object } : body);
    for (const e of entries) {
      const ePath = e.path.split('?')[0];
      const parent = ePath.replace(/\/[^/]+$/, '');
      const targetId = ePath.split('/').pop();
      if (Array.isArray(result)) {
        if (e.method === 'POST' && ePath === path && e.body && typeof e.body === 'object') {
          result.push({ is_active: true, ...(e.body as object), id: e.tempId, _pending: true });
        } else if (parent === path && (e.method === 'PATCH' || e.method === 'PUT')) {
          result = result.map((item: any) => String(item?.id) === targetId ? { ...item, ...(e.body as object), _pending: true } : item);
        } else if (parent === path && e.method === 'DELETE') {
          result = result.filter((item: any) => String(item?.id) !== targetId);
        }
      } else if (result && typeof result === 'object' && ePath === path && (e.method === 'PATCH' || e.method === 'PUT')) {
        result = { ...result, ...(e.body as object), _pending: true };
      }
    }
    return result;
  }

  // ─── Escrituras ────────────────────────────────────────────────────────────
  mutate(req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
    const path = this.relative(req.urlWithParams)!;
    if (!this.queueable(req, path)) {
      return navigator.onLine ? next(req) : throwError(() => this.offlineError(OFFLINE_MESSAGE, req.urlWithParams));
    }
    // La misma clave acompaña al intento en línea y a los reintentos: el servidor nunca la aplica dos veces.
    const idempotencyKey = `offline-${crypto.randomUUID()}`;
    const keyed = req.clone({ setHeaders: { 'Idempotency-Key': idempotencyKey } });
    if (!navigator.onLine) return this.enqueue(keyed, path, idempotencyKey);
    return next(keyed).pipe(
      tap(event => { if (event instanceof HttpResponse) this.serverReachable.set(true); }),
      catchError(err => {
        if (err instanceof HttpErrorResponse && err.status === 0) { this.serverReachable.set(false); return this.enqueue(keyed, path, idempotencyKey); }
        this.serverReachable.set(true);
        return throwError(() => err);
      }));
  }

  private enqueue(req: HttpRequest<unknown>, path: string, idempotencyKey: string): Observable<HttpEvent<unknown>> {
    const db = this.db()!;
    const tempId = req.method === 'POST' ? -(Date.now() * 10 + Math.floor(Math.random() * 10)) : null;
    const entry: OutboxEntry = {
      idempotencyKey, method: req.method, path, body: req.body ?? null, tempId,
      label: `${req.method} ${path.split('?')[0]}`, status: 'pending', error: null, createdAt: new Date().toISOString(),
    };
    return from(db.outbox.add(entry)).pipe(
      tap(() => { this.refresh(); this.toast.success('Sin conexión: el cambio quedó guardado y se sincronizará al volver internet.'); }),
      switchMap(() => {
        const id = req.method === 'POST' ? tempId : Number(path.split('?')[0].split('/').pop());
        const body = req.method === 'DELETE' ? null
          : { ...(req.method === 'POST' ? { is_active: true } : {}), ...(req.body && typeof req.body === 'object' ? req.body as object : {}), id, _pending: true };
        return of(new HttpResponse({ status: 202, url: req.urlWithParams, body }));
      }),
    );
  }

  // ─── Sincronización ────────────────────────────────────────────────────────
  async refresh(): Promise<void> {
    const db = this.db();
    if (!db) { this.pending.set(0); this.failed.set([]); return; }
    this.pending.set(await db.outbox.where('status').equals('pending').count());
    this.failed.set(await db.outbox.where('status').equals('failed').sortBy('seq'));
  }

  private replaceIds(value: unknown, ids: Map<number, number>): unknown {
    if (typeof value === 'number') return ids.get(value) ?? value;
    if (Array.isArray(value)) return value.map(v => this.replaceIds(v, ids));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, this.replaceIds(v, ids)]));
    }
    return value;
  }

  async sync(): Promise<void> {
    const db = this.db();
    if (!db || this.running || !navigator.onLine) return;
    const run = async () => {
      this.running = true; this.syncing.set(true);
      let synced = 0;
      try {
        const ids = new Map((await db.idmap.toArray()).map(r => [r.tempId, r.realId]));
        const failedTemp = new Set((await db.outbox.where('status').equals('failed').toArray()).map(e => e.tempId).filter(Boolean));
        for (const entry of await db.outbox.where('status').equals('pending').sortBy('seq')) {
          const path = entry.path.replace(/-\d{12,}/g, m => String(ids.get(Number(m)) ?? m));
          const body = this.replaceIds(entry.body, ids);
          if (/-\d{12,}/.test(path) || [...failedTemp].some(t => JSON.stringify(body).includes(String(t)))) {
            await db.outbox.update(entry.seq!, { status: 'failed', error: 'Depende de otro cambio que no se pudo sincronizar.' });
            if (entry.tempId) failedTemp.add(entry.tempId);
            continue;
          }
          try {
            const res: any = await new Promise((resolve, reject) => this.http.request(entry.method, `${environment.apiUrl}${path}`, {
              body, headers: { 'Idempotency-Key': entry.idempotencyKey }, context: new HttpContext().set(SKIP_OFFLINE, true),
            }).subscribe({ next: resolve, error: reject }));
            if (entry.tempId && res && typeof res.id === 'number') {
              ids.set(entry.tempId, res.id);
              await db.idmap.put({ tempId: entry.tempId, realId: res.id });
            }
            await db.outbox.delete(entry.seq!);
            this.serverReachable.set(true);
            synced++;
          } catch (err: any) {
            const status = err?.status ?? 0;
            this.serverReachable.set(status !== 0);
            if (status === 0 || status === 401 || status === 408 || status === 429 || status >= 500) break;  // reintentar luego
            const detail = err?.error?.detail;
            await db.outbox.update(entry.seq!, {
              status: 'failed',
              error: typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d: any) => d.msg).join(', ') : `Error ${status}`,
            });
            if (entry.tempId) failedTemp.add(entry.tempId);
          }
        }
      } finally {
        this.running = false; this.syncing.set(false);
        await this.refresh();
        if (synced) this.toast.success(`${synced} cambio(s) hechos sin conexión se sincronizaron con el servidor.`);
        if (this.failed().length) this.toast.error(`${this.failed().length} cambio(s) no se pudieron sincronizar. Revísalos en el aviso superior.`);
      }
    };
    if (navigator.locks) await navigator.locks.request(`${db.name}-outbox`, { ifAvailable: true }, lock => lock ? run() : undefined);
    else await run();
  }

  async retry(entry: OutboxEntry): Promise<void> {
    const db = this.db();
    if (!db || entry.seq === undefined) return;
    await db.outbox.update(entry.seq, { status: 'pending', error: null });
    await this.refresh();
    await this.sync();
  }

  async discard(entry: OutboxEntry): Promise<void> {
    const db = this.db();
    if (!db || entry.seq === undefined) return;
    await db.outbox.delete(entry.seq);
    await this.refresh();
  }
}

export const offlineInterceptor = (req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
  const offline = inject(OfflineHttpService);
  if (!offline.handles(req)) return next(req);
  return req.method === 'GET' ? offline.get(req, next) : offline.mutate(req, next);
};
