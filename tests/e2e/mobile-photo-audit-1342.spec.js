import { devices, expect, test } from '@playwright/test';
import { createServer } from 'node:http';

const { defaultBrowserType: _unused, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function fixture(page) {
  await page.route('**/__wawis_1342_fixture__', route => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><html lang="pl"><body>WAWIS 13.42 integrity</body></html>',
  }));
  await page.goto('/__wawis_1342_fixture__');
}

test.describe('@mobile audit 13.42: nondestructive IDB upgrade & fresh Storage', () => {
  test('baza v3 zachowuje stare File podczas aktualizacji v4; v3 po migracji nie może nic skasować', async ({ page }) => {
    await fixture(page);
    const before = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('wawis-mobile-photo-queue', 3);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('queued-photos')) db.createObjectStore('queued-photos', {keyPath:'id'});
        };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result, tx = db.transaction('queued-photos', 'readwrite');
          tx.objectStore('queued-photos').put({
            id: 'legacy-v3-saved', job_id:'j1', uploaded_by:'worker1',
            upload_status:'error', retry_count: 4,
            local_file: new File(['unuploaded-original-binary'], 'unit-jz.jpg', {type:'image/jpeg'}),
          });
          tx.oncomplete = () => {db.close();resolve(true);};
          tx.onerror = () => reject(tx.error);
        };
      });
    });
    expect(before).toBe(true);
    const migrated = await page.evaluate(async () => {
      const queue = await import('/src/mobile791/modules/photo-offline-queue.js');
      const records = await queue.listPhotoQueueItems();
      const dbVersion = await new Promise((resolve,reject) => {
        const req=indexedDB.open('wawis-mobile-photo-queue',4);
        req.onsuccess=()=>{const version=req.result.version;req.result.close();resolve(version)};
        req.onerror=()=>reject(req.error);
      });
      const r=records.find(x=>x.id==='legacy-v3-saved');
      return {version:dbVersion,entries:records.length,bytes:await r.local_file.text(),status:r.upload_status,retries:r.retry_count};
    });
    expect(migrated).toEqual({version:4,entries:1,bytes:'unuploaded-original-binary',status:'error',retries:4});

    const oldClient = await page.evaluate(() => new Promise(resolve=>{
      const r=indexedDB.open('wawis-mobile-photo-queue',3);
      r.onsuccess=()=>{r.result.close();resolve('UNSAFE_OLD_CLIENT_ALLOWED')};
      r.onerror=()=>resolve(r.error?.name);
    }));
    expect(oldClient).toBe('VersionError');

    await page.reload();
    const after=await page.evaluate(async ()=>{
      const queue=await import('/src/mobile791/modules/photo-offline-queue.js');
      const r=(await queue.listPhotoQueueItems()).find(x=>x.id==='legacy-v3-saved');
      return r?.local_file?.text();
    });
    expect(after).toBe('unuploaded-original-binary');
  });

  test('blokowana migracja nie usuwa istniejącego Blob; po zamknięciu starej karty następuje upgrade', async ({browser}) => {
    const context=await browser.newContext(iphone14);
    try {
      const pageOld=await context.newPage(),pageNew=await context.newPage();
      await fixture(pageOld);await fixture(pageNew);
      await pageOld.evaluate(async()=>{
        const req=indexedDB.open('wawis-mobile-photo-queue',3);
        await new Promise((resolve,reject)=>{
          req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('queued-photos'))db.createObjectStore('queued-photos',{keyPath:'id'})};
          req.onsuccess=()=>resolve();
          req.onerror=()=>reject(req.error);
        });
        window.__heldV3=req.result;
      });
      const pending=pageNew.evaluate(async()=>{
        const queue=await import('/src/mobile791/modules/photo-offline-queue.js');
        try {return await queue.savePhotoQueueItem({id:'blocked-new',local_file:new File(['important'],'a.jpg')});}
        catch(e){return e.name||'error'}
      });
      await expect.poll(async()=>pageOld.evaluate(()=>{
        return window.__heldV3?.version;
      })).toBe(3);
      const outcome=await pending;
      // Oczekiwany fail-closed: zapis nie jest potwierdzony, dopóki stara karta blokuje upgrade.
      expect(outcome).toBe(false);
      await pageOld.evaluate(()=>window.__heldV3.close());
      const upgraded=await pageNew.evaluate(async()=>{
        const queue=await import('/src/mobile791/modules/photo-offline-queue.js');
        return await queue.savePhotoQueueItem({id:'after-upgrade',local_file:new File(['persisted-new-file'],'fresh.jpg')});
      });
      expect(upgraded).toBe(true);
      const stillPresent=await pageNew.evaluate(async()=>{
        const q=await import('/src/mobile791/modules/photo-offline-queue.js');
        return (await q.listPhotoQueueItems()).find(x=>x.id==='after-upgrade')?.local_file.text();
      });
      expect(stillPresent).toBe('persisted-new-file');
    } finally {await context.close();}
  });

  test('błąd commit IDB nie pokazuje zapisania i Ponów najpierw utrwala File', async ({page}) => {
    await fixture(page);
    const first=await page.evaluate(async()=>{
      const photos=await import('/src/mobile791/modules/photos.js');
      const queue=await import('/src/mobile791/modules/photo-offline-queue.js');
      let jobs=[{id:'idb-failure-job',photos:[]}];
      let selectedJob={id:'idb-failure-job',photos:[]};
      const originalAdd=IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add=function(){throw new DOMException('Simulated quota failure','QuotaExceededError')};
      try{
        const result=await photos.uploadJobPhotos({
          supabase:{auth:{getUser:async()=>({data:{user:{id:'owner1'}},error:null})}},
          profile:{id:'owner1'},jobId:'idb-failure-job',
          event:{target:{files:[new File(['original-unsaved-file'],'a.jpg',{type:'image/jpeg'})],value:'a'}},
          setJobs:update=>{jobs=update(jobs)},
          setSelectedJob:update=>{selectedJob=update(selectedJob)},
        });
        const displayed=jobs[0].photos[0];
        return {
          failed:result.failedCount,
          queued:result.queuedCount,
          localPersistenceFailed:displayed.local_persistence_failed,
          status:displayed.upload_status,
          label:displayed.upload_status_label,
          fileText:await displayed.__localFile.text(),
          queueCount:(await queue.listPhotoQueueItems()).length,
        };
      }finally{IDBObjectStore.prototype.add=originalAdd;}
    });
    expect(first.failed).toBe(1);
    expect(first.queued).toBe(0);
    expect(first.localPersistenceFailed).toBe(true);
    expect(first.status).toBe('error');
    expect(first.label).not.toContain('Zapisano na telefonie');
    expect(first.fileText).toBe('original-unsaved-file');
    expect(first.queueCount).toBe(0);
  });

  test('rzeczywisty HTTP cache: stare 200 nie potwierdza obiektu po 404 na origin', async ({page}) => {
    let objectExists = true;
    let originGets = 0;
    const requests = [];
    const original = Buffer.from('WAWIS-REAL-HTTP-CACHE-ORIGINAL-BYTES');
    const server = createServer((req,res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,x-client-info,content-type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
      if (req.method === 'OPTIONS') { res.statusCode = 204;res.end();return; }
      if (req.method !== 'GET' || !req.url?.startsWith('/storage/v1/object/authenticated/job-photos/')) {
        res.statusCode=404;res.end();return;
      }
      originGets += 1;
      requests.push(String(req.url));
      if (objectExists) {
        res.statusCode = 200;
        res.setHeader('Content-Type','image/jpeg');
        res.setHeader('Cache-Control','private, max-age=3600');
        res.setHeader('Content-Length', original.length);
        res.end(original);
      } else {
        res.statusCode = 404;
        res.setHeader('Content-Type','application/json');
        res.setHeader('Cache-Control','no-store');
        res.end(JSON.stringify({statusCode:'404',error:'not_found',message:'Object not found'}));
      }
    });
    await new Promise((resolve,reject) => {
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    try {
      await fixture(page);
      const host = `http://127.0.0.1:${server.address().port}`;
      const firstRead = await page.evaluate(async ({host})=>{
        const {createClient}=await import('/tests/e2e/fixtures/supabase-storage-sdk-bridge.js');
        window.__freshProofClient=createClient(host,'mock-anon-key',{
          auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
        });
        const {data,error}=await window.__freshProofClient.storage.from('job-photos').download('job1/nameplates/jz.jpg');
        return {bytes:data?await data.text():null,error:error?.message||null};
      },{host});
      expect(firstRead.error).toBeNull();
      expect(firstRead.bytes).toBe(original.toString());
      expect(originGets).toBe(1);

      objectExists=false;
      // Z identycznym URL przeglądarka może mieć poprzednie bajty.
      // Bezpieczny dowód nie może używać tej odpowiedzi.
      await page.evaluate(async()=>{
        await window.__freshProofClient.storage.from('job-photos').download('job1/nameplates/jz.jpg');
      });
      const beforeFresh=originGets;
      const fresh=await page.evaluate(async()=>{
        const nonce=`fresh-${crypto.randomUUID()}`;
        const {data,error}=await window.__freshProofClient.storage.from('job-photos')
          .download('job1/nameplates/jz.jpg',{cacheNonce:nonce},{cache:'no-store'});
        return {hasData:Boolean(data),status:Number(error?.statusCode||error?.status||0),nonce};
      });
      expect(fresh.hasData).toBe(false);
      expect(fresh.status).toBe(404);
      expect(originGets).toBeGreaterThan(beforeFresh);
      expect(requests[requests.length-1]).toContain('cacheNonce=');
      expect(requests[requests.length-1]).toContain(encodeURIComponent(fresh.nonce));
    } finally {
      await new Promise(resolve=>server.close(resolve));
    }
  });

  test('aktualne Supabase SDK otrzymuje nonce i cache:no-store dla każdego readback', async ({ page }) => {
    await fixture(page);
    const proof=await page.evaluate(async()=>{
      const {createClient}=await import('/tests/e2e/fixtures/supabase-storage-sdk-bridge.js');
      const calls=[];
      const client=createClient('https://storage-proof.example.invalid','public-anon-key',{
        auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
        global:{fetch:async(url,init={})=>{
          const target=String(url);
          calls.push({target,cache:init.cache||null});
          return new Response(new Blob(['verified-byte-stream']),{status:200,headers:{'content-type':'image/jpeg'}});
        }},
      });
      for(let i=0;i<2;i++){
        const {data,error}=await client.storage.from('job-photos').download(
          'job-123/nameplates/jz.jpg',{cacheNonce:`proof-${i}-${crypto.randomUUID()}`},{cache:'no-store'}
        );
        if(error||!data)throw new Error(error?.message||'Download missing');
      }
      return calls;
    });
    expect(proof).toHaveLength(2);
    expect(proof[0].cache).toBe('no-store');
    expect(proof[1].cache).toBe('no-store');
    expect(proof[0].target).toContain('cacheNonce=');
    expect(proof[1].target).toContain('cacheNonce=');
    expect(proof[0].target).not.toEqual(proof[1].target);
  });
});
