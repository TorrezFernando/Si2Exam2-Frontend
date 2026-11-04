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
    const user={id:1,tenant_id:21,branch_id:9,is_active:true,full_name:'Cashier Test',role:{name:'cajero',permissions:[{name:'sales:write'}]}};
    const token=`e30.${Buffer.from(JSON.stringify({sub:'1',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`;
    await context.addInitScript(({user,token})=>{localStorage.setItem('fs_user',JSON.stringify(user));localStorage.setItem('fs_access_token',token);},{user,token});
    let receipt=null,body=null,attempts=0;
    const quote={order_id:50,branch_id:9,refund_amount:270,items:[{variant_id:1,quantity:1,label:'Camisa M'},{variant_id:2,quantity:1,label:'Camisa L'}]};
    await context.route('**/api/v1/**',route=>{
      const path=new URL(route.request().url()).pathname;let data=[];
      if(path.endsWith('/orders/50/full-return/quote'))data=quote;
      else if(path.endsWith('/orders/50/full-return')){
        if(route.request().method()==='GET')data=receipt;
        else {
          attempts++;const request=route.request().postDataJSON();
          if(!body){body=request;receipt={...quote,id:201,created_at:new Date().toISOString()};return route.abort('failed');}
          assert.deepEqual(request,body);data=receipt;
        }
      }
      return route.fulfill({json:data});
    });
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/cashier`);
    const form=page.locator('app-full-return');
    await form.getByLabel('Venta a devolver').fill('50');
    await form.getByRole('button',{name:'Consultar devolución'}).click();
    await form.getByText('1 × Camisa L',{exact:true}).waitFor();
    await form.getByLabel('Recibí todas las prendas indicadas y devolví el importe en efectivo.').check();
    await form.getByRole('button',{name:'Registrar devolución completa'}).click();
    await form.getByRole('button',{name:'Reintentar devolución registrada'}).waitFor();
    await page.reload();
    await form.getByRole('button',{name:'Reintentar devolución registrada'}).click();
    await form.getByText('Comprobante de devolución #201',{exact:true}).waitFor();
    assert.equal(attempts,2);assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>localStorage.getItem('fs_full_return_t21_u1')),null);
    console.log('PASS: full-return quote, current garments, cash confirmation, lost response and same request after reload. API mocked.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
