import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  SubscriptionPlan,
  SubscriptionPlanInput,
  AIModelOptions,
  TenantDetail,
  TenantCreateRequest,
  TenantUpdateRequest,
  MySubscriptionResponse,
  SaaSStats,
} from '../models';

@Injectable({ providedIn: 'root' })
export class SaasService {
  private readonly baseUrl = `${environment.apiUrl}/saas`;

  // ─── Reactive Signals ─────────────────────────────────────────────────────
  readonly selectedTenantId = signal<number | null>(this.loadSelectedTenantFromStorage());
  readonly mySubscription   = signal<MySubscriptionResponse | null>(null);
  readonly plans            = signal<SubscriptionPlan[]>([]);
  readonly isLoading        = signal<boolean>(false);

  constructor(private http: HttpClient) {}

  // ─── Planes SaaS ──────────────────────────────────────────────────────────
  getPlans(includeInactive = false): Observable<SubscriptionPlan[]> {
    this.isLoading.set(true);
    const params = includeInactive ? { include_inactive: 'true' } : undefined;
    return this.http.get<SubscriptionPlan[]>(`${this.baseUrl}/plans`, { params }).pipe(
      tap({
        next: (res) => {
          this.plans.set(res);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      })
    );
  }

  // ─── Mi Suscripción y Consumo ─────────────────────────────────────────────
  // ─── Editor de planes (Superadmin) ─────────────────────────────────────────
  getAiModels(): Observable<AIModelOptions> {
    return this.http.get<AIModelOptions>(`${this.baseUrl}/plans/ai-models`);
  }

  createPlan(payload: SubscriptionPlanInput): Observable<SubscriptionPlan> {
    return this.http.post<SubscriptionPlan>(`${this.baseUrl}/plans`, payload);
  }

  updatePlan(planId: number, payload: SubscriptionPlanInput): Observable<SubscriptionPlan> {
    return this.http.patch<SubscriptionPlan>(`${this.baseUrl}/plans/${planId}`, payload);
  }

  getMySubscription(): Observable<MySubscriptionResponse> {
    this.isLoading.set(true);
    return this.http.get<MySubscriptionResponse>(`${this.baseUrl}/my-subscription`).pipe(
      tap({
        next: (res) => {
          this.mySubscription.set(res);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      })
    );
  }

  changeMyPlan(planCode: string): Observable<TenantDetail> {
    this.isLoading.set(true);
    return this.http.post<TenantDetail>(`${this.baseUrl}/my-subscription/change-plan`, { plan_code: planCode }).pipe(
      tap({
        next: () => {
          // Recargar suscripción activa
          this.getMySubscription().subscribe();
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      })
    );
  }

  setMyAutoCancel(cancelAtPeriodEnd: boolean): Observable<MySubscriptionResponse> {
    this.isLoading.set(true);
    return this.http.patch<MySubscriptionResponse>(
      `${this.baseUrl}/my-subscription/auto-cancel`,
      { cancel_at_period_end: cancelAtPeriodEnd }
    ).pipe(
      tap({
        next: (res) => {
          this.mySubscription.set(res);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      })
    );
  }

  renewMySubscription(): Observable<TenantDetail> {
    this.isLoading.set(true);
    return this.http.post<TenantDetail>(`${this.baseUrl}/my-subscription/renew`, {}).pipe(
      tap({
        next: () => {
          this.getMySubscription().subscribe();
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      })
    );
  }

  // ─── Gestión de Empresas (Superadmin) ─────────────────────────────────────
  getTenants(): Observable<TenantDetail[]> {
    this.isLoading.set(true);
    return this.http.get<TenantDetail[]>(`${this.baseUrl}/tenants`).pipe(
      tap({
        next: () => this.isLoading.set(false),
        error: () => this.isLoading.set(false),
      })
    );
  }

  getTenant(tenantId: number): Observable<TenantDetail> {
    return this.http.get<TenantDetail>(`${this.baseUrl}/tenants/${tenantId}`);
  }

  createTenant(payload: TenantCreateRequest): Observable<TenantDetail> {
    this.isLoading.set(true);
    return this.http.post<TenantDetail>(`${this.baseUrl}/tenants`, payload).pipe(
      tap({
        next: () => this.isLoading.set(false),
        error: () => this.isLoading.set(false),
      })
    );
  }

  updateTenant(tenantId: number, payload: TenantUpdateRequest): Observable<TenantDetail> {
    this.isLoading.set(true);
    return this.http.patch<TenantDetail>(`${this.baseUrl}/tenants/${tenantId}`, payload).pipe(
      tap({
        next: () => this.isLoading.set(false),
        error: () => this.isLoading.set(false),
      })
    );
  }

  changeTenantPlan(tenantId: number, planCode: string): Observable<TenantDetail> {
    this.isLoading.set(true);
    return this.http.post<TenantDetail>(`${this.baseUrl}/tenants/${tenantId}/change-plan`, { plan_code: planCode }).pipe(
      tap({
        next: () => this.isLoading.set(false),
        error: () => this.isLoading.set(false),
      })
    );
  }

  setTenantAutoCancel(tenantId: number, cancelAtPeriodEnd: boolean): Observable<TenantDetail> {
    this.isLoading.set(true);
    return this.http.patch<TenantDetail>(
      `${this.baseUrl}/tenants/${tenantId}/auto-cancel`,
      { cancel_at_period_end: cancelAtPeriodEnd }
    ).pipe(
      tap({
        next: () => this.isLoading.set(false),
        error: () => this.isLoading.set(false),
      })
    );
  }

  renewTenantSubscription(tenantId: number): Observable<TenantDetail> {
    this.isLoading.set(true);
    return this.http.post<TenantDetail>(`${this.baseUrl}/tenants/${tenantId}/renew`, {}).pipe(
      tap({
        next: () => this.isLoading.set(false),
        error: () => this.isLoading.set(false),
      })
    );
  }

  getStats(): Observable<SaaSStats> {
    return this.http.get<SaaSStats>(`${this.baseUrl}/stats`);
  }

  // ─── Superadmin Tenant Context Switcher ────────────────────────────────────
  setTenantContext(tenantId: number | null): void {
    this.selectedTenantId.set(tenantId);
    if (tenantId !== null) {
      localStorage.setItem('fs_selected_tenant_id', String(tenantId));
    } else {
      localStorage.removeItem('fs_selected_tenant_id');
    }
    // Refrescar suscripción y datos en contexto
    this.getMySubscription().subscribe();
  }

  private loadSelectedTenantFromStorage(): number | null {
    const raw = localStorage.getItem('fs_selected_tenant_id');
    return raw ? parseInt(raw, 10) : null;
  }
}
