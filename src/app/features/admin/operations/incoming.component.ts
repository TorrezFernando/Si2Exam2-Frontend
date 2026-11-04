import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({selector:'app-incoming-stock', standalone:true, imports:[CommonModule,FormsModule], template:`
  <section class="card mt-lg">
    <h2>Próximos ingresos de proveedor</h2>
    <p>La previsión no aumenta existencias. Confirma únicamente unidades recibidas físicamente.</p>
    <p role="status">{{ message }}</p>
    <button class="btn btn-outline" (click)="load()" [disabled]="busy">Actualizar próximos ingresos</button>
    <div *ngIf="pending"><p>Hay un registro pendiente de confirmar. Reintenta sin repetir la recepción física.</p>
      <button class="btn btn-primary" (click)="send()" [disabled]="busy">Reintentar el mismo registro</button></div>
    <fieldset [disabled]="busy || !!pending" *ngIf="auth.hasPermission('inventory:write')">
      <form (ngSubmit)="create()" #form="ngForm">
        <label>Proveedor<select class="form-control" name="supplier" [(ngModel)]="draft.supplier_id" required><option *ngFor="let s of suppliers" [ngValue]="s.id">{{s.name}}</option></select></label>
        <label>Sucursal<select class="form-control" name="branch" [(ngModel)]="draft.branch_id" required><option *ngFor="let b of branches" [ngValue]="b.id">{{b.name}}</option></select></label>
        <label>Prenda / talla / color<select class="form-control" name="variant" [(ngModel)]="draft.variant_id" required><option *ngFor="let v of variants" [ngValue]="v.id">{{v.label}}</option></select></label>
        <label>Unidades previstas<input class="form-control" name="quantity" type="number" min="1" max="10000" required [(ngModel)]="draft.quantity"></label>
        <label>Fecha prevista<input class="form-control" name="date" type="date" required [(ngModel)]="draft.expected_date"></label>
        <label>Referencia del pedido<input class="form-control" name="ref" minlength="3" maxlength="200" required [(ngModel)]="draft.reference"></label>
        <button class="btn btn-primary" [disabled]="form.invalid">Programar ingreso</button>
      </form>
    </fieldset>
    <div style="overflow:auto"><table class="table"><thead><tr><th>Referencia</th><th>Fecha</th><th>Variante / sucursal</th><th>Previsto / recibido / pendiente</th><th>Estado</th><th>Recepción</th></tr></thead>
      <tbody><tr *ngFor="let row of rows"><td>{{row.reference}}</td><td>{{row.expected_date}}</td><td>{{row.variant_id}} / {{row.branch_id}}</td><td>{{row.quantity}} / {{row.received_quantity}} / {{row.pending_quantity}}</td><td>{{row.status}}</td>
        <td *ngIf="auth.hasPermission('inventory:write') && row.pending_quantity > 0">
          <input type="number" min="1" [max]="row.pending_quantity" [(ngModel)]="amounts[row.id]" [disabled]="busy || !!pending" aria-label="Cantidad recibida">
          <button class="btn btn-primary" (click)="receive(row)" [disabled]="busy || !!pending || !amounts[row.id]">Confirmar recepción física</button>
          <button class="btn btn-outline" (click)="cancel(row)" [disabled]="busy || !!pending">Cancelar pendiente</button>
        </td></tr></tbody></table></div>
    <p>Se muestran las primeras 500 previsiones por fecha.</p>
  </section>`})
export class IncomingComponent implements OnInit {
  api=inject(ApiService); auth=inject(AuthService);
  rows:any[]=[]; suppliers:any[]=[]; branches:any[]=[]; variants:any[]=[];
  amounts:Record<number,number>={}; busy=false; message=''; pending:any=null;
  draft={supplier_id:null,branch_id:null,variant_id:null,quantity:1,expected_date:'',reference:''};
  get key(){const u=this.auth.currentUser();return `fs_incoming_t${u?.tenant_id}_u${u?.id}`;}
  ngOnInit(){try{this.pending=JSON.parse(localStorage.getItem(this.key)||'null');}catch{this.message='No se pudo leer el registro pendiente.';}this.load();}
  async load(){
    if(this.busy)return; this.busy=true;
    try {
      this.rows=await firstValueFrom(this.api.get<any[]>('/operations/incoming',{params:{limit:500}}));
      if(this.auth.hasPermission('inventory:write')){
        this.suppliers=await firstValueFrom(this.api.get<any[]>('/operations/masters/suppliers'));
        this.branches=(await firstValueFrom(this.api.getBranches())).filter(b=>this.auth.hasPermission('branches:write')||b.id===this.auth.currentUser()?.branch_id);
        const products:any[]=[];
        for(let skip=0;;skip+=100){const page=await firstValueFrom(this.api.getProducts({skip,limit:100}));products.push(...page);if(page.length<100)break;}
        this.variants=products.flatMap(p=>p.variants.map((v:any)=>({id:v.id,label:`${p.name} · ${v.size} / ${v.color}`})));
      }
    }catch(e:any){this.message=this.error(e);}finally{this.busy=false;}
  }
  create(){if(this.busy||this.pending)return;this.stage('/operations/incoming',{...this.draft,request_key:crypto.randomUUID()});}
  receive(row:any){if(this.busy||this.pending)return;this.stage(`/operations/incoming/${row.id}/receive`,{quantity:this.amounts[row.id],request_key:crypto.randomUUID()});}
  stage(path:string,body:any){try{localStorage.setItem(this.key,JSON.stringify({path,body}));this.pending={path,body};this.send();}catch{this.message='No se pudo conservar la solicitud. No se envió el registro.';}}
  async send(){
    if(this.busy||!this.pending)return;const key=this.key,token=this.auth.getToken(),draft=this.pending;this.busy=true;
    try{await firstValueFrom(this.api.post(draft.path,draft.body,{headers:{Authorization:`Bearer ${token}`}}));localStorage.removeItem(key);
      if(key!==this.key||token!==this.auth.getToken())return;this.pending=null;this.message='Registro confirmado.';
    }catch(e:any){if(key===this.key){this.message=this.error(e);if([400,404,409,422].includes(e.status)){localStorage.removeItem(key);this.pending=null;}}}
    finally{this.busy=false;}
    if(!this.pending)await this.load();
  }
  async cancel(row:any){if(this.busy||this.pending)return;if(!confirm('¿Cancelar las unidades pendientes? Las ya recibidas conservarán su stock.'))return;
    this.busy=true;try{await firstValueFrom(this.api.post(`/operations/incoming/${row.id}/cancel`,{}));this.message='Pendiente cancelado.';}catch(e:any){this.message=this.error(e);}finally{this.busy=false;}await this.load();}
  error(e:any){return typeof e?.error?.detail==='string'?e.error.detail:'No se pudo completar la operación. Revisa la conexión.';}
}
