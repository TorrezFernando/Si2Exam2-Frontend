import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SaasService } from '../../../core/services/saas.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { TenantDetail, SaaSStats, TenantCreateRequest } from '../../../core/models';

@Component({
  selector: 'app-tenants',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="content-area">

      <!-- Header -->
      <div class="page-header">
        <div>
          <div class="header-tag">Superadmin Global</div>
          <h1 class="page-title">Gestión de Empresas SaaS</h1>
          <p class="page-desc">Supervisa y administra todas las empresas cliente de la plataforma, define sus planes y crea nuevas organizaciones.</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" (click)="loadAll()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refrescar
          </button>
          <button class="btn btn-primary" (click)="openCreateModal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            + Nueva Empresa
          </button>
        </div>
      </div>

      <!-- Superadmin Active Context Indicator -->
      @if (saas.selectedTenantId(); as activeId) {
        <div class="context-banner">
          <div class="context-text">
            👑 <strong>Modo Inspección Activo:</strong> Estás actuando sobre el contexto de la Empresa ID #{{ activeId }}.
          </div>
          <button class="btn btn-sm btn-ghost" (click)="clearTenantContext()">
            ✕ Salir de contexto (Ver Todo)
          </button>
        </div>
      }

      <!-- KPI Summary Cards -->
      @if (stats(); as st) {
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-icon primary">🏢</div>
            <div class="kpi-content">
              <div class="kpi-value">{{ st.total_tenants }}</div>
              <div class="kpi-label">Empresas Registradas ({{ st.active_tenants }} activas)</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon success">📍</div>
            <div class="kpi-content">
              <div class="kpi-value">{{ st.total_branches }}</div>
              <div class="kpi-label">Sucursales Físicas Totales</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon pro">✨</div>
            <div class="kpi-content">
              <div class="kpi-value">{{ st.plans_distribution['professional'] || 0 }}</div>
              <div class="kpi-label">Empresas en Plan Profesional (IA)</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon warning">💰</div>
            <div class="kpi-content">
              <div class="kpi-value">\${{ st.monthly_recurring_revenue }}</div>
              <div class="kpi-label">MRR Estimado Mensual</div>
            </div>
          </div>
        </div>
      }

      <!-- Tenants Table Section -->
      <div class="table-container card">
        <div class="table-header">
          <h3>Empresas Clientes en la Red SaaS</h3>
          <span class="badge badge-primary">{{ tenants().length }} Empresas</span>
        </div>

        @if (loading()) {
          <div class="loading-state">
            <div class="spinner"></div> Cargando empresas registradas...
          </div>
        } @else {
          <div class="table-responsive">
            <table class="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Empresa / Subdominio</th>
                  <th>Plan Activo</th>
                  <th>Sucursales</th>
                  <th>Usuarios</th>
                  <th>Plazo Cambios</th>
                  <th>Estado</th>
                  <th class="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (t of tenants(); track t.id) {
                  <tr [class.highlighted]="saas.selectedTenantId() === t.id">
                    <td class="font-mono text-muted">#{{ t.id }}</td>
                    <td>
                      <div class="tenant-name-box">
                        <strong>{{ t.name }}</strong>
                        <span class="tenant-subdomain">{{ t.subdomain }}.fashionstore.com</span>
                      </div>
                    </td>
                    <td>
                      <span class="plan-pill" [ngClass]="t.active_plan?.code === 'professional' ? 'pro' : 'basic'">
                        {{ t.active_plan?.name || 'Sin Plan' }}
                      </span>
                    </td>
                    <td>
                      <span class="font-semibold">{{ t.branches_count }}</span>
                      <span class="text-muted text-xs"> / {{ t.active_plan?.max_branches || 2 }} máx</span>
                    </td>
                    <td>
                      <span>👥 {{ t.users_count }}</span>
                    </td>
                    <td>
                      <span>🔄 {{ t.exchange_window_days }} días</span>
                    </td>
                    <td>
                      <span class="status-badge" [class.active]="t.is_active" [class.inactive]="!t.is_active">
                        {{ t.is_active ? 'Activa' : 'Inactiva' }}
                      </span>
                    </td>
                    <td class="text-right">
                      <div class="action-buttons">
                        <!-- Inspeccionar contexto -->
                        <button class="btn btn-sm" [ngClass]="saas.selectedTenantId() === t.id ? 'btn-primary' : 'btn-ghost'"
                          (click)="toggleContext(t.id)"
                          [title]="saas.selectedTenantId() === t.id ? 'Dejar de inspeccionar' : 'Inspeccionar catálogo/sucursales de esta empresa'">
                          {{ saas.selectedTenantId() === t.id ? '👁️ Inspeccionando' : '👁️ Contexto' }}
                        </button>

                        <!-- Cambiar Plan rápido -->
                        <button class="btn btn-sm btn-outline" (click)="togglePlan(t)" title="Cambiar Plan de Suscripción">
                          🔄 Cambiar Plan
                        </button>

                        <!-- Editar Empresa -->
                        <button class="btn btn-sm btn-secondary" (click)="openEditModal(t)" title="Editar Datos de Empresa">
                          ✏️ Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <!-- MODAL: Crear Nueva Empresa -->
      @if (showCreateModal()) {
        <div class="modal-backdrop" (click)="closeCreateModal()">
          <div class="modal-window" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>🏢 Registrar Nueva Empresa SaaS</h2>
              <button class="close-btn" (click)="closeCreateModal()">✕</button>
            </div>
            
            <form (ngSubmit)="submitCreateTenant()" class="modal-body">
              <div class="form-section-title">1. Información de la Empresa</div>
              <div class="form-group">
                <label>Nombre Comercial de la Empresa *</label>
                <input type="text" [(ngModel)]="newTenant.name" name="name" required class="input"
                  placeholder="Ej: Tienda París, Boutique Glamour" />
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Subdominio Único *</label>
                  <div class="input-addon-wrap">
                    <input type="text" [(ngModel)]="newTenant.subdomain" name="subdomain" required class="input"
                      placeholder="tienda-paris" />
                    <span class="input-addon">.fashionstore.com</span>
                  </div>
                </div>
                <div class="form-group">
                  <label>Plazo de Cambio de Prendas (días)</label>
                  <input type="number" [(ngModel)]="newTenant.exchange_window_days" name="exchange_window_days" min="1" max="365" class="input" />
                </div>
              </div>

              <div class="form-group">
                <label>Plan de Suscripción Asignado *</label>
                <select [(ngModel)]="newTenant.plan_code" name="plan_code" class="input select">
                  <option value="basic">Plan Básico ($29.99/mes - Hasta 2 sucursales)</option>
                  <option value="professional">Plan Profesional ($99.99/mes - Hasta 10 sucursales + IA Gemini)</option>
                </select>
              </div>

              <div class="form-section-title">2. Usuario Administrador de la Empresa</div>
              <div class="form-row">
                <div class="form-group">
                  <label>Email del Administrador *</label>
                  <input type="email" [(ngModel)]="newTenant.admin_email" name="admin_email" required class="input"
                    placeholder="admin@tiendaparis.com" />
                </div>
                <div class="form-group">
                  <label>Contraseña Inicial *</label>
                  <input type="password" [(ngModel)]="newTenant.admin_password" name="admin_password" required class="input"
                    placeholder="Ej: ParisAdmin123!" />
                </div>
              </div>

              <div class="form-group">
                <label>Nombre del Administrador</label>
                <input type="text" [(ngModel)]="newTenant.admin_name" name="admin_name" class="input"
                  placeholder="Ej: Juan Carlos Pérez" />
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" (click)="closeCreateModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary" [disabled]="submitting()">
                  {{ submitting() ? 'Creando Empresa...' : '✓ Crear Empresa y Usuario' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- MODAL: Editar Empresa -->
      @if (showEditModal() && selectedTenantForEdit) {
        <div class="modal-backdrop" (click)="closeEditModal()">
          <div class="modal-window" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>✏️ Modificar Empresa #{{ selectedTenantForEdit.id }}</h2>
              <button class="close-btn" (click)="closeEditModal()">✕</button>
            </div>
            
            <form (ngSubmit)="submitEditTenant()" class="modal-body">
              <div class="form-group">
                <label>Nombre Comercial *</label>
                <input type="text" [(ngModel)]="editName" name="editName" required class="input" />
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Subdominio</label>
                  <input type="text" [(ngModel)]="editSubdomain" name="editSubdomain" required class="input" />
                </div>
                <div class="form-group">
                  <label>Plazo Cambio de Prendas (Días)</label>
                  <input type="number" [(ngModel)]="editWindow" name="editWindow" min="1" max="365" class="input" />
                </div>
              </div>

              <div class="form-group">
                <label>Plan de Suscripción</label>
                <select [(ngModel)]="editPlanCode" name="editPlanCode" class="input select">
                  <option value="basic">Plan Básico ($29.99/mes - Hasta 2 sucursales)</option>
                  <option value="professional">Plan Profesional ($99.99/mes - Hasta 10 sucursales + IA Gemini)</option>
                </select>
              </div>

              <div class="form-group checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="editIsActive" name="editIsActive" />
                  <span>Empresa Activa (si se desactiva, sus usuarios no podrán ingresar)</span>
                </label>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" (click)="closeEditModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary" [disabled]="submitting()">
                  {{ submitting() ? 'Guardando...' : 'Guardar Cambios' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    .content-area {
      padding: 32px;
      max-width: 1300px;
      margin: 0 auto;
    }

    .header-tag {
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-primary);
      font-weight: 700;
      margin-bottom: 4px;
    }

    .page-title {
      font-size: 1.85rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }

    .page-desc {
      color: var(--text-secondary);
      font-size: 0.95rem;
      max-width: 700px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      gap: 16px;
    }

    .header-actions {
      display: flex;
      gap: 12px;
      flex-shrink: 0;
    }

    /* Context Banner */
    .context-banner {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2));
      border: 1px solid var(--color-primary);
      padding: 12px 20px;
      border-radius: var(--radius-md);
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .context-text {
      font-size: 0.92rem;
      color: var(--text-primary);
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 18px;
      margin-bottom: 28px;

      @media (max-width: 900px) {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .kpi-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: var(--shadow-sm);
    }

    .kpi-icon {
      width: 48px;
      height: 48px;
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
      flex-shrink: 0;

      &.primary { background: rgba(99, 102, 241, 0.15); }
      &.success { background: rgba(34, 197, 94, 0.15); }
      &.pro     { background: rgba(236, 72, 153, 0.15); }
      &.warning { background: rgba(245, 158, 11, 0.15); }
    }

    .kpi-value {
      font-size: 1.6rem;
      font-weight: 800;
      line-height: 1.2;
    }

    .kpi-label {
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* Table */
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-sm);
    }

    .table-header {
      padding: 20px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-subtle);

      h3 { font-size: 1.15rem; font-weight: 700; margin: 0; }
    }

    .table-responsive {
      overflow-x: auto;
    }

    .tenant-name-box {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .tenant-subdomain {
      font-size: 0.78rem;
      color: var(--text-muted);
      font-family: var(--font-mono, monospace);
    }

    .plan-pill {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 999px;
      display: inline-block;

      &.pro {
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(236, 72, 153, 0.2));
        color: #a855f7;
        border: 1px solid rgba(168, 85, 247, 0.3);
      }

      &.basic {
        background: rgba(148, 163, 184, 0.15);
        color: #94a3b8;
        border: 1px solid rgba(148, 163, 184, 0.25);
      }
    }

    .status-badge {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: var(--radius-sm);

      &.active { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
      &.inactive { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
    }

    .highlighted {
      background: rgba(99, 102, 241, 0.08) !important;
    }

    .action-buttons {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .loading-state {
      padding: 40px;
      text-align: center;
      color: var(--text-muted);
    }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .modal-window {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      max-width: 600px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: var(--shadow-xl);
    }

    .modal-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      justify-content: space-between;
      align-items: center;

      h2 { font-size: 1.25rem; font-weight: 700; margin: 0; }
    }

    .close-btn {
      background: transparent;
      border: none;
      font-size: 1.2rem;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      &:hover { color: var(--text-primary); background: var(--bg-elevated); }
    }

    .modal-body {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-section-title {
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-primary);
      margin-top: 6px;
      margin-bottom: 2px;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;

      label { font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); }
    }

    .input-addon-wrap {
      display: flex;
      align-items: center;

      .input { border-top-right-radius: 0; border-bottom-right-radius: 0; }
      .input-addon {
        background: var(--bg-elevated);
        border: 1px solid var(--border-subtle);
        border-left: none;
        padding: 9px 12px;
        font-size: 0.85rem;
        color: var(--text-muted);
        border-top-right-radius: var(--radius-md);
        border-bottom-right-radius: var(--radius-md);
      }
    }

    .checkbox-group {
      margin-top: 8px;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.88rem;
      cursor: pointer;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 12px;
      padding-top: 16px;
      border-top: 1px solid var(--border-subtle);
    }
  `]
})
export class TenantsManagementComponent implements OnInit {
  tenants = signal<TenantDetail[]>([]);
  stats = signal<SaaSStats | null>(null);
  loading = signal<boolean>(false);
  submitting = signal<boolean>(false);

  // Modal Crear
  showCreateModal = signal<boolean>(false);
  newTenant: TenantCreateRequest = {
    name: '',
    subdomain: '',
    exchange_window_days: 30,
    is_active: true,
    plan_code: 'basic',
    admin_email: '',
    admin_password: '',
    admin_name: '',
  };

  // Modal Editar
  showEditModal = signal<boolean>(false);
  selectedTenantForEdit: TenantDetail | null = null;
  editName = '';
  editSubdomain = '';
  editWindow = 30;
  editIsActive = true;
  editPlanCode = 'basic';

  constructor(
    public saas: SaasService,
    public auth: AuthService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loading.set(true);
    this.saas.getTenants().subscribe({
      next: (list) => {
        this.tenants.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Error al cargar la lista de empresas');
      }
    });

    this.saas.getStats().subscribe({
      next: (st) => this.stats.set(st),
      error: () => {},
    });
  }

  // ─── Superadmin Context Switcher ───────────────────────────────────────────
  toggleContext(tenantId: number): void {
    if (this.saas.selectedTenantId() === tenantId) {
      this.clearTenantContext();
    } else {
      this.saas.setTenantContext(tenantId);
      this.toast.info(`Contexto cambiado a Empresa #${tenantId}. Ahora visualizarás sus sucursales y catálogo.`);
    }
  }

  clearTenantContext(): void {
    this.saas.setTenantContext(null);
    this.toast.info('Contexto restaurado a modo Superadmin Global.');
  }

  // ─── Quick Plan Toggle ─────────────────────────────────────────────────────
  togglePlan(tenant: TenantDetail): void {
    const isPro = tenant.active_plan?.code === 'professional';
    const targetPlan = isPro ? 'basic' : 'professional';
    const targetName = isPro ? 'Plan Básico' : 'Plan Profesional';

    const ok = confirm(`¿Deseas cambiar el plan de "${tenant.name}" a ${targetName}?`);
    if (!ok) return;

    this.saas.changeTenantPlan(tenant.id, targetPlan).subscribe({
      next: () => {
        this.toast.success(`Plan de "${tenant.name}" actualizado a ${targetName}!`);
        this.loadAll();
      },
      error: (err) => {
        const detail = err.error?.detail || 'No se pudo cambiar el plan';
        this.toast.error(detail);
      }
    });
  }

  // ─── Modal Crear ───────────────────────────────────────────────────────────
  openCreateModal(): void {
    this.newTenant = {
      name: '',
      subdomain: '',
      exchange_window_days: 30,
      is_active: true,
      plan_code: 'basic',
      admin_email: '',
      admin_password: '',
      admin_name: '',
    };
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
  }

  submitCreateTenant(): void {
    if (!this.newTenant.name || !this.newTenant.subdomain) {
      this.toast.error('Nombre y subdominio son obligatorios.');
      return;
    }

    this.submitting.set(true);
    this.saas.createTenant(this.newTenant).subscribe({
      next: (created) => {
        this.submitting.set(false);
        this.toast.success(`¡Empresa "${created.name}" creada exitosamente con su plan inicial!`);
        this.closeCreateModal();
        this.loadAll();
      },
      error: (err) => {
        this.submitting.set(false);
        const detail = err.error?.detail || 'Error al registrar la empresa';
        this.toast.error(detail);
      }
    });
  }

  // ─── Modal Editar ───────────────────────────────────────────────────────────
  openEditModal(tenant: TenantDetail): void {
    this.selectedTenantForEdit = tenant;
    this.editName = tenant.name;
    this.editSubdomain = tenant.subdomain;
    this.editWindow = tenant.exchange_window_days;
    this.editIsActive = tenant.is_active;
    this.editPlanCode = tenant.active_plan?.code || 'basic';
    this.showEditModal.set(true);
  }

  closeEditModal(): void {
    this.showEditModal.set(false);
    this.selectedTenantForEdit = null;
  }

  submitEditTenant(): void {
    if (!this.selectedTenantForEdit) return;

    this.submitting.set(true);
    const tenantId = this.selectedTenantForEdit.id;
    const currentPlanCode = this.selectedTenantForEdit.active_plan?.code || 'basic';

    this.saas.updateTenant(tenantId, {
      name: this.editName,
      subdomain: this.editSubdomain,
      exchange_window_days: this.editWindow,
      is_active: this.editIsActive,
    }).subscribe({
      next: () => {
        // Si el plan fue modificado en el modal, aplicar el cambio de plan
        if (this.editPlanCode !== currentPlanCode) {
          this.saas.changeTenantPlan(tenantId, this.editPlanCode).subscribe({
            next: () => {
              this.submitting.set(false);
              this.toast.success('¡Empresa y plan de suscripción actualizados con éxito!');
              this.closeEditModal();
              this.loadAll();
            },
            error: (pErr) => {
              this.submitting.set(false);
              const pDetail = pErr.error?.detail || 'No se pudo cambiar el plan';
              this.toast.error(pDetail);
              this.loadAll();
            }
          });
        } else {
          this.submitting.set(false);
          this.toast.success('¡Empresa actualizada correctamente!');
          this.closeEditModal();
          this.loadAll();
        }
      },
      error: (err) => {
        this.submitting.set(false);
        const detail = err.error?.detail || 'Error al actualizar la empresa';
        this.toast.error(detail);
      }
    });
  }
}
