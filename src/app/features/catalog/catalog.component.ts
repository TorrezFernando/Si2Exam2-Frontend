import { Component, OnInit } from '@angular/core';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { CartService } from '../../core/services/cart.service';
import { Product } from '../../core/models';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { NetworkService } from '../../core/services/network.service';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './catalog.component.html',
  styles: [`
    .search-container {
      max-width: 600px;
      margin: 0 auto 3rem;
    }
    .search-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 30px;
      padding: 4px 8px;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
      backdrop-filter: blur(10px);
    }
    .search-input-wrapper:focus-within {
      border-color: var(--color-primary);
      box-shadow: 0 4px 20px rgba(108, 99, 255, 0.25);
      transform: translateY(-2px);
    }
    .search-icon {
      width: 20px;
      height: 20px;
      color: var(--color-primary);
      margin-left: 12px;
      opacity: 0.8;
    }
    .search-input {
      flex: 1;
      background: transparent;
      border: none;
      padding: 14px 16px;
      color: var(--text-primary);
      font-size: 1.05rem;
      outline: none;
      width: 100%;
    }
    .search-input::placeholder {
      color: var(--text-muted);
    }
    .search-clear-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      padding: 8px;
      margin-right: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: all 0.2s;
    }
    .search-clear-btn:hover {
      background: var(--bg-hover);
      color: var(--color-primary);
    }
    .search-clear-btn svg {
      width: 16px;
      height: 16px;
    }
  `]
})
export class CatalogComponent implements OnInit {
  offlineBranches: {id: number; name: string}[] = [];
  offlineBranchId: number | null = null;
  savingOffline = false;
  storeName = '';
  selectedStore = '';
  stores: {name: string; slug: string}[] = [];
  private requestVersion = 0;
  products: Product[] = [];
  filteredProducts: Product[] = [];
  recommendedProducts: Product[] = [];
  loading = true;
  loadingRecommended = false;
  searchQuery = '';

