import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Order } from '../../core/models';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `<div class="content-area"><div class="card" style="max-width:640px;margin:40px auto">
    <h1>Pago de tu compra</h1>
    <p *ngIf="order">Orden #{{ order.id }} · Bs {{ order.total_amount | number:'1.2-2' }}</p>
    <p *ngIf="order?.is_paid" class="text-success">Pago confirmado. Tu compra ya está registrada.</p>
    <ng-container *ngIf="order && !order.is_paid">
      <p>Pago pendiente. Abre Libélula para pagar y después verifica el estado.</p>
      <button class="btn btn-primary" [disabled]="busy" (click)="pay()">Pagar en Libélula</button>
      <button class="btn btn-outline" [disabled]="busy" (click)="verify()">Verificar pago</button>
    </ng-container>
    <p role="status">{{ message }}</p>
    <a routerLink="/catalog">Volver al catálogo</a>
  </div></div>`
})
export class PaymentComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  order?: Order;
  busy = false;
  message = '';
  private id = Number(this.route.snapshot.paramMap.get('id'));
  ngOnInit() {
    this.api.get<Order>(`/orders/${this.id}`).subscribe({ next: order => this.order = order, error: e => this.fail(e) });
  }
  pay() {
    this.busy = true;
    this.api.post<{paid:boolean; payment_url:string}>(`/payments/${this.id}/checkout`, {}).subscribe({
      next: result => { this.busy = false; if (result.paid) this.verify(); else window.location.assign(result.payment_url); },
      error: e => this.fail(e)
    });
  }
  verify() {
    this.busy = true;
    this.api.post<Order>(`/payments/${this.id}/verify`, {}).subscribe({
      next: order => { this.order = order; this.busy = false; this.message = order.is_paid ? 'Gracias por tu compra.' : 'Libélula aún no confirma el pago.'; },
      error: e => this.fail(e)
    });
  }
  private fail(e: any) { this.busy = false; this.message = typeof e?.error?.detail === 'string' ? e.error.detail : 'No se pudo consultar el pago. Puedes reintentar.'; }
}
