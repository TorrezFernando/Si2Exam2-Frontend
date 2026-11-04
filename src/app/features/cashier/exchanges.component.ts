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
      <p class="text-secondary mb-md">Hasta 48 horas desde la compra, en su sucursal original. Se conserva el precio pagado por la prenda devuelta. Las diferencias se liquidan en efectivo.</p>
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
          <label>Prenda devuelta
            <select class="form-control" [(ngModel)]="originalId" (ngModelChange)="invalidate()">
              <option [ngValue]="null">Selecciona una prenda</option>
              <option *ngFor="let item of order.items" [ngValue]="item.variant_id">{{ item.variant?.product?.name || 'Prenda' }} · {{ item.variant?.size }} / {{ item.variant?.color }} · {{ item.quantity }} compradas a Bs {{ item.unit_price }}</option>
            </select>
          </label>
          <label>Prenda a entregar
            <select class="form-control" [(ngModel)]="replacementId" (ngModelChange)="invalidate()">
              <option [ngValue]="null">Selecciona la nueva variante</option>
              <option *ngFor="let variant of replacements" [ngValue]="variant.id">{{ variant.label }}</option>
            </select>
          </label>
          <label>Cantidad <input class="form-control" type="number" min="1" [(ngModel)]="quantity" (ngModelChange)="invalidate()"></label>
          <label>Motivo <input class="form-control" maxlength="255" [(ngModel)]="reason" (ngModelChange)="invalidate()"></label>
          <button class="btn btn-outline mt-sm" (click)="preview()" [disabled]="!originalId || !replacementId || quantity < 1">Consultar diferencia y disponibilidad</button>
          <div *ngIf="quote" class="card mt-md">
            <p>Precio pagado: Bs {{ quote.original_unit_price | number:'1.2-2' }} · Precio nuevo: Bs {{ quote.new_unit_price | number:'1.2-2' }}</p>
            <strong>{{ quote.action === 'collect' ? 'Cobrar al cliente' : quote.action === 'refund' ? 'Devolver al cliente' : 'Sin diferencia de precio' }}: Bs {{ absoluteDifference | number:'1.2-2' }}</strong>
            <p>Límite: {{ quote.deadline | date:'short' }}. El servidor vuelve a comprobar stock y precio al confirmar.</p>
            <label><input type="checkbox" [(ngModel)]="confirmed"> Recibí la prenda original y realicé el cobro o devolución indicados, si corresponde.</label>
            <button class="btn btn-primary mt-sm" (click)="submit()" [disabled]="!confirmed">Registrar cambio</button>
          </div>
        </div>
      </fieldset>
      <div *ngIf="receipt" class="card mt-md" role="status">
        <h3 class="font-bold">Comprobante de cambio #{{ receipt.id }}</h3>
        <p>Venta #{{ receipt.order_id }} · {{ receipt.created_at | date:'short' }}</p>
        <p>{{ receipt.quantity }} unidad(es): variante {{ receipt.original_variant_id }} → {{ receipt.new_variant_id }}</p>
        <p>Diferencia: Bs {{ receipt.difference_amount | number:'1.2-2' }} · {{ receipt.settlement_method === 'cash' ? 'Liquidada en efectivo' : 'Sin diferencia' }}</p>
        <p class="text-secondary">Importe positivo: cobrado. Importe negativo: devuelto. Comprobante interno.</p>
      </div>
      <div *ngIf="history.length" class="mt-md">
        <h3 class="font-bold">Historial de cambios de esta venta</h3>
        <p *ngFor="let change of history">#{{ change.id }} · {{ change.created_at | date:'short' }} · {{ change.quantity }} unidad(es) · Diferencia Bs {{ change.difference_amount | number:'1.2-2' }} · {{ change.settlement_method || 'Registro anterior sin liquidación documentada' }}</p>
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
  quantity = 1;
  reason = 'Cambio de talla/color';
  replacements: {id: number; label: string}[] = [];
  quote: any = null;
  receipt: any = null;
  history: any[] = [];
  confirmed = false;
  busy = false;
  error = '';
  pending: {orderId: number; body: any} | null = null;
  get absoluteDifference() { return Math.abs(this.quote?.difference_amount ?? 0); }
  private get storageKey() {
    const user = this.auth.currentUser();
    return `fs_exchange_pending_t${user?.tenant_id}_u${user?.id}`;
  }
  ngOnInit() {
    try { this.pending = JSON.parse(localStorage.getItem(this.storageKey) || 'null'); }
    catch { this.error = 'No se pudo leer el cambio pendiente. Conserva los datos locales y solicita revisión.'; }
  }
  invalidate() { this.quote = null; this.confirmed = false; }
  private body() { return {original_variant_id: this.originalId, new_variant_id: this.replacementId,
    quantity: this.quantity, branch_id: this.order.branch_id, reason: this.reason}; }
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
      this.replacements = products.flatMap(p => (p.variants || []).map((v: any) => ({id: v.id,
        label: `${p.name} · ${v.size} / ${v.color} · Bs ${v.effective_price ?? v.price_override ?? p.effective_price ?? p.base_price}`})));
      this.originalId = this.order.items[0]?.variant_id ?? null; this.replacementId = null;
      this.history = await firstValueFrom(this.api.get(`/orders/${this.order.id}/exchanges`));
    } catch (e) {this.order = null; this.error = this.message(e);}
    finally {this.busy = false;}
  }
  async preview() {
    if (this.busy || this.pending || !this.order) return;
    this.busy = true; this.error = ''; this.invalidate();
    try { this.quote = await firstValueFrom(this.api.post(`/orders/${this.order.id}/exchange/quote`, this.body())); }
    catch (e) {this.error = this.message(e);}
    finally {this.busy = false;}
  }
  async submit() {
    if (this.busy || this.network.isOffline()) return;
    if (!this.pending && (!this.quote || !this.confirmed || !this.order)) return;
    const key = this.storageKey;
    const token = this.auth.getToken();
    const draft = this.pending || {orderId: this.order.id, body: {...this.body(), request_key: crypto.randomUUID(),
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
