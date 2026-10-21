import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { Order } from '../../core/models';

@Component({
  selector: 'app-my-purchases',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="content-area" style="max-width: 1100px; margin: 0 auto; padding-top: var(--space-xl);">
      <div class="flex items-center justify-between mb-lg">
        <div>
          <h1 class="text-2xl font-bold">Mis Compras</h1>
          <p class="text-secondary text-sm">Historial de pedidos y comprobantes</p>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-outline btn-sm" (click)="goCatalog()">Ir al catálogo</button>
          <button class="btn btn-primary btn-sm" (click)="goProfile()">📅 Ver Mis Reservas</button>
        </div>
      </div>

      <!-- Filtros -->
      <div class="flex gap-sm mb-lg border-b pb-sm">
        <button class="btn btn-sm" [ngClass]="filter === 'todas' ? 'btn-primary' : 'btn-outline'" (click)="setFilter('todas')">Todas</button>
        <button class="btn btn-sm" [ngClass]="filter === 'completadas' ? 'btn-primary' : 'btn-outline'" (click)="setFilter('completadas')">Completadas</button>
        <button class="btn btn-sm" [ngClass]="filter === 'pendientes' ? 'btn-primary' : 'btn-outline'" (click)="setFilter('pendientes')">Pendientes / Delivery</button>
      </div>

      <div *ngIf="loading" class="flex justify-center p-xl">
        <div class="spinner"></div>
      </div>

      <div *ngIf="!loading && filteredOrders.length === 0" class="card card-glass text-center p-xl">
        <div style="font-size: 3rem; margin-bottom: var(--space-md);">🛍️</div>
        <h3 class="font-semibold text-xl mb-sm">No se encontraron compras</h3>
        <p class="text-secondary">Tus pedidos aparecerán aquí.</p>
      </div>

      <!-- Lista de Órdenes -->
      <div class="grid gap-md" *ngIf="!loading && filteredOrders.length > 0">
        <div *ngFor="let order of filteredOrders" class="card card-glass p-md flex flex-col md:flex-row justify-between gap-md">
          <div class="flex-1">
            <div class="flex items-center gap-sm mb-xs">
              <h3 class="font-bold text-lg">Orden #{{ order.id }}</h3>
              <span class="badge badge-primary">{{ order.order_type | uppercase }}</span>
              <span class="badge" [ngClass]="order.payment_status === 'paid' ? 'badge-success' : 'badge-warning'">
                {{ order.payment_status === 'paid' ? 'PAGADO' : 'PENDIENTE' }}
              </span>
            </div>

            <p class="text-secondary text-sm mb-sm">
              <strong>Fecha:</strong> {{ order.created_at | date:'medium' }}<br>
              <strong>Total:</strong> \${{ order.total_amount.toFixed(2) }}
            </p>

            <div class="mt-sm">
              <div *ngFor="let item of order.items" class="text-sm mb-xs flex items-center gap-sm">
                <img *ngIf="item.variant?.product?.image_url" [src]="formatImageUrl(item.variant?.product?.image_url)" style="width: 30px; height: 30px; object-fit: cover; border-radius: 4px;">
                <span>
                  {{ item.variant?.product?.name || 'Producto ID: ' + item.variant_id }} 
                  <span *ngIf="item.variant">({{ item.variant.size }} - {{ item.variant.color }})</span>
                  x {{ item.quantity }}
                </span>
              </div>
            </div>
            
            <p *ngIf="order.order_type === 'online_delivery'" class="text-sm mt-sm italic text-primary" style="background: var(--bg-hover); padding: 8px; border-radius: 4px;">
              🚚 <strong>Delivery:</strong> Enseguida se contactarán contigo al número de teléfono para coordinar la entrega.
            </p>
          </div>

          <div class="mt-md md:mt-0 text-right flex flex-col justify-center">
            <button *ngIf="!order.is_paid" class="btn btn-primary" (click)="continuePayment(order.id)">Continuar o verificar pago</button>
            <button class="btn btn-outline btn-sm text-primary" (click)="openInvoice(order)">📄 Ver comprobante</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal de Factura -->
    <div class="modal-backdrop" *ngIf="selectedOrder" style="position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 1000; display: flex; align-items: center; justify-content: center;">
      <div class="card" style="width: 100%; max-width: 500px; padding: 2rem; position: relative; background: #fff; color: #333;">
        <button class="btn btn-sm btn-outline" style="position: absolute; top: 1rem; right: 1rem; color: #333; border-color: #333;" (click)="selectedOrder = null">✕</button>
        
        <div class="text-center mb-lg border-b pb-md">
          <div style="font-size: 3rem;">💎</div>
          <h2 class="font-bold text-2xl" style="color: #000;">Fashion Store</h2>
          <p class="text-sm" style="color: #666;">Comprobante de compra</p>
        </div>

        <div class="mb-md text-sm" style="color: #444;">
          <p><strong>Orden #:</strong> {{ selectedOrder.id }}</p>
          <p><strong>Fecha:</strong> {{ selectedOrder.created_at | date:'dd/MM/yyyy HH:mm' }}</p>
          <p><strong>Cliente:</strong> {{ auth.currentUser()?.full_name || 'Consumidor Final' }}</p>
          <p><strong>Método de Pago:</strong> {{ selectedOrder.payment_method | uppercase }}</p>
        </div>

        <table style="width: 100%; text-align: left; margin-bottom: 1rem; font-size: 0.9rem; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid #ddd;">
              <th style="padding: 8px 0; color: #000;">Cant</th>
              <th style="padding: 8px 0; color: #000;">Descripción</th>
              <th style="padding: 8px 0; text-align: right; color: #000;">P.U.</th>
              <th style="padding: 8px 0; text-align: right; color: #000;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of selectedOrder.items" style="border-bottom: 1px solid #f0f0f0;">
              <td style="padding: 8px 0; color: #333;">{{ item.quantity }}</td>
              <td style="padding: 8px 0; color: #333;">
                {{ item.variant?.product?.name || 'Item ' + item.variant_id }}
                <div style="font-size: 0.75rem; color: #888;">{{ item.variant?.size }} - {{ item.variant?.color }}</div>
              </td>
              <td style="padding: 8px 0; text-align: right; color: #333;">\${{ item.unit_price.toFixed(2) }}</td>
              <td style="padding: 8px 0; text-align: right; color: #333;">\${{ (item.quantity * item.unit_price).toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>

        <div class="flex justify-between items-center border-t pt-md mt-md" style="border-top: 2px solid #000;">
          <span class="font-bold text-xl" style="color: #000;">Total</span>
          <span class="font-bold text-2xl" style="color: #000;">\${{ selectedOrder.total_amount.toFixed(2) }}</span>
        </div>
        
        <div class="text-center mt-xl text-sm" style="color: #888;">
          <p>¡Gracias por tu compra!</p>
          <p>Este documento es válido como comprobante de pago.</p>
        </div>

        <button class="btn w-full mt-lg" style="background: #000; color: #fff; padding: 12px 0;" (click)="printInvoice()">
          🖨️ Imprimir Factura
        </button>
      </div>
    </div>
  `
})
export class MyPurchasesComponent implements OnInit {
  continuePayment(id: number) { this.router.navigate(["/payment", id]); }
  orders: Order[] = [];
  filteredOrders: Order[] = [];
  loading = true;
  filter: 'todas' | 'completadas' | 'pendientes' = 'todas';
  selectedOrder: Order | null = null;

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadOrders();
  }

  loadOrders() {
    this.loading = true;
    this.api.getOrders().subscribe({
      next: (res) => {
        // As a client, the backend already filters my orders
        this.orders = res;
        this.applyFilter();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  setFilter(f: 'todas' | 'completadas' | 'pendientes') {
    this.filter = f;
    this.applyFilter();
  }

  applyFilter() {
    if (this.filter === 'todas') {
      this.filteredOrders = this.orders;
    } else if (this.filter === 'completadas') {
      this.filteredOrders = this.orders.filter(o => o.payment_status === 'paid' && o.order_type !== 'reserva_pickup');
    } else if (this.filter === 'pendientes') {
      this.filteredOrders = this.orders.filter(o => o.payment_status === 'pending' || o.order_type === 'online_delivery' || o.order_type === 'reserva_pickup');
    }
  }

  formatImageUrl(url?: string | null): string | null {
    if (!url || !url.trim()) return null;
    const clean = url.trim();
    if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('data:')) return clean;
    if (clean.startsWith('/')) return `http://localhost:8000${clean}`;
    return clean;
  }

  openInvoice(order: Order) {
    this.selectedOrder = order;
  }

  printInvoice() {
    window.print();
  }

  goCatalog() {
    this.router.navigate(['/catalog']);
  }

  goProfile() {
    this.router.navigate(['/profile']);
  }
}
