import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { SaasService } from '../../../core/services/saas.service';
import { User, Branch } from '../../../core/models';

interface StatCard {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  trend?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="content-area">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Dashboard de Empresa</h1>
          <p class="text-secondary text-sm">Bienvenido, {{ auth.currentUser()?.full_name || 'Admin' }}</p>
        </div>
        <div class="header-actions">
          <span class="badge badge-success">● Sistema activo</span>
        </div>
      </div>

      <!-- Subscription Expiration Banner -->
      @if (saas.mySubscription(); as sub) {
        @if (!sub.is_superadmin) {
          <div class="sub-banner" [class.sub-cancelled]="sub.status !== 'active'">
            <div class="sub-banner-info">
              <div class="sub-banner-title">
                <span class="badge" [ngClass]="sub.status === 'active' ? 'badge-primary' : 'badge-danger'">
                  {{ sub.plan?.name || 'Plan Básico' }}
                </span>
                @if (sub.status === 'active') {
                  <span>
                    📅 Fin de suscripción:
                    <strong>{{ sub.end_date ? (sub.end_date | date:'dd/MM/yyyy HH:mm') : 'Ciclo mensual activo' }}</strong>
                  </span>
                  @if (sub.days_remaining !== null && sub.days_remaining !== undefined) {
                    <span class="badge" [ngClass]="sub.days_remaining <= 5 ? 'badge-warning' : 'badge-success'">
                      {{ sub.days_remaining }} día{{ sub.days_remaining === 1 ? '' : 's' }} restante{{ sub.days_remaining === 1 ? '' : 's' }}
                    </span>
                  }
                } @else {
                  <strong style="color: #ef4444;">
                    ⚠️ Suscripción cancelada automáticamente por fin de mes
                    @if (sub.end_date) { ({{ sub.end_date | date:'dd/MM/yyyy' }}) }
                  </strong>
                }
              </div>
              <div class="text-xs text-muted" style="margin-top: 4px;">
                Cancelación automática al acabar el mes:
                <strong>{{ sub.cancel_at_period_end !== false ? 'Activa' : 'Desactivada' }}</strong>
              </div>
            </div>
            @if (auth.userRoleName() === 'admin') {
              <a routerLink="/admin/plans" class="btn btn-sm btn-outline">
                Gestionar Suscripción →
              </a>
            }
          </div>
        }
      }

