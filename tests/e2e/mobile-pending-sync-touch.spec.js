import {test,expect,devices} from '@playwright/test';
import {WORKER,resetMockSupabase,loginWithoutReset} from './mock-helpers.js';
const {defaultBrowserType:_unused,...iphone}=devices['iPhone 14'];test.use(iphone);
test('@mobile pending device manual sync is touchable and preserves intent while offline',async({page,context})=>{
 await resetMockSupabase(page);await loginWithoutReset(page,WORKER);
 await page.evaluate(async()=>{
  const job=window.__KLIMA_MOCK_SUPABASE__.getStore().jobs.find(j=>j.id==='mock-job-002');
  const store=await import('/src/mobile791/modules/job-offline-store.js');
  const op=await store.queueOfflineJobOperation({user_id:'mock-worker-1',job_id:job.id,type:'device',base:{device_model:job.device_model,device_serial_number:job.device_serial_number},payload:{device_fields:{device_model:job.device_model,device_serial_number:job.device_serial_number}}});
  await store.updateOfflineJobOperation(op.id,{next_attempt_at:new Date(Date.now()+3600000).toISOString()});
 });
 await page.reload();await page.locator('.statusActionButton[title="W trakcie"]').click();await page.getByText('Klient Testowy B',{exact:true}).click();
 const button=page.locator('.offlinePendingSyncButton');await expect(button).toBeVisible();
 const box=await button.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);
 expect(await button.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
 await context.setOffline(true);await button.click();
 await expect(page.locator('.offlinePendingSyncMessage')).toContainText('Brak internetu');
 await expect(page.getByRole('button',{name:'Protokół',exact:true}).last()).toBeDisabled();
 expect(await page.evaluate(async()=>{const s=await import('/src/mobile791/modules/job-offline-store.js');return(await s.listOfflineJobOperations('mock-worker-1')).length;})).toBe(1);
 await context.setOffline(false);
 await page.evaluate(()=>{
  const original=IDBDatabase.prototype.transaction;
  window.__restoreIntentRead=()=>{IDBDatabase.prototype.transaction=original;};
  IDBDatabase.prototype.transaction=function(stores,...args){
   if(String(stores).includes('job-operations'))throw new DOMException('fixture intent read unavailable','InvalidStateError');
   return original.call(this,stores,...args);
  };
  window.dispatchEvent(new CustomEvent('wawis-job-offline-changed'));
 });
 await page.getByRole('button',{name:'Synchronizuj dane',exact:true}).click();
 await expect(page.getByRole('status',{name:/Połączenie:/})).toContainText('Nie można odczytać pamięci telefonu');
 await expect(page.locator('.offlinePendingNotice')).toBeVisible();
 await page.evaluate(()=>window.__restoreIntentRead());

});
