import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';

interface BackupInfo { name: string; size_bytes: number; created_at: string | null; label: string | null;
  schema_revision: string | null; includes_uploads: boolean; rows: number; }

@Component({
  selector: 'app-backups',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="content-area">
    <div class="page-header">
      <div>
        <h1 class="page-title">Backup / Restore</h1>
        <p class="text-secondary">Copias de seguridad de todo el sistema: todas las empresas, usuarios, catálogo, inventario,
          ventas, reservas y bitácora (cifrada), y opcionalmente las imágenes. Antes de restaurar se guarda una copia automática.</p>
      </div>
    </div>

    <section class="card p-lg">
      <h3>Crear copia de seguridad</h3>
      <label class="check"><input type="checkbox" [(ngModel)]="includeUploads"> Incluir imágenes de productos (archivo más grande)</label>
      <button class="btn btn-primary mt-sm" (click)="create()" [disabled]="busy()">{{ busy() ? 'Procesando…' : 'Crear copia ahora' }}</button>
    </section>

    <section class="card p-lg">
      <h3>Restaurar desde un archivo</h3>
      <p class="text-secondary text-sm">Sube un archivo .fsbak descargado antes. Debe ser de la misma versión del sistema.</p>
      <input type="file" accept=".fsbak" (change)="file = $any($event.target).files?.[0] || null">
      <button class="btn btn-outline mt-sm" (click)="restoreUpload()" [disabled]="busy() || !file">Restaurar archivo</button>
    </section>

    <section class="card p-lg">
      <h3>Copias guardadas en el servidor</h3>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Archivo</th><th>Fecha</th><th>Tamaño</th><th>Registros</th><th>Imágenes</th><th>Acciones</th></tr></thead>
          <tbody>
            @for (b of backups(); track b.name) {
              <tr>
                <td><code>{{ b.name }}</code></td>
                <td>{{ b.created_at | date:'dd/MM/yyyy HH:mm' }}</td>
                <td>{{ size(b.size_bytes) }}</td>
                <td>{{ b.rows }}</td>
                <td>{{ b.includes_uploads ? 'Sí' : 'No' }}</td>
                <td class="actions">
                  <button class="btn btn-sm btn-outline" (click)="download(b)" [disabled]="busy()">Descargar</button>
                  <button class="btn btn-sm btn-primary" (click)="restore(b)" [disabled]="busy()">Restaurar</button>
                  <button class="btn btn-sm btn-outline danger" (click)="remove(b)" [disabled]="busy()">Eliminar</button>
                </td>
              </tr>
            } @empty { <tr><td colspan="6">Todavía no hay copias de seguridad.</td></tr> }
          </tbody>
        </table>
      </div>
    </section>
  </div>`,
  styles: [`
    section { margin-bottom: 18px; }
    .check { display: flex; align-items: center; gap: 8px; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .danger { color: #f87171; }
    .table-wrap { overflow-x: auto; }
  `]
})
export class BackupsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private base = `${environment.apiUrl}/backups`;
  backups = signal<BackupInfo[]>([]);
  busy = signal(false);
  includeUploads = true;
  file: File | null = null;

  ngOnInit() { this.load(); }

  load() { this.http.get<BackupInfo[]>(this.base).subscribe({ next: b => this.backups.set(b), error: e => this.fail(e) }); }

  size(bytes: number) { return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : (bytes / 1024).toFixed(0) + ' KB'; }

  create() {
    this.busy.set(true);
    this.http.post<BackupInfo>(this.base, { include_uploads: this.includeUploads }).subscribe({
      next: b => { this.busy.set(false); this.toast.success(`Copia creada: ${b.name}`); this.load(); },
      error: e => this.fail(e),
    });
  }

  download(b: BackupInfo) {
    this.busy.set(true);
    this.http.get(`${this.base}/${b.name}/download`, { responseType: 'blob' }).subscribe({
      next: blob => { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = b.name; a.click();
        setTimeout(() => URL.revokeObjectURL(u), 1000); this.busy.set(false); },
      error: e => this.fail(e),
    });
  }

  private confirmRestore(): string | null {
    const typed = prompt('ATENCIÓN: se reemplazarán TODOS los datos actuales del sistema por los de la copia.\n' +
      'Antes se guardará una copia automática del estado actual.\n\nEscribe RESTAURAR para confirmar:');
    return typed === 'RESTAURAR' ? typed : (typed !== null ? (this.toast.error('Confirmación incorrecta. No se restauró nada.'), null) : null);
  }

  private done(r: any) {
    this.busy.set(false);
    this.toast.success(`Sistema restaurado: ${r.restored_rows} registros, ${r.images_restored} imágenes. Copia previa: ${r.safety_backup}`);
    this.load();
  }

  restore(b: BackupInfo) {
    const confirmation = this.confirmRestore();
    if (!confirmation) return;
    this.busy.set(true);
    this.http.post<any>(`${this.base}/${b.name}/restore`, { confirmation }).subscribe({ next: r => this.done(r), error: e => this.fail(e) });
  }

  restoreUpload() {
    if (!this.file) return;
    const confirmation = this.confirmRestore();
    if (!confirmation) return;
    const form = new FormData();
    form.append('confirmation', confirmation);
    form.append('file', this.file);
    this.busy.set(true);
    this.http.post<any>(`${this.base}/upload-restore`, form).subscribe({ next: r => this.done(r), error: e => this.fail(e) });
  }

  remove(b: BackupInfo) {
    if (!confirm(`¿Eliminar la copia ${b.name}? No se puede deshacer.`)) return;
    this.busy.set(true);
    this.http.delete(`${this.base}/${b.name}`).subscribe({ next: () => { this.busy.set(false); this.load(); }, error: e => this.fail(e) });
  }

  private fail(e: any) {
    this.busy.set(false);
    const d = e?.error?.detail;
    this.toast.error(typeof d === 'string' ? d : 'No se pudo completar la operación.');
  }
}
