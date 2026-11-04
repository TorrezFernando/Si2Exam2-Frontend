import {Component,EventEmitter,Output,OnInit,inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {firstValueFrom} from 'rxjs';
import {ApiService} from '../../core/services/api.service';
import {AuthService} from '../../core/services/auth.service';
import {NetworkService} from '../../core/services/network.service';

@Component({selector:'app-full-return',standalone:true,imports:[CommonModule,FormsModule],template:`
 <section class="card p-lg mt-lg">
  <h2>Devolución completa en efectivo</h2>
  <p>Incluye las prendas entregadas en cambios anteriores. Comprueba físicamente todas las prendas indicadas antes de devolver el importe.</p>
  <p role="alert">{{error}}</p>
  <div *ngIf="pending"><p>Registro pendiente de confirmar. No repitas la devolución de dinero.</p><button class="btn btn-primary" (click)="submit()" [disabled]="busy || network.isOffline()">Reintentar devolución registrada</button></div>
  <fieldset [disabled]="busy || !!pending || network.isOffline()">
   <label>Venta a devolver<input class="form-control" type="number" min="1" [(ngModel)]="orderId" (ngModelChange)="quote=null;receipt=null;confirmed=false"></label>
   <button class="btn btn-outline" (click)="preview()" [disabled]="!orderId">Consultar devolución</button>
   <div *ngIf="quote">
    <p>Venta #{{quote.order_id}} · Sucursal {{quote.branch_id}}</p>
    <ul><li *ngFor="let item of quote.items">{{item.quantity}} × {{item.label}}</li></ul>
    <strong>Devolver en efectivo: Bs {{quote.refund_amount | number:'1.2-2'}}</strong>
    <label><input type="checkbox" [(ngModel)]="confirmed"> Recibí todas las prendas indicadas y devolví el importe en efectivo.</label>
    <button class="btn btn-primary" (click)="submit()" [disabled]="!confirmed">Registrar devolución completa</button>
   </div>
  </fieldset>
  <div *ngIf="receipt" role="status">
   <h3>Comprobante de devolución #{{receipt.id}}</h3>
   <p>Venta #{{receipt.order_id}} · {{receipt.created_at | date:'short'}} · Efectivo devuelto: Bs {{receipt.refund_amount | number:'1.2-2'}}</p>
   <ul><li *ngFor="let item of receipt.items">{{item.quantity}} × {{item.label}}</li></ul>
  </div>
  <p *ngIf="network.isOffline()">Se requiere conexión para consultar y confirmar devoluciones.</p>
 </section>`})
export class FullReturnComponent implements OnInit {
 api=inject(ApiService);auth=inject(AuthService);network=inject(NetworkService);
 @Output() changed=new EventEmitter<void>();
 orderId:number|null=null;quote:any=null;receipt:any=null;pending:any=null;confirmed=false;busy=false;error='';
 get key(){const u=this.auth.currentUser();return `fs_full_return_t${u?.tenant_id}_u${u?.id}`;}
 ngOnInit(){try{this.pending=JSON.parse(localStorage.getItem(this.key)||'null');}catch{this.error='No se pudo leer la devolución pendiente.';}}
 async preview(){if(this.busy||this.pending||!this.orderId)return;this.busy=true;this.error='';this.quote=null;this.receipt=null;this.confirmed=false;
   try{this.receipt=await firstValueFrom(this.api.get(`/orders/${this.orderId}/full-return`));
     if(!this.receipt)this.quote=await firstValueFrom(this.api.post(`/orders/${this.orderId}/full-return/quote`,{}));
   }catch(e:any){this.error=this.message(e);}finally{this.busy=false;}}
 async submit(){
   if(this.busy||this.network.isOffline()||(!this.pending&&(!this.quote||!this.confirmed)))return;
   const key=this.key,token=this.auth.getToken();
   const draft=this.pending||{orderId:this.quote.order_id,body:{request_key:crypto.randomUUID(),confirmed_refund_amount:this.quote.refund_amount,settlement_confirmed:true}};
   this.busy=true;this.error='';
   try{localStorage.setItem(key,JSON.stringify(draft));this.pending=draft;
     const receipt=await firstValueFrom(this.api.post(`/orders/${draft.orderId}/full-return`,draft.body,{headers:{Authorization:`Bearer ${token}`}}));
     localStorage.removeItem(key);if(key!==this.key||token!==this.auth.getToken())return;
     this.receipt=receipt;this.pending=null;this.quote=null;this.confirmed=false;this.changed.emit();
   }catch(e:any){if(key===this.key){this.error=this.message(e);if([400,404,409,422].includes(e.status)){localStorage.removeItem(key);this.pending=null;this.quote=null;this.confirmed=false;}}}
   finally{this.busy=false;}
 }
 message(e:any){return typeof e?.error?.detail==='string'?e.error.detail:'No se pudo confirmar el registro. Conserva la solicitud para reintentar.';}
}
