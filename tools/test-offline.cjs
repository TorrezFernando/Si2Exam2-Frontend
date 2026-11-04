// Test the production repository with real Dexie transactions and an IndexedDB
// emulator. No browser profile, application database, or HTTP endpoint is used.
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  }}).outputText, filename);
};
require('fake-indexeddb/auto');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {AppDatabase} = require('../src/app/core/db/app-database.ts');
const {OfflineStore} = require('../src/app/core/db/offline-store.ts');
let next = 100;
async function fixture(t, tenant = ++next, owner = ++next) {
  const db = new AppDatabase(tenant, owner);
  t.after(() => db.delete());
  const store = new OfflineStore(db, tenant, owner);
  const catalog = {tenant_id: tenant, branch_id: 9, branch_name: 'Test', server_timestamp: new Date().toISOString(), exchange_window_days: 2,
    categories: [], customers: [], products: [{id: 1, name: 'Test garment', base_price: 10, variants: [
      {id: 1, sku: 'TEST', size: 'M', color: 'Blue', price: 10, stock: 5}]}]};
  await store.saveCatalog(catalog);
  return {db, store, catalog};
}
function sale(extra = {}) {
  return {client_operation_uuid: crypto.randomUUID(), branch_id: 9, payment_method: 'efectivo', total_amount: 20,
    items: [{variant_id: 1, quantity: 2, unit_price: 10}], created_at: new Date().toISOString(), sync_status: 'PENDIENTE', ...extra};
}
function receipt(sent, status = 'CONFIRMADA') {
  return {total_processed: sent.length, confirmed_count: status === 'CONFIRMADA' ? sent.length : 0,
    conflict_count: status === 'RECHAZADA_CONFLICTO' ? sent.length : 0,
    receipts: sent.map(q => ({client_operation_uuid: q.client_operation_uuid, operation_type: q.operation_type,
      status, server_id: status === 'CONFIRMADA' ? 100 : undefined, rejection_reason: status === 'RECHAZADA_CONFLICTO' ? 'Stock' : undefined}))};
}

test('databases isolate both companies and users within one company', async t => {
  const a = await fixture(t), b = await fixture(t, a.store.tenantId), c = await fixture(t);
  await a.store.record('sale', sale());
  assert.notEqual(a.db.name, b.db.name);
  assert.equal(await b.store.pending(), 0);
  assert.equal(await c.store.pending(), 0);
  assert.equal((await b.db.variants.get(1)).stock, 5);
});

test('sale and stock survive close and reopen under the same account', async t => {
  const {store, db} = await fixture(t);
  const op = sale(); await store.record('sale', op); db.close(); await db.open();
  assert.equal((await db.local_sales.get(op.client_operation_uuid)).sync_status, 'PENDIENTE');
  assert.equal((await db.variants.get(1)).stock, 3);
});

test('invalid quantity, duplicate lines and invalid price cannot partially debit stock', async t => {
  const {store, db} = await fixture(t);
  for (const op of [sale({items: [{variant_id: 1, quantity: -1, unit_price: 10}]}),
    sale({total_amount: 60, items: [{variant_id: 1, quantity: 3, unit_price: 10}, {variant_id: 1, quantity: 3, unit_price: 10}]}),
    sale({items: [{variant_id: 1, quantity: 2, unit_price: 1}]}), sale({branch_id: 999})]) {
    await assert.rejects(store.record('sale', op));
    assert.equal((await db.variants.get(1)).stock, 5);
    assert.equal(await db.sync_queue.count(), 0);
  }
});

test('concurrent local sales cannot oversell cached inventory', async t => {
  const {store, db} = await fixture(t);
  const results = await Promise.allSettled([store.record('sale', sale({total_amount: 40, items: [{variant_id: 1, quantity: 4, unit_price: 10}]})),
    store.record('sale', sale({total_amount: 40, items: [{variant_id: 1, quantity: 4, unit_price: 10}]}))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await db.variants.get(1)).stock, 1);
});

test('conflict is terminal and compensation happens exactly once', async t => {
  const {store, db} = await fixture(t);
  await store.record('sale', sale()); const sent = await store.claim(); const response = receipt(sent, 'RECHAZADA_CONFLICTO');
  await store.applyReceipts(sent, response); await store.applyReceipts(sent, response);
  assert.equal((await db.variants.get(1)).stock, 5);
  assert.equal((await store.claim(undefined, true)).length, 0);
  assert.equal(await store.pending(), 0);
});

