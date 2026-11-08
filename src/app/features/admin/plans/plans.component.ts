import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SaasService } from '../../../core/services/saas.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { MySubscriptionResponse } from '../../../core/models';

@Component({
  selector: 'app-plans',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="content-area">

      <!-- Header -->
      <div class="page-header">
        <div>
          <div class="header-tag">{{ auth.isSuperAdmin() ? 'Plataforma SaaS Global' : 'Suscripción Mensual de Empresa' }}</div>
          <h1 class="page-title">{{ auth.isSuperAdmin() ? 'Catálogo Global de Planes SaaS' : 'Planes & Suscripción' }}</h1>
          <p class="page-desc">
            {{ auth.isSuperAdmin()
              ? 'Consulta los niveles de servicio disponibles en la plataforma. Para asignar, cambiar o renovar el plan de una empresa específica, utiliza el módulo Empresas SaaS.'
              : 'Gestiona el plan mensual de tu empresa, controla la cancelación automática a fin de mes y revisa tus límites contratados.' }}
          </p>
        </div>
        <div class="header-actions">
          @if (auth.isSuperAdmin()) {
            <a routerLink="/admin/tenants" class="btn btn-primary">
              🏢 Gestionar Empresas SaaS
            </a>
          }
          <button class="btn btn-secondary" (click)="loadData()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refrescar
          </button>
        </div>
      </div>

      <!-- Current Subscription Banner -->
      @if (sub(); as s) {
        @if (s.is_superadmin || auth.isSuperAdmin()) {
          <div class="current-plan-card pro">
            <div class="plan-header" style="margin-bottom: 0; padding-bottom: 0; border-bottom: none;">
              <div class="plan-badge-wrapper">
                <span class="badge badge-warning">👑 Rol Global: SuperAdmin SaaS</span>
                <span class="status-pill active">PLATAFORMA GLOBAL</span>
              </div>
              <div class="company-name-tag">
                Cada empresa cliente cuenta con ciclo mensual de 30 días y cancelación automática al finalizar el mes.
              </div>
            </div>
          </div>
        } @else {
          <div class="current-plan-card" [class.pro]="s.plan?.has_ai_reports" [class.cancelled-card]="s.status !== 'active'">
            <div class="plan-header">
              <div class="plan-badge-wrapper">
                <span class="badge" [ngClass]="s.plan?.has_ai_reports ? 'badge-primary' : 'badge-warning'">
                  ● Plan Actual: {{ s.plan?.name || 'Plan Básico' }}
                </span>
                <span class="status-pill" [class.active]="s.status === 'active'" [class.cancelled]="s.status !== 'active'">
                  Estado: {{ s.status === 'active' ? 'ACTIVA' : (s.status === 'cancelled' ? 'CANCELADA (FIN DE MES)' : (s.status | uppercase)) }}
                </span>
              </div>
              <div class="company-name-tag">
                🏢 {{ s.tenant?.name || 'Tu Empresa' }}
                <span class="subdomain-text">({{ s.tenant?.subdomain || 'empresa' }}.fashionstore.com)</span>
              </div>
            </div>

            <!-- Monthly Billing Cycle & Auto-Cancellation Control -->
            <div class="billing-cycle-box" [class.alert-cancelled]="s.status !== 'active'">
              <div class="cycle-info">
                <div class="cycle-title">
                  @if (s.status === 'active') {
                    🗓️ Ciclo Mensual Vigente
                    @if (s.days_remaining !== null && s.days_remaining !== undefined) {
                      <span class="days-pill" [class.urgent]="s.days_remaining <= 5">
                        {{ s.days_remaining }} día{{ s.days_remaining === 1 ? '' : 's' }} restante{{ s.days_remaining === 1 ? '' : 's' }}
                      </span>
                    }
                  } @else {
                    ⚠️ Suscripción cancelada automáticamente por fin de ciclo mensual
                  }
                </div>
                <div class="cycle-dates">
                  @if (s.start_date) {
                    <span>Inicio: <strong>{{ s.start_date | date:'dd/MM/yyyy' }}</strong></span>
                  }
                  @if (s.end_date) {
                    <span>Fin de mes: <strong>{{ s.end_date | date:'dd/MM/yyyy HH:mm' }}</strong></span>
                  }
                  <span>
                    Cancelación automática a fin de mes:
                    <strong [class.text-warning]="s.cancel_at_period_end" [class.text-success]="!s.cancel_at_period_end">
                      {{ s.cancel_at_period_end ? 'ACTIVA (se cancela al acabar el mes)' : 'DESACTIVADA' }}
                    </strong>
                  </span>
                </div>
              </div>
              <div class="cycle-actions">
                @if (s.status === 'active') {
                  <button class="btn btn-sm btn-outline" [disabled]="togglingAutoCancel || renewing" (click)="toggleAutoCancel()">
                    {{ s.cancel_at_period_end ? '🔕 Desactivar auto-cancelación' : '⏰ Activar auto-cancelación fin de mes' }}
                  </button>
                }
                <button class="btn btn-sm btn-primary" [disabled]="renewing" (click)="renewSubscription()">
                  {{ renewing ? 'Renovando...' : (s.status === 'active' ? '🔄 Extender +30 días' : '🔄 Reactivar Mes (+30 días)') }}
                </button>
              </div>
            </div>

            <!-- Usage Metrics Grid -->
            @if (s.usage; as u) {
              <div class="usage-grid">
                <!-- Sucursales -->
                <div class="usage-item">
                  <div class="usage-label">
                    <span>Sucursales Activas</span>
                    <strong>{{ u.branches_count }} / {{ u.branches_limit }}</strong>
                  </div>
                  <div class="progress-bar">
                    <div class="progress-fill" [style.width.%]="(u.branches_count / u.branches_limit) * 100"
                      [class.warning]="u.branches_count >= u.branches_limit"></div>
                  </div>
                  <span class="usage-helper">
                    @if (u.branches_count >= u.branches_limit) {
                      ⚠️ Límite de sucursales alcanzado. Consulta los planes disponibles o desactiva una sucursal.
                    } @else {
                      {{ u.branches_limit - u.branches_count }} sucursales disponibles para aperturar.
                    }
                  </span>
                </div>

                <!-- Reportes IA -->
                <div class="usage-item stat">
                  <div class="stat-icon-wrap" [class.enabled]="s.plan?.has_ai_reports">
                    {{ s.plan?.has_ai_reports ? '✨' : '🔒' }}
                  </div>
                  <div class="stat-details">
                    <span class="stat-title">Reportes Generativos con IA</span>
                    <strong class="stat-val" [class.text-success]="s.plan?.has_ai_reports" [class.text-muted]="!s.plan?.has_ai_reports">
                      {{ s.plan?.has_ai_reports ? 'Habilitado (Gemini AI)' : 'No incluido en este plan' }}
                    </strong>
                  </div>
                </div>

                <!-- Modo Offline First -->
                <div class="usage-item stat">
                  <div class="stat-icon-wrap enabled">
                    ⚡
                  </div>
                  <div class="stat-details">
                    <span class="stat-title">Caja Offline-First</span>
                    <strong class="stat-val text-success">{{ s.plan?.has_offline_sync ? 'Habilitado' : 'No incluido en este plan' }}</strong>
                  </div>
                </div>

                <!-- Plazo de cambios -->
                <div class="usage-item stat">
                  <div class="stat-icon-wrap enabled">
                    🔄
                  </div>
                  <div class="stat-details">
                    <span class="stat-title">Ventana para Cambio de Prendas</span>
                    <strong class="stat-val text-primary">{{ s.tenant?.exchange_window_days || 2 }} días configurados</strong>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      }

      <!-- Plans Comparison Grid -->
      <div class="section-title-wrap">
        <h2>Comparativa de Planes SaaS</h2>
        <p class="text-secondary text-sm">
          {{ auth.isSuperAdmin()
            ? 'Niveles de suscripción disponibles para las empresas registradas en la red SaaS.'
            : 'Elige el plan mensual que mejor se adapte al volumen de tu cadena o boutique.' }}
        </p>
      </div>

      <div class="plans-grid">
        @for (plan of saas.plans(); track plan.id) {
          <div class="plan-card" [class.pro]="plan.has_ai_reports" [class.is-current]="!auth.isSuperAdmin() && isCurrentPlan(plan.code)">
            <div class="plan-name">{{ plan.name }}</div>
            <div class="plan-pricing"><span class="currency">USD</span><span class="amount">{{ plan.price | number:'1.2-2' }}</span><span class="period">/ mes</span></div>
            <ul class="features-list">
              <li>Hasta {{ plan.max_branches }} sucursales activas</li>
              <li>Catálogo, ventas, reservas e inventario por empresa</li>
              <li>Reportes con IA: {{ plan.has_ai_reports ? 'Incluidos' : 'No incluidos' }}</li>
              <li>Sincronización offline: {{ plan.has_offline_sync ? 'Incluida' : 'No incluida' }}</li>
              <li>Ciclo de 30 días con cancelación automática a fin de mes</li>
            </ul>
            <div class="plan-cta-box">
              @if (auth.isSuperAdmin()) {
                <a routerLink="/admin/tenants" class="btn btn-outline w-full" style="text-align: center; display: block;">
                  Asignar en Empresas SaaS →
                </a>
              } @else {
                <button class="btn btn-primary w-full" [disabled]="isCurrentPlan(plan.code) || changing" (click)="confirmPlanChange(plan.code, plan.name)">
                  {{ isCurrentPlan(plan.code) ? 'Plan actual' : 'Cambiar a ' + plan.name }}
                </button>
              }
            </div>
          </div>
        } @empty {
          <p>No hay planes disponibles. Vuelve a cargar la página para consultar el catálogo.</p>
        }
      </div>
      <p class="text-secondary">Suscripciones mensuales de 30 días: al finalizar el mes se cancelan automáticamente salvo renovación explícita.</p>

    </div>
  `,
  styles: [`
    .content-area {
      padding: 32px;
      max-width: 1200px;
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
      max-width: 650px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 28px;
      gap: 16px;
    }

    .header-actions {
      display: flex;
      gap: 12px;
      flex-shrink: 0;
    }

    /* Current Plan Banner */
    .current-plan-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 24px;
      margin-bottom: 36px;
      box-shadow: var(--shadow-sm);
      transition: all var(--transition-normal);

      &.pro {
        border-color: rgba(99, 102, 241, 0.4);
        background: linear-gradient(135deg, rgba(30, 27, 75, 0.25) 0%, var(--bg-surface) 100%);
      }
    }

    .plan-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .plan-badge-wrapper {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .status-pill {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
      border: 1px solid rgba(34, 197, 94, 0.3);

      &.cancelled {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
        border-color: rgba(239, 68, 68, 0.35);
      }
    }

    .cancelled-card {
      border-color: rgba(239, 68, 68, 0.45) !important;
    }

    .billing-cycle-box {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      padding: 16px 18px;
      margin-bottom: 20px;
      border-radius: var(--radius-md);
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);

      &.alert-cancelled {
        background: rgba(239, 68, 68, 0.08);
        border-color: rgba(239, 68, 68, 0.35);
      }
    }

    .cycle-info {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .cycle-title {
      font-size: 0.95rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .days-pill {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 2px 9px;
      border-radius: 999px;
      background: rgba(99, 102, 241, 0.18);
      color: var(--color-primary-light, #818cf8);

      &.urgent {
        background: rgba(245, 158, 11, 0.2);
        color: #f59e0b;
      }
    }

    .cycle-dates {
      display: flex;
      flex-wrap: wrap;
      gap: 18px;
      font-size: 0.84rem;
      color: var(--text-secondary);
    }

    .cycle-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .company-name-tag {
      font-size: 0.92rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .subdomain-text {
      color: var(--text-muted);
      font-size: 0.85rem;
      font-weight: normal;
      margin-left: 4px;
    }

    .usage-grid {
      display: grid;
      grid-template-columns: 1.5fr 1fr 1fr 1fr;
      gap: 20px;

      @media (max-width: 900px) {
        grid-template-columns: 1fr;
      }
    }

    .usage-item {
      background: var(--bg-elevated);
      padding: 16px;
      border-radius: var(--radius-md);
      display: flex;
      flex-direction: column;
      gap: 8px;

      &.stat {
        flex-direction: row;
        align-items: center;
        gap: 14px;
      }
    }

    .usage-label {
      display: flex;
      justify-content: space-between;
      font-size: 0.88rem;
      color: var(--text-secondary);
    }

    .progress-bar {
      height: 8px;
      background: var(--border-subtle);
      border-radius: 999px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--color-primary);
      border-radius: 999px;
      transition: width 0.4s ease;

      &.warning {
        background: #f59e0b;
      }
    }

    .usage-helper {
      font-size: 0.78rem;
      color: var(--text-muted);
    }

    .stat-icon-wrap {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, 0.05);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      flex-shrink: 0;

      &.enabled {
        background: rgba(99, 102, 241, 0.15);
      }
    }

    .stat-details {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .stat-title {
      font-size: 0.78rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .stat-val {
      font-size: 0.9rem;
      font-weight: 600;
    }

    /* Plans Grid */
    .section-title-wrap {
      margin-bottom: 24px;
      h2 {
        font-size: 1.4rem;
        font-weight: 700;
        margin-bottom: 4px;
      }
    }

    .plans-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 28px;
      margin-bottom: 40px;

      @media (max-width: 768px) {
        grid-template-columns: 1fr;
      }
    }

    .plan-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      padding: 32px;
      position: relative;
      display: flex;
      flex-direction: column;
      transition: all var(--transition-normal);

      &:hover {
        transform: translateY(-4px);
        box-shadow: var(--shadow-lg);
      }

      &.pro {
        border-color: var(--color-primary);
        box-shadow: 0 0 24px rgba(99, 102, 241, 0.15);
      }

      &.is-current {
        border-width: 2px;
      }
    }

    .popular-tag {
      position: absolute;
      top: -12px;
      right: 28px;
      background: linear-gradient(135deg, var(--color-primary), #ec4899);
      color: white;
      font-size: 0.72rem;
      font-weight: 800;
      padding: 4px 12px;
      border-radius: 999px;
      letter-spacing: 0.08em;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
    }

    .ribbon-current {
      position: absolute;
      top: 16px;
      right: 16px;
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
      border: 1px solid rgba(34, 197, 94, 0.3);
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      font-size: 0.78rem;
      font-weight: 700;
    }

    .plan-name {
      font-size: 1.45rem;
      font-weight: 800;
      margin-bottom: 8px;
    }

    .plan-desc {
      color: var(--text-secondary);
      font-size: 0.9rem;
      line-height: 1.4;
      margin-bottom: 24px;
      min-height: 48px;
    }

    .plan-pricing {
      display: flex;
      align-items: baseline;
      gap: 4px;
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border-subtle);

      .currency { font-size: 1.4rem; font-weight: 700; color: var(--text-secondary); }
      .amount { font-size: 2.8rem; font-weight: 800; letter-spacing: -0.03em; color: var(--text-primary); }
      .period { font-size: 0.95rem; color: var(--text-muted); font-weight: 500; }
    }

    .features-list {
      list-style: none;
      padding: 0;
      margin: 0 0 32px 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .feature-item {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 0.92rem;

      .f-icon {
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        font-size: 0.8rem;
        flex-shrink: 0;
      }

      &.enabled {
        color: var(--text-primary);
        .f-icon { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
      }

      &.highlight {
        .f-icon { background: rgba(99, 102, 241, 0.2); color: var(--color-primary); }
      }

      &.disabled {
        color: var(--text-muted);
        text-decoration: line-through;
        .f-icon { background: rgba(255, 255, 255, 0.05); color: var(--text-muted); }
      }
    }

    .plan-cta-box {
      margin-top: auto;
    }

    .glow {
      box-shadow: 0 4px 18px rgba(99, 102, 241, 0.35);
    }

    .w-full { width: 100%; }

    /* Matrix */
    .matrix-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 24px;
      margin-top: 20px;

      h3 {
        font-size: 1.15rem;
        font-weight: 700;
        margin-bottom: 18px;
      }
    }

    .check-yes { color: #22c55e; font-weight: 600; font-size: 0.88rem; }
    .check-no { color: var(--text-muted); font-size: 0.88rem; }
  `]
})
export class SubscriptionPlansComponent implements OnInit {
  sub = signal<MySubscriptionResponse | null>(null);

  constructor(
    public saas: SaasService,
    public auth: AuthService,
    private toast: ToastService,
  ) {}

  changing = false;
  togglingAutoCancel = false;
  renewing = false;

  ngOnInit(): void {
    this.saas.getPlans().subscribe({error: () => this.toast.error('No se pudieron cargar los planes')});
    this.loadData();
  }

  loadData(): void {
    this.saas.getMySubscription().subscribe({
      next: (data) => this.sub.set(data),
      error: () => this.toast.error('Error al cargar la información de suscripción'),
    });
  }

  isCurrentPlan(code: string): boolean {
    const active = this.sub();
    return active?.status === 'active' && active?.plan?.code === code;
  }

  toggleAutoCancel(): void {
    const current = this.sub();
    if (!current || this.togglingAutoCancel) return;
    const nextValue = !current.cancel_at_period_end;
    this.togglingAutoCancel = true;
    this.saas.setMyAutoCancel(nextValue).subscribe({
      next: (updated) => {
        this.togglingAutoCancel = false;
        this.sub.set(updated);
        this.toast.success(
          nextValue
            ? 'Cancelación automática activada: la suscripción finalizará al acabar el mes.'
            : 'Cancelación automática desactivada para este ciclo mensual.'
        );
      },
      error: (err) => {
        this.togglingAutoCancel = false;
        this.toast.error(err.error?.detail || 'No se pudo actualizar la configuración de cancelación automática');
      }
    });
  }

  renewSubscription(): void {
    if (this.renewing) return;
    this.renewing = true;
    this.saas.renewMySubscription().subscribe({
      next: () => {
        this.renewing = false;
        this.toast.success('¡Suscripción renovada por 30 días adicionales!');
        this.loadData();
      },
      error: (err) => {
        this.renewing = false;
        this.toast.error(err.error?.detail || 'No se pudo renovar la suscripción');
      }
    });
  }

  confirmPlanChange(targetPlanCode: string, planName: string): void {
    if (this.changing) return;
    const current = this.sub()?.plan?.name || 'Plan Básico';
    const ok = confirm(`¿Confirmas que deseas cambiar tu suscripción a ${planName}?\n\nTu plan actual (${current}) será reemplazado inmediatamente.`);
    if (!ok) return;

    this.changing = true;
    this.saas.changeMyPlan(targetPlanCode).subscribe({
      next: (res) => {
        this.changing = false;
        this.toast.success(`¡Suscripción actualizada exitosamente a ${planName}!`);
        this.loadData();
      },
      error: (err) => {
        this.changing = false;
        const detail = err.error?.detail || 'No se pudo actualizar el plan';
        this.toast.error(detail);
      }
    });
  }
}
