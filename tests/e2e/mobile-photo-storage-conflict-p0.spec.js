import { devices, expect, test } from '@playwright/test';

const { defaultBrowserType: _ignored, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function fixture(page) {
  await page.route('**/__wawis_storage_conflict__', route => route.fulfill({
    status:200,contentType:'text/html',body:'<!doctype html><html><body>WAWIS 409 proof</body></html>',
  }));
  await page.goto('/__wawis_storage_conflict__');
}

async function runStorageConflict({ remoteMode, uploadStatus = 409 }) {
  const photos = await import('/src/mobile791/modules/photos.js');
  const queue = await import('/src/mobile791/modules/photo-offline-queue.js');
  for (const record of await queue.listPhotoQueueItems()) await queue.deletePhotoQueueItem(record.id);
  const original = 'ORIGINAL-IMAGE-BYTES-P0-409';
  let uploads = 0, inserts = 0, reads = 0, callbacks = 0;
  const serverRows=[];
  const supabase={
    auth:{async getUser(){return{data:{user:{id:'worker409'}},error:null};}},
    from(table) {
      if (table !== 'photos') throw new Error('Unexpected table: '+table);
      const filters=[];
      return {
        select(){return this;},
        eq(k,v){filters.push([k,v]);return this;},
        async maybeSingle(){
          return {data:serverRows.find(row=>filters.every(([key,val])=>row[key]===val))||null,error:null};
        },
        insert(input){inserts++;
          this.pending={...input,id:'remote409',created_at:new Date().toISOString()};
          return this;
        },
        async single() {
          serverRows.push(this.pending);
          return {data:this.pending,error:null};
        },
      };
    },
    storage:{
      from(bucket){
        if(bucket!=='job-photos')throw new Error('Wrong bucket');
        return {
          async upload(){uploads++;return uploadStatus===409?{data:null,error:{statusCode:409,message:'already exists'}}:{data:{},error:null};},
          async download(path,options,fetchOptions){reads++;
            if(!options?.cacheNonce || fetchOptions?.cache!=='no-store') {
              return {data:null,error:{statusCode:412,message:'Unsafe cached readback'}};
            }
            if(remoteMode==='missing')return{data:null,error:{statusCode:404,message:'Not found'}};
            if(remoteMode==='503')return{data:null,error:{statusCode:503,message:'Temporary Storage outage'}};
            if(remoteMode==='429')return{data:null,error:{statusCode:429,message:'Rate limited'}};
            return{data:new Blob([remoteMode==='different'?'DIFFERENT-IMAGE-BYTES-P0!':original],{type:'image/jpeg'}),error:null};
          },
          async createSignedUrl(){return{data:{signedUrl:'https://example.invalid/proof'},error:null};},
        };
      }
    },
  };
  let jobs=[{id:'job409',photos:[]}];
  let selectedJob={id:'job409',photos:[]};
  const result=await photos.uploadJobDocumentationPhotos({
    supabase,profile:{id:'worker409'},jobId:'job409',
    documents:[{file:new File([original],'original.jpg',{type:'image/jpeg',lastModified:1}),
      deviceIndex:0,unitRef:'jz',serialNumber:'SN409'}],
    setJobs:update=>{jobs=update(jobs);},
    setSelectedJob:update=>{selectedJob=update(selectedJob);},
    onPhotoUploaded:()=>{callbacks++;},
  });
  const list=await queue.listPhotoQueueItems();
  return {
    uploads,inserts,reads,callbacks,
    queued:list.length,
    bytes:list[0]?.local_file ? await list[0].local_file.text():null,
    status:list[0]?.upload_status||null,
    nextAttemptAt:list[0]?.next_attempt_at||'',
    serverRows:serverRows.length,
    uploaded:result.uploadedCount,
  };
}

test.describe('@mobile P0 — 409 i ACK nie mogą zgubić ostatniej kopii', () => {
  test('409 + inne bajty pod tym samym path nie usuwa File i nie wykonuje INSERT', async ({page}) => {
    await fixture(page);
    const state=await page.evaluate(runStorageConflict,{remoteMode:'different'});
    expect(state.uploads).toBe(1);
    expect(state.inserts).toBe(0);
    expect(state.queued).toBe(1);
    expect(state.bytes).toBe('ORIGINAL-IMAGE-BYTES-P0-409');
    expect(state.uploaded).toBe(0);
  });
  test('409 + dokładne bajty pozwala dopisać row i bezpiecznie uzgodnić', async ({page}) => {
    await fixture(page);
    const state=await page.evaluate(runStorageConflict,{remoteMode:'exact'});
    expect(state.uploads).toBe(1);
    expect(state.inserts).toBe(1);
    expect(state.queued).toBe(0);
    expect(state.uploaded).toBe(1);
    expect(state.callbacks).toBe(1);
  });
  for (const remoteMode of ['503','429']) {
    test(`konflikt 409 i przejściowy błąd ${remoteMode} zachowują Blob i ustawiają backoff`, async ({page}) => {
      await fixture(page);
      const state=await page.evaluate(runStorageConflict,{remoteMode});
      expect(state.uploads).toBe(1);
      expect(state.inserts).toBe(0);
      expect(state.queued).toBe(1);
      expect(state.bytes).toBe('ORIGINAL-IMAGE-BYTES-P0-409');
      expect(state.status).toBe('local');
      expect(Date.parse(state.nextAttemptAt)).toBeGreaterThan(Date.now());
    });
  }

  test('udany upload/INSERT z brakującym obiektem nie usuwa File', async ({page}) => {
    await fixture(page);
    const state=await page.evaluate(runStorageConflict,{remoteMode:'missing',uploadStatus:200});
    expect(state.uploads).toBe(1);
    expect(state.inserts).toBe(1);
    expect(state.queued).toBe(1);
    expect(state.bytes).toBe('ORIGINAL-IMAGE-BYTES-P0-409');
    expect(state.uploaded).toBe(0);
  });
});
