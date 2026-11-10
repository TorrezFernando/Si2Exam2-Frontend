import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuditLog } from '../../../core/models';

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="content-area">
      <div class="flex items-center justify-between mb-lg">
        <div>
          <h1 class="text-3xl font-bold">Bitácora de Modificaciones</h1>
          <p class="text-secondary mt-sm">Todas las acciones de los usuarios con IP, usuario, fecha y hora. Se guardan cifradas con la llave del desarrollador: nadie puede leerlas desde la base de datos, solo desde esta pantalla (solo lectura).</p>
        </div>
      </div>

      <div *ngIf="!unlocked" class="card p-lg" style="max-width: 460px;">
        <h3 class="font-bold">🔒 Bitácora protegida</h3>
        <p class="text-secondary text-sm mt-sm">Ingresa la contraseña del desarrollador para descifrar y ver la bitácora.</p>
        <form (ngSubmit)="unlock()" class="mt-md flex gap-md items-end">
          <input class="form-control" type="password" name="auditKey" [(ngModel)]="keyInput" placeholder="Contraseña de la bitácora" autocomplete="off" required>
          <button class="btn btn-primary" type="submit" [disabled]="!keyInput || loading">{{ loading ? 'Verificando…' : 'Ver bitácora' }}</button>
        </form>
        <p *ngIf="keyError" class="text-danger text-sm mt-sm">{{ keyError }}</p>
      </div>

      <div *ngIf="unlocked" class="card overflow-hidden p-0">
        <div class="p-md bg-neutral flex gap-md items-end border-b">
          <div class="flex-1">
            <label class="form-label text-sm">Filtrar por Acción</label>
            <select class="form-control" [(ngModel)]="filters.action" (change)="loadData()">
              <option value="">Todas</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="LOGIN">LOGIN</option>
              <option value="AUTO_CANCEL">AUTO_CANCEL</option>
              <option value="RENEW">RENEW</option>
              <option value="EXPIRE">EXPIRE</option>
            </select>
          </div>
          <div class="flex-1">
            <label class="form-label text-sm">Filtrar por Entidad</label>
            <select class="form-control" [(ngModel)]="filters.entity_type" (change)="loadData()">
              <option value="">Todas</option>
              <option value="TENANT">TENANT</option>
              <option value="SUBSCRIPTION">SUBSCRIPTION</option>
              <option value="USER">USER</option>
              <option value="ROLE">ROLE</option>
              <option value="USER_PERMISSION">USER_PERMISSION</option>
              <option value="AUTH">AUTH</option>
              <option value="BRANCH">BRANCH</option>
            </select>
          </div>
          <div>
            <button class="btn btn-primary" (click)="loadData()">Filtrar</button>
          </div>
        </div>

        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>IP</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Entidad ID</th>
                <th>Detalles</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let log of logs">
                <td class="text-secondary" style="white-space: nowrap;">{{ log.created_at | date:'short' }}</td>
                <td>{{ log.user_email || (log.user_id ? 'ID ' + log.user_id : (log.entity_type === 'HTTP' ? 'Sin sesión' : 'Sistema')) }}</td>
                <td class="text-sm" [title]="log.user_agent || ''">{{ log.ip || '—' }}</td>
                <td>
                  <span class="badge" 
                        [class.badge-success]="log.action === 'CREATE' || log.action === 'LOGIN' || log.action === 'RENEW'"
                        [class.badge-primary]="log.action === 'UPDATE'"
                        [class.badge-danger]="log.action === 'DELETE' || log.action === 'AUTO_CANCEL' || log.action === 'EXPIRE'">
                    {{ log.action }}
                  </span>
                </td>
                <td class="font-semibold">{{ log.entity_type }}</td>
                <td>{{ log.entity_id || 'N/A' }}</td>
                <td class="text-sm text-secondary">
                  <pre class="m-0 bg-neutral p-xs rounded" style="max-width: 300px; overflow-x: auto; font-size: 0.75rem;">{{ log.details | json }}</pre>
                </td>
              </tr>
              <tr *ngIf="logs.length === 0">
                <td colspan="7" class="text-center py-xl text-secondary">No hay registros que coincidan con los filtros.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
})
export class AuditComponent implements OnInit {
  logs: AuditLog[] = [];
  unlocked = false;
  loading = false;
  keyInput = '';
  keyError = '';
  // Solo en memoria de esta pestaña: al cerrarla o salir hay que volver a ingresarla.
  private key = sessionStorage.getItem('fs_audit_key') || '';
  filters = {
    action: '',
    entity_type: ''
  };

  constructor(private api: ApiService, private toast: ToastService) {}

  ngOnInit() {
    if (this.key) this.loadData();
  }

  unlock() {
    this.key = this.keyInput;
    this.keyInput = '';
    this.loadData();
  }

  loadData() {
    let params: any = {};
    if (this.filters.action) params.action = this.filters.action;
    if (this.filters.entity_type) params.entity_type = this.filters.entity_type;
    
    this.loading = true;
    this.api.get('/audit', { params, headers: { 'X-Audit-Key': this.key } }).subscribe({
      next: (res: any) => {
        this.logs = res; this.unlocked = true; this.loading = false; this.keyError = '';
        try { sessionStorage.setItem('fs_audit_key', this.key); } catch {}
      },
      error: (err) => {
        this.loading = false;
        if (err?.status === 403 && String(err?.error?.detail || '').startsWith('LLAVE_BITACORA')) {
          this.unlocked = false; this.key = ''; this.keyError = 'Contraseña incorrecta.';
          try { sessionStorage.removeItem('fs_audit_key'); } catch {}
          return;
        }
        this.toast.error(err?.error?.detail || 'Error al cargar la bitácora');
      }
    });
  }
}
