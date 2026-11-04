import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import { Product, ProductVariant, Branch } from '../../../core/models';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './products.component.html'
})
export class ProductsComponent implements OnInit {
  products: Product[] = [];
  branches: Branch[] = [];
  suppliers: any[] = [];
  seasons: any[] = [];
  collections: any[] = [];
  categories: any[] = [];
  
  showModal = false;
  isEditing = false;
  loading = false;
  editingId: number | null = null;
  
  productForm: FormGroup;

  constructor(
    private api: ApiService,
    private fb: FormBuilder,
    private toast: ToastService,
    public authService: AuthService
  ) {
    this.productForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      promotion_percent: [null, [Validators.min(0.01), Validators.max(100)]],
      promotion_start: [''], promotion_end: [''],
      weight_grams: [null, [Validators.min(0.001), Validators.max(1000000)]],
      fabric_type: ['', Validators.maxLength(100)],
      design: ['', Validators.maxLength(255)],
      base_price: [0, [Validators.required, Validators.min(0)]],
      season: [''],
      supplier_id: [null], season_id: [null], collection_id: [null], category_id: [null],
      garment_image_url: [''], garment_type: ['upper_body'],
      branch_id: [null],
      image_url: [''],
      variants: this.fb.array([this.createVariantGroup()])
    });
  }

  get variantsArray(): FormArray {
    return this.productForm.get('variants') as FormArray;
  }

  createVariantGroup(variant?: Partial<ProductVariant>): FormGroup {
    const userBranchId = this.getDefaultBranchId();

    const invArray = this.fb.array(
      (this.branches || []).map(b => {
        const existingInv = variant?.inventories?.find(i => i.branch_id === b.id);
        const defaultStock = existingInv ? existingInv.stock : 0;
        return this.fb.group({
          branch_id: [b.id],
          branch_name: [b.name],
          stock: [defaultStock, [Validators.required, Validators.min(0)]]
        });
      })
    );

    return this.fb.group({
      id: [variant?.id ?? null],
      size: [variant?.size ?? 'M'],
      color: [variant?.color ?? 'Único'],
      quantity: [variant?.quantity ?? 1, [Validators.required, Validators.min(0)]],
      sku: [variant?.sku ?? ''],
      inventories: invArray
    });
  }

  getInventoriesArray(variantControl: any): FormArray {
    return variantControl.get('inventories') as FormArray;
  }

  setVariants(variants?: ProductVariant[]): void {
    this.variantsArray.clear();
    if (variants && variants.length > 0) {
      variants.forEach(v => this.variantsArray.push(this.createVariantGroup(v)));
    } else {
      this.variantsArray.push(this.createVariantGroup());
    }
  }

  addVariant(): void {
    this.variantsArray.push(this.createVariantGroup());
  }

  removeVariant(index: number): void {
    if (this.variantsArray.length > 1) {
      this.variantsArray.removeAt(index);
    }
  }

  ngOnInit(): void {
    this.api.get<any[]>("/operations/masters/suppliers").subscribe(r => this.suppliers=r);
    this.api.get<any[]>("/operations/masters/seasons").subscribe(r => this.seasons=r);
    this.api.get<any[]>("/operations/masters/collections").subscribe(r => this.collections=r);
    this.api.getCategories().subscribe(r => this.categories=r);
    this.loadBranches();
    this.loadProducts();
  }

  loadProducts() {
    this.api.getProducts().subscribe({
      next: (res: Product[]) => this.products = res,
      error: (err: any) => this.toast.error('Error al cargar productos')
    });
  }

  loadBranches() {
    this.api.getBranches(true).subscribe({
      next: (res: Branch[]) => {
        this.branches = res;
        // Re-initialize variants if branches were loaded after component creation
        if (this.showModal && this.variantsArray.length > 0) {
          const currentVal = this.productForm.value;
          this.setVariants(this.isEditing ? this.products.find(p => p.id === this.editingId)?.variants : undefined);
        }
      },
      error: () => {}
    });
  }

  getDefaultBranchId(): number | null {
    const user = this.authService.currentUser();
    if (user?.branch_id) {
      return user.branch_id;
    }
    return null;
  }

  openCreateModal() {
    this.isEditing = false;
    this.editingId = null;
    const defaultBranch = this.getDefaultBranchId();
    this.productForm.reset({
      name: '',
      description: '',
      promotion_percent: null, promotion_start: '', promotion_end: '',
      weight_grams: null, fabric_type: '', design: '',
      base_price: 0,
      season: '',
      branch_id: defaultBranch,
      image_url: ''
    });
    if (!this.authService.isAdmin()) {
      this.productForm.get('branch_id')?.disable();
    } else {
      this.productForm.get('branch_id')?.enable();
    }
    this.setVariants();
    this.showModal = true;
  }

  openEditModal(product: Product) {
    this.isEditing = true;
    this.editingId = product.id;
    const defaultBranch = this.getDefaultBranchId();
    this.productForm.reset({
      name: product.name,
      description: product.description,
      promotion_percent: product.promotion_percent ?? null,
      promotion_start: this.localDate(product.promotion_start), promotion_end: this.localDate(product.promotion_end),
      weight_grams: product.weight_grams ?? null, fabric_type: product.fabric_type ?? '', design: product.design ?? '',
      base_price: product.base_price,
      season: product.season,
      supplier_id: product.supplier_id ?? null, season_id: product.season_id ?? null, collection_id: product.collection_id ?? null, category_id: product.category_id ?? null,
      garment_image_url: product.garment_image_url ?? "", garment_type: product.garment_type ?? "upper_body",
      branch_id: defaultBranch,
      image_url: product.image_url ?? ''
    });
    if (!this.authService.isAdmin()) {
      this.productForm.get('branch_id')?.disable();
    } else {
      this.productForm.get('branch_id')?.enable();
    }
    this.setVariants(product.variants);
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      this.productForm.patchValue({ image_url: result });
    };
    reader.readAsDataURL(file);
  }

  onSubmit() {
    if (this.productForm.invalid) {
      this.toast.error('Por favor completa todos los campos requeridos.');
      return;
    }
    this.loading = true;

    const rawForm = this.productForm.getRawValue();
    const rawVariants = this.variantsArray?.getRawValue() ?? [];
    const selectedBranchId = rawForm.branch_id ?? this.getDefaultBranchId();

    const variants = rawVariants.map((v: any) => {
      const inventories = (v.inventories || []).map((inv: any) => ({
        branch_id: inv.branch_id,
        stock: Number(inv.stock ?? 0)
      }));

      const totalQty = inventories.length
        ? inventories.reduce((sum: number, inv: any) => sum + inv.stock, 0)
        : Number(v.quantity ?? 0);

      return {
        id: v.id ?? null,
        size: (v.size || 'M').trim(),
        color: (v.color || 'Único').trim(),
        quantity: totalQty,
        branch_id: selectedBranchId,
        sku: (v.sku || '').trim(),
        inventories
      };
    });

    const hasPromotion = rawForm.promotion_percent !== null && rawForm.promotion_percent !== '';
    if (hasPromotion && (!rawForm.promotion_start || !rawForm.promotion_end || new Date(rawForm.promotion_start) >= new Date(rawForm.promotion_end))) {
      this.toast.error('Indica inicio y fin de promoción; el fin debe ser posterior.'); this.loading=false; return;
    }
    const data = {
      name: rawForm.name,
      description: rawForm.description,
      promotion_percent: hasPromotion ? Number(rawForm.promotion_percent) : null,
      promotion_start: hasPromotion ? new Date(rawForm.promotion_start).toISOString() : null,
      promotion_end: hasPromotion ? new Date(rawForm.promotion_end).toISOString() : null,
      weight_grams: rawForm.weight_grams === null || rawForm.weight_grams === '' ? null : Number(rawForm.weight_grams),
      fabric_type: rawForm.fabric_type?.trim() || null, design: rawForm.design?.trim() || null,
      base_price: Number(rawForm.base_price || 0),
      season: rawForm.season,
      supplier_id: rawForm.supplier_id, season_id: rawForm.season_id, collection_id: rawForm.collection_id, category_id: rawForm.category_id,
      garment_image_url: rawForm.garment_image_url, garment_type: rawForm.garment_type,
      branch_id: selectedBranchId,
      image_url: rawForm.image_url,
      variants
    };

    if (this.isEditing && this.editingId) {
      this.api.updateProduct(this.editingId, data).subscribe({
        next: (res: Product) => {
          this.toast.success('Producto actualizado exitosamente');
          this.loadProducts();
          this.closeModal();
          this.loading = false;
        },
        error: (err: any) => {
          console.error('Error updating product:', err);
          this.toast.error(err?.error?.detail || 'Error al actualizar producto');
          this.loading = false;
        }
      });
    } else {
      this.api.createProduct(data).subscribe({
        next: (res: Product) => {
          this.toast.success('Producto creado exitosamente');
          this.loadProducts();
          this.closeModal();
          this.loading = false;
        },
        error: (err: any) => {
          console.error('Error creating product:', err);
          this.toast.error(err?.error?.detail || 'Error al crear producto');
          this.loading = false;
        }
      });
    }
  }

  deleteProduct(id: number) {
    if (confirm('¿Estás seguro de eliminar este producto?')) {
      this.api.deleteProduct(id).subscribe({
        next: (res: Product) => {
          this.toast.success('Producto eliminado');
          this.loadProducts();
        },
        error: (err: any) => this.toast.error('Error al eliminar producto')
      });
    }
  }
  localDate(value?: string | null) {
    if (!value) return '';
    const date = new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : value + 'Z');
    return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  }

}