  constructor(
    private api: ApiService,
    private toast: ToastService,
    public authService: AuthService,
    public cartService: CartService,
    private route: ActivatedRoute,
    public router: Router,
    private offline: OfflineSyncService,
    public network: NetworkService
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => this.loadStore(params.get('store') ?? ''));
    if (this.authService.currentUser()?.tenant_id) {
      this.api.getBranches().subscribe({next: branches => {
        this.offlineBranches = branches;
        this.offlineBranchId = branches[0]?.id ?? null;
      }, error: async () => {
        try { this.offlineBranches = await this.offline.getLocalBranches(); this.offlineBranchId = this.offlineBranches[0]?.id ?? null; } catch {}
      }});
    }
  }

  async downloadOffline() {
    if (!this.offlineBranchId || this.savingOffline) return;
    this.savingOffline = true;
    try {
      await this.offline.downloadCatalog(Number(this.offlineBranchId));
      this.toast.success('Catálogo guardado para usar sin conexión en esta cuenta y sucursal.');
    } catch (e: any) { this.toast.error(e?.error?.detail || e.message); }
    finally { this.savingOffline = false; }
  }

  private async loadOffline(version: number) {
    try {
      const products = await this.offline.getLocalProducts();
      if (version !== this.requestVersion) return;
      this.storeName = this.authService.currentUser()?.tenant_name ?? 'Mi tienda';
      this.products = this.filteredProducts = products as unknown as Product[];
      this.toast.info(products.length ? 'Catálogo local: confirma la disponibilidad al sincronizar.' : 'Descarga un catálogo antes de usarlo sin conexión.');
    } catch { if (version === this.requestVersion) this.toast.error('No hay catálogo local disponible para esta cuenta.'); }
    finally { if (version === this.requestVersion) this.loading = false; }
  }

  changeStore(slug: string): void {
    this.cartService.clearCart();
    this.router.navigate([], { relativeTo: this.route, queryParams: { store: slug || null }, queryParamsHandling: 'merge' });
  }

  loadStore(slug: string): void {
    const version = ++this.requestVersion;
    this.loading = true;
    this.products = this.filteredProducts = this.recommendedProducts = [];
    this.storeName = '';
    if (this.network.isOffline()) { void this.loadOffline(version); return; }
    this.api.get<{ selected: {name: string; slug: string} | null; stores: {name: string; slug: string}[] }>('/products/storefront', {params: slug ? {store: slug} : {}}).subscribe({
      next: data => {
        if (version !== this.requestVersion) return;
        this.stores = data.stores;
        this.storeName = data.selected?.name ?? '';
        this.selectedStore = data.selected?.slug ?? '';
        if (!data.selected) { this.loading = false; return; }
        this.loadProducts(version);
        if (this.authService.currentUser()?.tenant_id) this.loadRecommendedProducts();
      },
      error: () => { if (version === this.requestVersion) void this.loadOffline(version); }
    });
  }

  loadRecommendedProducts() {
    this.loadingRecommended = true;
    this.api.getRecommendedProducts(4).subscribe({
      next: (res: Product[]) => {
        this.recommendedProducts = res;
        this.loadingRecommended = false;
      },
      error: () => {
        this.loadingRecommended = false;
      }
    });
  }

  loadProducts(version = this.requestVersion) {
    this.loading = true;
    this.api.getProducts({store: this.selectedStore}).subscribe({
      next: (res: Product[]) => {
        if (version !== this.requestVersion) return;
        this.products = res;
        this.filteredProducts = res;
        this.loading = false;
      },
      error: (err: any) => {
        if (version === this.requestVersion) void this.loadOffline(version);
      }
    });
  }

  onSearch() {
    const q = this.searchQuery.toLowerCase().trim();
    this.filteredProducts = q
      ? this.products.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
        )
      : this.products;
  }

  clearSearch() {
    this.searchQuery = '';
    this.filteredProducts = this.products;
  }

  addToCart(product: Product) {
    if (!this.authService.isLoggedIn()) {
      this.toast.warning('Debes iniciar sesión para añadir productos al carrito.');
      this.router.navigate(['/auth/login']);
      return;
    }
    const variant = product.variants && product.variants.length > 0 ? product.variants[0] : undefined;
    this.cartService.addToCart(product, variant, 1);
    this.toast.success(`Se ha añadido al carrito`);
  }

  viewProduct(product: Product) {
    this.router.navigate(['/catalog/product', product.id], {queryParams: {store: this.selectedStore}});
  }

  goToReservations() {
    if (!this.authService.isLoggedIn()) {
      this.toast.warning('Debes iniciar sesión para ver tus reservas.');
      this.router.navigate(['/auth/login']);
      return;
    }
    this.router.navigate(['/catalog/reservations']);
  }

  formatImageUrl(url?: string | null): string | null {
    if (!url || !url.trim()) return null;
    const clean = url.trim();
    if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('data:')) {
      return clean;
    }
    if (clean.startsWith('/')) {
      const baseUrl = environment.apiUrl.replace('/api/v1', '');
      return `${baseUrl}${clean}`;
    }
    return clean;
  }

  getAvailableBranchesText(product: Product): string {
    if (!product.variants || product.variants.length === 0) {
      return 'Sin stock';
    }
    const branchNames = new Set<string>();
    product.variants.forEach(v => {
      if (v.inventories && v.inventories.length > 0) {
        v.inventories.forEach(inv => {
          if (inv.stock > 0) {
            branchNames.add(inv.branch?.name || `Sucursal ${inv.branch_id}`);
          }
        });
      }
    });

    if (branchNames.size === 0) {
      return 'Agotado en todas las sucursales';
    }
    return Array.from(branchNames).join(', ');
  }

  goToCashier() {
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/cashier']);
      return;
    }
    this.router.navigate(['/auth/login']);
  }
}