test('confirmation does not debit inventory a second time', async t => {
  const {store, db} = await fixture(t);
  await store.record('sale', sale()); const sent = await store.claim();
  await store.applyReceipts(sent, receipt(sent)); await store.applyReceipts(sent, receipt(sent));
  assert.equal((await db.variants.get(1)).stock, 3);
  assert.equal(await db.sync_queue.count(), 1);
});

test('crash recovery retains the UUID and original payload', async t => {
  const {store, db} = await fixture(t);
  await store.record('sale', sale()); const sent = await store.claim(); db.close(); await db.open();
  const recovered = await store.claim();
  assert.deepEqual(recovered[0].payload, sent[0].payload);
  assert.equal(recovered[0].client_operation_uuid, sent[0].client_operation_uuid);
  assert.equal((await db.local_sales.get(sent[0].client_operation_uuid)).sync_status, 'ENVIANDO');
});

test('pending operation prevents catalog overwrite or branch change', async t => {
  const {store, db, catalog} = await fixture(t);
  await store.record('sale', sale());
  await assert.rejects(store.saveCatalog({...catalog, branch_id: 10}));
  assert.equal((await db.variants.get(1)).stock, 3);
  assert.equal((await db.branches.toArray())[0].id, 9);
});

test('missing, duplicate and wrong-type receipts leave every operation pending', async t => {
  const {store, db} = await fixture(t);
  await store.record('sale', sale()); const sent = await store.claim();
  const invalid = [ {...receipt(sent), receipts: []}, {...receipt(sent), receipts: [...receipt(sent).receipts, ...receipt(sent).receipts]},
    {...receipt(sent), receipts: receipt(sent).receipts.map(r => ({...r, operation_type: 'reservation'}))} ];
  for (const response of invalid) await assert.rejects(store.applyReceipts(sent, response));
  assert.equal((await db.sync_queue.get(sent[0].id)).status, 'ENVIANDO');
  assert.equal((await db.variants.get(1)).stock, 3);
});

test('session change during a receipt transaction rolls back all writes', async t => {
  const {store, db} = await fixture(t);
  await store.record('sale', sale()); const sent = await store.claim(); let calls = 0;
  await assert.rejects(store.applyReceipts(sent, receipt(sent, 'RECHAZADA_CONFLICTO'), () => {if (++calls === 2) throw new Error('Session changed');}));
  assert.equal((await db.variants.get(1)).stock, 3);
  assert.equal((await db.sync_queue.get(sent[0].id)).status, 'ENVIANDO');
});

test('transient failure retains payload with backoff, manual retry can claim it', async t => {
  const {store, db} = await fixture(t);
  await store.record('sale', sale()); const sent = await store.claim(); await store.failed(sent, 'Network');
  assert.equal((await store.claim()).length, 0);
  assert.equal((await store.claim(undefined, true)).length, 1);
  assert.equal((await db.variants.get(1)).stock, 3);
});

test('reservation is saved atomically and expired snapshot refuses new records', async t => {
  const {store, db} = await fixture(t);
  const op = {client_operation_uuid: crypto.randomUUID(), branch_id: 9, user_id: store.ownerId,
    items: [{variant_id: 1, quantity: 2}], created_at: new Date().toISOString(), sync_status: 'PENDIENTE'};
  await store.record('reservation', op);
  assert.equal((await db.variants.get(1)).stock, 3);
  assert.equal((await db.local_reservations.get(op.client_operation_uuid)).items[0].unit_price, 10);
  await db.metadata.put({key: 'snapshot', value: {branchId: 9, downloadedAt: Date.now() - 25 * 3600000}});
  await assert.rejects(store.record('sale', sale()));
});


test('garment attributes persist in offline catalog after reopening', async t => {
  const {store, db, catalog} = await fixture(t);
  Object.assign(catalog.products[0], {weight_grams:250.5, fabric_type:'Algodón', design:'Floral'});
  await store.saveCatalog(catalog); db.close(); await db.open();
  const p = await db.products.get(1);
  assert.equal(p.weight_grams,250.5); assert.equal(p.fabric_type,'Algodón'); assert.equal(p.design,'Floral');
});