      <!-- Stat Cards -->
      <div class="stats-grid">
        @for (stat of stats(); track stat.label) {
          <div class="stat-card">
            <div class="stat-icon" [style.background]="stat.color">
              <span [innerHTML]="stat.icon"></span>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stat.value }}</div>
              <div class="stat-label">{{ stat.label }}</div>
              @if (stat.trend) {
                <div class="stat-trend">{{ stat.trend }}</div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Quick Actions -->
      <div class="section-title">Acciones rápidas</div>
      <div class="quick-actions">
        <a routerLink="/admin/users" class="action-card">
          <div class="action-icon primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
          </div>
          <div class="action-label">Crear Usuario</div>
          <div class="action-sub">Agregar cajero, encargado o cliente</div>
        </a>

        <a routerLink="/admin/products" class="action-card">
          <div class="action-icon accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <div class="action-label">Nuevo Producto</div>
          <div class="action-sub">Agregar prenda al catálogo</div>
        </a>

        <a routerLink="/admin/branches" class="action-card">
          <div class="action-icon success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div class="action-label">Ver Sucursales</div>
          <div class="action-sub">Gestionar tiendas</div>
        </a>

        <a routerLink="/admin/reservations" class="action-card">
          <div class="action-icon warning">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div class="action-label">Reservas Pendientes</div>
          <div class="action-sub">Revisar y confirmar</div>
        </a>
      </div>

      <!-- Recent Users -->
      <div class="section-header">
        <div class="section-title">Usuarios recientes</div>
        <a routerLink="/admin/users" class="btn btn-ghost btn-sm">Ver todos →</a>
      </div>

      @if (loading()) {
        <div class="loading-row">
          <div class="spinner"></div> Cargando usuarios...
        </div>
      } @else {
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Registrado</th>
              </tr>
            </thead>
            <tbody>
              @for (user of recentUsers(); track user.id) {
                <tr>
                  <td>
                    <div class="flex items-center gap-sm">
                      <div class="avatar avatar-sm">{{ initials(user) }}</div>
                      <div>
                        <div class="text-sm font-medium">{{ user.full_name || 'Sin nombre' }}</div>
                        <div class="text-xs text-muted">{{ user.email }}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="badge" [ngClass]="roleBadge(user.role?.name)">{{ user.role?.name }}</span>
                  </td>
                  <td>
                    <span class="badge" [ngClass]="user.is_active ? 'badge-success' : 'badge-danger'">
                      {{ user.is_active ? 'Activo' : 'Inactivo' }}
                    </span>
                  </td>
                  <td class="text-sm text-secondary">{{ user.created_at | date:'dd/MM/yy' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: var(--space-lg); padding-top: var(--space-xl);
    }
    .page-title { font-size: 1.75rem; font-weight: 800; margin-bottom: 4px; }

    .sub-banner {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-left: 4px solid var(--color-primary);
      border-radius: var(--radius-lg);
      padding: 14px 18px;
      margin-bottom: var(--space-xl);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      &.sub-cancelled {
        border-left-color: #ef4444;
        background: rgba(239, 68, 68, 0.06);
      }
    }
    .sub-banner-title {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      font-size: 0.9rem;
    }

    /* Stats */
    .stats-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-md);
      margin-bottom: var(--space-xl);
      @media (max-width: 1024px) { grid-template-columns: repeat(2, 1fr); }
    }
    .stat-card {
      background: var(--bg-card); border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg); padding: var(--space-lg);
      display: flex; align-items: flex-start; gap: var(--space-md);
      transition: all var(--transition-normal);
      &:hover { border-color: var(--border-default); transform: translateY(-2px); box-shadow: var(--shadow-md); }
    }
    .stat-icon {
      width: 48px; height: 48px; border-radius: var(--radius-md);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; opacity: 0.9;
    }
    .stat-value { font-size: 2rem; font-weight: 800; font-family: var(--font-display); line-height: 1; }
    .stat-label { font-size: 0.82rem; color: var(--text-secondary); margin-top: 4px; }
    .stat-trend { font-size: 0.75rem; color: var(--color-success); margin-top: 2px; }

    /* Quick actions */
    .section-title { font-family: var(--font-display); font-weight: 700; font-size: 1.05rem; margin-bottom: var(--space-md); color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.8rem; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin: var(--space-xl) 0 var(--space-md); }

    .quick-actions {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-md);
      margin-bottom: var(--space-xl);
      @media (max-width: 1024px) { grid-template-columns: repeat(2, 1fr); }
    }
    .action-card {
      background: var(--bg-card); border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg); padding: var(--space-lg);
      text-decoration: none; display: flex; flex-direction: column; gap: 8px;
      transition: all var(--transition-normal);
      &:hover { border-color: var(--border-default); transform: translateY(-2px); box-shadow: var(--shadow-md); }
    }
    .action-icon {
      width: 48px; height: 48px; border-radius: var(--radius-md);
      display: flex; align-items: center; justify-content: center; margin-bottom: 4px;
      &.primary { background: var(--color-primary-glow); color: var(--color-primary-light); }
      &.accent  { background: rgba(255,101,132,0.15); color: var(--color-accent); }
      &.success { background: rgba(45,212,191,0.15); color: var(--color-success); }
      &.warning { background: rgba(251,191,36,0.15); color: var(--color-warning); }
    }
    .action-label { font-weight: 600; font-size: 0.9rem; }
    .action-sub { font-size: 0.78rem; color: var(--text-muted); }

    .loading-row {
      display: flex; align-items: center; gap: 12px;
      padding: var(--space-xl); color: var(--text-secondary);
      background: var(--bg-card); border-radius: var(--radius-lg);
    }
  `]
})
export class DashboardComponent implements OnInit {
  loading = signal(true);
  recentUsers = signal<User[]>([]);
  stats = signal<StatCard[]>([]);

  constructor(public auth: AuthService, private api: ApiService, public saas: SaasService) {}

  ngOnInit(): void {
    this.saas.getMySubscription().subscribe({ error: () => {} });
    this.api.getUsers({ limit: 6 }).subscribe({
      next: (users) => {
        this.recentUsers.set(users);
        this.updateStats(users);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  updateStats(users: User[]): void {
    const admins     = users.filter(u => u.role?.name === 'admin').length;
    const clientes   = users.filter(u => u.role?.name === 'cliente').length;
    const empleados  = users.filter(u => ['cajero','encargado'].includes(u.role?.name || '')).length;
    const activos    = users.filter(u => u.is_active).length;

    this.stats.set([
      { label: 'Total Usuarios', value: users.length, icon: '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="22" height="22"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', color: 'linear-gradient(135deg, #6C63FF, #4B44CC)', trend: `${activos} activos` },
      { label: 'Administradores', value: admins, icon: '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="22" height="22"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>', color: 'linear-gradient(135deg, #FF6584, #CC4466)' },
      { label: 'Empleados', value: empleados, icon: '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="22" height="22"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>', color: 'linear-gradient(135deg, #2DD4BF, #1a9980)' },
      { label: 'Clientes', value: clientes, icon: '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="22" height="22"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>', color: 'linear-gradient(135deg, #FBBF24, #d97706)' },
    ]);
  }

  initials(user: User): string {
    return (user.full_name || user.email).slice(0, 2).toUpperCase();
  }

  roleBadge(role?: string): string {
    const map: Record<string, string> = {
      admin: 'badge-danger', encargado: 'badge-warning',
      cajero: 'badge-info', cliente: 'badge-primary'
    };
    return role ? (map[role] || 'badge-primary') : 'badge-primary';
  }
}
