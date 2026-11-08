import {Component,EventEmitter,Output,OnInit,inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {firstValueFrom} from 'rxjs';
import {ApiService} from '../../core/services/api.service';
import {AuthService} from '../../core/services/auth.service';
import {NetworkService} from '../../core/services/network.service';

@Component({selector:'app-full-return',standalone:true,imports:[CommonModule,FormsModule],template:`
 <section class="card p-lg mt-lg" id="full-return-section">
  <h2>Devolución de dinero</h2>
  <p>Incluye las prendas entregadas en cambios anteriores. Comprueba físicamente todas las prendas indicadas antes de registrar.</p>
  <p role="alert">{{error}}</p>
  <div *ngIf="pending"><p>Registro pendiente de confirmar. No repitas la devolución de dinero.</p><button class="btn btn-primary" (click)="submit()" [disabled]="busy || network.isOffline()">Reintentar devolución registrada</button></div>
  <fieldset [disabled]="busy || !!pending || network.isOffline()">
   <label>Venta a devolver<input class="form-control" type="number" min="1" [(ngModel)]="orderId" (ngModelChange)="reset()"></label>
   <label>Momento de la devolución
    <select class="form-control" [(ngModel)]="refundTiming" (ngModelChange)="quote=null;confirmed=false">
     <option value="IMMEDIATE">Inmediata en efectivo (caja)</option>
     <option value="MONTH_END">A fin de mes (ajuste mensual) · toda la venta (para una sola prenda usa Cambios)</option>
    </select>
   </label>
   <label><input type="checkbox" [(ngModel)]="isDefective"> La prenda devuelta está defectuosa (no vuelve al stock vendible)</label>
   <label>Motivo<input class="form-control" maxlength="255" [(ngModel)]="reason"></label>
   <button class="btn btn-outline" (click)="preview()" [disabled]="!orderId">Consultar devolución</button>
   <div *ngIf="quote">
    <p>Venta #{{quote.order_id}} · Sucursal {{quote.branch_id}}</p>
    <ul><li *ngFor="let item of quote.items">{{item.quantity}} × {{item.label}}</li></ul>
    <ng-container *ngIf="quote.refund_timing === 'MONTH_END'; else immediate">
     <strong>Devolución programada a fin de mes: Bs {{quote.refund_amount | number:'1.2-2'}}</strong>
     <p>Fecha de ajuste mensual: {{quote.scheduled_for | date:'dd/MM/yyyy'}}</p>
     <label><input type="checkbox" [(ngModel)]="confirmed"> Recibí las prendas e informé al cliente que el dinero se devolverá en el ajuste de fin de mes.</label>
     <button class="btn btn-primary" (click)="submit()" [disabled]="!confirmed">Registrar devolución a fin de mes</button>
    </ng-container>
    <ng-template #immediate>
     <strong>Devolver en efectivo: Bs {{quote.refund_amount | number:'1.2-2'}}</strong>
     <label><input type="checkbox" [(ngModel)]="confirmed"> Recibí todas las prendas indicadas y devolví el importe en efectivo.</label>
     <button class="btn btn-primary" (click)="submit()" [disabled]="!confirmed">Registrar devolución completa</button>
    </ng-template>
   </div>
  </fieldset>
  <div *ngIf="receipt" role="status">
   <h3>Comprobante de devolución #{{receipt.id}}</h3>
   <p *ngIf="receipt.refund_timing === 'MONTH_END'; else paidNow">Venta #{{receipt.order_id}} · {{receipt.created_at | date:'short'}} · Bs {{receipt.refund_amount | number:'1.2-2'}} · {{receipt.disbursement_status === 'COMPLETED' ? 'Pagado en ajuste mensual' : 'Pendiente para fin de mes (' + (receipt.scheduled_for | date:'dd/MM/yyyy') + ')'}}</p>
   <ng-template #paidNow><p>Venta #{{receipt.order_id}} · {{receipt.created_at | date:'short'}} · Efectivo devuelto: Bs {{receipt.refund_amount | number:'1.2-2'}}</p></ng-template>
   <ul><li *ngFor="let item of receipt.items">{{item.quantity}} × {{item.label}}</li></ul>
  </div>

  <div class="mt-md" *ngIf="monthEnd.length">
   <h3>Devoluciones pendientes de fin de mes</h3>
   <p>Total pendiente: Bs {{pendingTotal | number:'1.2-2'}}</p>
   <ul>
    <li *ngFor="let r of monthEnd">Venta #{{r.order_id}} · {{r.source === 'exchange' ? r.quantity + ' prenda(s) sin ítem deseado (cambio #' + r.id + ')' : 'Venta completa'}} · Bs {{r.refund_amount | number:'1.2-2'}} · {{r.disbursement_status === 'COMPLETED' ? 'Liquidada ' + (r.settled_at | date:'dd/MM/yyyy') : 'Pendiente (' + (r.scheduled_for | date:'dd/MM/yyyy') + ')'}}
     <button *ngIf="r.disbursement_status !== 'COMPLETED'" class="btn btn-sm btn-outline" (click)="settle(r)" [disabled]="busy">Liquidar</button>
    </li>
   </ul>
   <button *ngIf="pendingTotal > 0" class="btn btn-outline" (click)="settleAll()" [disabled]="busy">Procesar ajuste de fin de mes</button>
  </div>
  <p *ngIf="network.isOffline()">Se requiere conexión para consultar y confirmar devoluciones.</p>
 </section>`})
export class FullReturnComponent implements OnInit {
 api=inject(ApiService);auth=inject(AuthService);network=inject(NetworkService);
 @Output() changed=new EventEmitter<void>();
 orderId:number|null=null;quote:any=null;receipt:any=null;pending:any=null;confirmed=false;busy=false;error='';
 refundTiming:'IMMEDIATE'|'MONTH_END'='IMMEDIATE';isDefective=false;reason='';desiredVariantId:number|null=null;
 monthEnd:any[]=[];
 get pendingTotal(){return this.monthEnd.filter(r=>r.disbursement_status!=='COMPLETED').reduce((s,r)=>s+Number(r.refund_amount||0),0);}
 get key(){const u=this.auth.currentUser();return `fs_full_return_t${u?.tenant_id}_u${u?.id}`;}
 ngOnInit(){try{this.pending=JSON.parse(localStorage.getItem(this.key)||'null');}catch{this.error='No se pudo leer la devolución pendiente.';}this.loadMonthEnd();}
 reset(){this.quote=null;this.receipt=null;this.confirmed=false;}
 async loadMonthEnd(){
   if(!this.auth.hasPermission('sales:read')&&!this.auth.hasPermission('sales:write'))return;
   try{this.monthEnd=await firstValueFrom(this.api.get<any[]>('/orders/full-returns/month-end'))||[];}catch{this.monthEnd=[];}
 }
 async preview(){if(this.busy||this.pending||!this.orderId)return;this.busy=true;this.error='';this.quote=null;this.receipt=null;this.confirmed=false;
   try{this.receipt=await firstValueFrom(this.api.get(`/orders/${this.orderId}/full-return`));
     if(!this.receipt)this.quote=await firstValueFrom(this.api.post(`/orders/${this.orderId}/full-return/quote`,{},{params:{refund_timing:this.refundTiming}}));
   }catch(e:any){this.error=this.message(e);}finally{this.busy=false;}}
 async submit(){
   if(this.busy||this.network.isOffline()||(!this.pending&&(!this.quote||!this.confirmed)))return;
   const key=this.key,token=this.auth.getToken();
   const extra:any={};
   if(this.quote?.refund_timing==='MONTH_END')extra.refund_timing='MONTH_END';
   if(this.isDefective)extra.is_defective=true;
   if(this.reason)extra.return_reason=this.reason;
   if(this.desiredVariantId)extra.desired_variant_id=this.desiredVariantId;
   const draft=this.pending||{orderId:this.quote.order_id,body:{request_key:crypto.randomUUID(),confirmed_refund_amount:this.quote.refund_amount,settlement_confirmed:true,...extra}};
   this.busy=true;this.error='';
   try{localStorage.setItem(key,JSON.stringify(draft));this.pending=draft;
     const receipt=await firstValueFrom(this.api.post(`/orders/${draft.orderId}/full-return`,draft.body,{headers:{Authorization:`Bearer ${token}`}}));
     localStorage.removeItem(key);if(key!==this.key||token!==this.auth.getToken())return;
     this.receipt=receipt;this.pending=null;this.quote=null;this.confirmed=false;this.changed.emit();this.loadMonthEnd();
   }catch(e:any){if(key===this.key){this.error=this.message(e);if([400,404,409,422].includes(e.status)){localStorage.removeItem(key);this.pending=null;this.quote=null;this.confirmed=false;}}}
   finally{this.busy=false;}
 }
 async settle(r:any){
   this.busy=true;this.error='';
   const url=r.source==='exchange'?`/orders/exchanges/${r.id}/settle-month-end`:`/orders/${r.order_id}/full-return/settle-month-end`;
   try{await firstValueFrom(this.api.post(url,{}));await this.loadMonthEnd();}
   catch(e:any){this.error=this.message(e);}finally{this.busy=false;}
 }
 async settleAll(){
   if(!confirm('¿Procesar el ajuste de fin de mes y marcar como pagadas todas las devoluciones pendientes?'))return;
   this.busy=true;this.error='';
   try{await firstValueFrom(this.api.post('/orders/full-returns/process-month-end',{}));await this.loadMonthEnd();}
   catch(e:any){this.error=this.message(e);}finally{this.busy=false;}
 }
 message(e:any){return typeof e?.error?.detail==='string'?e.error.detail:'No se pudo confirmar el registro. Conserva la solicitud para reintentar.';}
}
