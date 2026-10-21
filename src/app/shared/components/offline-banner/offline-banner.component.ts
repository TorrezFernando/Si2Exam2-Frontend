import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NetworkService } from '../../../core/services/network.service';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';

@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div *ngIf="network.isOffline() || offlineSync.pendingCount() > 0" class="offline-banner-container">
      <div class="offline-banner" [class.offline-alert]="network.isOffline()" [class.sync-pending]="network.isOnline() && offlineSync.pendingCount() > 0">
        <div class="banner-content">
          <div class="icon-wrap">
            <span *ngIf="network.isOffline()" class="pulse-icon">⚡</span>
            <span *ngIf="network.isOnline()" class="pulse-icon">🔄</span>
          </div>
          <div class="text-wrap">
            <strong *ngIf="network.isOffline()">Modo Sin Conexión Activado:</strong>
            <strong *ngIf="network.isOnline()">Conexión Restaurada:</strong>
            <span>
              {{ network.isOffline() 
                ? 'Operando con catálogo local en IndexedDB. Los datos de stock podrían estar desactualizados.' 
                : 'Tienes operaciones locales pendientes de sincronizar con el servidor central.' }}
            </span>
          </div>
        </div>

        <div class="banner-actions">
          <span *ngIf="offlineSync.pendingCount() > 0" class="badge-pending">
            {{ offlineSync.pendingCount() }} operación{{ offlineSync.pendingCount() > 1 ? 'es' : '' }} en cola
          </span>

          <button 
            *ngIf="network.isOnline() && offlineSync.pendingCount() > 0"
            class="btn-sync" 
            [disabled]="offlineSync.isSyncing()"
            (click)="triggerSync()"
          >
            <span *ngIf="offlineSync.isSyncing()" class="spinner"></span>
            {{ offlineSync.isSyncing() ? 'Sincronizando...' : 'Sincronizar Ahora' }}
          </button>

          <a routerLink="/admin/sync-inbox" class="btn-inbox">
            Bandeja de Sincronización →
          </a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .offline-banner-container {
      position: sticky;
      top: 0;
      z-index: 9999;
      width: 100%;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.35);
      animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .offline-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      padding: 10px 24px;
      font-size: 0.88rem;
      color: #ffffff;
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    }

    .offline-alert {
      background: linear-gradient(90deg, #b45309 0%, #d97706 50%, #f59e0b 100%);
    }

    .sync-pending {
      background: linear-gradient(90deg, #1e3a8a 0%, #2563eb 50%, #3b82f6 100%);
    }

    .banner-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .icon-wrap {
      font-size: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .pulse-icon {
      animation: pulse 1.5s infinite;
      display: inline-block;
    }

    .text-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .banner-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .badge-pending {
      background: rgba(0, 0, 0, 0.35);
      color: #fef3c7;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .btn-sync {
      background: #ffffff;
      color: #1e3a8a;
      border: none;
      padding: 5px 14px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.8rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }

    .btn-sync:hover:not(:disabled) {
      background: #f1f5f9;
      transform: translateY(-1px);
    }

    .btn-sync:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .btn-inbox {
      color: #ffffff;
      text-decoration: underline;
      font-weight: 600;
      font-size: 0.82rem;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background 0.2s;
    }

    .btn-inbox:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .spinner {
      width: 12px;
      height: 12px;
      border: 2px solid #1e3a8a;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: inline-block;
    }

    @keyframes slideDown {
      from { transform: translateY(-100%); }
      to { transform: translateY(0); }
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.15); opacity: 0.8; }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class OfflineBannerComponent {
  readonly network = inject(NetworkService);
  readonly offlineSync = inject(OfflineSyncService);

  triggerSync() {
    this.offlineSync.syncBatch().catch(err => {
      console.error('[OFFLINE-BANNER] Error al forzar sincronización:', err);
    });
  }
}
