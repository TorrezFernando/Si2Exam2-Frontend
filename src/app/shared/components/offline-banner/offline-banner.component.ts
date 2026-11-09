import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NetworkService } from '../../../core/services/network.service';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { OfflineHttpService, OutboxEntry } from '../../../core/offline/offline-http.service';

@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div *ngIf="isOffline() || totalPending() > 0 || outbox.failed().length > 0" class="offline-banner-container">
      <div class="offline-banner" [class.offline-alert]="isOffline()" [class.sync-pending]="!isOffline() && totalPending() > 0">
        <div class="banner-content">
          <div class="icon-wrap">
            <span *ngIf="isOffline()" class="pulse-icon">⚡</span>
            <span *ngIf="!isOffline()" class="pulse-icon">🔄</span>
          </div>
          <div class="text-wrap">
            <strong *ngIf="isOffline()">Modo Sin Conexión Activado:</strong>
            <strong *ngIf="!isOffline()">Conexión restaurada:</strong>
            <span>
              {{ isOffline()
                ? 'Trabajando con los datos guardados en este dispositivo. Los cambios se guardan y se sincronizan al volver internet.'
                : (totalPending() > 0 ? 'Tienes cambios hechos sin conexión pendientes de sincronizar.' : 'Algunos cambios hechos sin conexión no se pudieron sincronizar.') }}
            </span>
          </div>
        </div>

        <div class="banner-actions">
          <span *ngIf="totalPending() > 0" class="badge-pending">
            {{ totalPending() }} cambio{{ totalPending() > 1 ? 's' : '' }} en cola
          </span>

          <button *ngIf="outbox.failed().length" class="btn-sync" (click)="showFailed = !showFailed">
            ⚠️ {{ outbox.failed().length }} con error
          </button>

          <button
            *ngIf="!isOffline() && totalPending() > 0"
            class="btn-sync"
            [disabled]="offlineSync.isSyncing() || outbox.syncing()"
            (click)="triggerSync()"
          >
            <span *ngIf="offlineSync.isSyncing() || outbox.syncing()" class="spinner"></span>
            {{ offlineSync.isSyncing() || outbox.syncing() ? 'Sincronizando...' : 'Sincronizar Ahora' }}
          </button>

          <a *ngIf="offlineSync.pendingCount() > 0" routerLink="/sync-inbox" class="btn-inbox">
            Ventas y reservas offline →
          </a>
        </div>
      </div>
      <div *ngIf="showFailed && outbox.failed().length" class="failed-panel">
        <strong>Cambios que el servidor rechazó al sincronizar</strong>
        <p>Corrige la causa (por ejemplo, límite del plan o stock) y reintenta, o descarta el cambio.</p>
        <div *ngFor="let entry of outbox.failed()" class="failed-row">
          <div>
            <code>{{ entry.label }}</code>
            <small>{{ entry.createdAt | date:'short' }} · {{ entry.error }}</small>
          </div>
          <div class="failed-actions">
            <button class="btn-sync" (click)="retry(entry)">Reintentar</button>
            <button class="btn-inbox" (click)="discard(entry)">Descartar</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .failed-panel { background: #1f2937; color: #f9fafb; padding: 12px 24px; font-size: 0.85rem; max-height: 50vh; overflow: auto; }
    .failed-panel p { margin: 4px 0 10px; opacity: 0.8; }
    .failed-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.1); }
    .failed-row small { display: block; opacity: 0.85; margin-top: 2px; }
    .failed-actions { display: flex; gap: 8px; align-items: center; }

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
  readonly outbox = inject(OfflineHttpService);
  showFailed = false;

  /** Sin red, o con red pero sin respuesta del servidor. */
  isOffline() { return this.network.isOffline() || !this.outbox.serverReachable(); }

  totalPending() { return this.offlineSync.pendingCount() + this.outbox.pending(); }

  triggerSync() {
    if (this.offlineSync.pendingCount() > 0) {
      this.offlineSync.syncBatch().catch(err => console.error('[OFFLINE-BANNER] Error al forzar sincronización:', err));
    }
    this.outbox.sync();
  }

  retry(entry: OutboxEntry) { this.outbox.retry(entry); }

  discard(entry: OutboxEntry) {
    if (confirm(`¿Descartar el cambio "${entry.label}"? No se enviará al servidor.`)) this.outbox.discard(entry);
  }
}
