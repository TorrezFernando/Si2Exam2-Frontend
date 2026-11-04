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
    const context=await browser.newContext({serviceWorkers:'allow'});
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

    const precacheUrls=JSON.parse(fs.readFileSync(path.join(root,'ngsw.json'),'utf8')).assetGroups.find(g=>g.name==='app').urls;
    const deadline=Date.now()+60000;
    let ready=false;
    while(Date.now()<deadline){
      ready=await page.evaluate(async urls=>{
        const registration=await navigator.serviceWorker.getRegistration();
        if(!registration?.active||!navigator.serviceWorker.controller)return false;
        const names=(await caches.keys()).filter(n=>n.endsWith(':assets:app:cache'));
        if(names.length!==1)return false;
        const cache=await caches.open(names[0]);
        const cached=await Promise.all(urls.map(url=>cache.match(url)));
        return urls.length>0 && cached.every(r=>r && r.status===200);
      },precacheUrls);
      if(ready)break;
      await page.waitForTimeout(250);
    }
    assert.equal(ready,true,'All production modules must be cached before disconnecting.');
    offline=true;await context.setOffline(true);
    await page.reload();
    await page.getByRole('button',{name:/Ver Detalles/}).first().waitFor();
    await page.getByRole('button',{name:/Ver Detalles/}).first().click();
    await page.getByText('Algodón',{exact:true}).waitFor();
    assert.equal((await readState(page)).stock,5);
    assert.deepEqual(errors,[]);
    console.log('PASS: active production Service Worker, full offline reload, cached catalog and product detail. API mocked; real offline browser and IndexedDB.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
