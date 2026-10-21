import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthResponse, LoginRequest, RegisterRequest, User
} from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'fs_access_token';
  private readonly USER_KEY  = 'fs_user';

  // ─── Reactive State (Angular Signals) ─────────────────────────────────────
  private _currentUser = signal<User | null>(this.loadUserFromStorage());
  private _isLoading   = signal(false);

  readonly currentUser  = this._currentUser.asReadonly();
  readonly isLoading    = this._isLoading.asReadonly();
  readonly isLoggedIn   = computed(() => !!this._currentUser() && !!this.getToken());
  
  // Computar permisos
  readonly userPermissions = computed(() => {
    const user = this._currentUser();
    if (!user) return new Set<string>();
    
    const perms = new Set<string>();
    
    // Add role permissions
    if (user.role?.permissions) {
      user.role.permissions.forEach(p => perms.add(p.name));
    }
    
    // Add/remove user specific permissions
    if (user.user_permissions) {
      user.user_permissions.forEach(up => {
        if (up.is_granted) perms.add(up.permission.name);
        else perms.delete(up.permission.name);
      });
    }
    return perms;
  });

  // Role helpers
  readonly userRoleName = computed(() => this._currentUser()?.role?.name ?? null);
  readonly isSuperAdmin = computed(() => this.userRoleName() === 'superadmin');
  readonly isAdmin      = computed(() => this.userRoleName() === 'admin' || this.isSuperAdmin());

  constructor(private http: HttpClient, private router: Router) {}

  // ─── CU-02: Login ─────────────────────────────────────────────────────────
  login(credentials: LoginRequest): Observable<AuthResponse> {
    this._isLoading.set(true);
    // FastAPI OAuth2 requires x-www-form-urlencoded
    const formData = new HttpParams()
      .set('username', credentials.username)
      .set('password', credentials.password);

    return this.http.post<AuthResponse>(
      `${environment.apiUrl}/auth/login`,
      formData.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    ).pipe(
      tap(res => {
        localStorage.setItem(this.TOKEN_KEY, res.access_token);
        this._isLoading.set(false);
        // Fetch full user profile after login
        this.fetchMe().subscribe();
      }),
      catchError(err => {
        this._isLoading.set(false);
        return throwError(() => err);
      })
    );
  }

  // ─── CU-01: Register ──────────────────────────────────────────────────────
  register(data: RegisterRequest): Observable<User> {
    this._isLoading.set(true);
    return this.http.post<User>(`${environment.apiUrl}/auth/register`, data).pipe(
      tap(() => this._isLoading.set(false)),
      catchError(err => {
        this._isLoading.set(false);
        return throwError(() => err);
      })
    );
  }

  // ─── Fetch current user profile ───────────────────────────────────────────
  fetchMe(): Observable<User> {
    return this.http.get<User>(`${environment.apiUrl}/auth/me`).pipe(
      tap(user => {
        this._currentUser.set(user);
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
        // Redirect based on role after first login
        this.redirectByRole(user.role?.name || '');
      })
    );
  }

  // ─── Redirect by Role ─────────────────────────────────────────────────────
  redirectByRole(roleName: string): void {
    if (roleName === 'admin' || roleName === 'superadmin') {
      this.router.navigate(['/admin/dashboard']);
    } else if (roleName === 'encargado') {
      this.router.navigate(['/admin/reservations']);
    } else if (roleName === 'cajero') {
      this.router.navigate(['/cashier']);
    } else {
      this.router.navigate(['/catalog']);
    }
  }

  // ─── Logout ───────────────────────────────────────────────────────────────
  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this._currentUser.set(null);
    this.router.navigate(['/auth/login']);
  }

  // ─── Helpers ────────────────────────────────────────────────────────
  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  hasPermission(permission: string): boolean {
    return this.userPermissions().has(permission);
  }

  private loadUserFromStorage(): User | null {
    try {
      const token = localStorage.getItem(this.TOKEN_KEY);
      if (!token) {
        localStorage.removeItem(this.USER_KEY);
        return null;
      }
      const raw = localStorage.getItem(this.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
      return null;
    }
  }
}
