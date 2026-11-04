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

(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
  try {
    const context=await browser.newContext({serviceWorkers:'block'});
    const user={id:1,tenant_id:21,branch_id:9,is_active:true,full_name:'Admin Test',role:{name:'admin',permissions:['branches:write','inventory:write','catalog:write'].map(name=>({name}))}};
    const token=`e30.${Buffer.from(JSON.stringify({sub:'1',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`;
    await context.addInitScript(({user,token})=>{localStorage.setItem('fs_user',JSON.stringify(user));localStorage.setItem('fs_access_token',token);},{user,token});
    let row=null, receiptBody=null, attempts=0;
    await context.route('**/api/v1/**',route=>{
      const pathname=new URL(route.request().url()).pathname;let data=[];
      if(pathname.endsWith('/branches')) data=[{id:9,name:'Sucursal A'}];
      else if(pathname.endsWith('/products')) data=[{id:1,name:'Camisa',base_price:100,variants:[{id:10,size:'M',color:'Azul'}]}];
      else if(pathname.endsWith('/masters/suppliers')) data=[{id:1,name:'Proveedor A'}];
      else if(pathname.endsWith('/incoming')&&route.request().method()==='POST') {const body=route.request().postDataJSON();row={...body,id:1,status:'pending',received_quantity:0,pending_quantity:body.quantity};data=row;}
      else if(pathname.endsWith('/incoming')) data=row?[row]:[];
      else if(pathname.endsWith('/incoming/1/receive')) {
        attempts++;const body=route.request().postDataJSON();
        if(!receiptBody){receiptBody=body;row.received_quantity=body.quantity;row.pending_quantity-=body.quantity;row.status='partial';return route.abort('failed');}
        assert.deepEqual(body,receiptBody);data={receipt_id:1,incoming:row};
      }
      return route.fulfill({json:data});
    });
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const origin=`http://127.0.0.1:${server.address().port}`;
    await page.goto(origin+'/admin/operations');const incoming=page.locator('app-incoming-stock');
    await incoming.locator('select[name=supplier]').selectOption({label:'Proveedor A'});
    await incoming.locator('select[name=branch]').selectOption({label:'Sucursal A'});
    await incoming.locator('select[name=variant]').selectOption({label:'Camisa · M / Azul'});
    await incoming.getByLabel('Unidades previstas').fill('10');
    await incoming.getByLabel('Fecha prevista').fill('2030-01-01');
    await incoming.getByLabel('Referencia del pedido').fill('Pedido demo');
    await incoming.getByRole('button',{name:'Programar ingreso'}).click();
    await incoming.getByText('10 / 0 / 10',{exact:true}).waitFor();
    await incoming.getByLabel('Cantidad recibida').fill('4');
    await incoming.getByRole('button',{name:'Confirmar recepción física'}).click();
    await incoming.getByRole('button',{name:'Reintentar el mismo registro'}).waitFor();
    await page.reload();
    await incoming.getByRole('button',{name:'Reintentar el mismo registro'}).click();
    await incoming.getByText('10 / 4 / 6',{exact:true}).waitFor();
    await incoming.getByText('Registro confirmado.',{exact:true}).waitFor();
    assert.equal(attempts,2);assert.deepEqual(errors,[]);
    console.log('PASS: scheduled receipt, partial delivery, lost response, reload and identical retry. API mocked.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
