import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { Reservation, LocalReservationOperation } from '../../core/models';
import { OfflineSyncService } from '../../core/services/offline-sync.service';

@Component({
  selector: 'app-my-reservations',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="content-area" style="max-width: 1100px; margin: 0 auto; padding-top: var(--space-xl);">
      <div class="flex items-center justify-between mb-lg">
        <div>
          <h1 class="text-2xl font-bold">Mi perfil</h1>
          <p class="text-secondary text-sm">Reservas y horario de retiro</p>
        </div>
        <div class="flex gap-sm">
          <button *ngIf="auth.userRoleName() === 'cajero'" class="btn btn-outline btn-sm" (click)="goBackToCashier()">Volver al cajero</button>
          <button *ngIf="auth.userRoleName() === 'admin' || auth.userRoleName() === 'encargado'" class="btn btn-outline btn-sm" (click)="goBackToAdmin()">Volver al panel</button>
          <button class="btn btn-outline btn-sm" (click)="goCatalog()">Ir al catálogo</button>
          <button class="btn btn-primary btn-sm" (click)="goPurchases()">🛍️ Mis Compras y Facturas</button>
        </div>
      </div>

      <div class="card card-glass p-lg mb-lg">
        <div class="flex items-center gap-md">
          <div class="avatar avatar-lg" style="background: linear-gradient(135deg, var(--color-primary), var(--color-accent));">{{ initials }}</div>
          <div>
            <div class="text-xl font-bold">{{ auth.currentUser()?.full_name || 'Usuario' }}</div>
            <div class="text-secondary text-sm">{{ auth.userRoleName() || 'Cliente' }}</div>
          </div>
        </div>
      </div>

      <div class="card mb-lg" *ngIf="localReservations.length">
        <h2 class="font-bold">Reservas guardadas en este dispositivo</h2>
        <p class="text-secondary">Las pendientes aún no están confirmadas por la tienda. Los conflictos requieren revisar disponibilidad y hacer una nueva reserva.</p>
        <div *ngFor="let local of localReservations" class="border-b p-sm">
          <strong>{{ local.sync_status }}</strong> · Sucursal {{ local.branch_id }} · {{ local.created_at | date:'short' }}
          <span *ngIf="local.server_id"> · Reserva #{{ local.server_id }}</span>
          <p *ngIf="local.rejection_reason">{{ local.rejection_reason }}</p>
        </div>
        <button class="btn btn-outline mt-sm" (click)="syncLocal()" [disabled]="offline.isSyncing()">Sincronizar y actualizar</button>
      </div>
      <div *ngIf="loading" class="flex justify-center p-xl">
        <div class="spinner"></div>
      </div>

      <div *ngIf="!loading && reservations.length === 0" class="card card-glass text-center p-xl">
        <div style="font-size: 3rem; margin-bottom: var(--space-md);">📅</div>
        <h3 class="font-semibold text-xl mb-sm">Aún no tienes reservas</h3>
        <p class="text-secondary">Tus reservas aparecerán aquí con la hora estimada de retiro.</p>
      </div>

      <div class="grid gap-md" *ngIf="!loading && reservations.length > 0">
        <div *ngFor="let res of reservations" class="card card-glass p-md">
          <div class="flex flex-col md:flex-row justify-between gap-md">
            <div class="flex-1">
              <div class="flex items-center gap-sm mb-xs">
                <h3 class="font-bold text-lg">Reserva #{{ res.id }}</h3>
                <span class="badge" [ngClass]="{
                  'badge-warning': res.status === 'pending',
                  'badge-success': res.status === 'confirmed',
                  'badge-primary': res.status === 'completed',
                  'badge-danger': res.status === 'cancelled'
                }">{{ res.status | uppercase }}</span>
              </div>

              <p class="text-secondary text-sm mb-sm">
                <strong>Sucursal:</strong> {{ res.branch_id }}<br>
                <strong>Hora de retiro:</strong> {{ getPickupDate(res) }}
              </p>

              <div class="mt-sm">
                <div *ngFor="let item of res.items" class="text-sm mb-xs">
                  • Variante ID: {{ item.variant_id }} - Cantidad: {{ item.quantity }}
                </div>
              </div>

              <p *ngIf="res.notes" class="text-sm mt-sm italic text-muted">Notas: "{{ res.notes }}"</p>
            </div>

            <div class="mt-md md:mt-0 text-right">
              <div class="mt-sm" *ngIf="res.status === 'pending' || res.status === 'confirmed'">
                <button class="btn btn-outline btn-sm text-danger" (click)="cancelReservation(res.id)">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class MyReservationsComponent implements OnInit {
  localReservations: LocalReservationOperation[] = [];
  reservations: Reservation[] = [];
  loading = true;

  constructor(
    private api: ApiService,
    private toast: ToastService,
    public auth: AuthService,
    private router: Router,
    public offline: OfflineSyncService
  ) {}

  get initials(): string {
    const fullName = this.auth.currentUser()?.full_name || 'Usuario';
    return fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() || '')
      .join('') || 'U';
  }

  ngOnInit() {
    this.loadReservations();
  }

  async syncLocal() {
    try { await this.offline.syncBatch(); }
    catch (e: any) { this.toast.error(e?.error?.detail || e.message); }
    this.loadReservations();
  }

  getPickupDate(res: Reservation): string {
    return res.pickup_date ? new Date(res.pickup_date).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) : 'Sin horario definido';
  }

  goBackToCashier() {
    this.router.navigate(['/cashier']);
  }

  goBackToAdmin() {
    this.router.navigate(['/admin/dashboard']);
  }

  goCatalog() {
    this.router.navigate(['/catalog']);
  }

  goPurchases() {
    this.router.navigate(['/catalog/purchases']);
  }

  loadReservations() {
    this.offline.getLocalReservations().then(rows => this.localReservations = rows).catch(() => this.localReservations = []);
    this.loading = true;
    this.api.getReservations().subscribe({
      next: (res) => {
        this.reservations = res;
        this.loading = false;
      },
      error: () => {
        this.toast.error('No se pudieron cargar tus reservas');
        this.loading = false;
      }
    });
  }

  cancelReservation(id: number) {
    if (!confirm('¿Estás seguro de cancelar esta reserva?')) return;
    this.api.cancelReservation(id).subscribe({
      next: () => {
        this.toast.success('Reserva cancelada');
        this.loadReservations();
      },
      error: () => {
        this.toast.error('Error al cancelar la reserva');
      }
    });
  }
}
