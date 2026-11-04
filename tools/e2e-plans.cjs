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
    const user={id:1,tenant_id:21,is_active:true,full_name:'Admin Test',role:{name:'admin',permissions:[{name:'branches:write'}]}};
    const token=`e30.${Buffer.from(JSON.stringify({sub:'1',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`;
    await context.addInitScript(({user,token})=>{localStorage.setItem('fs_user',JSON.stringify(user));localStorage.setItem('fs_access_token',token);},{user,token});
    const plans=[{id:1,code:'basic',name:'Plan Básico',max_branches:2,price:29.99,has_ai_reports:false},
      {id:2,code:'professional',name:'Plan Profesional',max_branches:10,price:99.99,has_ai_reports:true},
      {id:3,code:'enterprise',name:'Plan Empresarial',max_branches:30,price:199.99,has_ai_reports:true}].map(p=>({...p,has_offline_sync:true,is_active:true}));
    let active=plans[0], changes=0;
    await context.route('**/api/v1/**',route=>{
      const pathname=new URL(route.request().url()).pathname;
      let data=[];
      if(pathname.endsWith('/saas/plans')) data=plans;
      else if(pathname.endsWith('/saas/my-subscription/change-plan')) {
        assert.equal(route.request().postDataJSON().plan_code,'enterprise');active=plans[2];changes++;data={active_plan:active};
      } else if(pathname.endsWith('/saas/my-subscription')) data={is_superadmin:false,plan:active,status:'active',tenant:{id:21,name:'Demo',exchange_window_days:2},usage:{branches_count:1,branches_limit:active.max_branches}};
      return route.fulfill({json:data});
    });
    const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(`http://127.0.0.1:${server.address().port}/admin/plans`);
    await page.getByRole('button',{name:'Cambiar a Plan Empresarial',exact:true}).click();
    await page.getByText('● Plan Actual: Plan Empresarial').waitFor();
    assert.equal(await page.locator('.plan-card').count(),3);
    assert.equal(changes,1);assert.deepEqual(errors,[]);
    console.log('PASS: three API-driven plan cards and enterprise selection refresh the active subscription. API mocked.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
