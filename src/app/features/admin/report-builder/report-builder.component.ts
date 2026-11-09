import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

interface Op { key: string; label: string; }
interface Column { key: string; label: string; type: 'text' | 'number' | 'date' | 'bool'; ops: Op[]; }
interface Source { key: string; label: string; columns: Column[]; }
interface Filter { column: string; op: string; value: any; }
interface Sort { column: string; direction: 'asc' | 'desc'; }
interface Template { name: string; title: string; source: string; columns: string[]; filters: Filter[]; order_by: Sort[]; limit: number; }

@Component({
  selector: 'app-report-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="content-area builder">
    <div class="page-header">
      <div>
        <h1 class="page-title">Constructor de reportes</h1>
        <p class="text-secondary">Arma tu propio reporte: elige la fuente, las columnas, los criterios de selección y el orden.
          Luego míralo en pantalla, expórtalo a Excel, PDF, HTML o CSV, o envíalo por correo.</p>
      </div>
    </div>

    <section class="card p-lg">
      <div class="grid-2">
        <label>1. Fuente de datos
          <select class="form-control" [(ngModel)]="sourceKey" (ngModelChange)="onSource()">
            <option [ngValue]="''" disabled>Selecciona…</option>
            @for (s of sources(); track s.key) { <option [ngValue]="s.key">{{ s.label }}</option> }
          </select>
        </label>
        <label>Título del reporte
          <input class="form-control" [(ngModel)]="title" maxlength="120" placeholder="Ej. Ventas mayores a Bs 100">
        </label>
      </div>
      @if (!sources().length) { <p class="text-secondary mt-sm">Tu usuario no tiene permisos sobre ninguna fuente de datos.</p> }
      <div class="templates" *ngIf="templates.length">
        <span class="text-secondary text-sm">Mis reportes guardados:</span>
        @for (t of templates; track t.name) {
          <span class="chip"><button class="link" (click)="loadTemplate(t)">{{ t.name }}</button><button class="link danger" (click)="deleteTemplate(t)" title="Eliminar">✕</button></span>
        }
      </div>
    </section>

    @if (source(); as src) {
      <section class="card p-lg">
        <h3>2. Columnas <small class="text-secondary">(marca las que quieres ver; usa ↑ ↓ para ordenarlas)</small></h3>
        <div class="columns">
          @for (c of src.columns; track c.key) {
            <label class="check"><input type="checkbox" [checked]="selected.includes(c.key)" (change)="toggle(c.key)"> {{ c.label }}</label>
          }
        </div>
        @if (selected.length) {
          <div class="order-list">
            @for (key of selected; track key; let i = $index) {
              <span class="chip">{{ i + 1 }}. {{ label(key) }}
                <button class="link" (click)="move(i, -1)" [disabled]="i === 0" title="Subir">↑</button>
                <button class="link" (click)="move(i, 1)" [disabled]="i === selected.length - 1" title="Bajar">↓</button>
              </span>
            }
          </div>
        }
      </section>

      <section class="card p-lg">
        <h3>3. Criterios de selección</h3>
        @for (f of filters; track $index; let i = $index) {
          <div class="row">
            <select class="form-control" [(ngModel)]="f.column" (ngModelChange)="f.op = opsFor(f.column)[0].key; f.value = ''">
              @for (c of src.columns; track c.key) { <option [ngValue]="c.key">{{ c.label }}</option> }
            </select>
            <select class="form-control" [(ngModel)]="f.op">
              @for (o of opsFor(f.column); track o.key) { <option [ngValue]="o.key">{{ o.label }}</option> }
            </select>
            @switch (typeOf(f.column)) {
              @case ('date') { <input class="form-control" type="date" [(ngModel)]="f.value"> }
              @case ('number') { <input class="form-control" type="number" [(ngModel)]="f.value"> }
              @case ('bool') { <select class="form-control" [(ngModel)]="f.value"><option [ngValue]="true">Sí</option><option [ngValue]="false">No</option></select> }
              @default { <input class="form-control" [(ngModel)]="f.value" placeholder="Valor"> }
            }
            <button class="btn btn-sm btn-outline" (click)="filters.splice(i, 1)">Quitar</button>
          </div>
        }
        <button class="btn btn-sm btn-outline" (click)="addFilter()">+ Agregar criterio</button>

        <h3 class="mt-md">4. Orden</h3>
        @for (o of orderBy; track $index; let i = $index) {
          <div class="row">
            <select class="form-control" [(ngModel)]="o.column">
              @for (c of src.columns; track c.key) { <option [ngValue]="c.key">{{ c.label }}</option> }
            </select>
            <select class="form-control" [(ngModel)]="o.direction">
              <option value="asc">Ascendente (A→Z, menor→mayor)</option>
              <option value="desc">Descendente (Z→A, mayor→menor)</option>
            </select>
            <button class="btn btn-sm btn-outline" (click)="orderBy.splice(i, 1)">Quitar</button>
          </div>
        }
        <button class="btn btn-sm btn-outline" (click)="addSort()">+ Agregar orden</button>

        <div class="actions">
          <label>Máximo de filas <input class="form-control small" type="number" min="1" max="5000" [(ngModel)]="limit"></label>
          <button class="btn btn-primary" (click)="run()" [disabled]="busy() || !selected.length">{{ busy() ? 'Generando…' : 'Ver reporte' }}</button>
          <button class="btn btn-outline" (click)="saveTemplate()" [disabled]="!selected.length">Guardar como plantilla</button>
        </div>
      </section>
    }

    @if (report(); as r) {
      <section class="card p-lg">
        <div class="report-head">
          <div>
            <h2>{{ r.title }}</h2>
            <p class="text-secondary text-sm">{{ r.source }} · {{ r.count }} registro(s){{ r.truncated ? ' (se alcanzó el máximo de filas)' : '' }} · {{ r.generated_at }}</p>
            @if (r.filters.length) { <p class="text-secondary text-sm">Criterios: {{ r.filters.join('; ') }}</p> }
            @if (r.order_by.length) { <p class="text-secondary text-sm">Orden: {{ r.order_by.join(', ') }}</p> }
          </div>
          <div class="exports">
            <button class="btn btn-sm btn-outline" (click)="download('xlsx')" [disabled]="busy()">Excel</button>
            <button class="btn btn-sm btn-outline" (click)="download('pdf')" [disabled]="busy()">PDF</button>
            <button class="btn btn-sm btn-outline" (click)="download('html')" [disabled]="busy()">HTML</button>
            <button class="btn btn-sm btn-outline" (click)="download('csv')" [disabled]="busy()">CSV</button>
          </div>
        </div>
        <div class="email-row">
          <input class="form-control" [(ngModel)]="emailTo" placeholder="correo@empresa.com, otro@empresa.com">
          <select class="form-control small" [(ngModel)]="emailFormat">
            <option value="pdf">PDF</option><option value="xlsx">Excel</option><option value="html">HTML</option><option value="csv">CSV</option>
          </select>
          <button class="btn btn-sm btn-primary" (click)="sendEmail()" [disabled]="busy() || !emailTo.trim()">Enviar por correo</button>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>@for (c of r.columns; track c.key) { <th>{{ c.label }}</th> }</tr></thead>
            <tbody>
              @for (row of r.rows; track $index) { <tr>@for (v of row; track $index) { <td>{{ v ?? '—' }}</td> }</tr> }
              @empty { <tr><td [attr.colspan]="r.columns.length">No hay registros con esos criterios.</td></tr> }
            </tbody>
          </table>
        </div>
      </section>
    }
  </div>`,
  styles: [`
    .builder section { margin-bottom: 18px; }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
    label { display: flex; flex-direction: column; gap: 6px; font-size: .9rem; }
    .columns { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; margin: 10px 0; }
    .check { flex-direction: row; align-items: center; gap: 8px; }
    .order-list, .templates { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; align-items: center; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 999px; background: rgba(99,102,241,.15); font-size: .85rem; }
    .link { background: none; border: 0; color: inherit; cursor: pointer; padding: 0 2px; }
    .link.danger { color: #f87171; }
    .link:disabled { opacity: .3; cursor: default; }
    .row { display: grid; grid-template-columns: 1.2fr 1fr 1.2fr auto; gap: 8px; margin-bottom: 8px; align-items: center; }
    .actions, .email-row, .exports { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin-top: 14px; }
    .small { max-width: 130px; }
    .report-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; }
    .table-wrap { overflow-x: auto; margin-top: 14px; }
    @media (max-width: 700px) { .row { grid-template-columns: 1fr; } }
  `]
})
export class ReportBuilderComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private base = `${environment.apiUrl}/report-builder`;

  sources = signal<Source[]>([]);
  report = signal<any>(null);
  busy = signal(false);
  sourceKey = '';
  title = '';
  selected: string[] = [];
  filters: Filter[] = [];
  orderBy: Sort[] = [];
  limit = 1000;
  emailTo = '';
  emailFormat: 'pdf' | 'xlsx' | 'html' | 'csv' = 'pdf';
  templates: Template[] = [];

  private get templateKey() { return `fs_report_templates_u${this.auth.currentUser()?.id}`; }

  ngOnInit() {
    try { this.templates = JSON.parse(localStorage.getItem(this.templateKey) || '[]'); } catch { this.templates = []; }
    this.http.get<Source[]>(`${this.base}/metadata`).subscribe({
      next: s => this.sources.set(s),
      error: e => this.fail(e),
    });
  }

  source() { return this.sources().find(s => s.key === this.sourceKey) || null; }
  column(key: string) { return this.source()?.columns.find(c => c.key === key); }
  label(key: string) { return this.column(key)?.label || key; }
  typeOf(key: string) { return this.column(key)?.type || 'text'; }
  opsFor(key: string) { return this.column(key)?.ops || []; }

  onSource() {
    this.report.set(null); this.filters = []; this.orderBy = [];
    this.selected = (this.source()?.columns || []).slice(0, 4).map(c => c.key);
  }
  toggle(key: string) {
    this.selected = this.selected.includes(key) ? this.selected.filter(k => k !== key) : [...this.selected, key];
  }
  move(i: number, delta: number) {
    const copy = [...this.selected]; [copy[i], copy[i + delta]] = [copy[i + delta], copy[i]]; this.selected = copy;
  }
  addFilter() {
    const first = this.source()!.columns[0];
    this.filters.push({ column: first.key, op: first.ops[0].key, value: '' });
  }
  addSort() { this.orderBy.push({ column: this.selected[0] || this.source()!.columns[0].key, direction: 'asc' }); }

  private spec() {
    return { title: this.title.trim() || null, source: this.sourceKey, columns: this.selected,
      filters: this.filters.map(f => ({ column: f.column, op: f.op, value: f.value })),
      order_by: this.orderBy, limit: Math.min(Math.max(Number(this.limit) || 1000, 1), 5000) };
  }

  run() {
    this.busy.set(true);
    this.http.post<any>(`${this.base}/run`, this.spec()).subscribe({
      next: r => { this.report.set(r); this.busy.set(false); },
      error: e => this.fail(e),
    });
  }

  download(fmt: string) {
    this.busy.set(true);
    this.http.post(`${this.base}/export/${fmt}`, this.spec(), { responseType: 'blob' }).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = `reporte-${this.sourceKey}.${fmt}`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); this.busy.set(false);
      },
      error: async e => { if (e.error instanceof Blob) { try { e = { error: JSON.parse(await e.error.text()) }; } catch {} } this.fail(e); },
    });
  }

  sendEmail() {
    const to = this.emailTo.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    this.busy.set(true);
    this.http.post<any>(`${this.base}/email`, { ...this.spec(), to, format: this.emailFormat }).subscribe({
      next: r => { this.busy.set(false); this.toast.success(`Reporte enviado a ${r.recipients.join(', ')}.`); },
      error: e => this.fail(e),
    });
  }

  saveTemplate() {
    const name = prompt('Nombre de la plantilla', this.title || this.source()?.label || 'Mi reporte');
    if (!name) return;
    const t: Template = { name, ...this.spec(), title: this.title } as Template;
    this.templates = [...this.templates.filter(x => x.name !== name), t];
    try { localStorage.setItem(this.templateKey, JSON.stringify(this.templates)); } catch {}
    this.toast.success(`Plantilla "${name}" guardada en este dispositivo.`);
  }
  loadTemplate(t: Template) {
    if (!this.sources().some(s => s.key === t.source)) { this.toast.error('No tienes acceso a la fuente de esta plantilla.'); return; }
    this.sourceKey = t.source; this.title = t.title || ''; this.selected = [...t.columns];
    this.filters = t.filters.map(f => ({ ...f })); this.orderBy = t.order_by.map(o => ({ ...o })); this.limit = t.limit || 1000;
    this.run();
  }
  deleteTemplate(t: Template) {
    this.templates = this.templates.filter(x => x.name !== t.name);
    try { localStorage.setItem(this.templateKey, JSON.stringify(this.templates)); } catch {}
  }

  private fail(e: any) {
    this.busy.set(false);
    const d = e?.error?.detail;
    this.toast.error(typeof d === 'string' ? d : Array.isArray(d) ? d.map((x: any) => x.msg).join(', ') : 'No se pudo generar el reporte.');
  }
}
