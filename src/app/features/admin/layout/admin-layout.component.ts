import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { SaasService } from '../../../core/services/saas.service';
import { ToastContainerComponent } from '../../../shared/components/toast-container/toast-container.component';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  permissions?: string[];
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, RouterLink, RouterLinkActive, FormsModule, ToastContainerComponent],
  template: `
    <app-toast-container />
    <div class="page-wrapper">

      <!-- ── Sidebar ───────────────────────────────────────────── -->
      <aside class="sidebar" [class.collapsed]="sidebarCollapsed()">
        <!-- Logo -->
        <div class="sidebar-logo">
          <div class="logo-mark">F</div>
          @if (!sidebarCollapsed()) {
            <span class="logo-name">FashionStore</span>
          }
          <button class="collapse-btn" (click)="toggleSidebar()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline [attr.points]="sidebarCollapsed() ? '9 18 15 12 9 6' : '15 18 9 12 15 6'"/>
            </svg>
          </button>
        </div>

        <!-- User Card -->
        @if (!sidebarCollapsed()) {
          <div class="sidebar-user">
            <div class="avatar avatar-md" [style.background]="auth.isSuperAdmin() ? 'linear-gradient(135deg, #f59e0b, #ec4899)' : ''">
              {{ auth.isSuperAdmin() ? '👑' : initials() }}
            </div>
            <div class="user-info">
              <div class="user-name">{{ auth.currentUser()?.full_name || 'Usuario' }}</div>
              <div class="badge" [ngClass]="auth.isSuperAdmin() ? 'badge-warning' : 'badge-primary'">
                {{ auth.isSuperAdmin() ? '👑 Superadmin' : auth.userRoleName() }}
              </div>
            </div>
          </div>
        }

        <!-- Navigation -->
        <nav class="sidebar-nav">
          <ng-container *ngFor="let item of navItems">
            <a *ngIf="canShowItem(item)"
              [routerLink]="item.route"
              routerLinkActive="active"
              class="nav-item"
              [title]="sidebarCollapsed() ? item.label : ''"
            >
              <span class="nav-icon" [innerHTML]="item.icon"></span>
              @if (!sidebarCollapsed()) {
                <span class="nav-label">{{ item.label }}</span>
              }
            </a>
          </ng-container>
        </nav>

        <div class="sidebar-actions">
          <button class="sidebar-link" [routerLink]="['/profile']">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M20 21a8 8 0 0 0-16 0"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            @if (!sidebarCollapsed()) { <span>Mi perfil</span> }
          </button>
          <button class="sidebar-logout" (click)="auth.logout()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            @if (!sidebarCollapsed()) { <span>Cerrar sesión</span> }
          </button>
        </div>
      </aside>

      <!-- ── Main Content ────────────────────────────────────────── -->
      <main class="main-content" [class.sidebar-collapsed]="sidebarCollapsed()">
        <router-outlet />
      </main>

    </div>
  `,
  styles: [`
    .page-wrapper { display: flex; min-height: 100vh; }

    /* ── Sidebar ── */
    .sidebar {
      width: var(--sidebar-width);
      background: var(--bg-surface);
      border-right: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0; left: 0;
      height: 100vh;
      z-index: 50;
      transition: width var(--transition-normal);
      overflow: hidden;

      &.collapsed {
        width: 68px;
        .sidebar-logo { justify-content: center; }
        .sidebar-logout { justify-content: center; }
      }
    }

    .sidebar-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px 16px;
      border-bottom: 1px solid var(--border-subtle);
      position: relative;
    }

    .logo-mark {
      width: 36px; height: 36px;
      background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
      border-radius: var(--radius-md);
      display: flex; align-items: center; justify-content: center;
      font-family: var(--font-display); font-weight: 800; font-size: 1.1rem; color: white;
      flex-shrink: 0;
    }

    .logo-name {
      font-family: var(--font-display); font-weight: 700; font-size: 1.05rem;
      white-space: nowrap;
    }

    .collapse-btn {
      margin-left: auto;
      padding: 6px;
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      transition: all var(--transition-fast);
      flex-shrink: 0;
      &:hover { background: var(--bg-elevated); color: var(--text-primary); }
    }

    .sidebar-user {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .user-info {
      display: flex; flex-direction: column; gap: 4px;
      .user-name { font-size: 0.85rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    }

    .sidebar-nav {
      flex: 1;
      padding: 12px 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow-y: auto;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 10px;
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      transition: all var(--transition-fast);
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;

      &:hover {
        background: var(--bg-elevated);
        color: var(--text-primary);
      }

      &.active {
        background: var(--color-primary-glow);
        color: var(--color-primary-light);
        border-left: 3px solid var(--color-primary);
      }
    }

    .nav-icon {
      width: 20px; height: 20px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    .nav-label { font-size: 0.88rem; font-weight: 500; }

    .sidebar-actions {
      border-top: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
    }

    .sidebar-link,
    .sidebar-logout {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 18px;
      color: var(--text-muted);
      font-size: 0.88rem;
      transition: all var(--transition-fast);
      &:hover { color: var(--color-primary); background: rgba(108,99,255,0.08); }
    }

    .sidebar-logout:hover { color: var(--color-danger); background: rgba(248,113,113,0.08); }

    /* ── Main ── */
    .main-content {
      flex: 1;
      margin-left: var(--sidebar-width);
      transition: margin-left var(--transition-normal);
      min-height: 100vh;
      background: var(--bg-base);

      &.sidebar-collapsed { margin-left: 68px; }
    }
  `]
})
export class AdminLayoutComponent {
  sidebarCollapsed = signal(false);

