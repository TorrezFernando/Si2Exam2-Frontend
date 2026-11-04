import {Component, inject, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {HttpClient} from '@angular/common/http';
import {AuthService} from '../../../core/services/auth.service';
import {environment} from '../../../../environments/environment';

@Component({selector:'app-inventory-report',standalone:true,imports:[CommonModule,FormsModule],template:`
  <section class="card p-lg mb-lg" *ngIf="allowed">
    <h2>Inventario integral</h2>
    <p>Existencias actuales y unidades vendidas netas acumuladas. Las previsiones no forman parte del stock físico.</p>
    <label>Sucursal (ID, opcional)<input class="form-control" type="number" min="1" [(ngModel)]="branchId"></label>
    <button class="btn btn-primary" [disabled]="busy" (click)="load()">Consultar inventario</button>
    <button class="btn btn-outline" [disabled]="busy" (click)="download()">Exportar inventario CSV</button>
    <p role="alert">{{error}}</p>
    <ng-container *ngIf="result">
      <p>Actualizado: {{result.generated_at | date:'short'}} · {{result.count}} variantes por sucursal</p>
      <p>Disponible: {{result.totals.available}} · Reservado: {{result.totals.reserved}} · Pago pendiente: {{result.totals.payment_pending}} · Físico: {{result.totals.physical}} · Vendido neto: {{result.totals.sold_net}} · Próximos ingresos: {{result.totals.incoming}}</p>
      <div style="overflow:auto;max-height:520px"><table class="table"><thead><tr><th>Sucursal</th><th>Prenda / SKU</th><th>Disponible</th><th>Reservado</th><th>Pago pendiente</th><th>Físico</th><th>Vendido neto</th><th>Próximos ingresos</th></tr></thead><tbody>
        <tr *ngFor="let row of result.data"><td>{{row.branch_name}}</td><td>{{row.product_name}} · {{row.size}} / {{row.color}} · {{row.sku}} {{row.is_active ? '' : '(Inactivo)'}}</td><td>{{row.available}}</td><td>{{row.reserved}}</td><td>{{row.payment_pending}}</td><td>{{row.physical}}</td><td>{{row.sold_net}}</td><td>{{row.incoming}}</td></tr>
      </tbody></table></div>
    </ng-container>
  </section>`})
export class InventoryReportComponent implements OnInit {
  http=inject(HttpClient);auth=inject(AuthService);branchId:number|null=null;result:any=null;busy=false;error='';
  get allowed(){return this.auth.hasPermission('inventory:read')||this.auth.hasPermission('inventory:write');}
  get params(): Record<string,string>{return this.branchId?{branch_id:String(this.branchId)}:{};}
  ngOnInit(){if(this.allowed)this.load();}
  load(){if(this.busy)return;this.busy=true;this.error='';this.result=null;
    this.http.get(`${environment.apiUrl}/reports/inventory`,{params:this.params}).subscribe({next:r=>{this.result=r;this.busy=false;},error:e=>this.fail(e)});}
  download(){if(this.busy)return;this.busy=true;this.error='';
    this.http.get(`${environment.apiUrl}/reports/inventory/export`,{params:this.params,responseType:'blob'}).subscribe({next:blob=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='inventario.csv';a.click();URL.revokeObjectURL(url);this.busy=false;},error:e=>this.fail(e)});}
  fail(e:any){this.busy=false;this.error=typeof e?.error?.detail==='string'?e.error.detail:'No se pudo consultar inventario.';}
}
