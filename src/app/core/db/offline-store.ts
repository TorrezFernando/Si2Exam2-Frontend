import { AppDatabase } from './app-database';
import type { LocalSaleOperation, LocalReservationOperation, SyncBatchResponse, SyncCatalogResponse, SyncQueueItem } from '../models';

type Operation = LocalSaleOperation | LocalReservationOperation;
const pendingStates = ['PENDIENTE', 'ENVIANDO'];
export class OfflineStore {
  constructor(readonly db: AppDatabase, readonly tenantId: number, readonly ownerId: number) {}

  async pending() { return this.db.sync_queue.where('status').anyOf(pendingStates).count(); }

  async saveCatalog(catalog: SyncCatalogResponse, assertSession = () => {}) {
    if (catalog.tenant_id !== this.tenantId || !Number.isSafeInteger(catalog.branch_id) || catalog.branch_id < 1) {
      throw new Error('El catálogo no pertenece a esta sesión.');
    }
    return this.db.transaction('rw', this.db.tables, async () => {
      assertSession();
      if (await this.pending()) throw new Error('Sincroniza las operaciones pendientes antes de actualizar el catálogo.');
      await this.db.products.clear(); await this.db.variants.clear();
      await this.db.customers.clear(); await this.db.branches.clear();
      await this.db.branches.put({id: catalog.branch_id, tenant_id: this.tenantId,
        name: catalog.branch_name, address: '', is_active: true});
      for (const p of catalog.products) {
        await this.db.products.put({...p, tenant_id: this.tenantId});
        for (const v of p.variants) {
          if (!Number.isSafeInteger(v.stock) || v.stock < 0 || !Number.isFinite(v.price) || v.price < 0) {
            throw new Error('Catálogo con stock o precio inválido.');
          }
          await this.db.variants.put({...v, product_id: p.id});
        }
      }
      for (const c of catalog.customers) await this.db.customers.put({...c, tenant_id: this.tenantId});
      await this.db.metadata.put({key: 'snapshot', value: {branchId: catalog.branch_id, downloadedAt: Date.now()}});
      assertSession();
    });
  }

  async record(kind: 'sale' | 'reservation', operation: Operation, assertSession = () => {}) {
    return this.db.transaction('rw', this.db.tables, async () => {
      assertSession();
      const snapshot = (await this.db.metadata.get('snapshot'))?.value;
      if (!snapshot || snapshot.branchId !== operation.branch_id) throw new Error('Descarga el catálogo de esta sucursal antes de operar offline.');
      if (Date.now() - snapshot.downloadedAt > 24 * 60 * 60 * 1000) throw new Error('Actualiza el catálogo: el acceso offline caducó después de 24 horas.');
      if (!operation.items.length) throw new Error('Selecciona al menos una prenda.');
      if (operation.user_id && operation.user_id !== this.ownerId && !await this.db.customers.get(operation.user_id)) {
        throw new Error('El cliente no pertenece al catálogo descargado.');
      }
      const counts = new Map<number, number>();
      let amount = 0;
      for (const item of operation.items) {
        if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error('Cantidad inválida.');
        const variant = await this.db.variants.get(item.variant_id);
        if (!variant) throw new Error('Prenda no disponible en el catálogo local.');
        if (kind === 'sale' && (!Number.isFinite(item.unit_price) || Math.round(item.unit_price! * 100) !== Math.round(variant.price * 100))) {
          throw new Error('El precio cambió. Actualiza la selección de prendas.');
        }
        item.unit_price = variant.price;
        amount += Math.round(variant.price * 100) * item.quantity;
        counts.set(item.variant_id, (counts.get(item.variant_id) ?? 0) + item.quantity);
      }
      if (kind === 'sale') {
        const sale = operation as LocalSaleOperation;
        if (sale.payment_method !== 'efectivo') throw new Error('Offline solo admite ventas de contado en efectivo.');
        if (!Number.isFinite(sale.total_amount) || Math.round(sale.total_amount * 100) !== amount) throw new Error('Total de venta incorrecto.');
      }
      for (const [id, qty] of counts) {
        const variant = (await this.db.variants.get(id))!;
        if (variant.stock < qty) throw new Error('Stock local insuficiente.');
        await this.db.variants.update(id, {stock: variant.stock - qty});
      }
      const row = {...operation, tenant_id: this.tenantId};
      if (kind === 'sale') await this.db.local_sales.add(row as LocalSaleOperation);
      else await this.db.local_reservations.add(row as LocalReservationOperation);
      await this.db.sync_queue.add({branch_id: operation.branch_id, client_operation_uuid: operation.client_operation_uuid,
        operation_type: kind, status: 'PENDIENTE', payload: row, attempts: 0,
        created_at: operation.created_at, updated_at: operation.created_at});
      assertSession();
      return row;
    });
  }

