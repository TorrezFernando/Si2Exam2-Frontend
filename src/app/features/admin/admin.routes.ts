import { Routes } from '@angular/router';
import { AdminLayoutComponent } from './layout/admin-layout.component';

export const adminRoutes: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      { path: "operations", loadComponent: () => import("./operations/operations.component").then(m => m.OperationsComponent) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'users',
        loadComponent: () => import('./users/users.component').then(m => m.UsersComponent)
      },
      {
        path: 'branches',
        loadComponent: () => import('./branches/branches.component').then(m => m.BranchesComponent)
      },
      {
        path: 'products',
        loadComponent: () => import('./products/products.component').then(m => m.ProductsComponent)
      },
      {
        path: 'roles',
        loadComponent: () => import('./roles/roles.component').then(m => m.RolesComponent)
      },
      {
        path: 'reports',
        loadComponent: () => import('./reports/reports.component').then(m => m.ReportsComponent)
      },
      {
        path: 'audit',
        loadComponent: () => import('./audit/audit.component').then(m => m.AuditComponent)
      },
      {
        path: 'reservations',
        loadComponent: () => import('./reservations/reservations.component').then(m => m.ReservationsComponent)
      },
      {
        path: 'plans',
        loadComponent: () => import('./plans/plans.component').then(m => m.SubscriptionPlansComponent)
      },
      {
        path: 'tenants',
        loadComponent: () => import('./tenants/tenants.component').then(m => m.TenantsManagementComponent)
      },
      {
        path: 'sync-inbox',
        loadComponent: () => import('./sync-inbox/sync-inbox.component').then(m => m.SyncInboxComponent)
      }
    ]
  }
];