  navItems: NavItem[] = [
    {label: "Gestión comercial", icon: "📦", route: "/admin/operations", permissions: ["catalog:write", "inventory:write", "inventory:read"]},
    {
      label: 'Dashboard',
      route: '/admin/dashboard',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>`,
    },
    {
      label: 'Usuarios',
      route: '/admin/users',
      permissions: ['users:read'],
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>`
    },
    {
      label: 'Roles',
      route: '/admin/roles',
      permissions: ['roles:manage'],
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>`
    },
    {
      label: 'Sucursales',
      route: '/admin/branches',
      permissions: ['branches:read'],
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>`
    },
    {
      label: 'Productos',
      route: '/admin/products',
      permissions: ['catalog:read'],
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 0 1-8 0"/>
      </svg>`
    },
    {
      label: 'Reservas',
      route: '/admin/reservations',
      permissions: ['reservations:read'],
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>`
    },
    {
      label: 'Reportes',
      route: '/admin/reports',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
        <path d="M22 12A10 10 0 0 0 12 2v10z"/>
      </svg>`
    },
    {
      label: 'Bitácora',
      route: '/admin/audit',
      permissions: ['audit:read'],
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>`
    },
    {
      label: 'Planes & Suscripción',
      route: '/admin/plans',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>`
    },
    {
      label: 'Empresas SaaS',
      route: '/admin/tenants',
      permissions: ['saas:manage'],
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1"/>
      </svg>`
    },
    {
      label: 'Sync Offline',
      route: '/admin/sync-inbox',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>`
    }
  ];

  constructor(public auth: AuthService, public saas: SaasService) {}

  canShowItem(item: NavItem): boolean {
    if (this.auth.isSuperAdmin()) {
      return true;
    }
    if (item.route === '/admin/tenants') {
      return false; // Solo accesible para superadmin
    }
    if (item.route === '/admin/plans') {
      // Visible para administradores de empresas
      const role = this.auth.userRoleName()?.toLowerCase() || '';
      return role === 'admin' || role === 'superadmin';
    }
    if (item.route === '/admin/reports') {
      const role = this.auth.userRoleName()?.toLowerCase() || '';
      if (role.includes('cajero')) return false;
      return true;
    }
    if (!item.permissions || item.permissions.length === 0) return true;
    return item.permissions.some(p => this.auth.hasPermission(p));
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  initials(): string {
    const name = this.auth.currentUser()?.full_name || this.auth.currentUser()?.email || 'U';
    return name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  }
}
