import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { offlineDb } from '../db/app-database';
import { NetworkService } from './network.service';
import {
  LocalProduct,
  LocalVariant,
  LocalSaleOperation,
  LocalReservationOperation,
  SyncQueueItem,
  SyncCatalogResponse,
  SyncBatchResponse,
  LocalCustomer,
  LocalBranch,
} from '../models';

@Injectable({
  providedIn: 'root',
})
export class OfflineSyncService {
  private readonly http = inject(HttpClient);
  private readonly network = inject(NetworkService);
  private readonly apiUrl = environment.apiUrl;

  readonly isSyncing = signal<boolean>(false);
  readonly pendingCount = signal<number>(0);
  readonly lastSyncTimestamp = signal<string | null>(null);

  constructor() {
    this.refreshPendingCount();

    // Sincronización automática al recuperar conectividad
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[PWA-OFFLINE] Conexión recuperada. Evaluando sincronización automática...');
        this.syncBatch();
      });
    }
  }

  // ─── 1. DESCARGA Y CACHEO DE CATÁLOGO OFFLINE ──────────────────────────────

  async downloadCatalog(branchId: number): Promise<SyncCatalogResponse> {
    try {
      const url = `${this.apiUrl}/sync/catalog?branch_id=${branchId}`;
      const response = await firstValueFrom(this.http.get<SyncCatalogResponse>(url));

      // Guardar productos, variantes y clientes en IndexedDB
      await offlineDb.transaction('rw', [offlineDb.products, offlineDb.variants, offlineDb.customers, offlineDb.branches], async () => {
        // Limpiar catálogo previo para la sucursal/tenant
        await offlineDb.products.clear();
        await offlineDb.variants.clear();
        await offlineDb.customers.clear();

        // Guardar sucursal activa
        await offlineDb.branches.put({
          id: response.branch_id,
          tenant_id: response.tenant_id,
          name: response.branch_name,
          address: 'Sucursal Sincronizada',
          is_active: true,
        });

        // Guardar productos y sus variantes
        for (const prod of response.products) {
          await offlineDb.products.put({
            id: prod.id,
            tenant_id: response.tenant_id,
            name: prod.name,
            description: prod.description,
            category_id: prod.category_id,
            category_name: prod.category_name,
            base_price: prod.base_price,
            image_url: prod.image_url,
            variants: prod.variants,
            updated_at: new Date().toISOString(),
          });

          for (const v of prod.variants) {
            await offlineDb.variants.put({
              id: v.id,
              product_id: prod.id,
              sku: v.sku,
              size: v.size,
              color: v.color,
              price: v.price,
              stock: v.stock,
              image_url: v.image_url,
            });
          }
        }

        // Guardar clientes
        for (const cust of response.customers) {
          await offlineDb.customers.put({
            id: cust.id,
            tenant_id: response.tenant_id,
            full_name: cust.full_name,
            email: cust.email,
            phone: cust.phone,
          });
        }
      });

      const now = new Date().toISOString();
      this.lastSyncTimestamp.set(now);
      localStorage.setItem('last_offline_catalog_sync', now);
      localStorage.setItem('exchange_window_days', String(response.exchange_window_days || 30));

      return response;
    } catch (error) {
      console.error('[PWA-OFFLINE] Error al descargar catálogo:', error);
      throw error;
    }
  }

  // ─── 2. LECTURA DE CATÁLOGO DESDE INDEXEDDB ───────────────────────────────

  async getLocalProducts(): Promise<LocalProduct[]> {
    return await offlineDb.products.toArray();
  }

  async getLocalVariant(variantId: number): Promise<LocalVariant | undefined> {
    return await offlineDb.variants.get(variantId);
  }

  async getLocalCustomers(): Promise<LocalCustomer[]> {
    return await offlineDb.customers.toArray();
  }

  // ─── 3. REGISTRO LOCAL DE VENTA OFFLINE ────────────────────────────────────

  async recordOfflineSale(sale: {
    branchId: number;
    userId?: number;
    customerName?: string;
    paymentMethod: string;
    totalAmount: number;
    items: { variant_id: number; quantity: number; unit_price: number; variant_name?: string; sku?: string }[];
  }): Promise<LocalSaleOperation> {
    const uuid = this.generateUuid();
    const now = new Date().toISOString();

    const localSale: LocalSaleOperation = {
      client_operation_uuid: uuid,
      branch_id: sale.branchId,
      user_id: sale.userId,
      customer_name: sale.customerName || 'Cliente Venta Rápida',
      payment_method: sale.paymentMethod,
      total_amount: sale.totalAmount,
      items: sale.items,
      created_at: now,
      sync_status: 'PENDIENTE',
    };

    const queueItem: SyncQueueItem = {
      client_operation_uuid: uuid,
      operation_type: 'sale',
      status: 'PENDIENTE',
      payload: {
        client_operation_uuid: uuid,
        user_id: sale.userId,
        payment_method: sale.paymentMethod,
        total_amount: sale.totalAmount,
        created_at: now,
        items: sale.items.map((i) => ({
          variant_id: i.variant_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
      },
      created_at: now,
      updated_at: now,
      attempts: 0,
    };

    // Descontar inventario preventivamente en la BD local
    await offlineDb.transaction('rw', [offlineDb.variants, offlineDb.local_sales, offlineDb.sync_queue], async () => {
      for (const item of sale.items) {
        const variant = await offlineDb.variants.get(item.variant_id);
        if (variant) {
          const newStock = Math.max(0, variant.stock - item.quantity);
          await offlineDb.variants.update(item.variant_id, { stock: newStock });
        }
      }

      await offlineDb.local_sales.put(localSale);
      await offlineDb.sync_queue.put(queueItem);
    });

    await this.refreshPendingCount();

    // Si hay conexión, intentar enviar en background
    if (this.network.isOnline()) {
      this.syncBatch(sale.branchId).catch((err) =>
        console.warn('[PWA-OFFLINE] Sincronización diferida por error de red:', err)
      );
    }

    return localSale;
  }

  // ─── 4. REGISTRO LOCAL DE RESERVA OFFLINE ──────────────────────────────────

  async recordOfflineReservation(reservation: {
    branchId: number;
    userId: number;
    customerName?: string;
    pickupDate?: string;
    notes?: string;
    items: { variant_id: number; quantity: number; unit_price?: number; variant_name?: string; sku?: string }[];
  }): Promise<LocalReservationOperation> {
    const uuid = this.generateUuid();
    const now = new Date().toISOString();

    const localReservation: LocalReservationOperation = {
      client_operation_uuid: uuid,
      branch_id: reservation.branchId,
      user_id: reservation.userId,
      customer_name: reservation.customerName,
      pickup_date: reservation.pickupDate,
      notes: reservation.notes,
      items: reservation.items,
      created_at: now,
      sync_status: 'PENDIENTE',
    };

    const queueItem: SyncQueueItem = {
      client_operation_uuid: uuid,
      operation_type: 'reservation',
      status: 'PENDIENTE',
      payload: {
        client_operation_uuid: uuid,
        user_id: reservation.userId,
        pickup_date: reservation.pickupDate,
        notes: reservation.notes,
        items: reservation.items.map((i) => ({
          variant_id: i.variant_id,
          quantity: i.quantity,
        })),
      },
      created_at: now,
      updated_at: now,
      attempts: 0,
    };

    // Retener inventario preventivamente en la BD local
    await offlineDb.transaction('rw', [offlineDb.variants, offlineDb.local_reservations, offlineDb.sync_queue], async () => {
      for (const item of reservation.items) {
        const variant = await offlineDb.variants.get(item.variant_id);
        if (variant) {
          const newStock = Math.max(0, variant.stock - item.quantity);
          await offlineDb.variants.update(item.variant_id, { stock: newStock });
        }
      }

      await offlineDb.local_reservations.put(localReservation);
      await offlineDb.sync_queue.put(queueItem);
    });

    await this.refreshPendingCount();

    if (this.network.isOnline()) {
      this.syncBatch(reservation.branchId).catch((err) =>
        console.warn('[PWA-OFFLINE] Sincronización diferida por error de red:', err)
      );
    }

    return localReservation;
  }

  // ─── 5. PROCESAMIENTO POR LOTE (SYNC BATCH) ───────────────────────────────

  async syncBatch(branchId?: number): Promise<SyncBatchResponse | null> {
    if (this.isSyncing() || !this.network.isOnline()) {
      return null;
    }

    const pendingQueue = await offlineDb.sync_queue
      .where('status')
      .anyOf(['PENDIENTE', 'RECHAZADA_CONFLICTO'])
      .toArray();

    if (pendingQueue.length === 0) {
      await this.refreshPendingCount();
      return null;
    }

    this.isSyncing.set(true);

    try {
      // Determinar branch_id
      let targetBranchId = branchId;
      if (!targetBranchId) {
        const branch = await offlineDb.branches.toCollection().first();
        targetBranchId = branch ? branch.id : 1;
      }

      const salesPayload = pendingQueue
        .filter((q) => q.operation_type === 'sale')
        .map((q) => q.payload);

      const resPayload = pendingQueue
        .filter((q) => q.operation_type === 'reservation')
        .map((q) => q.payload);

      // Marcar cola en estado ENVIANDO
      const now = new Date().toISOString();
      for (const item of pendingQueue) {
        if (item.id) {
          await offlineDb.sync_queue.update(item.id, {
            status: 'ENVIANDO',
            updated_at: now,
            attempts: (item.attempts || 0) + 1,
          });
        }
      }

      const requestBody = {
        branch_id: targetBranchId,
        sales: salesPayload,
        reservations: resPayload,
      };

      const response = await firstValueFrom(
        this.http.post<SyncBatchResponse>(`${this.apiUrl}/sync/operations`, requestBody)
      );

      // Procesar recibos del servidor (CONFIRMADA o RECHAZADA_CONFLICTO)
      await offlineDb.transaction(
        'rw',
        [offlineDb.local_sales, offlineDb.local_reservations, offlineDb.sync_queue, offlineDb.variants],
        async () => {
          for (const receipt of response.receipts) {
            const queueEntry = await offlineDb.sync_queue
              .where('client_operation_uuid')
              .equals(receipt.client_operation_uuid)
              .first();

            if (receipt.operation_type === 'sale') {
              const localSale = await offlineDb.local_sales.get(receipt.client_operation_uuid);
              if (localSale) {
                await offlineDb.local_sales.update(receipt.client_operation_uuid, {
                  sync_status: receipt.status,
                  server_id: receipt.server_id,
                  rejection_reason: receipt.rejection_reason,
                });

                // Si fue rechazada por conflicto, restaurar inventario local
                if (receipt.status === 'RECHAZADA_CONFLICTO') {
                  for (const it of localSale.items) {
                    const v = await offlineDb.variants.get(it.variant_id);
                    if (v) {
                      await offlineDb.variants.update(it.variant_id, {
                        stock: v.stock + it.quantity,
                      });
                    }
                  }
                }
              }
            } else if (receipt.operation_type === 'reservation') {
              const localRes = await offlineDb.local_reservations.get(receipt.client_operation_uuid);
              if (localRes) {
                await offlineDb.local_reservations.update(receipt.client_operation_uuid, {
                  sync_status: receipt.status,
                  server_id: receipt.server_id,
                  rejection_reason: receipt.rejection_reason,
                });

                if (receipt.status === 'RECHAZADA_CONFLICTO') {
                  for (const it of localRes.items) {
                    const v = await offlineDb.variants.get(it.variant_id);
                    if (v) {
                      await offlineDb.variants.update(it.variant_id, {
                        stock: v.stock + it.quantity,
                      });
                    }
                  }
                }
              }
            }

            if (queueEntry && queueEntry.id) {
              await offlineDb.sync_queue.update(queueEntry.id, {
                status: receipt.status,
                error_message: receipt.rejection_reason,
                updated_at: new Date().toISOString(),
              });
            }
          }
        }
      );

      return response;
    } catch (err: any) {
      console.error('[PWA-OFFLINE] Falló sincronización por lote:', err);
      // RNF03: PROHIBIDO borrar operaciones locales en caso de error
      for (const item of pendingQueue) {
        if (item.id) {
          await offlineDb.sync_queue.update(item.id, {
            status: 'PENDIENTE',
            error_message: err?.message || 'Error de comunicación con el servidor',
            updated_at: new Date().toISOString(),
          });
        }
      }
      throw err;
    } finally {
      this.isSyncing.set(false);
      await this.refreshPendingCount();
    }
  }

  // ─── 6. CONSULTAS Y HISTORIAL ─────────────────────────────────────────────

  async getLocalSales(): Promise<LocalSaleOperation[]> {
    return await offlineDb.local_sales.reverse().sortBy('created_at');
  }

  async getLocalReservations(): Promise<LocalReservationOperation[]> {
    return await offlineDb.local_reservations.reverse().sortBy('created_at');
  }

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    return await offlineDb.sync_queue.reverse().sortBy('created_at');
  }

  async refreshPendingCount(): Promise<number> {
    const count = await offlineDb.sync_queue
      .where('status')
      .anyOf(['PENDIENTE', 'RECHAZADA_CONFLICTO', 'ENVIANDO'])
      .count();
    this.pendingCount.set(count);
    return count;
  }

  private generateUuid(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
