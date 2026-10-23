import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  User, CreateUserByAdmin, UpdateUser,
  Branch, CreateBranch,
  Product, Category, ProductVariant, Inventory,
  Reservation, Order, PaginationParams
} from '../models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ─── GENERIC METHODS ──────────────────────────────────────────────────────
  get<T = any>(endpoint: string, options?: { params?: any; headers?: any }): Observable<T> {
    return this.http.get<T>(`${this.base}${endpoint}`, options);
  }
  
  post<T = any>(endpoint: string, data: any, options?: { params?: any; headers?: any }): Observable<T> {
    return this.http.post<T>(`${this.base}${endpoint}`, data, options);
  }
  
  patch<T = any>(endpoint: string, data: any, options?: { params?: any; headers?: any }): Observable<T> {
    return this.http.patch<T>(`${this.base}${endpoint}`, data, options);
  }
  
  delete<T = any>(endpoint: string, options?: { params?: any; headers?: any }): Observable<T> {
    return this.http.delete<T>(`${this.base}${endpoint}`, options);
  }

  // ─── USERS (CU-03) ────────────────────────────────────────────────────────

  /** Lista usuarios con filtros opcionales (Admin) */
  getUsers(params?: {
    role?: string;
    branch_id?: number;
    is_active?: boolean;
    skip?: number;
    limit?: number;
  }): Observable<User[]> {
    let p = new HttpParams();
    if (params?.role)      p = p.set('role', params.role);
    if (params?.branch_id) p = p.set('branch_id', params.branch_id);
    if (params?.is_active !== undefined) p = p.set('is_active', params.is_active);
    if (params?.skip)      p = p.set('skip', params.skip);
    if (params?.limit)     p = p.set('limit', params.limit ?? 50);
    return this.http.get<User[]>(`${this.base}/users`, { params: p });
  }

  /** Crea usuario con rol específico (Admin) */
  createUser(data: CreateUserByAdmin): Observable<User> {
    return this.http.post<User>(`${this.base}/users`, data);
  }

  /** Obtiene usuario por ID (Admin) */
  getUserById(id: number): Observable<User> {
    return this.http.get<User>(`${this.base}/users/${id}`);
  }

  /** Actualiza usuario parcialmente (Admin) */
  updateUser(id: number, data: UpdateUser): Observable<User> {
    return this.http.patch<User>(`${this.base}/users/${id}`, data);
  }

  /** Cambia solo el rol de un usuario (Admin) */
  changeUserRole(id: number, newRole: string, branchId?: number): Observable<User> {
    let p = new HttpParams().set('new_role', newRole);
    if (branchId) p = p.set('branch_id', branchId);
    return this.http.patch<User>(`${this.base}/users/${id}/role`, null, { params: p });
  }

  /** Desactiva un usuario (soft delete) (Admin) */
  deactivateUser(id: number): Observable<User> {
    return this.http.delete<User>(`${this.base}/users/${id}`);
  }

  /** Reactiva un usuario (Admin) */
  activateUser(id: number): Observable<User> {
    return this.http.post<User>(`${this.base}/users/${id}/activate`, null);
  }

  // ─── BRANCHES (CU-05) ─────────────────────────────────────────────────────

  getBranches(activeOnly = true): Observable<Branch[]> {
    const params = new HttpParams().set('active_only', activeOnly);
    return this.http.get<Branch[]>(`${this.base}/branches`, { params });
  }

  getBranchById(id: number): Observable<Branch> {
    return this.http.get<Branch>(`${this.base}/branches/${id}`);
  }

  createBranch(data: CreateBranch): Observable<Branch> {
    return this.http.post<Branch>(`${this.base}/branches`, data);
  }

  updateBranch(id: number, data: Partial<CreateBranch>): Observable<Branch> {
    return this.http.patch<Branch>(`${this.base}/branches/${id}`, data);
  }

  deactivateBranch(id: number): Observable<Branch> {
    return this.http.delete<Branch>(`${this.base}/branches/${id}`);
  }

  // ─── PRODUCTS (CU-04) ─────────────────────────────────────────────────────

  getProducts(params?: {
    store?: string;
    category_id?: number;
    season?: string;
    skip?: number;
    limit?: number;
  }): Observable<Product[]> {
    let p = new HttpParams();
    if (params?.store) p = p.set('store', params.store);
    if (params?.category_id) p = p.set('category_id', params.category_id);
    if (params?.season)      p = p.set('season', params.season);
    if (params?.skip)        p = p.set('skip', params.skip);
    p = p.set('limit', params?.limit ?? 50);
    return this.http.get<Product[]>(`${this.base}/products`, { params: p });
  }

  getProductById(id: number, store?: string): Observable<Product> {
    return this.http.get<Product>(`${this.base}/products/${id}`, { params: store ? {store} : {} });
  }

  createProduct(data: Partial<Product>): Observable<Product> {
    return this.http.post<Product>(`${this.base}/products`, data);
  }

  updateProduct(id: number, data: Partial<Product>): Observable<Product> {
    return this.http.patch<Product>(`${this.base}/products/${id}`, data);
  }

  deleteProduct(id: number): Observable<Product> {
    return this.http.delete<Product>(`${this.base}/products/${id}`);
  }

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.base}/products/categories`);
  }

  // ─── RECOMMENDATIONS (Fase 3) ─────────────────────────────────────────────

  getRecommendedProducts(limit: number = 10): Observable<Product[]> {
    return this.http.get<Product[]>(`${this.base}/products/recommended`, { params: { limit } });
  }

  interactWithProduct(productId: number): Observable<any> {
    return this.http.post(`${this.base}/products/${productId}/interact`, {});
  }

  // ─── AI CHAT (Fase 3) ─────────────────────────────────────────────────────

  chatWithAI(messages: { role: string; content: string }[]): Observable<{ response: string }> {
    return this.http.post<{ response: string }>(`${this.base}/ai/chat`, { messages });
  }

  // ─── INVENTORY (CU-06, CU-07) ─────────────────────────────────────────────

  /** Consultar stock de una variante en todas las sucursales (CU-06) */
  getStockByVariant(variantId: number): Observable<Inventory[]> {
    return this.http.get<Inventory[]>(`${this.base}/inventory/variant/${variantId}`);
  }

  /** Consultar stock de una sucursal (CU-06) */
  getStockByBranch(branchId: number): Observable<Inventory[]> {
    return this.http.get<Inventory[]>(`${this.base}/inventory/branch/${branchId}`);
  }

  // ─── RESERVATIONS (CU-09) ─────────────────────────────────────────────────

  getReservations(params?: { branch_id?: number; status?: string }): Observable<Reservation[]> {
    let p = new HttpParams();
    if (params?.branch_id) p = p.set('branch_id', params.branch_id);
    if (params?.status)    p = p.set('status', params.status);
    return this.http.get<Reservation[]>(`${this.base}/reservations`, { params: p });
  }

  createReservation(data: {
    branch_id: number;
    items: { variant_id: number; quantity: number }[];
    pickup_date?: string;
    notes?: string;
  }): Observable<Reservation> {
    return this.http.post<Reservation>(`${this.base}/reservations`, data);
  }

  updateReservation(id: number, data: Partial<Reservation>): Observable<Reservation> {
    return this.http.patch<Reservation>(`${this.base}/reservations/${id}`, data);
  }

  updateReservationStatus(id: number, status: string): Observable<Reservation> {
    return this.http.patch<Reservation>(`${this.base}/reservations/${id}/status`, { status });
  }

  cancelReservation(id: number): Observable<Reservation> {
    return this.http.patch<Reservation>(`${this.base}/reservations/${id}/cancel`, {});
  }

  // ─── ORDERS (CU-10, CU-11) ────────────────────────────────────────────────

  getOrders(params?: { skip?: number; limit?: number }): Observable<Order[]> {
    let p = new HttpParams();
    if (params?.skip)  p = p.set('skip', params.skip);
    if (params?.limit) p = p.set('limit', params.limit);
    return this.http.get<Order[]>(`${this.base}/orders`, { params: p });
  }

  createOrder(data: {
    branch_id?: number;
    items: { variant_id: number; quantity: number; unit_price?: number }[];
    order_type?: string;
    payment_method?: string;
    reservation_id?: number;
    request_key?: string;
  }): Observable<Order> {
    return this.http.post<Order>(`${this.base}/orders`, data);
  }
}
