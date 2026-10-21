import { Routes } from '@angular/router';
import { authGuard, publicGuard, permissionGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // ─── Redirect raíz ──────────────────────────────────────────────────
  { path: '', redirectTo: 'catalog', pathMatch: 'full' },

  // ─── Auth (Login / Register) ─────────────────────────────────────────
  {
    path: 'auth',
    canActivate: [publicGuard],
    loadChildren: () =>
      import('./features/auth/auth.routes').then(m => m.authRoutes)
  },

  // ─── Panel Admin ─────────────────────────────────────────────────────
  {
    path: 'admin',
    canActivate: [permissionGuard('users:read', 'catalog:write', 'branches:write', 'roles:manage', 'sales:read', 'reservations:read')],
    loadChildren: () =>
      import('./features/admin/admin.routes').then(m => m.adminRoutes)
  },

  // ─── Panel Cajero ─────────────────────────────────────────────────────
  {
    path: 'cashier',
    canActivate: [permissionGuard('sales:write')],
    loadChildren: () =>
      import('./features/cashier/cashier.routes').then(m => m.cashierRoutes)
  },

  // ─── Portal Cliente (Catálogo Público) ───────────────────────────────
  {
    path: 'catalog',
    loadChildren: () =>
      import('./features/catalog/catalog.routes').then(m => m.catalogRoutes)
  },

  // ─── Perfil del usuario con sus reservas ──────────────────────────────
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/catalog/my-reservations.component').then(m => m.MyReservationsComponent)
  },

  // ─── Carrito ───────────────────────────────────────────────────────────
  {
    path: 'cart',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/cart/cart.routes').then(m => m.cartRoutes)
  },

  { path: 'payment/:id', canActivate: [authGuard], loadComponent: () => import('./features/cart/payment.component').then(m => m.PaymentComponent) },

  {
    path: 'sync-inbox',
    canActivate: [authGuard],
    loadComponent: () => import('./features/admin/sync-inbox/sync-inbox.component').then(m => m.SyncInboxComponent)
  },

  // ─── Wildcard ─────────────────────────────────────────────────────────
  { path: '**', redirectTo: 'auth/login' }
];
