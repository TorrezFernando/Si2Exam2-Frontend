import { Routes } from '@angular/router';
import { AdminLayoutComponent } from './layout/admin-layout.component';
import { companyOnlyGuard, superAdminGuard } from '../../core/guards/auth.guard';

export const adminRoutes: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      {
        path: 'analytics',
        canActivate: [companyOnlyGuard],
        loadComponent: () => import('./analytics/analytics.component').then(m => m.AnalyticsComponent)
      },
      {
        path: 'operations',
        canActivate: [companyOnlyGuard],
        loadComponent: () => import('./operations/operations.component').then(m => m.OperationsComponent)
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        canActivate: [companyOnlyGuard],
        loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'users',
        canActivate: [companyOnlyGuard],
        loadComponent: () => import('./users/users.component').then(m => m.UsersComponent)
      },
      {
        path: 'branches',
        canActivate: [companyOnlyGuard],
        loadComponent: () => import('./branches/branches.component').then(m => m.BranchesComponent)
      },
      {
        path: 'products',
        canActivate: [companyOnlyGuard],
        loadComponent: () => import('./products/products.component').then(m => m.ProductsComponent)
      },
      {
        path: 'roles',
        loadComponent: () => import('./roles/roles.component').then(m => m.RolesComponent)
      },
      {
        path: 'reports',
        canActivate: [companyOnlyGuard],
        loadComponent: () => import('./reports/reports.component').then(m => m.ReportsComponent)
      },
      {
        path: 'audit',
        loadComponent: () => import('./audit/audit.component').then(m => m.AuditComponent)
      },
      {
        path: 'reservations',
        canActivate: [companyOnlyGuard],
        loadComponent: () => import('./reservations/reservations.component').then(m => m.ReservationsComponent)
      },
      {
        path: 'plans',
        loadComponent: () => import('./plans/plans.component').then(m => m.SubscriptionPlansComponent)
      },
      {
        path: 'tenants',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./tenants/tenants.component').then(m => m.TenantsManagementComponent)
      },
      {
        path: 'sync-inbox',
        canActivate: [companyOnlyGuard],
        loadComponent: () => import('./sync-inbox/sync-inbox.component').then(m => m.SyncInboxComponent)
      }
    ]
  }
];
