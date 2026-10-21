import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  standalone: true, imports: [CommonModule, FormsModule],
  template: `<div class="content-area">
    <h1>Gestión comercial</h1><p role="status">{{ message }}</p>
    <div class="card" *ngIf="auth.hasPermission('catalog:write')">
      <h2>Proveedores y clasificación</h2>
      <select class="form-control" [(ngModel)]="kind" (ngModelChange)="loadMaster()">
        <option value="suppliers">Proveedores</option><option value="seasons">Temporadas</option>
        <option value="collections">Colecciones</option><option value="categories">Categorías</option>
      </select>
      <form (ngSubmit)="save()">
        <label>Nombre<input class="form-control" name="name" [(ngModel)]="draft.name" required maxlength="120"></label>
        <label *ngIf="kind === 'suppliers'">Contacto<input class="form-control" name="contact" [(ngModel)]="draft.contact"></label>
        <label *ngIf="kind !== 'suppliers'">Descripción<input class="form-control" name="description" [(ngModel)]="draft.description"></label>
        <button class="btn btn-primary" [disabled]="busy || !draft.name.trim()">{{ editing ? 'Guardar cambios' : 'Crear' }}</button>
        <button type="button" class="btn btn-outline" (click)="reset()">Limpiar</button>
      </form>
      <table class="table"><thead><tr><th>Nombre</th><th>Contacto / descripción</th><th></th></tr></thead>
        <tbody><tr *ngFor="let row of records"><td>{{ row.name }}</td><td>{{ row.contact || row.description }}</td>
        <td><button class="btn btn-outline" (click)="edit(row)">Editar</button></td></tr></tbody></table>
    </div>
    <div class="card mt-lg" *ngIf="auth.hasPermission('inventory:write')">
      <h2>Recepción y ajustes de inventario</h2>
      <form (ngSubmit)="move()">
        <label>Sucursal<select class="form-control" name="branch" [(ngModel)]="movement.branch_id" required>
          <option *ngFor="let b of branches" [ngValue]="b.id">{{ b.name }}</option></select></label>
        <label>Prenda / talla / color<select class="form-control" name="variant" [(ngModel)]="movement.variant_id" required>
          <option *ngFor="let v of variants" [ngValue]="v.id">{{ v.label }}</option></select></label>
        <label>Movimiento<select class="form-control" name="kind" [(ngModel)]="movement.kind">
          <option value="receipt">Recepción de proveedor</option><option value="adjustment_in">Ajuste de entrada</option><option value="adjustment_out">Ajuste de salida</option></select></label>
        <label>Unidades<input class="form-control" name="quantity" type="number" min="1" [(ngModel)]="movement.quantity" required></label>
        <label>Referencia / motivo<input class="form-control" name="reference" [(ngModel)]="movement.reference" required minlength="3"></label>
        <button class="btn btn-primary" [disabled]="busy || !movement.branch_id || !movement.variant_id || movement.quantity < 1 || movement.reference.length < 3">Registrar movimiento</button>
      </form>
    </div>
    <div class="card mt-lg" *ngIf="auth.hasPermission('inventory:read') || auth.hasPermission('inventory:write')">
      <h2>Últimos movimientos</h2><button class="btn btn-outline" (click)="loadMovements()">Actualizar</button>
      <div style="overflow:auto"><table class="table"><thead><tr><th>Fecha</th><th>Sucursal</th><th>Variante</th><th>Tipo</th><th>Unidades</th><th>Referencia</th></tr></thead>
      <tbody><tr *ngFor="let row of movements"><td>{{ row.created_at | date:'short' }}</td><td>{{ row.branch_id }}</td><td>{{ row.variant_id }}</td><td>{{ row.kind }}</td><td>{{ row.quantity }}</td><td>{{ row.reference }}</td></tr></tbody></table></div>
    </div>
  </div>`
})
export class OperationsComponent implements OnInit {
  api = inject(ApiService); auth = inject(AuthService);
  kind = 'suppliers'; records: any[] = []; movements: any[] = []; branches: any[] = []; variants: any[] = [];
  draft = {name: '', contact: '', description: ''}; editing: number | null = null;
  busy = false; message = '';
  movement = {branch_id: null as number | null, variant_id: null as number | null, quantity: 1, kind: 'receipt', reference: ''};
  ngOnInit() {
    if (this.auth.hasPermission('catalog:write')) this.loadMaster();
    if (this.auth.hasPermission('inventory:read') || this.auth.hasPermission('inventory:write')) this.loadMovements();
    this.api.getBranches().subscribe(b => this.branches = b.filter(x => this.auth.hasPermission('branches:write') || x.id === this.auth.currentUser()?.branch_id));
    this.api.getProducts({limit:100}).subscribe(p => this.variants = p.flatMap(x => (x.variants ?? []).map(v => ({id: v.id, label: `${x.name} · ${v.size} · ${v.color}`}))));
  }
  reset() { this.editing = null; this.draft = {name:'', contact:'', description:''}; }
  edit(row: any) { this.editing = row.id; this.draft = {name:row.name, contact:row.contact ?? '', description:row.description ?? ''}; }
  loadMaster() { this.reset(); this.api.get<any[]>(`/operations/masters/${this.kind}`).subscribe({next:r => this.records = r, error:e => this.fail(e)}); }
  save() {
    this.busy = true;
    const path = `/operations/masters/${this.kind}`;
    const request = this.editing ? this.api.patch(`${path}/${this.editing}`, this.draft) : this.api.post(path, this.draft);
    request.subscribe({next:() => {this.busy=false; this.message='Registro guardado'; this.loadMaster();}, error:e => this.fail(e)});
  }
  loadMovements() { this.api.get<any[]>('/operations/movements').subscribe({next:r => this.movements=r, error:e => this.fail(e)}); }
  move() {
    this.busy=true;
    this.api.post('/operations/movements', this.movement).subscribe({next:() => {this.busy=false; this.message='Movimiento registrado'; this.loadMovements();}, error:e => this.fail(e)});
  }
  fail(e:any) {this.busy=false; this.message=typeof e?.error?.detail === 'string' ? e.error.detail : 'No se pudo completar la operación';}
}
