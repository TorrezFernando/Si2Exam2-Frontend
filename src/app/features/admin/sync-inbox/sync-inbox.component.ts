import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { NetworkService } from '../../../core/services/network.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  LocalSaleOperation,
  LocalReservationOperation,
  SyncQueueItem,
  SyncOperationStatus,
} from '../../../core/models';

interface UnifiedSyncItem {
  uuid: string;
  type: 'sale' | 'reservation';
  date: string;
  branchId: number;
  customer: string;
  summary: string;
  total?: number;
  status: SyncOperationStatus;
  serverId?: number;
  rejectionReason?: string;
  attempts?: number;
}

@Component({
  selector: 'app-sync-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="sync-inbox-container">
      <!-- Encabezado -->
      <div class="inbox-header">
        <div>
          <div class="breadcrumb">
            <a routerLink="/admin">Administración</a> / <span>Sincronización Offline</span>
          </div>
          <h1 class="page-title">⚡ Bandeja de Sincronización Offline</h1>
          <p class="page-subtitle">
            Monitoreo y consistencia de ventas y reservas locales (IndexedDB) con idempotencia y bloqueo pesimista en servidor.
          </p>
        </div>

        <div class="header-actions">
          <button 
            class="btn btn-secondary" 
            (click)="refreshCatalog()"
            [disabled]="loadingCatalog() || network.isOffline()"
          >
            <span *ngIf="loadingCatalog()" class="spinner-sm"></span>
            <span>📥 Actualizar Catálogo Local</span>
          </button>

          <button 
            class="btn btn-primary" 
            (click)="triggerSync()"
            [disabled]="offlineSync.isSyncing() || network.isOffline() || pendingCount() === 0"
          >
            <span *ngIf="offlineSync.isSyncing()" class="spinner-sm"></span>
            <span>⚡ Sincronizar Lote Ahora ({{ pendingCount() }})</span>
          </button>
        </div>
      </div>

      <!-- Estado de Red y Conectividad -->
      <div class="network-card" [class.is-offline]="network.isOffline()">
        <div class="network-info">
          <span class="status-indicator" [class.online]="network.isOnline()"></span>
          <div>
            <strong>Estado de Conexión:</strong>
            <span class="ml-1 font-semibold">{{ network.isOnline() ? 'En Línea (Conectado a FashionStore Cloud)' : 'Sin Conexión (Modo Offline Local)' }}</span>
          </div>
        </div>
        <div class="sync-metadata">
          <span *ngIf="offlineSync.lastSyncTimestamp()">
            Último catálogo descargado: <strong>{{ offlineSync.lastSyncTimestamp() | date:'short' }}</strong>
          </span>
          <span *ngIf="!offlineSync.lastSyncTimestamp()" class="text-warning">
            Catálogo local sin sincronizar aún.
          </span>
        </div>
      </div>

      <!-- Métricas Resumen -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon icon-total">📋</div>
          <div class="stat-details">
            <span class="stat-value">{{ totalCount() }}</span>
            <span class="stat-label">Total Operaciones Locales</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon icon-pending">⏳</div>
          <div class="stat-details">
            <span class="stat-value">{{ pendingCount() }}</span>
            <span class="stat-label">Pendientes / En Cola</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon icon-confirmed">✅</div>
          <div class="stat-details">
            <span class="stat-value">{{ confirmedCount() }}</span>
            <span class="stat-label">Confirmadas en Servidor</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon icon-conflict">⚠️</div>
          <div class="stat-details">
            <span class="stat-value">{{ conflictCount() }}</span>
            <span class="stat-label">Conflictos de Stock</span>
          </div>
        </div>
      </div>

      <!-- Barra de Filtros -->
      <div class="filter-bar">
        <div class="filter-tabs">
          <button 
            class="tab-btn" 
            [class.active]="statusFilter === 'ALL'" 
            (click)="setStatusFilter('ALL')"
          >
            Todas ({{ items.length }})
          </button>
          <button 
            class="tab-btn tab-warning" 
            [class.active]="statusFilter === 'PENDIENTE'" 
            (click)="setStatusFilter('PENDIENTE')"
          >
            Pendientes ({{ countByStatus('PENDIENTE') }})
          </button>
          <button 
            class="tab-btn tab-success" 
            [class.active]="statusFilter === 'CONFIRMADA'" 
            (click)="setStatusFilter('CONFIRMADA')"
          >
            Confirmadas ({{ countByStatus('CONFIRMADA') }})
          </button>
          <button 
            class="tab-btn tab-danger" 
            [class.active]="statusFilter === 'RECHAZADA_CONFLICTO'" 
            (click)="setStatusFilter('RECHAZADA_CONFLICTO')"
          >
            Conflictos ({{ countByStatus('RECHAZADA_CONFLICTO') }})
          </button>
        </div>

        <div class="filter-options">
          <select [(ngModel)]="typeFilter" class="form-select">
            <option value="ALL">Todos los tipos</option>
            <option value="sale">Ventas de Contado</option>
            <option value="reservation">Reservas</option>
          </select>
        </div>
      </div>

      <!-- Tabla de Operaciones -->
      <div class="table-card">
        <div *ngIf="loadingData" class="loading-state">
          <div class="spinner"></div>
          <p>Cargando operaciones desde IndexedDB...</p>
        </div>

        <div *ngIf="!loadingData && filteredItems.length === 0" class="empty-state">
          <div class="empty-icon">📭</div>
          <h3>No hay operaciones registradas</h3>
          <p>Las ventas y reservas generadas en caja o catálogo offline aparecerán en esta bandeja.</p>
        </div>

        <table *ngIf="!loadingData && filteredItems.length > 0" class="inbox-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>UUID v4 Operación</th>
              <th>Fecha y Hora</th>
              <th>Cliente / Resumen</th>
              <th>Monto Total</th>
              <th>Estado Local</th>
              <th>Resultado Servidor</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of filteredItems" [class.conflict-row]="item.status === 'RECHAZADA_CONFLICTO'">
              <td>
                <span class="type-pill" [class.type-sale]="item.type === 'sale'" [class.type-res]="item.type === 'reservation'">
                  {{ item.type === 'sale' ? '🛒 Venta' : '📅 Reserva' }}
                </span>
              </td>
              <td>
                <div class="uuid-cell" [title]="item.uuid">
                  <code>{{ item.uuid.substring(0, 13) }}...</code>
                  <button class="btn-copy" (click)="copyUuid(item.uuid)" title="Copiar UUID">📋</button>
                </div>
              </td>
              <td>{{ item.date | date:'dd/MM/yyyy HH:mm' }}</td>
              <td>
                <div class="customer-info">
                  <strong>{{ item.customer }}</strong>
                  <span class="item-summary">{{ item.summary }}</span>
                </div>
              </td>
              <td>
                <span class="amount-val" *ngIf="item.total != null">\${{ item.total.toFixed(2) }}</span>
                <span class="text-muted" *ngIf="item.total == null">—</span>
              </td>
              <td>
                <span class="status-badge" [ngClass]="getStatusBadgeClass(item.status)">
                  <span class="status-dot"></span>
                  {{ item.status }}
                </span>
              </td>
              <td>
                <div *ngIf="item.status === 'CONFIRMADA'" class="confirmed-cell">
                  <span class="server-id-badge">ID Central #{{ item.serverId }}</span>
                  <span class="text-xs text-muted">Stock descontado</span>
                </div>

                <div *ngIf="item.status === 'RECHAZADA_CONFLICTO'" class="conflict-cell">
                  <span class="conflict-title">⚠️ Conflicto de Stock</span>
                  <p class="conflict-reason" [title]="item.rejectionReason">
                    {{ item.rejectionReason || 'Stock insuficiente central' }}
                  </p>
                </div>

                <div *ngIf="item.status === 'PENDIENTE'" class="pending-cell">
                  <span class="text-xs text-muted">En cola local (esperando envío)</span>
                </div>

                <div *ngIf="item.status === 'ENVIANDO'" class="pending-cell">
                  <span class="spinner-sm inline"></span>
                  <span class="text-xs text-muted">Enviando al servidor...</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .sync-inbox-container {
      max-width: 1300px;
      margin: 0 auto;
      padding: 24px;
      color: #e2e8f0;
    }

    .breadcrumb {
      font-size: 0.85rem;
      color: #94a3b8;
      margin-bottom: 8px;
    }

    .breadcrumb a {
      color: #38bdf8;
      text-decoration: none;
    }

    .page-title {
      font-size: 1.75rem;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 6px 0;
    }

    .page-subtitle {
      font-size: 0.95rem;
      color: #94a3b8;
      margin: 0;
    }

    .inbox-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 24px;
    }

    .header-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-primary {
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);
    }

    .btn-primary:hover:not(:disabled) {
      background: linear-gradient(135deg, #4338ca 0%, #4f46e5 100%);
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #334155;
    }

    /* Network Card */
    .network-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-left: 4px solid #10b981;
      padding: 12px 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .network-card.is-offline {
      border-left-color: #f59e0b;
      background: rgba(245, 158, 11, 0.08);
    }

    .network-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .status-indicator {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #f59e0b;
      display: inline-block;
    }

    .status-indicator.online {
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }

    .sync-metadata {
      font-size: 0.85rem;
      color: #94a3b8;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .stat-icon {
      font-size: 2rem;
      width: 50px;
      height: 50px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .icon-total { background: rgba(56, 189, 248, 0.15); }
    .icon-pending { background: rgba(245, 158, 11, 0.15); }
    .icon-confirmed { background: rgba(16, 185, 129, 0.15); }
    .icon-conflict { background: rgba(239, 68, 68, 0.15); }

    .stat-value {
      display: block;
      font-size: 1.65rem;
      font-weight: 800;
      color: #ffffff;
      line-height: 1.2;
    }

    .stat-label {
      font-size: 0.8rem;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Filter Bar */
    .filter-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 16px;
    }

    .filter-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .tab-btn {
      background: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 0.85rem;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }

    .tab-btn.active {
      background: #4f46e5;
      color: #ffffff;
      border-color: #4f46e5;
    }

    .tab-warning.active {
      background: #d97706;
      border-color: #d97706;
    }

    .tab-success.active {
      background: #059669;
      border-color: #059669;
    }

    .tab-danger.active {
      background: #dc2626;
      border-color: #dc2626;
    }

    .form-select {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.85rem;
      outline: none;
    }

    /* Table */
    .table-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      overflow-x: auto;
    }

    .inbox-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.88rem;
    }

    .inbox-table th {
      background: #0f172a;
      padding: 12px 16px;
      color: #94a3b8;
      font-weight: 600;
      border-bottom: 1px solid #334155;
      font-size: 0.8rem;
      text-transform: uppercase;
    }

    .inbox-table td {
      padding: 14px 16px;
      border-bottom: 1px solid rgba(51, 65, 85, 0.5);
      vertical-align: middle;
    }

    .inbox-table tbody tr:hover {
      background: rgba(51, 65, 85, 0.3);
    }

    .conflict-row {
      background: rgba(239, 68, 68, 0.05);
    }

    .type-pill {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 0.75rem;
    }

    .type-sale { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
    .type-res { background: rgba(168, 85, 247, 0.2); color: #c084fc; }

    .uuid-cell {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .uuid-cell code {
      font-size: 0.8rem;
      background: #0f172a;
      padding: 2px 6px;
      border-radius: 4px;
      color: #93c5fd;
    }

    .btn-copy {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 0.85rem;
      opacity: 0.7;
    }

    .btn-copy:hover { opacity: 1; }

    .customer-info strong {
      display: block;
      color: #ffffff;
      font-size: 0.88rem;
    }

    .item-summary {
      font-size: 0.78rem;
      color: #94a3b8;
    }

    .amount-val {
      font-weight: 700;
      color: #10b981;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 0.72rem;
      letter-spacing: 0.5px;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .badge-pending {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .badge-pending .status-dot { background: #fbbf24; }

    .badge-sending {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .badge-sending .status-dot { background: #60a5fa; }

    .badge-confirmed {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .badge-confirmed .status-dot { background: #34d399; }

    .badge-conflict {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .badge-conflict .status-dot { background: #f87171; }

    .server-id-badge {
      display: inline-block;
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 0.75rem;
    }

    .conflict-cell {
      max-width: 260px;
    }

    .conflict-title {
      display: block;
      font-size: 0.78rem;
      font-weight: 700;
      color: #f87171;
    }

    .conflict-reason {
      font-size: 0.75rem;
      color: #fca5a5;
      margin: 2px 0 0 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .spinner-sm {
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: inline-block;
    }

    .empty-state {
      padding: 60px 20px;
      text-align: center;
      color: #94a3b8;
    }

    .empty-icon { font-size: 3rem; margin-bottom: 12px; }

    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class SyncInboxComponent implements OnInit {
  readonly offlineSync = inject(OfflineSyncService);
  readonly network = inject(NetworkService);
  readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);

  items: UnifiedSyncItem[] = [];
  loadingData = true;
  loadingCatalog = signal<boolean>(false);

  statusFilter: 'ALL' | SyncOperationStatus = 'ALL';
  typeFilter: 'ALL' | 'sale' | 'reservation' = 'ALL';

  readonly totalCount = signal<number>(0);
  readonly pendingCount = signal<number>(0);
  readonly confirmedCount = signal<number>(0);
  readonly conflictCount = signal<number>(0);

  ngOnInit() {
    this.loadOperations();
  }

  async loadOperations() {
    this.loadingData = true;
    try {
      const sales = await this.offlineSync.getLocalSales();
      const reservations = await this.offlineSync.getLocalReservations();

      const unified: UnifiedSyncItem[] = [];

      for (const s of sales) {
        unified.push({
          uuid: s.client_operation_uuid,
          type: 'sale',
          date: s.created_at,
          branchId: s.branch_id,
          customer: s.customer_name || 'Cliente de Caja',
          summary: `${s.items.length} prenda(s) · Pago: ${s.payment_method}`,
          total: s.total_amount,
          status: s.sync_status,
          serverId: s.server_id,
          rejectionReason: s.rejection_reason,
        });
      }

      for (const r of reservations) {
        unified.push({
          uuid: r.client_operation_uuid,
          type: 'reservation',
          date: r.created_at,
          branchId: r.branch_id,
          customer: r.customer_name || `Cliente #${r.user_id}`,
          summary: `${r.items.length} prenda(s) reservada(s)`,
          total: undefined,
          status: r.sync_status,
          serverId: r.server_id,
          rejectionReason: r.rejection_reason,
        });
      }

      // Ordenar cronológicamente descendente
      unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      this.items = unified;

      this.updateCounters();
    } catch (err) {
      console.error('[SYNC-INBOX] Error al cargar operaciones locales:', err);
    } finally {
      this.loadingData = false;
    }
  }

  private updateCounters() {
    this.totalCount.set(this.items.length);
    this.pendingCount.set(this.items.filter((i) => i.status === 'PENDIENTE' || i.status === 'ENVIANDO').length);
    this.confirmedCount.set(this.items.filter((i) => i.status === 'CONFIRMADA').length);
    this.conflictCount.set(this.items.filter((i) => i.status === 'RECHAZADA_CONFLICTO').length);
  }

  get filteredItems(): UnifiedSyncItem[] {
    return this.items.filter((item) => {
      const matchStatus = this.statusFilter === 'ALL' || item.status === this.statusFilter;
      const matchType = this.typeFilter === 'ALL' || item.type === this.typeFilter;
      return matchStatus && matchType;
    });
  }

  setStatusFilter(status: 'ALL' | SyncOperationStatus) {
    this.statusFilter = status;
  }

  countByStatus(status: SyncOperationStatus): number {
    return this.items.filter((i) => i.status === status).length;
  }

  getStatusBadgeClass(status: SyncOperationStatus): string {
    switch (status) {
      case 'PENDIENTE': return 'badge-pending';
      case 'ENVIANDO': return 'badge-sending';
      case 'CONFIRMADA': return 'badge-confirmed';
      case 'RECHAZADA_CONFLICTO': return 'badge-conflict';
      default: return '';
    }
  }

  async triggerSync() {
    if (this.network.isOffline()) {
      this.toast.warning('No es posible sincronizar sin conexión a internet.');
      return;
    }

    try {
      const res = await this.offlineSync.syncBatch();
      if (res) {
        this.toast.success(
          `Sincronización procesada: ${res.confirmed_count} confirmadas, ${res.conflict_count} conflictos.`
        );
      } else {
        this.toast.info('No hay operaciones pendientes de sincronizar.');
      }
      await this.loadOperations();
    } catch (err: any) {
      this.toast.error('Error durante la sincronización: ' + (err?.error?.detail || err.message));
      await this.loadOperations();
    }
  }

  async refreshCatalog() {
    if (this.network.isOffline()) {
      this.toast.warning('Se requiere conexión para descargar el catálogo central.');
      return;
    }

    this.loadingCatalog.set(true);
    try {
      const branchId = this.auth.currentUser()?.branch_id || 1;
      const cat = await this.offlineSync.downloadCatalog(branchId);
      this.toast.success(`Catálogo actualizado: ${cat.products.length} productos sincronizados localmente.`);
    } catch (err: any) {
      this.toast.error('Error al actualizar catálogo local: ' + (err?.error?.detail || err.message));
    } finally {
      this.loadingCatalog.set(false);
    }
  }

  copyUuid(uuid: string) {
    navigator.clipboard.writeText(uuid);
    this.toast.success('UUID copiado al portapapeles');
  }
}
