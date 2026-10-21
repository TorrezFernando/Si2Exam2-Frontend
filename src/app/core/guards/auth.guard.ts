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

/** Guard factory: restringe por permisos específicos */
export function permissionGuard(...permissions: string[]): CanActivateFn {
  return () => {
    const auth   = inject(AuthService);
    const router = inject(Router);
    if (!auth.isLoggedIn()) { 
      router.navigate(['/auth/login']); 
      return false; 
    }
    
    // Superadmin has universal access
    if (auth.isSuperAdmin()) return true;
    
    // Check if the user has any of the required permissions
    const hasAccess = permissions.some(p => auth.hasPermission(p));
    
    if (hasAccess) return true;
    
    // Redirigir al dashboard del rol actual si no tiene permiso
    auth.redirectByRole(auth.userRoleName() || '');
    return false;
  };
}
