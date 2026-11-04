import Dexie, { Table } from 'dexie';
import {
  LocalProduct,
  LocalVariant,
  LocalBranch,
  LocalCustomer,
  LocalSaleOperation,
  LocalReservationOperation,
  SyncQueueItem,
} from '../models';

export class AppDatabase extends Dexie {
  products!: Table<LocalProduct, number>;
  variants!: Table<LocalVariant, number>;
  branches!: Table<LocalBranch, number>;
  customers!: Table<LocalCustomer, number>;
  local_sales!: Table<LocalSaleOperation, string>;
  local_reservations!: Table<LocalReservationOperation, string>;
  sync_queue!: Table<SyncQueueItem, number>;
  metadata!: Table<{key: string; value: any}, string>;

  constructor(tenantId: number, ownerId: number) {
    if (![tenantId, ownerId].every(id => Number.isSafeInteger(id) && id > 0)) {
      throw new Error('La base offline requiere una empresa y un usuario válidos.');
    }
    // Never attach the legacy unowned database to whichever user logs in next.
    super(`FashionStoreOffline_t${tenantId}_u${ownerId}`);
    this.version(1).stores({
      products: 'id, tenant_id, category_id, name',
      variants: 'id, product_id, sku',
      branches: 'id, tenant_id',
      customers: 'id, tenant_id, email, phone',
      local_sales: 'client_operation_uuid, branch_id, sync_status, created_at',
      local_reservations: 'client_operation_uuid, branch_id, sync_status, created_at',
      sync_queue: '++id, &client_operation_uuid, branch_id, operation_type, status, created_at',
      metadata: 'key',
    });
  }
}
