import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SaasService } from '../../../core/services/saas.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { AIModelOptions, MySubscriptionResponse, SubscriptionCheckout, SubscriptionPlan, SubscriptionPlanInput } from '../../../core/models';

@Component({
  selector: 'app-plans',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="content-area">

      <!-- Header -->
      <div class="page-header">
        <div>
          <div class="header-tag">{{ auth.isSuperAdmin() ? 'Plataforma SaaS Global' : 'Suscripción Mensual de Empresa' }}</div>
          <h1 class="page-title">{{ auth.isSuperAdmin() ? 'Catálogo Global de Planes SaaS' : 'Planes & Suscripción' }}</h1>
          <p class="page-desc">
            {{ auth.isSuperAdmin()
              ? 'Edita los límites, funciones de IA, modelos y precio de cada plan, o crea planes nuevos. Para asignar, cambiar o renovar el plan de una empresa, utiliza el módulo Empresas SaaS.'
              : 'Gestiona el plan mensual de tu empresa, controla la cancelación automática a fin de mes y revisa tus límites contratados.' }}
          </p>
        </div>
        <div class="header-actions">
          @if (auth.isSuperAdmin()) {
            <button class="btn btn-primary" (click)="startCreate()">➕ Nuevo plan</button>
            <a routerLink="/admin/tenants" class="btn btn-secondary">
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

                <div class="usage-item">
                  <div class="usage-label">
                    <span>Usuarios del personal</span>
                    <strong>{{ u.staff_count ?? 0 }} / {{ u.users_limit ?? '∞' }}</strong>
                  </div>
                  @if (u.users_limit) {
                    <div class="progress-bar">
                      <div class="progress-fill" [style.width.%]="((u.staff_count ?? 0) / u.users_limit) * 100"
                        [class.warning]="(u.staff_count ?? 0) >= u.users_limit"></div>
                    </div>
                  }
                  <span class="usage-helper">Los clientes registrados no cuentan para este límite.</span>
                </div>

                <div class="usage-item">
                  <div class="usage-label">
                    <span>Productos activos</span>
                    <strong>{{ u.products_count }} / {{ u.products_limit ?? '∞' }}</strong>
                  </div>
                  @if (u.products_limit) {
                    <div class="progress-bar">
                      <div class="progress-fill" [style.width.%]="(u.products_count / u.products_limit) * 100"
                        [class.warning]="u.products_count >= u.products_limit"></div>
                    </div>
                  }
                </div>

                <!-- Funciones de IA del plan -->
                <div class="usage-item stat">
                  <div class="stat-icon-wrap" [class.enabled]="s.plan?.has_ai_shopper || s.plan?.has_ai_tryon">🤖</div>
                  <div class="stat-details">
                    <span class="stat-title">IA para clientes</span>
                    <strong class="stat-val">
                      Personal Shopper: {{ s.plan?.has_ai_shopper ? 'Sí' : 'No' }} · Probador virtual: {{ s.plan?.has_ai_tryon ? 'Sí' : 'No' }}
                    </strong>
                  </div>
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

      @if (checkout) {
        <div class="checkout-backdrop" (click)="closeCheckout()"></div>
        <form class="checkout-modal" (ngSubmit)="submitCheckout()" #payForm="ngForm">
          <div class="checkout-head">
            <h2>{{ checkout.kind === 'renew' ? 'Renovar suscripción' : 'Cambiar a ' + checkout.planName }}</h2>
            <button type="button" class="btn btn-sm btn-secondary" (click)="closeCheckout()">✕</button>
          </div>
          <div class="checkout-total">
            <span>Total a pagar</span>
            <strong>USD {{ checkout.price | number:'1.2-2' }}</strong>
            <small>Ciclo de 30 días. {{ checkout.kind === 'renew' ? 'Se suman al vencimiento actual.' : 'Tu plan actual se reemplaza cuando PayPal confirme el pago.' }}</small>
          </div>
          <h3>Datos de facturación</h3>
          <label>Nombre o razón social
            <input class="form-control" name="billName" [(ngModel)]="billing.name" required minlength="2" maxlength="120">
          </label>
          <label>NIT o CI (opcional)
            <input class="form-control" name="billTax" [(ngModel)]="billing.tax_id" maxlength="30">
          </label>
          <label>Correo para el comprobante
            <input class="form-control" type="email" name="billEmail" [(ngModel)]="billing.email" required email>
          </label>
          <h3>Método de pago</h3>
          <div class="pay-method">💳 PayPal: paga con tu cuenta PayPal o con tarjeta en la página segura de PayPal.
            FashionStore nunca recibe ni guarda los datos de tu tarjeta.</div>
          @if (isOffline()) {
            <p class="offline-note">⚡ Sin conexión: el formulario se guardará en este dispositivo y, al volver internet,
              se abrirá PayPal automáticamente para que confirmes el pago de USD {{ checkout.price | number:'1.2-2' }}.</p>
          }
          <div class="editor-actions">
            <button type="button" class="btn btn-secondary" (click)="closeCheckout()" [disabled]="changing || renewing">Cancelar</button>
            <button type="submit" class="btn btn-primary" [disabled]="payForm.invalid || changing || renewing">
              {{ isOffline() ? 'Guardar y pagar al reconectar' : (changing || renewing ? 'Procesando…' : 'Pagar USD ' + (checkout.price | number:'1.2-2') + ' con PayPal') }}
            </button>
          </div>
        </form>
      }

      @if (pendingCheckout) {
        <div class="pending-checkout">
          <span>⏳ Pago de plan guardado sin conexión: {{ pendingCheckout.kind === 'renew' ? 'renovación' : pendingCheckout.planName }} · USD {{ pendingCheckout.price | number:'1.2-2' }}.
            {{ isOffline() ? 'Se abrirá PayPal al volver internet.' : '' }}</span>
          <div>
            <button class="btn btn-sm btn-primary" (click)="resumePendingCheckout()" [disabled]="isOffline() || changing">Pagar ahora</button>
            <button class="btn btn-sm btn-secondary" (click)="discardPendingCheckout()">Descartar</button>
          </div>
        </div>
      }

      @if (editing) {
        <form class="plan-editor" (ngSubmit)="savePlan()" #planForm="ngForm">
          <div class="editor-head">
            <h2>{{ editingId ? 'Editar ' + (form.name || 'plan') : 'Nuevo plan' }}</h2>
            @if (editingId && editingSubscribers) {
              <span class="badge badge-warning">{{ editingSubscribers }} empresa(s) suscrita(s): los cambios se aplican de inmediato</span>
            }
          </div>
          <div class="editor-grid">
            <label>Código
              <input class="form-control" name="code" [(ngModel)]="form.code" [disabled]="!!editingId" required pattern="[a-z0-9][a-z0-9_-]*" maxlength="30" placeholder="ej. starter">
            </label>
            <label>Nombre
              <input class="form-control" name="name" [(ngModel)]="form.name" required minlength="2" maxlength="80">
            </label>
            <label>Precio mensual (USD)
              <input class="form-control" type="number" name="price" [(ngModel)]="form.price" required min="0" step="0.01">
            </label>
            <label class="span-2">Descripción
              <input class="form-control" name="description" [(ngModel)]="form.description" maxlength="255" placeholder="Opcional">
            </label>
          </div>

          <h3>Límites</h3>
          <p class="text-secondary text-sm">Deja usuarios o productos vacíos para que sean ilimitados. Bajar un límite no desactiva lo que ya existe; solo impide crear más.</p>
          <div class="editor-grid">
            <label>Sucursales activas
              <input class="form-control" type="number" name="max_branches" [(ngModel)]="form.max_branches" required min="1">
            </label>
            <label>Usuarios del personal
              <input class="form-control" type="number" name="max_users" [(ngModel)]="form.max_users" min="1" placeholder="Ilimitado">
            </label>
            <label>Productos activos
              <input class="form-control" type="number" name="max_products" [(ngModel)]="form.max_products" min="1" placeholder="Ilimitado">
            </label>
          </div>

          <h3>Funciones</h3>
          <div class="editor-grid toggles">
            <label><input type="checkbox" name="has_ai_reports" [(ngModel)]="form.has_ai_reports"> Reportes y análisis con IA</label>
            <label><input type="checkbox" name="has_ai_shopper" [(ngModel)]="form.has_ai_shopper"> Personal Shopper y recomendaciones IA</label>
            <label><input type="checkbox" name="has_ai_tryon" [(ngModel)]="form.has_ai_tryon"> Probador virtual con IA</label>
            <label><input type="checkbox" name="has_offline_sync" [(ngModel)]="form.has_offline_sync"> Caja offline</label>
            <label><input type="checkbox" name="is_active" [(ngModel)]="form.is_active"> Plan disponible para contratar</label>
          </div>

          <h3>Modelos de IA</h3>
          <div class="editor-grid">
            <label>Modelo de texto (chat, recomendaciones, reportes)
              <select class="form-control" name="ai_text_model" [(ngModel)]="form.ai_text_model" [disabled]="!form.has_ai_reports && !form.has_ai_shopper">
                <option [ngValue]="null">Por defecto del servidor ({{ models?.default_text_model || '…' }})</option>
                @for (m of models?.text_models ?? []; track m) { <option [ngValue]="m">{{ m }}</option> }
              </select>
            </label>
            <label>Modelo de imagen (probador virtual)
              <select class="form-control" name="ai_image_model" [(ngModel)]="form.ai_image_model" [disabled]="!form.has_ai_tryon">
                <option [ngValue]="null">Por defecto del servidor ({{ models?.default_image_model || '…' }})</option>
                @for (m of models?.image_models ?? []; track m) { <option [ngValue]="m">{{ m }}</option> }
              </select>
            </label>
          </div>

          <div class="editor-actions">
            <button type="button" class="btn btn-secondary" (click)="cancelEdit()" [disabled]="saving">Cancelar</button>
            <button type="submit" class="btn btn-primary" [disabled]="saving || planForm.invalid">{{ saving ? 'Guardando…' : 'Guardar plan' }}</button>
          </div>
        </form>
      }

      <div class="plans-grid">
        @for (plan of saas.plans(); track plan.id) {
          <div class="plan-card" [class.pro]="plan.has_ai_reports" [class.is-current]="!auth.isSuperAdmin() && isCurrentPlan(plan.code)" [class.inactive-plan]="!plan.is_active">
            <div class="plan-name">{{ plan.name }}</div>
            @if (auth.isSuperAdmin()) {
              <div class="text-secondary text-sm">
                Código {{ plan.code }} · {{ plan.subscribers_count || 0 }} empresa(s)
                @if (!plan.is_active) { · <strong>No disponible</strong> }
              </div>
            }
            @if (plan.description) { <p class="text-secondary text-sm">{{ plan.description }}</p> }
            <div class="plan-pricing"><span class="currency">USD</span><span class="amount">{{ plan.price | number:'1.2-2' }}</span><span class="period">/ mes</span></div>
            <ul class="features-list">
              <li>Hasta {{ plan.max_branches }} sucursales activas</li>
              <li>{{ plan.max_users ? 'Hasta ' + plan.max_users + ' usuarios del personal' : 'Usuarios del personal ilimitados' }}</li>
              <li>{{ plan.max_products ? 'Hasta ' + plan.max_products + ' productos activos' : 'Productos ilimitados' }}</li>
              <li>Catálogo, ventas, reservas e inventario por empresa</li>
              <li>Reportes con IA: {{ plan.has_ai_reports ? 'Incluidos' : 'No incluidos' }}</li>
              <li>Personal Shopper IA: {{ plan.has_ai_shopper ? 'Incluido' : 'No incluido' }}</li>
              <li>Probador virtual IA: {{ plan.has_ai_tryon ? 'Incluido' : 'No incluido' }}</li>
              @if (auth.isSuperAdmin() && (plan.ai_text_model || plan.ai_image_model)) {
                <li>Modelos: {{ plan.ai_text_model || 'texto por defecto' }} · {{ plan.ai_image_model || 'imagen por defecto' }}</li>
              }
              <li>Sincronización offline: {{ plan.has_offline_sync ? 'Incluida' : 'No incluida' }}</li>
              <li>Ciclo de 30 días con cancelación automática a fin de mes</li>
            </ul>
            <div class="plan-cta-box">
              @if (auth.isSuperAdmin()) {
                <button class="btn btn-primary w-full" (click)="startEdit(plan)">✏️ Editar plan</button>
                <a routerLink="/admin/tenants" class="btn btn-outline w-full" style="text-align: center; display: block; margin-top: 8px;">
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

    .plan-editor {
      background: var(--bg-card, rgba(255,255,255,0.03));
      border: 1px solid var(--border-color, rgba(255,255,255,0.12));
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 28px;
    }
    .plan-editor h2 { margin: 0; font-size: 1.25rem; }
    .plan-editor h3 { margin: 20px 0 8px; font-size: 1rem; }
    .editor-head { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
    .editor-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-top: 12px; }
    .editor-grid label { display: flex; flex-direction: column; gap: 6px; font-size: 0.88rem; }
    .editor-grid .span-2 { grid-column: span 2; }
    .editor-grid.toggles label { flex-direction: row; align-items: center; gap: 8px; }
    .editor-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
    .plan-card.inactive-plan { opacity: 0.6; }
    .checkout-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 10000; }
    .checkout-modal { position: fixed; z-index: 10001; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
      background: var(--bg-card, #1e1b2e); border: 1px solid var(--border-color, rgba(255,255,255,.12));
      border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 10px; }
    .checkout-modal label { display: flex; flex-direction: column; gap: 6px; font-size: .88rem; }
    .checkout-modal h3 { margin: 10px 0 0; font-size: 1rem; }
    .checkout-head { display: flex; justify-content: space-between; align-items: center; }
    .checkout-head h2 { margin: 0; font-size: 1.3rem; }
    .checkout-total { display: flex; flex-direction: column; padding: 14px; border-radius: 12px; background: rgba(99,102,241,.12); }
    .checkout-total strong { font-size: 1.8rem; }
    .checkout-total small { opacity: .75; }
    .pay-method { padding: 12px; border-radius: 10px; background: rgba(255,255,255,.04); font-size: .88rem; }
    .offline-note { color: #f59e0b; font-size: .88rem; }
    .pending-checkout { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center;
      padding: 12px 16px; border-radius: 12px; margin-bottom: 20px; background: rgba(245,158,11,.12); border: 1px solid rgba(245,158,11,.4); }
    @media (max-width: 600px) { .editor-grid .span-2 { grid-column: auto; } }
    .check-no { color: var(--text-muted); font-size: 0.88rem; }
  `]
})
export class SubscriptionPlansComponent implements OnInit, OnDestroy {
  sub = signal<MySubscriptionResponse | null>(null);

  constructor(
    public saas: SaasService,
    public auth: AuthService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  changing = false;
  togglingAutoCancel = false;
  renewing = false;

  editing = false;
  editingId: number | null = null;
  editingSubscribers = 0;
  saving = false;
  models: AIModelOptions | null = null;
  form: SubscriptionPlanInput = {};
  checkout: { kind: 'change_plan' | 'renew'; planCode?: string; planName: string; price: number } | null = null;
  billing = { name: '', tax_id: '', email: '' };
  pendingCheckout: { kind: 'change_plan' | 'renew'; planCode?: string; planName: string; price: number; requestKey: string;
                     billing: { name: string; tax_id: string; email: string } } | null = null;
  private onlineListener = () => this.autoResumePendingCheckout();

  ngOnInit(): void {
    this.loadPlans();
    this.loadData();
    this.handlePaymentReturn();
    this.loadPendingCheckout();
    window.addEventListener('online', this.onlineListener);
    setTimeout(() => this.autoResumePendingCheckout(), 1500);
    if (this.auth.isSuperAdmin()) {
      this.saas.getAiModels().subscribe({ next: m => this.models = m, error: () => this.models = null });
    }
  }

  loadPlans(): void {
    // El Superadmin ve también los planes no disponibles para poder reactivarlos.
    this.saas.getPlans(this.auth.isSuperAdmin()).subscribe({error: () => this.toast.error('No se pudieron cargar los planes')});
  }

  startCreate(): void {
    this.editing = true; this.editingId = null; this.editingSubscribers = 0;
    this.form = { code: '', name: '', description: '', price: 0, max_branches: 1, max_users: null, max_products: null,
      has_ai_reports: false, has_ai_shopper: true, has_ai_tryon: true, has_offline_sync: true,
      ai_text_model: null, ai_image_model: null, is_active: true };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  startEdit(plan: SubscriptionPlan): void {
    this.editing = true; this.editingId = plan.id; this.editingSubscribers = plan.subscribers_count || 0;
    this.form = { code: plan.code, name: plan.name, description: plan.description ?? '', price: plan.price,
      max_branches: plan.max_branches, max_users: plan.max_users ?? null, max_products: plan.max_products ?? null,
      has_ai_reports: plan.has_ai_reports, has_ai_shopper: plan.has_ai_shopper ?? true, has_ai_tryon: plan.has_ai_tryon ?? true,
      has_offline_sync: plan.has_offline_sync, ai_text_model: plan.ai_text_model ?? null,
      ai_image_model: plan.ai_image_model ?? null, is_active: plan.is_active };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void { this.editing = false; this.editingId = null; }

  savePlan(): void {
    if (this.saving) return;
    const limit = (v: unknown) => (v === '' || v === null || v === undefined) ? null : Number(v);
    const { code, ...rest } = this.form;
    const payload: SubscriptionPlanInput = { ...rest, description: (rest.description || '').trim() || null,
      price: Number(rest.price), max_branches: Number(rest.max_branches),
      max_users: limit(rest.max_users), max_products: limit(rest.max_products) };
    if (this.editingId && this.editingSubscribers &&
        !confirm(`Este plan tiene ${this.editingSubscribers} empresa(s) suscrita(s). Los cambios se aplicarán de inmediato. ¿Continuar?`)) return;
    this.saving = true;
    const request = this.editingId ? this.saas.updatePlan(this.editingId, payload) : this.saas.createPlan({ ...payload, code });
    request.subscribe({
      next: plan => {
        this.saving = false; this.editing = false; this.editingId = null;
        this.toast.success(`Plan "${plan.name}" guardado.`);
        this.loadPlans();
      },
      error: err => {
        this.saving = false;
        const detail = err.error?.detail;
        this.toast.error(typeof detail === 'string' ? detail : 'No se pudo guardar el plan. Revisa los campos.');
      }
    });
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

  /** Vuelta desde PayPal (?sub_payment=ID): el servidor confirma el pago y recién entonces aplica el plan. */
  private handlePaymentReturn(): void {
    const query = this.route.snapshot.queryParamMap;
    const id = Number(query.get('sub_payment'));
    if (!id) return;
    const clear = () => this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    if (query.get('cancelled')) { this.toast.error('Cancelaste el pago. Tu plan no cambió.'); clear(); return; }
    this.saas.verifySubscriptionPayment(id).subscribe({
      next: result => { this.reportCheckout(result); clear(); },
      error: err => { this.toast.error(err.error?.detail || 'No se pudo verificar el pago con PayPal. Reintenta en unos segundos.'); },
    });
  }

  /** Redirige a PayPal si falta pagar; si ya se aplicó (o el plan es gratis) informa y recarga. */
  private reportCheckout(result: SubscriptionCheckout): void {
    if (result.status === 'pending' && result.payment_url) {
      this.toast.success(`Redirigiendo a PayPal para pagar USD ${result.amount.toFixed(2)}…`);
      window.location.assign(result.payment_url);
      return;
    }
    if (result.status === 'pending') this.toast.error('PayPal aún no confirma el pago. Vuelve a intentarlo en unos segundos.');
    else if (result.status === 'applied') this.toast.success(result.kind === 'renew'
      ? '¡Pago confirmado! Suscripción renovada por 30 días.'
      : `¡Pago confirmado! Tu empresa ya está en el ${result.plan?.name || 'nuevo plan'}.`);
    else this.toast.error(result.error || 'El pago no pudo aplicarse. Contacta al administrador de la plataforma.');
    this.loadData();
  }

  ngOnDestroy(): void { window.removeEventListener('online', this.onlineListener); }

  isOffline(): boolean { return !navigator.onLine; }

  private get pendingKey() { return `fs_pending_plan_checkout_u${this.auth.currentUser()?.id}`; }

  private loadPendingCheckout() {
    try { this.pendingCheckout = JSON.parse(localStorage.getItem(this.pendingKey) || 'null'); } catch { this.pendingCheckout = null; }
  }

  private openCheckout(kind: 'change_plan' | 'renew', planName: string, price: number, planCode?: string) {
    const user = this.auth.currentUser();
    this.billing = { name: this.billing.name || this.sub()?.tenant?.name || user?.full_name || '',
                     tax_id: this.billing.tax_id || '', email: this.billing.email || user?.email || '' };
    this.checkout = { kind, planCode, planName, price };
  }

  closeCheckout() { if (!this.changing && !this.renewing) this.checkout = null; }

  /** Envía el formulario; sin conexión lo guarda para pagarlo al volver internet. */
  submitCheckout() {
    if (!this.checkout) return;
    const pending = { ...this.checkout, requestKey: `planform-${crypto.randomUUID()}`, billing: { ...this.billing } };
    if (this.isOffline()) {
      this.savePending(pending);
      this.checkout = null;
      this.toast.success('Sin conexión: el pago del plan quedó guardado. Al volver internet se abrirá PayPal para confirmarlo.');
      return;
    }
    this.checkout = null;
    this.sendCheckout(pending);
  }

  private savePending(pending: NonNullable<typeof this.pendingCheckout>) {
    this.pendingCheckout = pending;
    try { localStorage.setItem(this.pendingKey, JSON.stringify(pending)); } catch { /* sin almacenamiento */ }
  }

  private sendCheckout(pending: NonNullable<typeof this.pendingCheckout>) {
    this.changing = true;
    this.saas.startCheckout({ kind: pending.kind, plan_code: pending.planCode, request_key: pending.requestKey,
      billing: { name: pending.billing.name, tax_id: pending.billing.tax_id || null, email: pending.billing.email } }).subscribe({
      next: result => {
        this.changing = false;
        this.discardPendingCheckout(false);
        this.reportCheckout(result);
      },
      error: err => {
        this.changing = false;
        if (err?.status === 0) {  // se cortó la conexión justo al enviar: se conserva para reintentar
          this.savePending(pending);
          this.toast.error('Sin conexión: el pago quedó guardado y se reintentará al volver internet.');
          return;
        }
        this.toast.error(err.error?.detail || 'No se pudo iniciar el pago con PayPal.');
      }
    });
  }

  private autoResumePendingCheckout() {
    this.loadPendingCheckout();
    if (this.pendingCheckout && !this.isOffline() && !this.changing) {
      this.toast.success('Conexión restaurada: abriendo PayPal para el pago de plan guardado…');
      this.sendCheckout(this.pendingCheckout);
    }
  }

  resumePendingCheckout() { if (this.pendingCheckout) this.sendCheckout(this.pendingCheckout); }

  discardPendingCheckout(ask = true) {
    if (ask && !confirm('¿Descartar el pago de plan guardado? No se cobrará nada.')) return;
    this.pendingCheckout = null;
    try { localStorage.removeItem(this.pendingKey); } catch { /* sin almacenamiento */ }
  }

  renewSubscription(): void {
    if (this.renewing) return;
    const plan = this.sub()?.plan;
    this.openCheckout('renew', plan?.name || 'Plan actual', plan?.price ?? 0);
  }

  confirmPlanChange(targetPlanCode: string, planName: string): void {
    if (this.changing) return;
    const price = this.saas.plans().find(p => p.code === targetPlanCode)?.price ?? 0;
    this.openCheckout('change_plan', planName, price, targetPlanCode);
  }
}
