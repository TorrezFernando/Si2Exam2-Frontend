import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Guard: solo usuarios autenticados */
export const authGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) return true;
  router.navigate(['/auth/login']);
  return false;
};

/** Guard: solo usuarios NO autenticados (para login/register) */
export const publicGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  if (!auth.isLoggedIn()) return true;
  auth.redirectByRole(auth.userRoleName() || '');
  return false;
};

const SUPERADMIN_ALLOWED_PERMISSIONS = new Set(['saas:manage', 'roles:manage', 'audit:read']);

/** Guard: exclusivo para el SuperAdmin global de la plataforma SaaS */
export const superAdminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    router.navigate(['/auth/login']);
    return false;
  }
  if (auth.isSuperAdmin()) return true;
  auth.redirectByRole(auth.userRoleName() || '');
  return false;
};

/** Guard: exclusivo para usuarios operativos/clientes de una Empresa (bloquea SuperAdmin global) */
export const companyOnlyGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    router.navigate(['/auth/login']);
    return false;
  }
  if (auth.isSuperAdmin() || !auth.currentUser()?.tenant_id) {
    router.navigate([auth.isSuperAdmin() ? '/admin/tenants' : '/catalog']);
    return false;
  }
  return true;
};

/** Guard factory: restringe por permisos específicos */
export function permissionGuard(...permissions: string[]): CanActivateFn {
  return () => {
    const auth   = inject(AuthService);
    const router = inject(Router);
    if (!auth.isLoggedIn()) { 
      router.navigate(['/auth/login']); 
      return false; 
    }
    
    // SuperAdmin solo accede a módulos globales SaaS, nunca a módulos internos de empresa
    if (auth.isSuperAdmin()) {
      const allowedGlobal = permissions.some(p => SUPERADMIN_ALLOWED_PERMISSIONS.has(p));
      if (allowedGlobal) return true;
      router.navigate(['/admin/tenants']);
      return false;
    }
    
    // Check if the user has any of the required permissions
    const hasAccess = permissions.some(p => auth.hasPermission(p));
    
    if (hasAccess) return true;
    
    // Redirigir al dashboard del rol actual si no tiene permiso
    auth.redirectByRole(auth.userRoleName() || '');
    return false;
  };
}
