import { Component, OnInit, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { CartService } from '../../core/services/cart.service';
import { AuthService } from '../../core/services/auth.service';
import { Product, ProductVariant, Inventory } from '../../core/models';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="content-area" style="max-width: 1200px; margin: 0 auto; padding-top: var(--space-xl);">
      <button class="btn btn-outline btn-sm mb-lg" (click)="goBack()">← Volver al catálogo</button>

      <div *ngIf="loading()" class="flex justify-center p-xl">
        <div class="spinner"></div>
      </div>

      <div *ngIf="!loading() && !product()" class="card card-glass text-center p-xl mt-lg">
        <h3 class="font-semibold text-xl mb-sm">Producto no encontrado</h3>
        <button class="btn btn-primary" (click)="goBack()">Ir a la tienda</button>
      </div>

      <div *ngIf="!loading() && product()" class="grid" style="grid-template-columns: 1fr 1fr; gap: var(--space-xl); align-items: start;">

        <!-- Galería de imágenes -->
        <div class="card card-glass" style="padding: 0; overflow: hidden;">
          <div style="background: var(--bg-hover); aspect-ratio: 4/5; position: relative;">
            <img *ngIf="displayImage()" [src]="displayImage()" [alt]="product()?.name" style="width: 100%; height: 100%; object-fit: cover;">
            <div *ngIf="!displayImage()" class="flex justify-center items-center h-full text-muted">
              <span>Sin imagen</span>
            </div>
          </div>
        </div>

        <!-- Detalles e interacciones -->
        <div class="flex-col gap-lg">
          <div>
            <div class="flex items-center gap-sm mb-xs">
              <span *ngIf="product()?.season" class="badge badge-primary">{{ product()?.season }}</span>
              <span class="text-secondary text-sm">{{ product()?.category?.name || 'Categoría general' }}</span>
            </div>
            <h1 style="font-size: 2.5rem; font-weight: 800; line-height: 1.2;">{{ product()?.name }}</h1>
            <div class="font-bold text-3xl text-primary mt-sm">\${{ (selectedVariant()?.price_override ?? product()?.base_price)?.toFixed(2) }}</div>
          </div>

          <div class="text-secondary" style="line-height: 1.6;">
            {{ product()?.description || 'Este producto no cuenta con descripción adicional.' }}
          </div>

          <!-- Vestidor Virtual IA -->
          <div class="p-md rounded border" style="background: rgba(108, 99, 255, 0.05); border-color: rgba(108, 99, 255, 0.2);">
            <div class="flex items-center justify-between">
              <div>
                <h4 class="font-bold text-primary flex items-center gap-xs">
                  ✨ Vestidor Virtual IA
                </h4>
                <p class="text-sm text-secondary mt-xs">
                  {{ tryOnState === 'idle' ? 'Sube una foto tuya y Gemini te mostrará con la prenda puesta.' : '' }}
                  {{ tryOnState === 'loading' ? 'Gemini está generando tu look... (~30-60 seg)' : '' }}
                  {{ tryOnState === 'done' ? '¡Listo! Así te verías con esta prenda.' : '' }}
                  {{ tryOnState === 'error' ? tryOnError : '' }}
                </p>
              </div>
              <button class="btn btn-sm btn-outline" style="border-color: var(--color-primary); color: var(--color-primary);"
                      (click)="tryOnInput.click()"
                      [disabled]="tryOnState === 'loading'">
                {{ tryOnState === 'loading' ? '⏳ Generando...' : '✨ Probar' }}
              </button>
            </div>
            <!-- Input oculto para foto -->
            <input #tryOnInput type="file" accept="image/*" capture="user" style="display:none" (change)="onPhotoSelected($event)">
            <!-- Imagen resultado -->
            <div *ngIf="tryOnResultUrl" class="mt-md">
              <img [src]="tryOnResultUrl" alt="Try-On resultado" style="width:100%; border-radius: 12px; max-height: 400px; object-fit: contain;">
              <div class="flex gap-sm mt-sm">
                <a [href]="tryOnResultUrl" target="_blank" class="btn btn-sm btn-outline" style="flex:1;">💾 Ver completo</a>
                <button class="btn btn-sm btn-outline" style="flex:1;" (click)="resetTryOn()">🔄 Intentar de nuevo</button>
              </div>
            </div>
          </div>

          <div class="border-t pt-md" *ngIf="variants().length > 0">
            <h3 class="font-semibold mb-sm">Variantes Disponibles</h3>
            <div class="grid grid-2 gap-sm">
              <button *ngFor="let variant of variants()"
                      class="btn w-full"
                      style="justify-content: flex-start; text-align: left;"
                      [ngClass]="selectedVariant()?.id === variant.id ? 'btn-primary' : 'btn-outline'"
                      (click)="selectVariant(variant)">
                <div class="flex-col items-start gap-xs">
                  <span>Talla: <strong>{{ variant.size }}</strong> | Color: {{ variant.color }}</span>
                </div>
              </button>
            </div>
          </div>

          <div *ngIf="selectedVariant() && inventory().length > 0" class="border-t pt-md">
            <h3 class="font-semibold mb-sm">Disponibilidad en Sucursales</h3>
            <div class="flex-col gap-xs">
              <div *ngFor="let inv of inventory()" class="flex justify-between items-center p-sm border rounded" style="background: var(--bg-card);">
                <span class="font-medium">{{ inv.branch?.name || 'Sucursal ' + inv.branch_id }}</span>
                <span class="badge" [ngClass]="inv.stock > 0 ? 'badge-success' : 'badge-danger'">
                  {{ inv.stock > 0 ? inv.stock + ' en stock' : 'Agotado' }}
                </span>
              </div>
            </div>
          </div>

          <div *ngIf="selectedVariant() && inventory().length === 0" class="border-t pt-md">
            <p class="text-secondary text-sm">Consultando inventario...</p>
          </div>

          <div class="pt-md mt-auto flex-col gap-sm">
            <!-- Selector de Cantidad -->
            <div class="flex items-center gap-md mb-sm">
              <span class="font-bold text-secondary">Cantidad:</span>
              <div class="flex items-center gap-sm">
                <button class="btn btn-sm btn-outline" (click)="updateQuantity(-1)">-</button>
                <span class="font-bold" style="min-width: 30px; text-align: center; font-size: 1.1rem;">{{ quantity() }}</span>
                <button class="btn btn-sm btn-outline" (click)="updateQuantity(1)">+</button>
              </div>
            </div>

            <!-- Botón Reservar -->
            <button class="btn btn-outline w-full" style="border-color: var(--color-accent); color: var(--color-accent);"
                    (click)="reserveProduct()"
                    [disabled]="selectedVariant() && totalStock() === 0">
              📅 Reservar ({{ quantity() }})
            </button>
            <!-- Botón Añadir al Carrito -->
            <button class="btn btn-accent w-full" style="padding: var(--space-md) 0; font-size: 1.1rem;"
                    (click)="addToCart()"
                    [disabled]="selectedVariant() && totalStock() === 0">
              🛒 Añadir al Carrito ({{ quantity() }})
            </button>
            <p *ngIf="selectedVariant() && totalStock() === 0" class="text-danger text-sm text-center">Esta variante está agotada en todas las sucursales.</p>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ProductDetailComponent implements OnInit {
  @ViewChild('tryOnInput') tryOnInputRef!: ElementRef;

  loading = signal(true);
  product = signal<Product | null>(null);

  variants = computed(() => this.product()?.variants || []);
  selectedVariant = signal<ProductVariant | null>(null);
  inventory = signal<Inventory[]>([]);
  totalStock = computed(() => this.inventory().reduce((acc, inv) => acc + inv.stock, 0));
  quantity = signal(1);

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

  displayImage = computed(() => {
    const vImg = this.formatImageUrl(this.selectedVariant()?.image_url);
    const pImg = this.formatImageUrl(this.product()?.image_url);

    if (vImg && !vImg.toLowerCase().endsWith('.svg')) {
      return vImg;
    }
    if (pImg) {
      return pImg;
    }
    return vImg || null;
  });

  // ── Try-On state ──────────────────────────────────────────────────────────
  tryOnState: 'idle' | 'loading' | 'done' | 'error' = 'idle';
  tryOnResultUrl: string | null = null;
  tryOnError = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    private toast: ToastService,
    private cartService: CartService,
    private authService: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.loadProduct(Number(idParam));
    } else {
      this.loading.set(false);
    }
  }

  loadProduct(id: number) {
    this.loading.set(true);
    this.api.getProductById(id, this.route.snapshot.queryParamMap.get('store') ?? undefined).subscribe({
      next: (prod) => {
        this.product.set(prod);
        if (prod.variants && prod.variants.length > 0) {
          this.selectVariant(prod.variants[0]);
        }
        this.loading.set(false);

        // Registrar interacción para mejorar recomendaciones
        if (this.authService.isLoggedIn()) {
          this.api.interactWithProduct(id).subscribe({
            next: () => console.log('Interacción registrada'),
            error: (e) => console.error('Error registrando interacción', e)
          });
        }
      },
      error: () => {
        this.toast.error('No se pudo cargar el producto.');
        this.loading.set(false);
      }
    });
  }

  selectVariant(variant: ProductVariant) {
    if (variant.id == null) {
      this.selectedVariant.set(variant);
      return;
    }
    this.selectedVariant.set(variant);
    this.quantity.set(1); // Reset quantity when variant changes
    this.loadInventory(variant.id);
  }

  loadInventory(variantId: number) {
    this.inventory.set([]);
    this.api.getStockByVariant(variantId).subscribe({
      next: (inv) => this.inventory.set(inv),
      error: () => console.error('Error loading inventory')
    });
  }

  addToCart() {
    const prod = this.product();
    if (!prod) return;
    if (this.variants().length > 0 && !this.selectedVariant()) {
      this.toast.warning('Por favor selecciona una talla/color.');
      return;
    }
    if (this.selectedVariant() && this.totalStock() === 0) {
      this.toast.error('Este producto está fuera de stock.');
      return;
    }
    if (this.selectedVariant() && this.quantity() > this.totalStock()) {
      this.toast.error(`Solo hay ${this.totalStock()} disponibles en stock.`);
      return;
    }
    this.cartService.addToCart(prod, this.selectedVariant() || undefined, this.quantity());
    this.toast.success(`Se ha añadido al carrito`);
    this.quantity.set(1); // Reset after adding
  }

  reserveProduct() {
    if (!this.authService.isLoggedIn()) {
      this.toast.warning('Debes iniciar sesión para reservar.');
      return;
    }
    const prod = this.product();
    const variant = this.selectedVariant();
    if (!prod) return;

    const variantId = variant?.id ?? prod.variants?.[0]?.id;
    if (!variantId) {
      this.toast.warning('Selecciona una variante para reservar.');
      return;
    }

    this.api.createReservation({
      branch_id: 1,
      items: [{ variant_id: variantId, quantity: this.quantity() }]
    }).subscribe({
      next: () => {
        this.toast.success('✅ Reserva creada exitosamente');
        this.quantity.set(1);
      },
      error: (e) => this.toast.error('Error al crear la reserva: ' + (e?.error?.detail || e.message))
    });
  }

  updateQuantity(delta: number) {
    const newVal = this.quantity() + delta;
    if (newVal >= 1) {
      if (this.selectedVariant() && newVal > this.totalStock()) {
        this.toast.warning(`Solo hay ${this.totalStock()} en stock`);
        this.quantity.set(this.totalStock());
      } else {
        this.quantity.set(newVal);
      }
    }
  }

  // ── Virtual Try-On ────────────────────────────────────────────────────────
  onPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;

    const prod = this.product();
    if (!prod) return;

    if (!this.authService.isLoggedIn()) {
      this.toast.warning('Debes iniciar sesión para usar el Try-On.');
      return;
    }

    const file = input.files[0];
    const formData = new FormData();
    formData.append('user_photo', file);
    formData.append('product_id', prod.id.toString());

    this.tryOnState = 'loading';
    this.tryOnResultUrl = null;
    this.tryOnError = '';

    const apiBase = environment.apiUrl.replace('/api/v1', '');
    this.http.post<{ result_url: string }>(`${environment.apiUrl}/ai/tryon`, formData).subscribe({
      next: (res) => {
        this.tryOnResultUrl = res.result_url.startsWith('/')
          ? `${apiBase}${res.result_url}`
          : res.result_url;
        this.tryOnState = 'done';
      },
      error: (e) => {
        this.tryOnState = 'error';
        this.tryOnError = e?.error?.detail || 'Error al generar el Try-On. Intenta de nuevo.';
      }
    });
  }

  resetTryOn() {
    this.tryOnState = 'idle';
    this.tryOnResultUrl = null;
    this.tryOnError = '';
  }

  goBack() {
    this.router.navigate(['/catalog'], {queryParams: {store: this.route.snapshot.queryParamMap.get('store')}});
  }
}
