import {test,expect,devices} from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';
const {defaultBrowserType: _unused,...iphone}=devices['iPhone 14'];
test.use(iphone);
test('@mobile IndexedDB read failure must never display Everything sent',async({page})=>{
 await resetMockSupabase(page);await loginWithoutReset(page,WORKER);
 await expect(page.getByRole('status',{name:/Połączenie:/})).toContainText('Wszystko wysłane');
 await page.evaluate(()=>{
  const original=IDBDatabase.prototype.transaction;
  window.__restoreQueueTransaction=()=>{IDBDatabase.prototype.transaction=original;};
  IDBDatabase.prototype.transaction=function(stores,...args){
   if(String(stores).includes('queued-photos'))throw new DOMException('fixture read unavailable','InvalidStateError');
   return original.call(this,stores,...args);
  };
  window.dispatchEvent(new CustomEvent('wawis-photo-queue-changed'));
 });
 await expect(page.getByRole('status',{name:/Połączenie:/})).toContainText('Nie można odczytać pamięci telefonu');
 await page.evaluate(()=>{window.__restoreQueueTransaction();window.dispatchEvent(new CustomEvent('wawis-photo-queue-changed'));});
 await expect(page.getByRole('status',{name:/Połączenie:/})).toContainText('Wszystko wysłane');
});
