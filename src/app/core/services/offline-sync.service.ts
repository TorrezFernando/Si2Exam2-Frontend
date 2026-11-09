import { Injectable, inject, signal, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AppDatabase } from '../db/app-database';
import { OfflineStore } from '../db/offline-store';
import { NetworkService } from './network.service';
import { AuthService } from './auth.service';
import { LocalProduct, LocalSaleOperation, LocalReservationOperation, SyncBatchResponse, SyncCatalogResponse } from '../models';

type Context = {store: OfflineStore; token: string; assert: () => void};

@Injectable({providedIn: 'root'})
export class OfflineSyncService {
  private readonly http = inject(HttpClient);
  private readonly network = inject(NetworkService);
  private readonly auth = inject(AuthService);
  private readonly stores = new Map<string, OfflineStore>();
  private timer?: ReturnType<typeof setTimeout>;
  readonly isSyncing = signal(false);
  readonly pendingCount = signal(0);
  readonly lastSyncTimestamp = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.auth.currentUser();
      clearTimeout(this.timer);
      this.pendingCount.set(0);
      this.lastSyncTimestamp.set(null);
      this.refreshPendingCount().catch(() => {});
      this.automaticSync();
    });
    window.addEventListener('online', () => this.automaticSync());
    window.addEventListener('storage', event => {
      if (event.key === 'fs_access_token' || event.key === 'fs_user') {
        clearTimeout(this.timer);
        this.pendingCount.set(0);
        this.lastSyncTimestamp.set(null);
      }
    });
  }

  private context(): Context {
    const user = this.auth.currentUser();
    const token = this.auth.getToken();
    if (!user?.tenant_id || !user.id || !token || !user.is_active || this.auth.isSuperAdmin()) {
      throw new Error('Inicia sesión con una cuenta de empresa para trabajar offline.');
    }
    const tenant = user.tenant_id, owner = user.id;
    const key = `${tenant}:${owner}`;
    let store = this.stores.get(key);
    if (!store) { store = new OfflineStore(new AppDatabase(tenant, owner), tenant, owner); this.stores.set(key, store); }
    const assert = () => {
      const active = this.auth.currentUser();
      if (this.auth.getToken() !== token || active?.id !== owner || active?.tenant_id !== tenant) {
        throw new Error('La sesión cambió. Las operaciones permanecen guardadas en su cuenta original.');
      }
      // A tab can retain an old Angular profile after another tab logs in.
      const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (Number(claims.sub) !== owner || Number(claims.tenant_id) !== tenant) throw new Error('Actualiza la sesión de esta pestaña.');
    };
    assert();
    return {store, token, assert};
  }

  private async locked<T>(c: Context, action: () => Promise<T>): Promise<T> {
    if (!navigator.locks) throw new Error('El modo offline requiere HTTPS y un navegador compatible con bloqueo entre pestañas.');
    return navigator.locks.request(c.store.db.name, async () => {c.assert(); return action();});
  }

  private automaticSync() {
    this.syncBatch(undefined, false).catch(() => {});
  }

  private schedule(c: Context) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try { c.assert(); this.automaticSync(); } catch { /* Account changed. */ }
    }, 5000);
  }

  async downloadCatalog(branchId: number): Promise<SyncCatalogResponse> {
    const c = this.context();
    return this.locked(c, async () => {
      if (await c.store.pending()) await this.send(c, undefined, true);
      if (await c.store.pending()) throw new Error('Quedan operaciones pendientes; no se reemplazará su inventario local.');
      const catalog = await firstValueFrom(this.http.get<SyncCatalogResponse>(
        `${environment.apiUrl}/sync/catalog`, {params: {branch_id: branchId}, headers: {Authorization: `Bearer ${c.token}`}}));
      c.assert();
      if (catalog.branch_id !== branchId) throw new Error('Respuesta de otra sucursal.');
      await c.store.saveCatalog(catalog, c.assert);
      this.lastSyncTimestamp.set(new Date().toISOString());
      return catalog;
    });
  }

  async getLocalProducts(): Promise<LocalProduct[]> {
    const c = this.context();
    const branch = await c.store.db.branches.toCollection().first();
    const products = await c.store.db.products.toArray();
    const variants = await c.store.db.variants.toArray();
    c.assert();
    return products.map(p => ({...p, variants: variants.filter(v => v.product_id === p.id).map(v => ({...v,
      price_override: v.price, quantity: v.stock, inventories: [{branch_id: branch?.id, stock: v.stock}]}))}));
  }

  async getLocalVariant(id: number) { const c = this.context(); const r = await c.store.db.variants.get(id); c.assert(); return r; }
  async getLocalCustomers() { const c = this.context(); const r = await c.store.db.customers.toArray(); c.assert(); return r; }
  async getLocalBranches() { const c = this.context(); const r = await c.store.db.branches.toArray(); c.assert(); return r; }
  async getLocalSales() { const c = this.context(); const r = await c.store.db.local_sales.reverse().sortBy('created_at'); c.assert(); return r; }
  async getLocalReservations() { const c = this.context(); const r = await c.store.db.local_reservations.reverse().sortBy('created_at'); c.assert(); return r; }
  async getSyncQueue() { const c = this.context(); const r = await c.store.db.sync_queue.reverse().sortBy('created_at'); c.assert(); return r; }

  private checkRecordingSession(c: Context) {
    c.assert();
    const claims = JSON.parse(atob(c.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) throw new Error('Inicia sesión nuevamente antes de registrar operaciones.');
  }

  async recordOfflineSale(sale: {branchId: number; userId?: number; customerName?: string;
    paymentMethod: string; totalAmount: number; items: {variant_id: number; quantity: number; unit_price: number; variant_name?: string; sku?: string}[]}) {
    const c = this.context(); this.checkRecordingSession(c);
    if (!this.auth.hasPermission('sales:write')) throw new Error('Se requiere permiso de caja.');
    const operation: LocalSaleOperation = {client_operation_uuid: crypto.randomUUID(), branch_id: sale.branchId,
      user_id: sale.userId, customer_name: sale.customerName, payment_method: sale.paymentMethod,
      total_amount: sale.totalAmount, items: structuredClone(sale.items), created_at: new Date().toISOString(), sync_status: 'PENDIENTE'};
    await this.locked(c, () => c.store.record('sale', operation, () => this.checkRecordingSession(c)));
    await this.refreshPendingCount(); this.automaticSync();
    return operation;
  }

  /**
   * Guarda la reserva en el dispositivo y la sincroniza cuando hay señal.
   * `clientOperationUuid` identifica el intento: si ya existe en la cola local se devuelve la misma
   * reserva sin volver a guardarla, y el servidor también la acepta una sola vez por ese id.
   */
  async recordOfflineReservation(reservation: {branchId: number; userId: number; customerName?: string;
    pickupDate?: string; notes?: string; clientOperationUuid?: string;
    items: {variant_id: number; quantity: number; unit_price?: number; variant_name?: string; sku?: string}[]}): Promise<{operation: LocalReservationOperation; duplicate: boolean}> {
    const c = this.context(); this.checkRecordingSession(c);
    if (reservation.userId !== c.store.ownerId && !this.auth.hasPermission('reservations:write')) throw new Error('No puedes reservar para otro cliente.');
    const operation: LocalReservationOperation = {client_operation_uuid: reservation.clientOperationUuid || crypto.randomUUID(), branch_id: reservation.branchId,
      user_id: reservation.userId, customer_name: reservation.customerName, pickup_date: reservation.pickupDate,
      notes: reservation.notes, items: structuredClone(reservation.items), created_at: new Date().toISOString(), sync_status: 'PENDIENTE'};
    const result = await this.locked(c, async () => {
      // Dentro del bloqueo entre pestañas: dos toques o dos pestañas no pueden guardar el mismo intento dos veces.
      const existing = await c.store.db.local_reservations.get(operation.client_operation_uuid);
      if (existing) return {operation: existing, duplicate: true};
      await c.store.record('reservation', operation, () => this.checkRecordingSession(c));
      return {operation, duplicate: false};
    });
    await this.refreshPendingCount(); this.automaticSync();
    return result;
  }

  async syncBatch(branchId?: number, force = true): Promise<SyncBatchResponse | null> {
    if (!this.network.isOnline()) return null;
    let c: Context;
    try { c = this.context(); } catch { return null; }
    return this.locked(c, async () => {
      this.isSyncing.set(true);
      try { return await this.send(c, branchId, force); }
      finally { this.isSyncing.set(false); await this.refreshPendingCount(); }
    });
  }

  private async send(c: Context, branchId?: number, force = false): Promise<SyncBatchResponse | null> {
    let last: SyncBatchResponse | null = null;
    while (true) {
      c.assert();
      const sent = await c.store.claim(branchId, force, c.assert);
      if (!sent.length) { if (await c.store.pending()) this.schedule(c); return last; }
      try {
        c.assert();
        const response = await firstValueFrom(this.http.post<SyncBatchResponse>(`${environment.apiUrl}/sync/operations`, {
          branch_id: sent[0].branch_id,
          sales: sent.filter(q => q.operation_type === 'sale').map(q => q.payload),
          reservations: sent.filter(q => q.operation_type === 'reservation').map(q => q.payload),
        }, {headers: {Authorization: `Bearer ${c.token}`}}));
        c.assert();
        await c.store.applyReceipts(sent, response, c.assert);
        last = last ? {
          total_processed: last.total_processed + response.total_processed,
          confirmed_count: last.confirmed_count + response.confirmed_count,
          conflict_count: last.conflict_count + response.conflict_count,
          receipts: [...last.receipts, ...response.receipts],
        } : response;
      } catch (error: any) {
        // This is the captured account's DB, never the next account's database.
        await c.store.failed(sent, error?.error?.detail || error?.message || 'Error de sincronización');
        if (![401, 403].includes(error?.status)) { try {c.assert(); this.schedule(c);} catch {} }
        throw error;
      }
    }
  }

  async refreshPendingCount(): Promise<number> {
    try {
      const c = this.context(); const count = await c.store.pending(); c.assert();
      const snapshot = (await c.store.db.metadata.get('snapshot'))?.value; c.assert();
      this.pendingCount.set(count);
      this.lastSyncTimestamp.set(snapshot ? new Date(snapshot.downloadedAt).toISOString() : null);
      return count;
    } catch { this.pendingCount.set(0); return 0; }
  }
}
