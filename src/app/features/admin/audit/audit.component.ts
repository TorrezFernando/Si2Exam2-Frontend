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
          <p class="text-secondary mt-sm">Registro de actividades y cambios (Solo lectura).</p>
        </div>
      </div>

      <div class="card overflow-hidden p-0">
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
                <th>Usuario ID</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Entidad ID</th>
                <th>Detalles</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let log of logs">
                <td class="text-secondary" style="white-space: nowrap;">{{ log.created_at | date:'short' }}</td>
                <td>{{ log.user_id || 'Sistema' }}</td>
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
                <td colspan="6" class="text-center py-xl text-secondary">No hay registros que coincidan con los filtros.</td>
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
  filters = {
    action: '',
    entity_type: ''
  };

  constructor(private api: ApiService, private toast: ToastService) {}

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    let params: any = {};
    if (this.filters.action) params.action = this.filters.action;
    if (this.filters.entity_type) params.entity_type = this.filters.entity_type;
    
    this.api.get('/audit', { params }).subscribe({
      next: (res: any) => this.logs = res,
      error: () => this.toast.error('Error al cargar la bitácora')
    });
  }
}
