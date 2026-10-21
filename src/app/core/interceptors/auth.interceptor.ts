import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * JWT Interceptor: inyecta el Bearer token en cada request HTTP
 * y maneja expiración automática (401 → logout).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();

  // Clonar el request con el header Authorization si hay token
  const headersConfig: Record<string, string> = {};
  if (token) {
    headersConfig['Authorization'] = `Bearer ${token}`;
  }
  const selectedTenant = localStorage.getItem('fs_selected_tenant_id');
  if (selectedTenant && auth.isSuperAdmin()) {
    headersConfig['X-Tenant-Id'] = selectedTenant;
  }

  const authReq = Object.keys(headersConfig).length > 0
    ? req.clone({ setHeaders: headersConfig })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // 401 Unauthorized → token expirado, hacer logout
      if (error.status === 401) {
        auth.logout();
      }
      return throwError(() => error);
    })
  );
};