  // Called while holding the account's cross-tab Web Lock. ENVIANDO means a
  // previous worker stopped; its UUID/payload must be preserved on recovery.
  async claim(branchId?: number, force = false, assertSession = () => {}) {
    return this.db.transaction('rw', this.db.tables, async () => {
      assertSession();
      const rows = (await this.db.sync_queue.where('status').anyOf(pendingStates).toArray())
        .filter(q => (!branchId || q.branch_id === branchId) && (force || q.status === 'ENVIANDO' || !q.next_retry_at || q.next_retry_at <= Date.now()));
      const selectedBranch = branchId ?? rows[0]?.branch_id;
      const batch = rows.filter(q => q.branch_id === selectedBranch).slice(0, 100);
      for (const row of batch) {
        const table = row.operation_type === 'sale' ? this.db.local_sales : this.db.local_reservations;
        if (!await table.get(row.client_operation_uuid)) throw new Error('Detalle de operación local no encontrado.');
        await table.update(row.client_operation_uuid, {sync_status: 'ENVIANDO'});
        await this.db.sync_queue.update(row.id!, {status: 'ENVIANDO', attempts: row.attempts + 1});
      }
      assertSession();
      return batch;
    });
  }

  async applyReceipts(sent: SyncQueueItem[], response: SyncBatchResponse, assertSession = () => {}) {
    const expected = new Map(sent.map(q => [q.client_operation_uuid, q]));
    const receipts = response?.receipts;
    if (!Array.isArray(receipts) || receipts.length !== sent.length || response.total_processed !== sent.length) throw new Error('Respuesta de sincronización incompleta.');
    const seen = new Set<string>();
    for (const r of receipts) {
      const q = expected.get(r.client_operation_uuid);
      if (!q || seen.has(r.client_operation_uuid) || q.operation_type !== r.operation_type ||
          !['CONFIRMADA', 'RECHAZADA_CONFLICTO'].includes(r.status) ||
          (r.status === 'CONFIRMADA' && (!Number.isSafeInteger(r.server_id) || r.server_id! <= 0))) {
        throw new Error('Recibo de sincronización inválido.');
      }
      seen.add(r.client_operation_uuid);
    }
    return this.db.transaction('rw', this.db.tables, async () => {
      assertSession();
      for (const receipt of receipts) {
        const sentRow = expected.get(receipt.client_operation_uuid)!;
        const q = await this.db.sync_queue.get(sentRow.id!);
        if (!q || q.client_operation_uuid !== receipt.client_operation_uuid) throw new Error('Operación local no encontrada.');
        if (q.status === 'CONFIRMADA' || q.status === 'RECHAZADA_CONFLICTO') continue;
        const table = q.operation_type === 'sale' ? this.db.local_sales : this.db.local_reservations;
        const op = await table.get(q.client_operation_uuid);
        if (!op) throw new Error('Detalle local no encontrado.');
        if (receipt.status === 'RECHAZADA_CONFLICTO') {
          for (const item of op.items) {
            const v = await this.db.variants.get(item.variant_id);
            if (!v) throw new Error('Inventario local no encontrado.');
            await this.db.variants.update(v.id, {stock: v.stock + item.quantity});
          }
        }
        await table.update(op.client_operation_uuid, {sync_status: receipt.status,
          server_id: receipt.server_id, rejection_reason: receipt.rejection_reason});
        await this.db.sync_queue.update(q.id!, {status: receipt.status, error_message: receipt.rejection_reason, updated_at: new Date().toISOString()});
      }
      assertSession();
    });
  }

  async failed(sent: SyncQueueItem[], message: string) {
    await this.db.transaction('rw', this.db.tables, async () => {
      for (const row of sent) {
        const current = await this.db.sync_queue.get(row.id!);
        if (current?.status !== 'ENVIANDO') continue;
        const table = current.operation_type === 'sale' ? this.db.local_sales : this.db.local_reservations;
        await table.update(current.client_operation_uuid, {sync_status: 'PENDIENTE'});
        await this.db.sync_queue.update(row.id!, {status: 'PENDIENTE', error_message: message,
          next_retry_at: Date.now() + Math.min(60000, 1000 * 2 ** Math.min(current.attempts, 6))});
      }
    });
  }
}
