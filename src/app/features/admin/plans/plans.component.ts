import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SaasService } from '../../../core/services/saas.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { SubscriptionPlan, MySubscriptionResponse } from '../../../core/models';

@Component({
  selector: 'app-plans',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="content-area">

      <!-- Header -->
      <div class="page-header">
        <div>
          <div class="header-tag">SaaS Multi-tenant</div>
          <h1 class="page-title">Planes & Suscripción</h1>
          <p class="page-desc">Gestiona el plan de tu empresa, revisa tus límites contratados y actualiza tu nivel de suscripción.</p>
        </div>
        <div class="header-actions">
          @if (auth.isSuperAdmin()) {
            <a routerLink="/admin/tenants" class="btn btn-outline">
              🏢 Administrar Todas las Empresas SaaS
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
        <div class="current-plan-card" [class.pro]="s.plan?.code === 'professional'">
          <div class="plan-header">
            <div class="plan-badge-wrapper">
              <span class="badge" [ngClass]="s.plan?.code === 'professional' ? 'badge-primary' : 'badge-warning'">
                ● Plan Actual: {{ s.plan?.name || (s.is_superadmin ? 'SaaS Superadmin Global' : 'Plan Básico') }}
              </span>
              <span class="status-pill active">Estado: {{ s.status | uppercase }}</span>
            </div>
            <div class="company-name-tag">
              🏢 {{ s.tenant?.name || (s.is_superadmin ? 'Plataforma SaaS Multitenant (Superadmin)' : 'Tu Empresa') }}
              <span class="subdomain-text">({{ s.tenant?.subdomain || 'global' }}.fashionstore.com)</span>
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
                    ⚠️ Límite de sucursales alcanzado. Actualiza a Plan Profesional para habilitar hasta 10 sucursales.
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
                    {{ s.plan?.has_ai_reports ? 'Habilitado (Gemini AI)' : 'Bloqueado (Solo Plan Pro)' }}
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
                  <strong class="stat-val text-success">Activo (Ventas y Reservas sin red)</strong>
                </div>
              </div>

              <!-- Plazo de cambios -->
              <div class="usage-item stat">
                <div class="stat-icon-wrap enabled">
                  🔄
                </div>
                <div class="stat-details">
                  <span class="stat-title">Ventana para Cambio de Prendas</span>
                  <strong class="stat-val text-primary">{{ s.tenant?.exchange_window_days || 30 }} días configurados</strong>
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Plans Comparison Grid -->
      <div class="section-title-wrap">
        <h2>Comparativa de Planes SaaS</h2>
        <p class="text-secondary text-sm">Elige el plan que mejor se adapte al volumen de tu cadena o boutique.</p>
      </div>

      <div class="plans-grid">

        <!-- PLAN BÁSICO -->
        <div class="plan-card" [class.is-current]="isCurrentPlan('basic')">
          @if (isCurrentPlan('basic')) {
            <div class="ribbon-current">Plan Actual</div>
          }
          <div class="plan-card-body">
            <div class="plan-name">Plan Básico</div>
            <div class="plan-desc">Para boutiques emergentes, tiendas de ropa independientes y puntos de venta únicos.</div>
            
            <div class="plan-pricing">
              <span class="currency">$</span>
              <span class="amount">29.99</span>
              <span class="period">/ mes</span>
            </div>

            <ul class="features-list">
              <li class="feature-item enabled">
                <span class="f-icon">✓</span>
                <span><strong>Hasta 2 sucursales</strong> físicas activas</span>
              </li>
              <li class="feature-item enabled">
                <span class="f-icon">✓</span>
                <span>Catálogo de productos, tallas, colores y SKUs</span>
              </li>
              <li class="feature-item enabled">
                <span class="f-icon">✓</span>
                <span>Control de inventario por almacén</span>
              </li>
              <li class="feature-item enabled">
                <span class="f-icon">✓</span>
                <span>Ventas POS presenciales y pedidos online</span>
              </li>
              <li class="feature-item enabled">
                <span class="f-icon">✓</span>
                <span><strong>Sincronización Offline First</strong> en mostrador</span>
              </li>
              <li class="feature-item disabled">
                <span class="f-icon">✕</span>
                <span>Sin reportes generativos predictivos con IA</span>
              </li>
              <li class="feature-item disabled">
                <span class="f-icon">✕</span>
                <span>Soporte estándar por correo</span>
              </li>
            </ul>

            <div class="plan-cta-box">
              @if (isCurrentPlan('basic')) {
                <button class="btn btn-secondary w-full" disabled>
                  ✓ Plan Actual en Uso
                </button>
              } @else {
                <button class="btn btn-outline w-full" (click)="confirmPlanChange('basic', 'Plan Básico')">
                  Cambiar a Plan Básico
                </button>
              }
            </div>
          </div>
        </div>

        <!-- PLAN PROFESIONAL -->
        <div class="plan-card pro" [class.is-current]="isCurrentPlan('professional')">
          <div class="popular-tag">RECOMENDADO / MÁS POPULAR</div>
          @if (isCurrentPlan('professional')) {
            <div class="ribbon-current">Plan Actual</div>
          }
          <div class="plan-card-body">
            <div class="plan-name">Plan Profesional</div>
            <div class="plan-desc">Para cadenas de moda en expansión que necesitan múltiples sucursales e inteligencia artificial.</div>
            
            <div class="plan-pricing">
              <span class="currency">$</span>
              <span class="amount">99.99</span>
              <span class="period">/ mes</span>
            </div>

            <ul class="features-list">
              <li class="feature-item enabled highlight">
                <span class="f-icon">✓</span>
                <span><strong>Hasta 10 sucursales</strong> físicas simultáneas</span>
              </li>
              <li class="feature-item enabled highlight">
                <span class="f-icon">✨</span>
                <span><strong>Reportes Inteligentes con IA (Gemini)</strong>: tendencias y proyecciones</span>
              </li>
              <li class="feature-item enabled highlight">
                <span class="f-icon">✨</span>
                <span><strong>Probador Virtual IA (Try-On)</strong> y recomendaciones</span>
              </li>
              <li class="feature-item enabled">
                <span class="f-icon">✓</span>
                <span>Transferencias de stock entre sucursales</span>
              </li>
              <li class="feature-item enabled">
                <span class="f-icon">✓</span>
                <span><strong>Sincronización Offline First</strong> garantizada</span>
              </li>
              <li class="feature-item enabled">
                <span class="f-icon">✓</span>
                <span>Configuración de plazos de cambio de prendas</span>
              </li>
              <li class="feature-item enabled">
                <span class="f-icon">✓</span>
                <span>Soporte prioritario 24/7 y SLA garantizado</span>
              </li>
            </ul>

            <div class="plan-cta-box">
              @if (isCurrentPlan('professional')) {
                <button class="btn btn-primary w-full" disabled>
                  ✓ Plan Profesional Activo
                </button>
              } @else {
                <button class="btn btn-primary w-full glow" (click)="confirmPlanChange('professional', 'Plan Profesional')">
                  🚀 Actualizar a Plan Profesional
                </button>
              }
            </div>
          </div>
        </div>

      </div>

      <!-- Feature Matrix -->
      <div class="matrix-card">
        <h3>Matriz Detallada de Capacidades</h3>
        <table class="table">
          <thead>
            <tr>
              <th>Característica</th>
              <th class="text-center">Plan Básico ($29.99/mes)</th>
              <th class="text-center text-primary">Plan Profesional ($99.99/mes)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Sucursales Físicas Habilitadas</td>
              <td class="text-center">Máximo 2</td>
              <td class="text-center font-bold text-primary">Hasta 10</td>
            </tr>
            <tr>
              <td>Operación Offline en Caja (Sin Internet)</td>
              <td class="text-center"><span class="check-yes">✅ Incluido</span></td>
              <td class="text-center"><span class="check-yes">✅ Incluido</span></td>
            </tr>
            <tr>
              <td>Reportes Analíticos de Ventas e Inventario</td>
              <td class="text-center"><span class="check-yes">✅ Estándar</span></td>
              <td class="text-center"><span class="check-yes">✅ Avanzados + Métricas</span></td>
            </tr>
            <tr>
              <td>Reportes Predictivos con IA (Gemini AI)</td>
              <td class="text-center"><span class="check-no">❌ No disponible</span></td>
              <td class="text-center"><span class="check-yes font-bold">✨ Gemini 2.5 Generativo</span></td>
            </tr>
            <tr>
              <td>Probador Virtual de Prendas (Virtual Try-on)</td>
              <td class="text-center"><span class="check-no">❌ No disponible</span></td>
              <td class="text-center"><span class="check-yes font-bold">✨ Incluido con IA</span></td>
            </tr>
            <tr>
              <td>Plazo Configurable de Cambio de Prendas</td>
              <td class="text-center">15 días fijos</td>
              <td class="text-center text-primary">Totalmente personalizable (1 a 365 días)</td>
            </tr>
          </tbody>
        </table>
      </div>

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
      grid-template-columns: repeat(2, 1fr);
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

  ngOnInit(): void {
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
    return active?.plan?.code === code;
  }

  confirmPlanChange(targetPlanCode: string, planName: string): void {
    const current = this.sub()?.plan?.name || 'Plan Básico';
    const ok = confirm(`¿Confirmas que deseas cambiar tu suscripción a ${planName}?\n\nTu plan actual (${current}) será reemplazado inmediatamente.`);
    if (!ok) return;

    this.saas.changeMyPlan(targetPlanCode).subscribe({
      next: (res) => {
        this.toast.success(`¡Suscripción actualizada exitosamente a ${planName}!`);
        this.loadData();
      },
      error: (err) => {
        const detail = err.error?.detail || 'No se pudo actualizar el plan';
        this.toast.error(detail);
      }
    });
  }
}
