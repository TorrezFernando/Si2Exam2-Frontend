import { Injectable, signal, computed } from '@angular/core';
import { Product, ProductVariant } from '../models';

export interface CartItem {
  product: Product;
  variant?: ProductVariant; // Opcional, si hay variante seleccionada
  quantity: number;
  unit_price: number;
}

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private get cartKey(): string {
    try {
      const user = JSON.parse(localStorage.getItem('fs_user') || 'null');
      if (user?.tenant_id && user?.id) return `fashionstore_cart_t${user.tenant_id}_u${user.id}`;
    } catch { /* Invalid cached profile has no account cart. */ }
    return 'fashionstore_cart_guest';
  }
  
  // Usamos signal para reactividad en Angular 17+
  cartItems = signal<CartItem[]>(this.loadCart());
  
  totalItemsCount = computed(() => this.cartItems().reduce((acc, item) => acc + item.quantity, 0));

  constructor() {
    window.addEventListener('storage', event => {
      if (event.key === 'fs_user' || event.key === 'fs_access_token' || event.key === this.cartKey) {
        this.cartItems.set(this.loadCart());
      }
    });
  }

  /**
   * Carga el carrito del LocalStorage
   */
  private loadCart(): CartItem[] {
    try {
      const saved = JSON.parse(localStorage.getItem(this.cartKey) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch { return []; }
  }

  /**
   * Guarda el carrito en LocalStorage
   */
  private saveCart(items: CartItem[]) {
    localStorage.setItem(this.cartKey, JSON.stringify(items));
    this.cartItems.set(items);
  }

  /**
   * Añade un producto al carrito
   */
  addToCart(product: Product, variant?: ProductVariant, quantity: number = 1) {
    const current = this.cartItems();
    
    // Check if it already exists
    const existingIndex = current.findIndex(item => 
      item.product.id === product.id && 
      (variant ? item.variant?.id === variant.id : true)
    );

    if (existingIndex >= 0) {
      current[existingIndex].quantity += quantity;
    } else {
      current.push({
        product,
        variant,
        quantity,
        unit_price: variant?.effective_price ?? variant?.price_override ?? product.effective_price ?? product.base_price
      });
    }

    this.saveCart([...current]);
  }

  /**
   * Remueve un producto del carrito
   */
  removeFromCart(index: number) {
    const current = this.cartItems();
    current.splice(index, 1);
    this.saveCart([...current]);
  }

  /**
   * Actualiza la cantidad de un producto
   */
  updateQuantity(index: number, delta: number) {
    const current = this.cartItems();
    if (current[index]) {
      current[index].quantity += delta;
      if (current[index].quantity <= 0) {
        current.splice(index, 1);
      }
      this.saveCart([...current]);
    }
  }

  /**
   * Limpia todo el carrito
   */
  clearCart() {
    this.saveCart([]);
  }

  /**
   * Obtiene el total monetario del carrito
   */
  getTotal(): number {
    return this.cartItems().reduce((acc, item) => acc + (item.unit_price * item.quantity), 0);
  }
}
