// Production UI, isolated browser profile, mocked API, real browser IndexedDB.
// Set PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE to installed tooling paths.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist/fashionstore-web/browser');
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server = http.createServer((req,res) => {
  const requested = path.resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if (!requested.startsWith(root + path.sep) && requested !== root) {res.writeHead(403).end();return;}
  const file = fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(root,'index.html');
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
const user = {id: 11, tenant_id: 21, tenant_name:'Tienda de prueba', email:'demo@example.com', full_name:'Cliente Demo',
  is_active:true, user_permissions:[], role:{name:'cliente',permissions:[]}};
const tokenFor = u => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:String(u.id),tenant_id:u.tenant_id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`;
const variant = {id:1, product_id:1, sku:'DEMO',size:'M',color:'Azul',price:10,price_override:10,stock:5,quantity:5,inventories:[{id:1,variant_id:1,branch_id:9,stock:5}]};
const product = {id:1,weight_grams:250.5,fabric_type:'Algodón',design:'Floral',name:'Camisa de prueba',base_price:10,variants:[variant,{...variant,id:2,sku:'DEMO-L',size:'L',price:15,price_override:15}]};
let offline = false, sends = 0;
let exchangeAttempts = 0, exchangeBody = null, exchangeReceipt = null;
async function readState(page, name='FashionStoreOffline_t21_u11') {
  return page.evaluate(async name => {
    if (!(await indexedDB.databases()).some(db => db.name === name)) return {queue:[],stock:null};
    return new Promise((resolve,reject) => {
      const open = indexedDB.open(name); open.onerror=()=>reject(open.error);
      open.onsuccess=()=>{const db=open.result, tx=db.transaction(['sync_queue','variants'],'readonly');
        const q=tx.objectStore('sync_queue').getAll(),v=tx.objectStore('variants').get(1);
        tx.oncomplete=()=>{resolve({queue:q.result,stock:v.result?.stock});db.close();};};
    });
  }, name);
}
(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
  try {
    const context=await browser.newContext({serviceWorkers:'block'});
    await context.addInitScript(({user,token})=>{
      if (!localStorage.getItem('initialized-test')) {
        localStorage.setItem('fs_user',JSON.stringify(user));localStorage.setItem('fs_access_token',token);localStorage.setItem('initialized-test','yes');
      }
    },{user,token:tokenFor(user)});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if (url.origin!==origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (offline) return route.abort('internetdisconnected');
      let data=[];
      if (url.pathname.endsWith('/storefront')) data={selected:{name:user.tenant_name,slug:'test'},stores:[{name:user.tenant_name,slug:'test'}]};
      else if (url.pathname==='/api/v1/branches') data=[{id:9,name:'Sucursal de prueba',address:'Demo',is_active:true}];
      else if (url.pathname==='/api/v1/products') data=[product];
      else if (url.pathname==='/api/v1/products/1') data=product;
      else if (url.pathname.includes('/inventory/')) data=variant.inventories;
      else if (url.pathname.endsWith('/sync/catalog')) data={tenant_id:21,branch_id:9,branch_name:'Sucursal de prueba',server_timestamp:new Date().toISOString(),exchange_window_days:2,categories:[],customers:[user],products:[product]};
      else if (url.pathname.endsWith('/sync/operations')) {
        sends++;const body=route.request().postDataJSON();
        assert.equal(body.branch_id,9);
        data={total_processed:body.reservations.length,confirmed_count:body.reservations.length,conflict_count:0,
          receipts:body.reservations.map(r=>({operation_type:'reservation',client_operation_uuid:r.client_operation_uuid,status:'CONFIRMADA',server_id:101,processed_at:new Date().toISOString()}))};
      }
      else if (url.pathname === '/api/v1/orders/50') data={id:50,branch_id:9,created_at:new Date().toISOString(),is_paid:true,
        items:[{variant_id:1,quantity:1,unit_price:10,variant:{...variant,product}}]};
      else if (url.pathname === '/api/v1/orders/50/exchanges') data=exchangeReceipt?[exchangeReceipt]:[];
      else if (url.pathname === '/api/v1/orders/50/exchange/quote') data={original_unit_price:10,new_unit_price:15,
        difference_amount:5,action:'collect',deadline:new Date(Date.now()+86400000).toISOString()};
      else if (url.pathname === '/api/v1/orders/50/exchange') {
        exchangeAttempts++;
        const body=route.request().postDataJSON();
        if (!exchangeBody) {
          exchangeBody=body;
          exchangeReceipt={id:201,order_id:50,created_at:new Date().toISOString(),quantity:1,
            original_variant_id:1,new_variant_id:2,difference_amount:5,settlement_method:'cash'};
          return route.abort('failed'); // Server committed, response was lost.
        }
        assert.deepEqual(body,exchangeBody);
        data=exchangeReceipt;
      }
      return route.fulfill({json:data});
    });
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/catalog');
    await page.getByRole('button',{name:'Guardar catálogo en este dispositivo'}).click();
    await page.getByText('Catálogo guardado para usar sin conexión en esta cuenta y sucursal.').waitFor();
    await page.getByRole('button',{name:/Ver Detalles/}).click();
    await page.getByText('Algodón',{exact:true}).waitFor();
    await page.getByText('Floral',{exact:true}).waitFor();
    await page.getByRole('button',{name:/Reservar \(/}).click();
    await page.getByRole('button',{name:'Proceder al Pago'}).waitFor();
    offline=true;await context.setOffline(true);
    await page.getByRole('button',{name:'Proceder al Pago'}).click();
    await page.getByRole('button',{name:'🛍️ Reserva',exact:true}).click();
    const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
    await page.locator('input[type=date]').fill(tomorrow.toISOString().slice(0,10));
    await page.locator('input[type=time]').fill('12:00');
    await page.getByRole('button',{name:'Reservar prendas',exact:true}).click();
    await page.getByText(/Reserva guardada en este dispositivo/).waitFor();
    let state=await readState(page);
    assert.equal(state.queue.length,1);assert.equal(state.queue[0].status,'PENDIENTE');assert.equal(state.stock,4);assert.equal(sends,0);
    offline=false;await context.setOffline(false);
    await page.waitForFunction(async()=>new Promise(resolve=>{
      const request=indexedDB.open('FashionStoreOffline_t21_u11');request.onsuccess=()=>{
        const db=request.result,q=db.transaction('sync_queue').objectStore('sync_queue').getAll();
        q.onsuccess=()=>{resolve(q.result[0]?.status==='CONFIRMADA');db.close();};};
    }));
    state=await readState(page);assert.equal(state.stock,4);assert.equal(sends,1);
    await page.reload();await page.getByRole('button',{name:/Guardar catálogo/}).waitFor();
    assert.equal((await readState(page)).queue[0].status,'CONFIRMADA');assert.equal(sends,1);
    const other={...user,id:12,tenant_id:22};
    await page.evaluate(({user,token})=>{localStorage.setItem('fs_user',JSON.stringify(user));localStorage.setItem('fs_access_token',token);},{user:other,token:tokenFor(other)});
    await page.reload();await page.getByRole('button',{name:/Guardar catálogo/}).waitFor();
    assert.equal((await readState(page,'FashionStoreOffline_t22_u12')).queue.length,0);
    assert.equal((await readState(page)).queue.length,1);
    const staff={...user,id:13,branch_id:9,role:{name:'cajero',permissions:[{id:1,name:'sales:write'}]}};
    await page.evaluate(({user,token})=>{localStorage.setItem('fs_user',JSON.stringify(user));localStorage.setItem('fs_access_token',token);},{user:staff,token:tokenFor(staff)});
    await page.goto(origin+'/cashier');
    const exchange=page.locator('app-garment-exchanges');
    await exchange.getByLabel('Número de venta').fill('50');
    await exchange.getByRole('button',{name:'Buscar venta'}).click();
    await exchange.getByLabel('Prenda a entregar').selectOption({label:'Camisa de prueba · L / Azul · Bs 15'});
    await exchange.getByRole('button',{name:'Consultar diferencia y disponibilidad'}).click();
    await exchange.getByLabel(/Recibí la prenda original/).check();
    await exchange.getByRole('button',{name:'Registrar cambio',exact:true}).click();
    await exchange.getByRole('button',{name:'Reintentar registro, sin repetir cobro'}).waitFor();
    await page.reload();
    await exchange.getByRole('button',{name:'Reintentar registro, sin repetir cobro'}).click();
    await exchange.getByText('Comprobante de cambio #201').waitFor();
    assert.equal(exchangeAttempts,2);
    assert.equal(await page.evaluate(()=>localStorage.getItem('fs_exchange_pending_t21_u13')),null);
    assert.deepEqual(errors,[]);
    console.log('PASS: offline reservation, single synchronization, reload and account isolation; exchange quote and identical retry after lost response/reload. API mocked; service worker acceptance remains separate.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
