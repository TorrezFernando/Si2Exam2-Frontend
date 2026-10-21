import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { Product, ProductVariant, Reservation, Branch } from '../../core/models';

interface PosCartItem {
  variant: ProductVariant;
  productName: string;
  quantity: number;
  unitPrice: number;
}

@Component({
  selector: 'app-cashier',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="content-area" style="max-width: 1200px; margin: 0 auto; padding-top: var(--space-xl);">
      <div class="flex items-center justify-between mb-lg">
        <h1 class="text-2xl font-bold">Panel de Caja (POS)</h1>
        <div class="flex items-center gap-sm">
          <button class="btn btn-outline btn-sm" type="button" (click)="goToCatalog()">Ver catálogo</button>
          <button class="btn btn-outline btn-sm" type="button" (click)="goToProfile()">Mi perfil</button>
          <button class="btn btn-danger btn-sm" type="button" (click)="logout()">Cerrar sesión</button>
        </div>
      </div>

      <label>Sucursal de caja
        <select class="form-input" [(ngModel)]="branchId" [disabled]="cart.length > 0">
          <option [ngValue]="null">Selecciona una sucursal</option>
          <option *ngFor="let branch of branches" [ngValue]="branch.id">{{ branch.name }}</option>
        </select>
      </label>
      <p *ngIf="selectedReservation">Atendiendo reserva #{{ selectedReservation.id }}. Quita las prendas que el cliente no comprará.</p>
      <div class="grid" style="grid-template-columns: 2fr 1fr; gap: 24px;">
        <div style="display: flex; flex-direction: column; gap: 24px;">
          <div class="card card-glass p-lg">
            <h2 class="text-xl font-bold mb-md">Productos</h2>
            
            <div class="search-input-wrapper mb-md" style="display: flex; align-items: center; background: var(--bg-hover); padding: 8px 16px; border-radius: 20px;">
              <span class="mr-sm">🔍</span>
              <input 
                type="text" 
                class="form-input" 
                style="flex: 1; background: transparent; border: none; outline: none; color: white;" 
                placeholder="Buscar por nombre o SKU..." 
                [(ngModel)]="searchQuery" 
                (ngModelChange)="onSearch()"
              >
            </div>

            <div class="grid grid-2 gap-md" style="max-height: 500px; overflow-y: auto; padding-right: 12px;">
              <div *ngFor="let prod of filteredProducts" class="card" style="padding: 12px; background: var(--bg-base); border: 1px solid var(--border-subtle);">
                <h3 class="font-bold text-md truncate" [title]="prod.name">{{ prod.name }}</h3>
                <p class="text-sm text-primary mb-sm font-semibold">\${{ prod.base_price.toFixed(2) }}</p>
                
                <div *ngIf="prod.variants && prod.variants.length > 0" class="flex flex-col gap-xs mt-sm">
                  <div *ngFor="let v of prod.variants" class="flex justify-between items-center bg-hover p-xs" style="border-radius: 4px;">
                    <div class="flex items-center gap-xs">
                      <span class="text-xs font-semibold">{{ v.color }} / {{ v.size }}</span>
                      <span class="badge" [ngClass]="getVariantStock(v) > 0 ? 'badge-success' : 'badge-danger'" style="font-size: 0.65rem; padding: 1px 5px;">
                        {{ getVariantStock(v) > 0 ? getVariantStock(v) + ' disp.' : 'Agotado' }}
                      </span>
                    </div>
                    <button
                      class="btn btn-accent btn-sm"
                      style="padding: 2px 8px; font-size: 0.75rem;"
                      [disabled]="!v.id || getVariantStock(v) <= getCartQuantityForVariant(v.id)"
                      (click)="addToCart(prod, v)"
                    >
                      + Añadir
                    </button>
                  </div>
                </div>
                <div *ngIf="!prod.variants || prod.variants.length === 0" class="text-xs text-secondary mt-sm">Sin variantes</div>
              </div>
              
              <div *ngIf="filteredProducts.length === 0" class="text-secondary text-center p-lg" style="grid-column: span 2;">
                No se encontraron productos.
              </div>
            </div>
          </div>

          <div class="card card-glass p-lg">
            <h2 class="text-xl font-bold mb-md">Reservas próximas</h2>

            <div *ngIf="reservations.length === 0" class="text-secondary text-center p-md">
              No hay reservas pendientes o confirmadas.
            </div>

            <div *ngFor="let reservation of reservations.slice(0, 6)" class="mb-sm p-sm" style="background: var(--bg-hover); border-radius: 10px; border: 1px solid var(--border-subtle);">
              <div class="flex justify-between items-center mb-xs">
                <strong>{{ getReservationTitle(reservation) }}</strong>
                <span class="badge" [ngClass]="reservation.status === 'pending' ? 'badge-warning' : reservation.status === 'cancelled' ? 'badge-danger' : reservation.status === 'completed' ? 'badge-primary' : 'badge-success'">
                  {{ reservation.status }}
                </span>
              </div>
              <div class="text-xs text-secondary mb-xs">
                {{ getReservationProductsText(reservation) }}
              </div>
              <div class="text-xs text-primary mb-xs">
                Hora de retiro: {{ getReservationPickupText(reservation) }}
              </div>

              <div *ngIf="editingReservationId === reservation.id" class="mt-sm space-y-xs">
                <input class="form-input w-full" type="datetime-local" [(ngModel)]="reservationEditDraft.pickup_date" />
                <textarea class="form-input w-full" rows="2" [(ngModel)]="reservationEditDraft.notes" placeholder="Notas de la reserva"></textarea>
                <div class="flex gap-xs">
                  <button class="btn btn-primary btn-sm" (click)="saveReservationEdit(reservation)">Guardar</button>
                  <button class="btn btn-ghost btn-sm" (click)="cancelReservationEdit()">Cancelar</button>
                </div>
              </div>

              <div *ngIf="editingReservationId !== reservation.id" class="flex flex-wrap gap-xs mt-sm">
                <button class="btn btn-ghost btn-sm" (click)="startReservationEdit(reservation)">Editar</button>
                <button class="btn btn-primary btn-sm" (click)="changeReservationStatus(reservation.id, 'confirmed')" *ngIf="reservation.status !== 'confirmed' && reservation.status !== 'completed'">Confirmar</button>
                <button class="btn btn-accent btn-sm" (click)="loadReservationForSale(reservation)" *ngIf="reservation.status !== 'completed'">Cobrar prendas</button>
                <button class="btn btn-danger btn-sm" (click)="changeReservationStatus(reservation.id, 'cancelled')" *ngIf="reservation.status !== 'cancelled'">Cancelar</button>
              </div>
            </div>
          </div>
        </div>

        <div class="card card-glass p-lg flex flex-col" style="height: fit-content;">
          <h2 class="text-xl font-bold mb-md">Ventas del día</h2>

          <div class="grid gap-sm mb-md">
            <div class="p-sm" style="background: var(--bg-hover); border-radius: 10px;">
              <div class="text-xs text-secondary">Total</div>
              <div class="text-2xl font-bold text-primary">\${{ dailySummary.total.toFixed(2) }}</div>
            </div>
            <div class="p-sm" style="background: var(--bg-hover); border-radius: 10px;">
              <div class="text-xs text-secondary">Órdenes</div>
              <div class="text-xl font-bold">{{ dailySummary.orders }}</div>
            </div>
            <div class="p-sm" style="background: var(--bg-hover); border-radius: 10px;">
              <div class="text-xs text-secondary">Ticket promedio</div>
              <div class="text-xl font-bold">\${{ dailySummary.average.toFixed(2) }}</div>
            </div>
          </div>

          <div class="mb-md">
            <div class="text-sm font-semibold mb-xs">Desglose por pago</div>
            <div *ngFor="let payment of paymentBreakdown" class="flex justify-between text-sm text-secondary mb-xs">
              <span>{{ payment.label }}</span>
              <strong>{{ payment.value }}</strong>
            </div>
          </div>

          <h2 class="text-xl font-bold mb-md mt-md">Orden Actual</h2>

          <div class="flex-1" style="overflow-y: auto; max-height: 350px;">
            <div *ngIf="cart.length === 0" class="text-secondary text-center p-md">
              El carrito está vacío.
            </div>

            <div *ngFor="let item of cart; let i = index" class="flex justify-between items-center mb-sm p-sm" style="background: var(--bg-hover); border-radius: 8px;">
              <div style="max-width: 55%;">
                <div class="font-semibold text-sm truncate" [title]="item.productName">{{ item.productName }}</div>
                <div class="text-xs text-secondary font-medium">
                  {{ item.variant.color }} / {{ item.variant.size }} (Stock: {{ getVariantStock(item.variant) }})
                </div>
              </div>
              <div class="flex items-center gap-xs">
                <span class="font-bold text-sm">\${{ item.unitPrice.toFixed(2) }}</span>
                <div class="flex items-center bg-base" style="border-radius: 12px; overflow: hidden; border: 1px solid var(--border-subtle);">
                  <button class="btn btn-sm" style="padding: 0 6px;" (click)="updateQuantity(i, -1)">-</button>
                  <span class="text-xs px-xs">{{ item.quantity }}</span>
                  <button class="btn btn-sm" style="padding: 0 6px;" [disabled]="item.quantity >= getVariantStock(item.variant)" (click)="updateQuantity(i, 1)">+</button>
                </div>
                <button class="text-danger ml-xs" (click)="removeItem(i)" title="Eliminar">🗑️</button>
              </div>
            </div>
          </div>

          <div class="mt-md pt-md" style="border-top: 1px solid var(--border-subtle);">
            <div class="flex justify-between items-center mb-md">
              <span class="text-lg">Total:</span>
              <span class="text-2xl font-bold text-primary">\${{ getTotal().toFixed(2) }}</span>
            </div>

            <div class="form-group mb-md">
              <label class="text-sm text-secondary mb-xs block">Método de Pago</label>
              <select class="form-input w-full" [(ngModel)]="paymentMethod">
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta (POS)</option>
                <option value="qr">Pago QR</option>
              </select>
            </div>

            <button 
              class="btn btn-primary btn-full" 
              style="padding: 16px; font-size: 1.1rem;"
              [disabled]="cart.length === 0 || loading"
              (click)="submitOrder()"
            >
              {{ loading ? 'Procesando...' : 'Confirmar Venta' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .grid-2 { grid-template-columns: repeat(2, 1fr); }
    .bg-hover { background: var(--bg-hover); }
    .bg-base { background: var(--bg-base); }
    .badge { display: inline-flex; padding: 4px 8px; border-radius: 999px; font-size: 0.7rem; text-transform: capitalize; }
    .badge-warning { background: rgba(255, 179, 0, 0.12); color: #ffc857; }
    .badge-success { background: rgba(34, 197, 94, 0.12); color: #6ee7b7; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
  `]
})
export class CashierComponent implements OnInit {
  products: Product[] = [];
  filteredProducts: Product[] = [];
  reservations: Reservation[] = [];
  orders: any[] = [];
  searchQuery = '';

  dailySummary = { total: 0, orders: 0, average: 0 };
  paymentBreakdown: { label: string; value: string }[] = [];

  cart: PosCartItem[] = [];
  branches: Branch[] = [];
  branchId: number | null = null;
  selectedReservation: Reservation | null = null;
  requestKey = crypto.randomUUID();
  paymentMethod = 'efectivo';
  loading = false;
  editingReservationId: number | null = null;
  reservationEditDraft = { pickup_date: '', notes: '' };

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.branchId = this.auth.currentUser()?.branch_id ?? null;
    this.api.getBranches().subscribe(b => this.branches = b.filter(x => this.auth.hasPermission("branches:write") || x.id === this.branchId));
    this.loadProducts();
    this.loadReservations();
    this.loadOrders();
  }

  goToCatalog() {
    this.router.navigate(['/catalog']);
  }

  goToProfile() {
    this.router.navigate(['/profile']);
  }

  logout() {
    this.auth.logout();
  }

  loadProducts() {
    this.api.getProducts().subscribe({
      next: (res) => {
        this.products = res;
        this.filteredProducts = res;
      },
      error: () => this.toast.error('Error al cargar productos')
    });
  }

  loadReservations() {
    this.api.getReservations({ status: 'pending' }).subscribe({
      next: (res) => {
        const confirmed = this.reservations.filter(r => r.status === 'confirmed');
        this.reservations = [...res, ...confirmed].slice(0, 12);
      },
      error: () => {
        this.reservations = [];
      }
    });

    this.api.getReservations({ status: 'confirmed' }).subscribe({
      next: (res) => {
        const pending = this.reservations.filter(r => r.status === 'pending');
        this.reservations = [...pending, ...res].sort((a, b) => {
          const aDate = new Date(a.pickup_date ?? a.created_at).getTime();
          const bDate = new Date(b.pickup_date ?? b.created_at).getTime();
          return aDate - bDate;
        }).slice(0, 12);
      }
    });
  }

  loadOrders() {
    this.api.getOrders({ skip: 0, limit: 100 }).subscribe({
      next: (res) => {
        this.orders = res || [];
        this.calculateDailySummary();
      },
      error: () => {
        this.orders = [];
        this.calculateDailySummary();
      }
    });
  }

  calculateDailySummary() {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const todayOrders = this.orders.filter((order) => {
      const created = new Date(order.created_at);
      return order.is_paid && created >= startOfDay;
    });

    const total = todayOrders.reduce((acc, order) => acc + Number(order.total_amount || 0), 0);
    const average = todayOrders.length ? total / todayOrders.length : 0;

    const byMethod: Record<string, number> = {};
    todayOrders.forEach((order) => {
      const label = order.payment_method || 'efectivo';
      byMethod[label] = (byMethod[label] || 0) + 1;
    });

    this.dailySummary = {
      total,
      orders: todayOrders.length,
      average
    };

    this.paymentBreakdown = Object.entries(byMethod).map(([label, value]) => ({
      label: label.toUpperCase(),
      value: `${value} ordenes`
    }));

    if (this.paymentBreakdown.length === 0) {
      this.paymentBreakdown = [{ label: 'EFECTIVO', value: '0 ordenes' }];
    }
  }

  getVariantStock(v: ProductVariant): number {
    if (this.selectedReservation) return this.selectedReservation.items?.find(i => i.variant_id === v.id)?.quantity ?? 0;
    return v.inventories?.find(i => i.branch_id === this.branchId)?.stock ?? 0;
  }

  loadReservationForSale(reservation: Reservation) {
    if (this.cart.length) { this.toast.warning('Vacía el carrito antes de atender una reserva.'); return; }
    const loaded: PosCartItem[] = [];
    for (const item of reservation.items ?? []) {
      const product = this.products.find(p => p.variants?.some(v => v.id === item.variant_id));
      const variant = product?.variants?.find(v => v.id === item.variant_id);
      if (!product || !variant) { this.toast.error('No se pudo cargar una prenda. Revisa el catálogo.'); return; }
      loaded.push({ variant, productName: product.name, quantity: item.quantity, unitPrice: variant.price_override ?? product.base_price });
    }
    this.branchId = reservation.branch_id;
    this.selectedReservation = reservation;
    this.cart = loaded;
  }

  getCartQuantityForVariant(variantId?: number): number {
    if (!variantId) return 0;
    const item = this.cart.find(i => i.variant?.id === variantId);
    return item ? item.quantity : 0;
  }

  onSearch() {
    const q = this.searchQuery.toLowerCase().trim();
    this.filteredProducts = q 
      ? this.products.filter(p => 
          p.name.toLowerCase().includes(q) || 
          p.description?.toLowerCase().includes(q) ||
          p.variants?.some(v => 
            v.sku?.toLowerCase().includes(q) ||
            v.color?.toLowerCase().includes(q) ||
            v.size?.toLowerCase().includes(q)
          )
        )
      : this.products;
  }

  addToCart(product: Product, variant: ProductVariant) {
    if (!variant || !variant.id) {
      this.toast.error('Esta variante no tiene ID válido y no puede agregarse a la venta.');
      return;
    }

    const availableStock = this.getVariantStock(variant);
    const existing = this.cart.find(item => item.variant.id === variant.id);
    const currentInCart = existing ? existing.quantity : 0;

    if (availableStock <= 0) {
      this.toast.error(`La variante ${variant.color} / ${variant.size} está agotada.`);
      return;
    }

    if (currentInCart >= availableStock) {
      this.toast.warning(`No puedes agregar más unidades. Stock disponible para ${variant.color} / ${variant.size}: ${availableStock}`);
      return;
    }

    if (existing) {
      existing.quantity++;
    } else {
      this.cart.push({
        variant,
        productName: product.name,
        quantity: 1,
        unitPrice: variant.price_override ?? product.base_price
      });
    }
  }

  updateQuantity(index: number, delta: number) {
    const item = this.cart[index];
    if (delta > 0) {
      const stock = this.getVariantStock(item.variant);
      if (item.quantity >= stock) {
        this.toast.warning(`Alcanzado el stock máximo (${stock}) para ${item.variant.color} / ${item.variant.size}`);
        return;
      }
    }
    item.quantity += delta;
    if (item.quantity <= 0) {
      this.cart.splice(index, 1);
    }
  }

  removeItem(index: number) {
    this.cart.splice(index, 1);
  }

  getTotal(): number {
    return this.cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  }

  submitOrder() {
    if (this.cart.length === 0 || this.loading) return;
    if (!this.branchId) { this.toast.error('Selecciona la sucursal de caja'); return; }
    this.loading = true;

    const validItems = this.cart
      .filter(item => item.variant && item.variant.id != null)
      .map(item => ({
        variant_id: item.variant.id as number,
        quantity: item.quantity,
        unit_price: item.unitPrice
      }));

    if (validItems.length === 0) {
      this.toast.error('No hay variantes válidas para registrar la venta.');
      this.loading = false;
      return;
    }

    const orderData = {
      branch_id: this.branchId,
      order_type: this.selectedReservation ? "reserva_pickup" : "presencial",
      reservation_id: this.selectedReservation?.id,
      request_key: this.requestKey,
      payment_method: this.paymentMethod,
      card_type: this.paymentMethod === 'tarjeta' ? 'VISA' : undefined,
      card_last_four: this.paymentMethod === 'tarjeta' ? '0000' : undefined,
      transaction_ref: `POS-${Math.floor(Math.random() * 10000)}`,
      items: validItems
    };

    this.api.createOrder(orderData).subscribe({
      next: (res) => {
        this.loadProducts();
        this.loadReservations();
        this.selectedReservation = null;
        this.requestKey = crypto.randomUUID();
        this.toast.success(`Venta #${res.id} registrada con éxito`);
        this.cart = [];
        this.loading = false;
        this.loadOrders();
      },
      error: () => {
        this.toast.error('Error al registrar la venta');
        this.loading = false;
      }
    });
  }

  getReservationTitle(reservation: Reservation): string {
    const products = this.getReservationProducts(reservation);
    return products.length ? products.map(p => p.productName).join(', ') : 'Reserva';
  }

  getReservationProductsText(reservation: Reservation): string {
    const products = this.getReservationProducts(reservation);
    return products.length
      ? products.map(p => `${p.productName} · ${p.variantLabel}`).join(' | ')
      : 'Sin productos';
  }

  startReservationEdit(reservation: Reservation) {
    this.editingReservationId = reservation.id;
    this.reservationEditDraft = {
      pickup_date: reservation.pickup_date ? new Date(reservation.pickup_date).toISOString().slice(0, 16) : '',
      notes: reservation.notes ?? ''
    };
  }

  cancelReservationEdit() {
    this.editingReservationId = null;
    this.reservationEditDraft = { pickup_date: '', notes: '' };
  }

  saveReservationEdit(reservation: Reservation) {
    const payload: Partial<Reservation> = {
      notes: this.reservationEditDraft.notes?.trim() || undefined,
      pickup_date: this.reservationEditDraft.pickup_date
        ? new Date(this.reservationEditDraft.pickup_date).toISOString()
        : undefined
    };

    this.api.updateReservation(reservation.id, payload).subscribe({
      next: () => {
        this.toast.success('Reserva actualizada');
        this.cancelReservationEdit();
        this.loadReservations();
      },
      error: () => this.toast.error('No se pudo actualizar la reserva')
    });
  }

  changeReservationStatus(id: number, status: string) {
    this.api.updateReservationStatus(id, status).subscribe({
      next: () => {
        this.toast.success('Estado actualizado');
        this.loadReservations();
      },
      error: () => this.toast.error('No se pudo actualizar el estado')
    });
  }

  getReservationPickupText(reservation: Reservation): string {
    if (!reservation.pickup_date) {
      return 'Sin horario definido';
    }
    return new Date(reservation.pickup_date).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private getReservationProducts(reservation: Reservation) {
    const products: { productName: string; variantLabel: string }[] = [];
    const variantIndex = new Map<number, { productName: string; variantLabel: string }>();

    this.products.forEach((product) => {
      (product.variants || []).forEach((variant) => {
        if (variant.id) {
          variantIndex.set(variant.id, {
            productName: product.name,
            variantLabel: `${variant.color} / ${variant.size}`
          });
        }
      });
    });

    (reservation.items || []).forEach((item) => {
      const match = variantIndex.get(item.variant_id);
      if (match) {
        products.push(match);
      } else {
        products.push({ productName: `Variante ${item.variant_id}`, variantLabel: `Cant. ${item.quantity}` });
      }
    });

    return products;
  }
}
