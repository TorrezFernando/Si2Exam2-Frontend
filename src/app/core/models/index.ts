// ─── Auth & RBAC Models ─────────────────────────────────────────────────────────
export interface LoginRequest {
  username: string; // FastAPI uses 'username' for OAuth2
  password: string;
}

export interface RegisterRequest {
  email: string;
  full_name?: string;
  phone?: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  role: string | null;
  tenant_id?: number;
  plan_code?: string;
}

export interface Permission {
  id: number;
  name: string;
  description?: string;
}

export interface Role {
  id: number;
  name: string;
  description?: string;
  is_predefined: boolean;
  permissions: Permission[];
}

export interface UserPermission {
  permission: Permission;
  is_granted: boolean;
}

export interface User {
  id: number;
  email: string;
  full_name?: string;
  phone?: string;
  role_id?: number;
  role?: Role;
  user_permissions: UserPermission[];
  branch_id?: number;
  tenant_id?: number;
  is_active: boolean;
  created_at: string;
}


export interface CreateUserByAdmin {
  email: string;
  full_name?: string;
  phone?: string;
  password: string;
  role_id: number;
  branch_id?: number;
}

export interface UpdateUser {
  full_name?: string;
  phone?: string;
  role_id?: number;
  branch_id?: number;
  is_active?: boolean;
}

export interface PasswordChange {
  current_password: string;
  new_password: string;
}

// ─── Audit Log Models ──────────────────────────────────────────────────────
export interface AuditLog {
  id: number;
  user_id?: number;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: any;
  created_at: string;
}


// ─── Branch Models ────────────────────────────────────────────────────────
export interface Branch {
  city?: string;
  id: number;
  name: string;
  address: string;
  phone?: string;
  is_active: boolean;
}

export interface CreateBranch {
  city?: string;
  name: string;
  address: string;
  phone?: string;
}

// ─── Product Models ───────────────────────────────────────────────────────
export interface Category {
  id: number;
  name: string;
  description?: string;
  image_url?: string;
}

export interface Product {
  supplier_id?: number;
  season_id?: number;
  collection_id?: number;
  id: number;
  name: string;
  description?: string;
  base_price: number;
  category_id?: number;
  season?: string;
  image_url?: string;
  garment_image_url?: string;   // Imagen para Virtual Try-On
  garment_type?: string;        // upper_body | lower_body | dresses | full_outfit
  has_tryon?: boolean;          // True si tiene imagen para IA
  category?: Category;
  variants?: ProductVariant[];
}

export interface ProductVariant {
  id?: number;
  product_id?: number;
  size: string;
  color: string;
  sku?: string;
  quantity?: number;
  price_override?: number;
  image_url?: string;
  inventories?: Inventory[];
}

export interface Inventory {
  id: number;
  branch_id: number;
  variant_id: number;
  stock: number;
  branch?: Branch;
}

// ─── Reservation Models ───────────────────────────────────────────────────
export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface Reservation {
  id: number;
  user_id: number;
  branch_id: number;
  status: ReservationStatus;
  created_at: string;
  updated_at?: string;
  notes?: string;
  pickup_date?: string;
  user?: User;
  branch?: Branch;
  items?: ReservationItem[];
}

export interface ReservationItem {
  id: number;
  reservation_id: number;
  variant_id: number;
  quantity: number;
  variant?: ProductVariant;
}

// ─── Order Models ─────────────────────────────────────────────────────────
export interface Order {
  id: number;
  user_id: number;
  branch_id?: number;
  order_type?: string;
  payment_method?: string;
  payment_status?: string;
  total_amount: number;
  is_paid: boolean;
  payment_provider?: string;
  payment_id?: string;
  created_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: number;
  order_id: number;
  variant_id: number;
  quantity: number;
  unit_price: number;
  variant?: {
    id: number;
    size: string;
    color: string;
    image_url?: string;
    product?: {
      id: number;
      name: string;
      image_url?: string;
    }
  };
}

// ─── Pagination ───────────────────────────────────────────────────────────
export interface PaginationParams {
  skip?: number;
  limit?: number;
}

// ─── API Error ────────────────────────────────────────────────────────────
export interface ApiError {
  detail: string | { msg: string; type: string }[];
}

// ─── SaaS Multitenant Models ─────────────────────────────────────────────
export interface SubscriptionPlan {
  id: number;
  name: string;
  code: string;
  max_branches: number;
  has_ai_reports: boolean;
  has_offline_sync: boolean;
  price: number;
  is_active: boolean;
  created_at?: string;
}

export interface Tenant {
  id: number;
  name: string;
  subdomain: string;
  exchange_window_days: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TenantDetail extends Tenant {
  active_plan?: SubscriptionPlan | null;
  subscription_status: string;
  branches_count: number;
  users_count: number;
  orders_count: number;
}

export interface TenantCreateRequest {
  name: string;
  subdomain: string;
  exchange_window_days?: number;
  is_active?: boolean;
  plan_code?: string;
  admin_email?: string;
  admin_password?: string;
  admin_name?: string;
}

export interface TenantUpdateRequest {
  name?: string;
  subdomain?: string;
  exchange_window_days?: number;
  is_active?: boolean;
}

export interface SubscriptionUsage {
  branches_count: number;
  branches_limit: number;
  users_count: number;
  products_count: number;
  orders_count: number;
}

export interface MySubscriptionResponse {
  is_superadmin: boolean;
  tenant?: Tenant | null;
  plan?: SubscriptionPlan | null;
  status: string;
  start_date?: string | null;
  usage?: SubscriptionUsage | null;
}

export interface SaaSStats {
  total_tenants: number;
  active_tenants: number;
  total_branches: number;
  total_users: number;
  total_orders: number;
  plans_distribution: { [key: string]: number };
  monthly_recurring_revenue: number;
}

