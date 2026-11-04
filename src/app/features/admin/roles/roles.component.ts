import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { Role, Permission } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="content-area">
      <div class="flex items-center justify-between mb-lg">
        <div>
          <h1 class="text-3xl font-bold">Gestión de Roles</h1>
          <p class="text-secondary mt-sm">{{ auth.isSuperAdmin() ? 'Crea roles y asigna permisos específicos.' : 'Consulta los roles disponibles para tu empresa. Su edición corresponde al superadmin.' }}</p>
        </div>
        <button *ngIf="auth.isSuperAdmin()" class="btn btn-primary" (click)="openModal()">+ Nuevo Rol</button>
      </div>

      <div class="grid grid-3 gap-md">
        <div *ngFor="let role of roles" class="card relative">
          <div *ngIf="role.is_predefined" class="badge badge-primary" style="position: absolute; top: var(--space-md); right: var(--space-md);">
            Predefinido
          </div>
          
          <h3 class="font-bold text-xl mb-xs">{{ role.name | uppercase }}</h3>
          <p class="text-secondary text-sm mb-md" style="min-height: 40px;">{{ role.description || 'Sin descripción' }}</p>
          
          <div class="mb-md">
            <h4 class="font-semibold text-sm mb-xs border-b pb-xs">Permisos ({{role.permissions.length}}):</h4>
            <ul class="text-sm text-secondary" style="list-style-type: disc; padding-left: 1.2rem; margin-top: 0.5rem; line-height: 1.4;">
              <li *ngFor="let p of role.permissions">{{ p.description || p.name }}</li>
            </ul>
          </div>
          
          <div *ngIf="auth.isSuperAdmin()" class="flex gap-sm mt-auto pt-md border-t">
            <button class="btn btn-sm btn-outline flex-1" (click)="openModal(role)">Editar</button>
            <button *ngIf="!role.is_predefined" class="btn btn-sm btn-outline text-danger" (click)="deleteRole(role.id)">Eliminar</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Formulario -->
    <div class="modal-backdrop" *ngIf="showModal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center;">
      <div class="card" style="width: 100%; max-width: 600px; padding: var(--space-xl); max-height: 90vh; overflow-y: auto;">
        <h2 class="font-bold text-2xl mb-lg">{{ editingRole ? 'Editar Rol' : 'Nuevo Rol' }}</h2>
        
        <div class="flex-col gap-md mb-lg">
          <div>
            <label class="form-label">Nombre del Rol</label>
            <input type="text" class="form-control" [(ngModel)]="formData.name" [disabled]="!!editingRole?.is_predefined">
            <small class="text-danger" *ngIf="editingRole?.name === 'admin'">El nombre del administrador no puede modificarse.</small>
          </div>
          
          <div>
            <label class="form-label">Descripción</label>
            <input type="text" class="form-control" [(ngModel)]="formData.description">
          </div>
          
          <div>
            <label class="form-label border-b pb-xs mb-sm">Permisos Asignados</label>
            <div class="grid" style="grid-template-columns: 1fr; gap: 0.5rem;">
              <div *ngFor="let perm of availablePermissions" class="flex items-center gap-xs">
                <input type="checkbox" 
                       [id]="'perm_' + perm.id" 
                       [checked]="formData.permission_ids.includes(perm.id)"
                       (change)="togglePermission(perm.id)"
                       [disabled]="editingRole?.name === 'admin'">
                <label [for]="'perm_' + perm.id" class="text-sm cursor-pointer" [title]="perm.name">
                  {{ perm.description || perm.name }}
                </label>
              </div>
            </div>
            <small class="text-danger mt-sm block" *ngIf="editingRole?.name === 'admin'">Los permisos del Administrador son inmodificables.</small>
          </div>
        </div>

        <div class="flex justify-end gap-sm pt-md border-t">
          <button class="btn btn-outline" (click)="showModal = false">Cancelar</button>
          <button class="btn btn-primary" (click)="saveRole()" [disabled]="editingRole?.name === 'admin'">Guardar</button>
        </div>
      </div>
    </div>
  `
})
export class RolesComponent implements OnInit {
  roles: Role[] = [];
  availablePermissions: Permission[] = [];
  
  showModal = false;
  editingRole: Role | null = null;
  formData = {
    name: '',
    description: '',
    permission_ids: [] as number[]
  };

  constructor(private api: ApiService, private toast: ToastService, public auth: AuthService) {}

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.api.get('/roles/permissions').subscribe({
      next: (res: any) => this.availablePermissions = res,
      error: () => this.toast.error('Error al cargar permisos')
    });
    
    this.api.get('/roles').subscribe({
      next: (res: any) => this.roles = res,
      error: () => this.toast.error('Error al cargar roles')
    });
  }

  openModal(role?: Role) {
    if (role) {
      this.editingRole = role;
      this.formData = {
        name: role.name,
        description: role.description || '',
        permission_ids: role.permissions.map(p => p.id)
      };
    } else {
      this.editingRole = null;
      this.formData = { name: '', description: '', permission_ids: [] };
    }
    this.showModal = true;
  }

  togglePermission(id: number) {
    if (this.editingRole?.name === 'admin') return;
    
    const index = this.formData.permission_ids.indexOf(id);
    if (index === -1) {
      this.formData.permission_ids.push(id);
    } else {
      this.formData.permission_ids.splice(index, 1);
    }
  }

  saveRole() {
    if (!this.formData.name) {
      this.toast.warning('El nombre es obligatorio');
      return;
    }
    
    const req = this.editingRole 
      ? this.api.patch(`/roles/${this.editingRole.id}`, this.formData)
      : this.api.post('/roles', this.formData);
      
    req.subscribe({
      next: () => {
        this.toast.success(`Rol ${this.editingRole ? 'actualizado' : 'creado'} con éxito`);
        this.showModal = false;
        this.loadData();
      },
      error: (err) => this.toast.error(err.error?.detail || 'Error al guardar rol')
    });
  }

  deleteRole(id: number) {
    if (confirm('¿Estás seguro de eliminar este rol?')) {
      this.api.delete(`/roles/${id}`).subscribe({
        next: () => {
          this.toast.success('Rol eliminado');
          this.loadData();
        },
        error: (err) => this.toast.error(err.error?.detail || 'Error al eliminar rol')
      });
    }
  }
}
