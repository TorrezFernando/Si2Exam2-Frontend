import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { SaasService } from '../../../core/services/saas.service';
import { AuthService } from '../../../core/services/auth.service';
import { Branch } from '../../../core/models';

@Component({
  selector: 'app-branches',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="content-area">
      <!-- Encabezado de la página -->
      <div class="page-header" style="padding-top: var(--space-xl); margin-bottom: var(--space-xl);">
        <div>
          <h1 style="font-size: 1.75rem; font-weight: 800;">Sucursales</h1>
          <p class="text-secondary text-sm">Gestión de sucursales de la cadena</p>
        </div>
        <button class="btn btn-primary" (click)="createNewBranch()">+ Nueva Sucursal</button>
      </div>

      <div *ngIf="limitReached" class="card mb-lg limit-card">
        <div>
          <strong>⚠️ Límite del plan alcanzado</strong>
          <p class="text-sm mt-xs">{{ limitMessage }}</p>
        </div>
        <a *ngIf="isCompanyAdmin" routerLink="/admin/plans" class="btn btn-primary">⭐ Mejorar plan</a>
        <span *ngIf="!isCompanyAdmin" class="text-sm text-secondary">Pide al administrador de tu empresa que mejore el plan.</span>
      </div>

      <form *ngIf="editing" class="card mb-lg" (ngSubmit)="saveBranch()">
        <label>Nombre<input class="form-control" name="name" [(ngModel)]="draft.name" required></label>
        <label>Ciudad<input class="form-control" name="city" [(ngModel)]="draft.city" required></label>
        <label>Dirección<input class="form-control" name="address" [(ngModel)]="draft.address" required></label>
        <label>Teléfono<input class="form-control" name="phone" [(ngModel)]="draft.phone"></label>
        <button class="btn btn-primary" [disabled]="saving || !draft.name || !draft.city || !draft.address">Guardar</button>
        <button type="button" class="btn btn-outline" (click)="editing = false">Cancelar</button>
      </form>
      <!-- Estado de carga -->
      <div *ngIf="loading" class="flex justify-center p-xl">
        <div class="spinner"></div>
      </div>

      <!-- Lista de sucursales -->
      <div class="grid-3" *ngIf="!loading && branches.length > 0">
        <!-- Itera sobre cada sucursal obtenida de la API -->
        <div class="card card-glass" *ngFor="let branch of branches" style="display: flex; flex-direction: column; gap: var(--space-sm);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <h3 class="font-bold text-lg text-primary">{{ branch.name }}</h3>
            <span class="badge" [ngClass]="branch.is_active ? 'badge-primary' : 'badge-danger'">
              {{ branch.is_active ? 'Activa' : 'Inactiva' }}
            </span>
          </div>
          <p class="text-secondary text-sm"><strong>{{ branch.city }} · Dirección:</strong> {{ branch.address }}</p>
          <p class="text-secondary text-sm"><strong>Teléfono:</strong> {{ branch.phone || 'N/A' }}</p>
          
          <div class="flex justify-end mt-md gap-sm">
            <button class="btn btn-outline btn-sm" (click)="editBranch(branch)">Editar</button>
            <button class="btn btn-danger btn-sm" *ngIf="branch.is_active" (click)="deactivateBranch(branch.id)">Desactivar</button>
          </div>
        </div>
      </div>

      <!-- Mensaje cuando no hay sucursales -->
      <div *ngIf="!loading && branches.length === 0" class="card text-center p-xl">
        <p class="text-secondary">No hay sucursales registradas.</p>
      </div>
    </div>
  `,
  styles: [`.limit-card { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center; border: 1px solid rgba(245,158,11,.5); background: rgba(245,158,11,.1); }`]
})
export class BranchesComponent implements OnInit {
  branches: Branch[] = [];
  loading = true;
  editing = false;
  saving = false;
  editingId: number | null = null;
  draft = { name: "", city: "", address: "", phone: "" };

  private saas = inject(SaasService);
  private auth = inject(AuthService);
  limitReached = false;
  limitMessage = '';
  get isCompanyAdmin() { return ['admin', 'administrador'].includes((this.auth.userRoleName() || '').toLowerCase()); }

  /** Consulta el uso del plan: si ya no quedan sucursales disponibles se avisa antes de intentar crear una. */
  private checkPlanLimit() {
    this.saas.getMySubscription().subscribe({
      next: sub => {
        const used = sub.usage?.branches_count ?? 0, limit = sub.usage?.branches_limit ?? 0;
        this.limitReached = !!limit && used >= limit;
        this.limitMessage = this.limitReached
          ? `Tu empresa tiene ${used} de ${limit} sucursales activas permitidas en el ${sub.plan?.name || 'plan actual'}. Mejora tu plan o desactiva una sucursal para abrir otra.`
          : '';
      },
      error: () => { /* sin datos del plan: el servidor valida igual al guardar */ },
    });
  }

  constructor(
    private apiService: ApiService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.loadBranches();
    this.checkPlanLimit();
  }

  /**
   * Carga la lista de sucursales desde la API
   */
  loadBranches() {
    this.loading = true;
    // active_only = false para mostrar todas en el panel de admin
    this.apiService.getBranches(false).subscribe({
      next: (data) => {
        this.branches = data;
        this.loading = false;
      },
      error: (err) => {
        this.toast.error(err?.error?.detail ? this.toast.extractError(err) : 'Error al cargar las sucursales');
        this.loading = false;
        console.error(err);
      }
    });
  }

  /**
   * Desactiva una sucursal (soft delete)
   */
  deactivateBranch(id: number) {
    if (confirm('¿Estás seguro de que deseas desactivar esta sucursal?')) {
      this.apiService.deactivateBranch(id).subscribe({
        next: () => {
          this.toast.success('Sucursal desactivada exitosamente');
          this.loadBranches();
        },
        error: (err) => {
          this.toast.error('Error al desactivar la sucursal');
          console.error(err);
        }
      });
    }
  }

  /**
   * Placeholder para la creación de una nueva sucursal
   */
  createNewBranch() {
    if (this.limitReached) {
      this.toast.error('Límite del plan alcanzado. ' + (this.isCompanyAdmin ? 'Mejora tu plan para abrir más sucursales.' : 'Pide al administrador que mejore el plan.'));
      return;
    }
    this.editingId = null;
    this.draft = {name: "", city: "", address: "", phone: ""};
    this.editing = true;
  }
  editBranch(branch: Branch) {
    this.editingId = branch.id;
    this.draft = {name:branch.name, city:branch.city ?? '', address:branch.address, phone:branch.phone ?? ''};
    this.editing = true;
  }
  saveBranch() {
    if (this.saving) return;
    this.saving = true;
    const request = this.editingId ? this.apiService.updateBranch(this.editingId, this.draft) : this.apiService.createBranch(this.draft);
    request.subscribe({next: () => {this.saving=false; this.editing=false; this.loadBranches(); this.checkPlanLimit();}, error: (err) => {this.saving=false;
      const detail = err?.error?.detail ? this.toast.extractError(err) : 'No se pudo guardar la sucursal';
      if (/l[ií]mite de sucursales/i.test(detail)) { this.limitReached = true; this.limitMessage = detail; this.editing = false; }
      this.toast.error(detail);}});
  }

}
