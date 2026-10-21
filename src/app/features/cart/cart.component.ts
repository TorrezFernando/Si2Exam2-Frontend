import { Component, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CartService } from '../../core/services/cart.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { FormsModule } from '@angular/forms';
import { Branch } from '../../core/models';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="content-area">
      <div class="flex items-center justify-between" style="padding-top: var(--space-xl); margin-bottom: var(--space-xl);">
        <div>
          <h1 style="font-size: 2.25rem; font-weight: 800;">Tu Carrito de Compras</h1>
          <p class="text-secondary mt-sm">Revisa tus productos antes de finalizar la compra.</p>
        </div>
        <button class="btn btn-outline" (click)="router.navigate(['/catalog'])">Volver al Catálogo</button>
      </div>

      <!-- Contenido del carrito vacío -->
      <div *ngIf="cartItems().length === 0" class="card card-glass text-center p-xl mt-lg">
        <div style="font-size: 3rem; margin-bottom: var(--space-md);">🛒</div>
        <h3 class="font-semibold text-xl mb-sm">Tu carrito está vacío</h3>
        <p class="text-secondary mb-md">Agrega algunos productos increíbles para empezar.</p>
        <button class="btn btn-primary" (click)="router.navigate(['/catalog'])">Ir a la tienda</button>
      </div>

      <!-- Grid principal si hay items -->
      <div *ngIf="cartItems().length > 0" class="grid" style="grid-template-columns: 2fr 1fr; gap: var(--space-lg);">
        <!-- Lista de Productos -->
        <div class="card flex-col gap-md">
          <h2 class="font-bold text-lg mb-sm border-b pb-sm">Productos Seleccionados</h2>
          
          <div *ngFor="let item of cartItems(); let i = index" class="flex justify-between items-center border-b pb-sm">
            <div class="flex items-center gap-md">
              <div style="width: 60px; height: 60px; background: var(--bg-hover); border-radius: var(--radius-sm); overflow: hidden;">
                <img *ngIf="item.variant?.image_url || item.product.image_url" [src]="item.variant?.image_url || item.product.image_url" alt="" style="width:100%; height:100%; object-fit: cover;">
              </div>
              <div>
                <h4 class="font-semibold">{{ item.product.name }}</h4>
                <p class="text-secondary text-sm">
                  {{ item.variant ? 'Variante: ' + item.variant.color + ' - Talla ' + item.variant.size : 'Variante base' }}
                </p>
              </div>
            </div>
            
            <div class="flex items-center gap-lg">
              <div class="font-semibold text-lg">Bs {{ item.unit_price.toFixed(2) }}</div>
              <div class="flex items-center gap-sm">
                <button class="btn btn-sm btn-outline" style="padding: 2px 8px;" (click)="updateQuantity(i, -1)">-</button>
                <span class="text-sm font-semibold" style="min-width: 20px; text-align: center;">{{ item.quantity }}</span>
                <button class="btn btn-sm btn-outline" style="padding: 2px 8px;" (click)="updateQuantity(i, 1)">+</button>
              </div>
              <button class="btn btn-sm btn-outline text-danger ml-sm" (click)="removeItem(i)">✕</button>
            </div>
          </div>
        </div>

        <!-- Resumen de Compra -->
        <div class="card card-glass" style="height: fit-content; position: sticky; top: var(--space-xl);">
          <h2 class="font-bold text-lg mb-md">Resumen de Compra</h2>
          
          <div class="flex justify-between mb-sm">
            <span class="text-secondary">Subtotal</span>
            <span>Bs {{ cartTotal().toFixed(2) }}</span>
          </div>
          <div class="flex justify-between mb-sm">
            <span class="text-secondary">Envío</span>
            <span class="text-success">Gratis</span>
          </div>
          
          <div class="border-t mt-md pt-md flex justify-between items-center mb-lg">
            <span class="font-bold text-lg">Total</span>
            <span class="font-bold text-2xl text-primary">Bs {{ cartTotal().toFixed(2) }}</span>
          </div>

          <button class="btn btn-primary w-full" style="padding: var(--space-md) 0;" (click)="showPaymentModal = true">
            Proceder al Pago
          </button>
        </div>
      </div>
    </div>

    <!-- Modal de Pago Simulado (Pasarela) -->
    <div class="modal-backdrop" *ngIf="showPaymentModal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1000; display: flex; align-items: center; justify-content: center;">
      <div class="card" style="width: 100%; max-width: 700px; padding: var(--space-2xl); position: relative;">
        <!-- Botón cerrar modal -->
        <button class="btn btn-sm btn-outline" style="position: absolute; top: var(--space-md); right: var(--space-md);" (click)="showPaymentModal = false">✕</button>
        
        <h2 class="font-bold text-3xl mb-xs text-center">Finalizar Compra</h2>
        <p class="text-secondary text-center mb-xl">Total a pagar: <strong class="text-primary text-xl">Bs {{ cartTotal().toFixed(2) }}</strong></p>

        <!-- Selección de Método de Pago -->
        <div class="mb-lg">
          <label class="form-label mb-sm block">Método de Pago</label>
          <div class="grid grid-3 gap-sm">
            <button class="btn" [ngClass]="paymentMethod === 'tarjeta' ? 'btn-primary' : 'btn-outline'" (click)="paymentMethod = 'tarjeta'" style="padding: 10px;">💳 Tarjeta</button>
            <button class="btn" [ngClass]="paymentMethod === 'qr' ? 'btn-primary' : 'btn-outline'" (click)="paymentMethod = 'qr'" style="padding: 10px;">📱 Código QR</button>
            <button class="btn" [ngClass]="paymentMethod === 'reserva' ? 'btn-primary' : 'btn-outline'" (click)="paymentMethod = 'reserva'" style="padding: 10px;">🛍️ Reserva</button>
          </div>
        </div>

        <div *ngIf="paymentMethod !== 'reserva'" class="card mb-lg">
          <p>El pago se realiza de forma segura en Libélula. Podrás elegir entre los medios habilitados por el comercio.</p>
          <p class="text-secondary">Importes en bolivianos (BOB). La orden se confirma cuando Libélula informa el pago.</p>
        </div>
        
        <!-- Formulario Reserva -->
        <div *ngIf="paymentMethod === 'reserva'" class="flex-col gap-md mb-xl animate-fade-in text-left p-md border rounded" style="background: rgba(108, 99, 255, 0.05); border-color: rgba(108, 99, 255, 0.2);">
          <div class="flex items-center gap-sm mb-sm">
            <span style="font-size: 2rem;">🛍️</span>
            <div>
              <h3 class="font-semibold text-lg text-primary" style="margin: 0;">Reserva en Tienda</h3>
              <p class="text-secondary text-sm" style="margin: 0;">Tus productos serán separados para pagar y recoger.</p>
            </div>
          </div>
          
          <div>
            <label class="form-label mb-xs block">Sucursal de Retiro</label>
            <select class="form-control p-sm w-full" [(ngModel)]="reservaBranchId">
              <option *ngFor="let b of branches" [value]="b.id">{{ b.name }}</option>
            </select>
          </div>
          
          <div class="grid grid-2 gap-md">
            <div>
              <label class="form-label mb-xs block">Día de Retiro (Máx 2 días)</label>
              <input type="date" class="form-control p-sm w-full" [(ngModel)]="reservaDate" [min]="minDate" [max]="maxDate">
            </div>
            <div>
              <label class="form-label mb-xs block">Hora aproximada (07:00 a 20:00)</label>
              <input type="time" class="form-control p-sm w-full" [(ngModel)]="reservaTime" min="07:00" max="20:00">
              <small *ngIf="reservaTime && !isTimeValid()" class="text-danger mt-xs block">La hora debe estar entre 07:00 y 20:00.</small>
            </div>
          </div>
        </div>

        <button class="btn btn-accent w-full mt-lg" style="padding: var(--space-md) 0; margin-top: 1.5rem;" [disabled]="isProcessing || !canPay()" (click)="processPayment()">
          {{ isProcessing ? 'Procesando...' : paymentMethod === 'reserva' ? 'Reservar prendas' : 'Continuar a Libélula' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .animate-fade-in { animation: fadeIn 0.3s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
  `]
})
export class CartComponent implements OnInit {
  showPaymentModal = false;
  paymentMethod: 'tarjeta' | 'qr' | 'reserva' = 'tarjeta';
  isProcessing = false;
  private requestKey = crypto.randomUUID();
  
  branches: Branch[] = [];
  reservaBranchId: number | null = null;
  reservaDate: string = '';
  reservaTime: string = '';
  minDate = '';
  maxDate = '';

  private cartService = inject(CartService);

  // Usamos computed para acceder reactivamente a los datos del CartService
  cartItems = this.cartService.cartItems;
  cartTotal = computed(() => this.cartService.getTotal());

  constructor(
    private apiService: ApiService,
    private toast: ToastService,
    public router: Router
  ) {}

  ngOnInit() {
    this.apiService.getBranches(true).subscribe(b => {
      this.branches = b;
      if (b.length > 0) this.reservaBranchId = b[0].id;
    });
    
    const today = new Date();
    this.minDate = today.toISOString().split('T')[0];
    this.reservaDate = this.minDate;
    
    const max = new Date();
    max.setDate(max.getDate() + 2);
    this.maxDate = max.toISOString().split('T')[0];
  }

  removeItem(index: number) {
    this.cartService.removeFromCart(index);
  }

  updateQuantity(index: number, delta: number) {
    this.cartService.updateQuantity(index, delta);
  }

  canPay(): boolean {
    if (this.paymentMethod === 'reserva') {
      return !!(this.reservaBranchId && this.reservaDate && this.reservaTime && this.isTimeValid());
    }
    return true;
  }

  isTimeValid(): boolean {
    if (!this.reservaTime) return false;
    const [hours, minutes] = this.reservaTime.split(':').map(Number);
    // 07:00 to 20:00 inclusive
    if (hours < 7 || hours > 20) return false;
    if (hours === 20 && minutes > 0) return false;
    return true;
  }

  processPayment() {
    if (this.isProcessing || !this.canPay()) return;
    this.isProcessing = true;
    const items = this.cartItems().map(item => ({ variant_id: item.variant?.id ?? 0, quantity: item.quantity }));
    if (this.paymentMethod === 'reserva') {
      this.apiService.createReservation({
        branch_id: Number(this.reservaBranchId), items,
        pickup_date: new Date(`${this.reservaDate}T${this.reservaTime}`).toISOString()
      }).subscribe({
        next: () => this.handleSuccess('Reserva registrada. La sucursal ya puede preparar tus prendas.'),
        error: err => this.handleError(err)
      });
    } else {
      this.apiService.createOrder({ items, order_type: 'online_delivery', payment_method: this.paymentMethod,
        request_key: this.requestKey }).subscribe({
        next: order => {
          this.cartService.clearCart();
          this.isProcessing = false;
          this.router.navigate(['/payment', order.id]);
        },
        error: err => this.handleError(err)
      });
    }
  }

  private handleSuccess(msg: string) {
    this.toast.success(msg);
    this.cartService.clearCart();
    this.isProcessing = false;
    this.showPaymentModal = false;
    this.router.navigate(['/catalog']);
  }

  private handleError(err: any) {
    this.toast.error(typeof err?.error?.detail === 'string' ? err.error.detail : 'No se pudo procesar la solicitud. Revisa los datos y el stock.');
    console.error(err);
    this.isProcessing = false;
  }
}
