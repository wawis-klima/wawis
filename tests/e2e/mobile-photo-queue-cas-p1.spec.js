import { devices, expect, test } from '@playwright/test';

const { defaultBrowserType: _unused, ...iphone14 } = devices['iPhone 14'];

async function setup(page) {
  await page.route('**/__wawis_cas_fixture__', route => route.fulfill({
    status: 200, contentType:'text/html', body:'<!doctype html><html><body>WAWIS CAS</body></html>',
  }));
  await page.goto('/__wawis_cas_fixture__');
}

test.describe('@mobile queue fencing / owner / recovery', () => {
  test.use(iphone14);

  test('dwie karty: spóźniony A nie aktualizuje ani nie kasuje zdjęcia przejętego przez B i C', async ({ browser }) => {
    const ctx = await browser.newContext(iphone14);
    try {
      const pageA = await ctx.newPage();
      const pageB = await ctx.newPage();
      await setup(pageA);
      await setup(pageB);
      const seed = await pageA.evaluate(async () => {
        const queue = await import('/src/mobile791/modules/photo-offline-queue.js');
        for (const item of await queue.listPhotoQueueItems()) await queue.deletePhotoQueueItem(item.id);
        return queue.savePhotoQueueItem({
          id:'cas-photo',job_id:'cas-job',user_id:'ownerA',uploaded_by:'ownerA',
          local_file:new File(['original-file-bytes'],'p.jpg',{type:'image/jpeg'}),
          upload_status:'local',file_fingerprint:'cas-hash',
        });
      });
      expect(seed).toBe(true);
      const first = await pageA.evaluate(async () => {
        const queue=await import('/src/mobile791/modules/photo-offline-queue.js');
        const a=await queue.claimPhotoQueueItem('cas-photo');
        return {owner:a.lease_owner,gen:a.attempt_generation};
      });
      expect(first.owner).toBeTruthy();

      const blocked = await pageB.evaluate(async () => {
        const queue=await import('/src/mobile791/modules/photo-offline-queue.js');
        return queue.claimPhotoQueueItem('cas-photo');
      });
      expect(blocked).toBeNull();

      // A's lease expires before its server response, B takes the next claim.
      await pageA.evaluate(async ({owner,gen})=>{
        const queue=await import('/src/mobile791/modules/photo-offline-queue.js');
        const ok=await queue.updatePhotoQueueItem('cas-photo',{lease_until:'2000-01-01T00:00:00Z'},
          {expectedLeaseOwner:owner,expectedGeneration:gen});
        if(!ok) throw new Error('Lease not shortened in fixture');
      },first);
      const second = await pageB.evaluate(async () => {
        const queue=await import('/src/mobile791/modules/photo-offline-queue.js');
        const b=await queue.claimPhotoQueueItem('cas-photo');
        return {owner:b.lease_owner,gen:b.attempt_generation};
      });
      expect(second.owner).not.toBe(first.owner);
      expect(second.gen).toBe(first.gen+1);

      const stale = await pageA.evaluate(async ({first})=>{
        const queue=await import('/src/mobile791/modules/photo-offline-queue.js');
        const guard={expectedLeaseOwner:first.owner,expectedGeneration:first.gen};
        return {
          updated:await queue.updatePhotoQueueItem('cas-photo',{upload_status:'error',lease_owner:''},guard),
          deleted:await queue.deletePhotoQueueItem('cas-photo',guard),
          released:await queue.releaseClaimedPhotoQueueItem('cas-photo',{lease_owner:first.owner,attempt_generation:first.gen}),
        };
      },{first});
      expect(stale).toEqual({updated:false,deleted:false,released:false});

      const state = await pageB.evaluate(async ({second})=>{
        const queue=await import('/src/mobile791/modules/photo-offline-queue.js');
        const current=(await queue.listPhotoQueueItems()).find(x=>x.id==='cas-photo');
        const guard={expectedLeaseOwner:second.owner,expectedGeneration:second.gen};
        return {owner:current.lease_owner,gen:current.attempt_generation,bytes:await current.local_file.text(),
          deleted:await queue.deletePhotoQueueItem('cas-photo',guard)};
      },{second});
      expect(state).toEqual({owner:second.owner,gen:second.gen,bytes:'original-file-bytes',deleted:true});
    } finally { await ctx.close(); }
  });

  test('error 403 jest zachowany, a automatyczne wznowienie nie wysyła go ponownie', async ({ page }) => {
    await setup(page);
    const result=await page.evaluate(async () => {
      const queue=await import('/src/mobile791/modules/photo-offline-queue.js');
      const photos=await import('/src/mobile791/modules/photos.js');
      for(const item of await queue.listPhotoQueueItems()) await queue.deletePhotoQueueItem(item.id);
      const created=await queue.savePhotoQueueItem({
        id:'blocked-403',job_id:'job403',uploaded_by:'owner403',
        local_file:new File(['photo403'],'403.jpg',{type:'image/jpeg'}),
        upload_status:'error',upload_error:'403 permission denied',file_fingerprint:'hash',
        upload_key:'blocked403',planned_storage_path:'job403/nameplates/blocked403.jpg',
        photo_kind:'nameplate',device_index:1,unit_ref:'jz',
      });
      if (!created) throw new Error('Seed failed');
      let networkUploads=0;
      const supabase={
        from(){const q={
          select(){return this},eq(){return this},
          async maybeSingle(){return {data:null,error:null}},
        };return q;},
        auth:{async getUser(){return {data:{user:{id:'owner403'}},error:null};}},
        storage:{from(){return {async upload(){networkUploads++;return {data:null,error:null};}}}},
      };
      const result=await photos.resumePersistedPhotoUploads({
        supabase,profile:{id:'owner403'},supabaseUrl:'https://example.invalid',
        setJobs:()=>{},setSelectedJob:()=>{},onQueueIdle:()=>{},
      });
      const current=(await queue.listPhotoQueueItems()).find(x=>x.id==='blocked-403');
      return {networkUploads,status:current?.upload_status,bytes:await current?.local_file.text(),result};
    });
    expect(result.networkUploads).toBe(0);
    expect(result.status).toBe('error');
    expect(result.bytes).toBe('photo403');
  });
});
