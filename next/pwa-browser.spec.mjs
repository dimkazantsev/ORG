import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:8080/next/';
const sdkStub=`window.supabase={createClient:()=>({
 auth:{getSession:async()=>({data:{session:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 rpc:async()=>({data:null,error:null}),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:()=>{}
})};`;
test('PWA installs static shell and opens after internet is disabled',async({browser})=>{
 const context=await browser.newContext({serviceWorkers:'allow'});
 const page=await context.newPage();
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'application/javascript',body:sdkStub}));
 await page.goto(base,{waitUntil:'load'});
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker?.controller||navigator.serviceWorker?.ready));
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.reload({waitUntil:'load'});
 const cachesBefore=await page.evaluate(async()=>await caches.keys());
 expect(cachesBefore.some(x=>x.includes('qwiz-pwa-shell-20261026'))).toBeTruthy();
 await page.unroute('https://cdn.jsdelivr.net/**');
 await context.setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page).toHaveTitle(/QWIZ-PARTY/);
 await expect(page.locator('#joinForm')).toBeVisible();
 const cacheHasApi=await page.evaluate(async()=>{
  const keys=await caches.keys();
  for(const k of keys){const c=await caches.open(k);const requests=await c.keys();
   if(requests.some(r=>r.url.includes('.supabase.co/rest/')||r.url.includes('.supabase.co/auth/')))return true;
  }return false;
 });
 expect(cacheHasApi).toBe(false);
 await context.close();
});