import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { NetworkService } from '../../core/services/network.service';

@Component({
  selector: 'app-garment-exchanges', standalone: true, imports: [CommonModule, FormsModule],
  template: `
    <section class="card p-lg mt-lg">
      <h2 class="text-xl font-bold">Cambios de prendas</h2>
      <p class="text-secondary mb-md">Hasta 48 horas desde la compra, en su sucursal original. Alternativas: (1) mismo producto si estaba defectuoso, o (2) otra talla, color o producto. Si el nuevo ítem cuesta más se registra el dinero adicional; si no existe el ítem deseado, la devolución del dinero se procesa a fin de mes (ajuste mensual).</p>
      <p *ngIf="network.isOffline()" class="text-danger">Se necesita conexión para confirmar el plazo, inventario y registro del cambio.</p>
      <p *ngIf="error" class="text-danger" role="alert">{{ error }}</p>
      <div *ngIf="pending" class="card mb-md">
        <strong>Registro pendiente de confirmar: venta #{{ pending.orderId }}</strong>
        <p>Diferencia ya confirmada: Bs {{ pending.body.confirmed_difference_amount | number:'1.2-2' }}. Reintenta el mismo registro; no vuelvas a cobrar ni a devolver dinero.</p>
        <button class="btn btn-primary" (click)="submit()" [disabled]="busy || network.isOffline()">Reintentar registro, sin repetir cobro</button>
      </div>
      <fieldset [disabled]="busy || !!pending || network.isOffline()">
        <label>Número de venta
          <input class="form-control" type="number" min="1" [(ngModel)]="orderId" (ngModelChange)="order = null; invalidate()">
        </label>
        <button class="btn btn-outline mt-sm" (click)="loadOrder()" [disabled]="!orderId">Buscar venta</button>
        <div *ngIf="order" class="mt-md">
          <p>Venta #{{ order.id }} · Sucursal {{ order.branch_id }} · {{ order.created_at | date:'short' }}</p>
          <label>Alternativa de cambio
            <select class="form-control" [(ngModel)]="exchangeType" (ngModelChange)="onExchangeTypeChange()">
              <option value="variant_or_product">2) Cambio por otra talla, color o producto diferente</option>
              <option value="same_defective">1) Cambio por el mismo producto (porque estaba defectuoso)</option>
              <option value="month_end_refund">No existe el ítem deseado → devolver el dinero de esta prenda a fin de mes</option>
            </select>
          </label>
          <label>Prenda devuelta
            <select class="form-control" [(ngModel)]="originalId" (ngModelChange)="onOriginalChange()">
              <option [ngValue]="null">Selecciona una prenda</option>
              <option *ngFor="let item of order.items" [ngValue]="item.variant_id">{{ item.variant?.product?.name || 'Prenda' }} · {{ item.variant?.size }} / {{ item.variant?.color }} · {{ item.quantity }} compradas a Bs {{ item.unit_price }}</option>
            </select>
          </label>
          <label>{{ exchangeType === 'month_end_refund' ? 'Prenda deseada (sin stock)' : 'Prenda a entregar' }}
            <select class="form-control" [(ngModel)]="replacementId" (ngModelChange)="invalidate()">
              <option [ngValue]="null">Selecciona la nueva variante</option>
              <option *ngFor="let variant of replacements" [ngValue]="variant.id">{{ variant.label }}</option>
            </select>
          </label>
          <p *ngIf="selectedReplacement as sel" class="text-sm" [class.text-danger]="sel.stock !== null && sel.stock < quantity" [class.text-secondary]="sel.stock === null || sel.stock >= quantity">
            Disponibilidad en sucursal:
            <strong>{{ sel.stock === null ? 'Se verificará al consultar' : (sel.stock + ' unidad(es) disponible(s)') }}</strong>
            <span *ngIf="sel.id === originalId"> · (Mismo producto por prenda defectuosa: sin cobro adicional)</span>
          </p>
          <div *ngIf="exchangeType !== 'month_end_refund' && (isSelectedOutOfStock || outOfStockError)" class="card mt-sm" style="border-left: 4px solid #f59e0b; background: rgba(245, 158, 11, 0.08);">
            <strong>⚠️ No existe stock suficiente de la prenda solicitada en esta sucursal</strong>
            <p class="text-sm mt-xs">Alternativas disponibles cuando no existe el ítem:</p>
            <ul class="text-sm" style="margin: 6px 0 10px 18px;">
              <li><strong>Opción 1:</strong> Selecciona en <em>"Prenda a entregar"</em> otra talla, color o producto diferente disponible (si supera el precio, se registrará el dinero adicional que el cliente está aumentando).</li>
              <li><strong>Opción 2:</strong> Si no existe el ítem deseado, procesa la <strong>devolución del dinero a Fin de Mes (ajuste mensual)</strong>.</li>
            </ul>
            <button type="button" class="btn btn-outline btn-sm" (click)="triggerMonthEndReturn()">
              📅 No existe el ítem deseado → Procesar devolución de dinero a Fin de Mes
            </button>
          </div>
          <label>Cantidad <input class="form-control" type="number" min="1" [(ngModel)]="quantity" (ngModelChange)="invalidate()"></label>
          <label>Motivo <input class="form-control" maxlength="255" [(ngModel)]="reason" (ngModelChange)="invalidate()"></label>
          <button class="btn btn-outline mt-sm" (click)="preview()" [disabled]="!originalId || !replacementId || quantity < 1">{{ exchangeType === 'month_end_refund' ? 'Consultar devolución a fin de mes' : 'Consultar diferencia y disponibilidad' }}</button>
          <div *ngIf="quote?.action === 'refund_month_end'" class="card mt-md" style="border-left: 4px solid #f59e0b;">
            <p>Modalidad: <strong>Devolución del dinero a fin de mes (ajuste mensual)</strong></p>
            <p>Precio pagado: Bs {{ quote.original_unit_price | number:'1.2-2' }} × {{ quote.quantity }}<span *ngIf="quote.defective"> · Prenda defectuosa: no vuelve al stock vendible</span></p>
            <strong>Importe a devolver en el ajuste del {{ quote.scheduled_for | date:'dd/MM/yyyy' }}: Bs {{ quote.refund_amount | number:'1.2-2' }}</strong>
            <p class="text-sm">Solo se devuelve esta prenda; el resto de la venta sigue vigente. No entregues dinero ahora.</p>
            <label><input type="checkbox" [(ngModel)]="confirmed"> Recibí la prenda e informé al cliente que el dinero se devolverá a fin de mes.</label>
            <button class="btn btn-primary mt-sm" (click)="submit()" [disabled]="!confirmed">Registrar devolución a fin de mes</button>
          </div>
          <div *ngIf="quote && quote.action !== 'refund_month_end'" class="card mt-md">
            <p>
              Modalidad:
              <strong>{{ quote.exchange_type === 'same_defective' ? 'Cambio por el mismo producto (defectuoso)' : 'Cambio por talla, color o producto diferente' }}</strong>
            </p>
            <p>Precio pagado: Bs {{ quote.original_unit_price | number:'1.2-2' }} · Precio nuevo: Bs {{ quote.new_unit_price | number:'1.2-2' }}</p>
            <strong>{{ quote.action === 'collect' ? 'Cobrar al cliente (Dinero adicional que aumenta)' : quote.action === 'refund' ? 'Devolver al cliente' : 'Sin diferencia de precio' }}: Bs {{ absoluteDifference | number:'1.2-2' }}</strong>
            <div *ngIf="quote.action === 'collect'" class="mt-sm p-sm" style="background: rgba(99, 102, 241, 0.1); border-radius: 8px;">
              <p class="text-sm font-semibold">💵 El nuevo producto supera el precio original: registra el dinero adicional aumentado (Bs {{ absoluteDifference | number:'1.2-2' }})</p>
              <label class="text-sm">Medio de pago del dinero adicional
                <select class="form-control" [(ngModel)]="additionalPaymentMethod">
                  <option value="efectivo">Efectivo en caja</option>
                  <option value="qr">Código QR</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </label>
            </div>
            <p>Límite: {{ quote.deadline | date:'short' }}. El servidor vuelve a comprobar stock y precio al confirmar.</p>
            <label><input type="checkbox" [(ngModel)]="confirmed"> Recibí la prenda original y realicé el cobro o devolución indicados, si corresponde.</label>
            <button class="btn btn-primary mt-sm" (click)="submit()" [disabled]="!confirmed">Registrar cambio</button>
          </div>
        </div>
      </fieldset>
      <div *ngIf="receipt" class="card mt-md" role="status">
        <h3 class="font-bold">Comprobante de cambio #{{ receipt.id }}</h3>
        <p>Venta #{{ receipt.order_id }} · {{ receipt.created_at | date:'short' }}</p>
        <ng-container *ngIf="receipt.exchange_type === 'month_end_refund'; else regularReceipt">
          <p>{{ receipt.quantity }} unidad(es) de la variante {{ receipt.original_variant_id }} recibidas · ítem deseado (variante {{ receipt.new_variant_id }}) sin stock</p>
          <p>Devolución a fin de mes: Bs {{ -receipt.difference_amount | number:'1.2-2' }} · {{ receipt.disbursement_status === 'COMPLETED' ? 'Pagada en ajuste mensual' : 'Pendiente para el ' + (receipt.scheduled_for | date:'dd/MM/yyyy') }}</p>
        </ng-container>
        <ng-template #regularReceipt>
          <p>{{ receipt.quantity }} unidad(es): variante {{ receipt.original_variant_id }} → {{ receipt.new_variant_id }}</p>
          <p>Modalidad: {{ receipt.exchange_type === 'same_defective' ? 'Mismo producto (defectuoso)' : 'Talla, color o producto diferente' }}</p>
          <p>Diferencia: Bs {{ receipt.difference_amount | number:'1.2-2' }} · {{ receipt.settlement_method === 'cash' ? 'Liquidada' : 'Sin diferencia' }}<span *ngIf="receipt.difference_amount > 0"> · Dinero adicional cobrado por {{ receipt.additional_payment_method || 'efectivo' }}</span></p>
          <p class="text-secondary">Importe positivo: cobrado. Importe negativo: devuelto. Comprobante interno.</p>
        </ng-template>
      </div>
      <div *ngIf="history.length" class="mt-md">
        <h3 class="font-bold">Historial de cambios de esta venta</h3>
        <p *ngFor="let change of history">#{{ change.id }} · {{ change.created_at | date:'short' }} · {{ change.quantity }} unidad(es) · <ng-container *ngIf="change.settlement_method === 'month_end'; else regularChange">Devolución a fin de mes Bs {{ -change.difference_amount | number:'1.2-2' }} · {{ change.disbursement_status === 'COMPLETED' ? 'pagada' : 'pendiente' }}</ng-container><ng-template #regularChange>Diferencia Bs {{ change.difference_amount | number:'1.2-2' }} · {{ change.settlement_method || 'Registro anterior sin liquidación documentada' }}</ng-template></p>
      </div>
    </section>
  `,
  styles: [`fieldset {border:0;padding:0;display:grid;gap:12px} label {display:block;margin-top:8px} input[type=checkbox]{margin-right:8px}`],
})
export class GarmentExchangesComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  public network = inject(NetworkService);
  @Output() changed = new EventEmitter<void>();
  orderId: number | null = null;
  order: any = null;
  originalId: number | null = null;
  replacementId: number | null = null;
  exchangeType: 'same_defective' | 'variant_or_product' | 'month_end_refund' = 'variant_or_product';
  additionalPaymentMethod: 'efectivo' | 'qr' | 'tarjeta' | 'transferencia' = 'efectivo';
  quantity = 1;
  reason = 'Cambio de talla/color';
  replacements: {id: number; label: string; stock: number | null}[] = [];
  quote: any = null;
  receipt: any = null;
  history: any[] = [];
  confirmed = false;
  busy = false;
  error = '';
  outOfStockError = false;
  pending: {orderId: number; body: any} | null = null;
  get absoluteDifference() { return Math.abs(this.quote?.difference_amount ?? 0); }
  get selectedReplacement() { return this.replacements.find(r => r.id === this.replacementId) || null; }
  get isSelectedOutOfStock() {
    const sel = this.selectedReplacement;
    return !!sel && sel.stock !== null && sel.stock < this.quantity;
  }
  private get storageKey() {
    const user = this.auth.currentUser();
    return `fs_exchange_pending_t${user?.tenant_id}_u${user?.id}`;
  }
  ngOnInit() {
    try { this.pending = JSON.parse(localStorage.getItem(this.storageKey) || 'null'); }
    catch { this.error = 'No se pudo leer el cambio pendiente. Conserva los datos locales y solicita revisión.'; }
  }
  invalidate() { this.quote = null; this.confirmed = false; this.outOfStockError = false; }
  private readonly defaultReasons = ['Cambio de talla/color', 'Cambio por el mismo producto (prenda defectuosa)',
    'Prenda defectuosa y no existe stock para reposición', 'No existe stock del ítem deseado: devolución a fin de mes'];
  onExchangeTypeChange() {
    this.invalidate();
    if (this.exchangeType === 'same_defective') this.replacementId = this.originalId;
    if (this.defaultReasons.includes(this.reason)) this.reason = this.defaultReason();
  }
  private defaultReason() {
    if (this.exchangeType === 'same_defective') return 'Cambio por el mismo producto (prenda defectuosa)';
    if (this.exchangeType === 'month_end_refund') {
      return this.replacementId === this.originalId
        ? 'Prenda defectuosa y no existe stock para reposición'
        : 'No existe stock del ítem deseado: devolución a fin de mes';
    }
    return 'Cambio de talla/color';
  }
  onOriginalChange() {
    this.invalidate();
    if (this.exchangeType === 'same_defective') {
      this.replacementId = this.originalId;
    }
  }
  /** The desired item does not exist: refund only this garment at the month-end adjustment. */
  triggerMonthEndReturn() {
    if (!this.order) return;
    this.replacementId = this.replacementId || this.originalId;
    this.exchangeType = 'month_end_refund';
    this.onExchangeTypeChange();
    this.preview();
  }
  private body() {
    const payload: any = {
      original_variant_id: this.originalId,
      new_variant_id: this.replacementId,
      quantity: this.quantity,
      branch_id: this.order.branch_id,
      reason: this.reason,
    };
    if (this.exchangeType === 'month_end_refund') {
      payload.exchange_type = 'month_end_refund';
    } else if (this.exchangeType === 'same_defective' || this.originalId === this.replacementId) {
      payload.exchange_type = 'same_defective';
    }
    return payload;
  }
  private message(e: any) { return typeof e?.error?.detail === 'string' ? e.error.detail : e?.message || 'No se pudo registrar el cambio.'; }
  async loadOrder() {
    if (this.busy || this.pending || !this.orderId) return;
    this.busy = true; this.error = ''; this.invalidate(); this.receipt = null; this.history = [];
    try {
      this.order = await firstValueFrom(this.api.get(`/orders/${this.orderId}`));
      const products: any[] = [];
      for (let skip = 0; ; skip += 100) {
        const page = await firstValueFrom(this.api.get<any[]>('/products', {params: {skip, limit: 100}}));
        products.push(...page); if (page.length < 100) break;
      }
      this.replacements = products.flatMap(p => (p.variants || []).map((v: any) => {
        const inv = Array.isArray(v.inventories)
          ? v.inventories.find((i: any) => i.branch_id === this.order.branch_id)
          : null;
        const stock = inv ? Number(inv.stock ?? 0) : (typeof v.stock === 'number' ? v.stock : null);
        return {
          id: v.id,
          stock,
          label: `${p.name} · ${v.size} / ${v.color} · Bs ${v.effective_price ?? v.price_override ?? p.effective_price ?? p.base_price}`,
        };
      }));
      this.originalId = this.order.items[0]?.variant_id ?? null;
      this.replacementId = this.exchangeType === 'same_defective' ? this.originalId : null;
      this.history = await firstValueFrom(this.api.get(`/orders/${this.order.id}/exchanges`));
    } catch (e) {this.order = null; this.error = this.message(e);}
    finally {this.busy = false;}
  }
  async preview() {
    if (this.busy || this.pending || !this.order) return;
    this.busy = true; this.error = ''; this.invalidate();
    try { this.quote = await firstValueFrom(this.api.post(`/orders/${this.order.id}/exchange/quote`, this.body())); }
    catch (e: any) {
      this.error = this.message(e);
      if (e?.status === 409 && String(this.error).toLowerCase().includes('stock')) {
        this.outOfStockError = true;
      }
    }
    finally {this.busy = false;}
  }
  async submit() {
    if (this.busy || this.network.isOffline()) return;
    if (!this.pending && (!this.quote || !this.confirmed || !this.order)) return;
    const key = this.storageKey;
    const token = this.auth.getToken();
    const extraPayment = this.quote?.action === 'collect' && this.additionalPaymentMethod !== 'efectivo'
      ? {additional_payment_method: this.additionalPaymentMethod}
      : {};
    const draft = this.pending || {orderId: this.order.id, body: {...this.body(), ...extraPayment, request_key: crypto.randomUUID(),
      confirmed_difference_amount: this.quote.difference_amount, settlement_confirmed: true}};
    this.busy = true; this.error = '';
    try {
      // Preserve the exact request across reloads or a lost server response.
      localStorage.setItem(key, JSON.stringify(draft)); this.pending = draft;
      const result = await firstValueFrom(this.api.post(`/orders/${draft.orderId}/exchange`, draft.body,
        {headers: {Authorization: `Bearer ${token}`}}));
      localStorage.removeItem(key);
      if (key !== this.storageKey || token !== this.auth.getToken()) return;
      this.pending = null; this.receipt = result; this.invalidate(); this.changed.emit();
      this.history = await firstValueFrom(this.api.get(`/orders/${draft.orderId}/exchanges`));
    } catch (e: any) {
      if (key !== this.storageKey) return;
      this.error = this.message(e);
      if ([400, 404, 409, 422].includes(e?.status)) {
        localStorage.removeItem(key); this.pending = null; this.invalidate();
      }
    } finally {this.busy = false;}
  }
}
