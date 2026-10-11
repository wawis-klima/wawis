import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';
const { defaultBrowserType: _ignored, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);
async function swipe(page, frame, dx, dy=0) {
  const b = await frame.boundingBox();
  const x = b.x+b.width*0.65, y=b.y+b.height/2;
  await page.mouse.move(x,y); await page.mouse.down();
  await page.mouse.move(x+dx,y+dy,{steps:10}); await page.mouse.up();
}
async function open(page, who) {
  await resetMockSupabase(page); await loginWithoutReset(page,who);
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  const card = page.locator('.mobileJobCard').filter({hasText:'Klient Testowy B'}).first();
  await expect(card).toBeVisible();
  return card.locator('xpath=..').locator('xpath=..');
}
test.describe('@mobile 13.04 swipe montaży',()=>{
  for(const [role,who] of [['worker',WORKER],['admin',ADMIN]]) {
    test(role+' reveals actions and still expands on tap',async({page})=>{
      const frame=await open(page,who);
      await swipe(page,frame,-105);
      await expect(frame).toHaveClass(/isOpen/);
      await expect(page.locator('.mobileInlineJobDetails')).toHaveCount(0);
      await expect(frame.getByRole('link',{name:'Zadzwoń do klienta'})).toHaveAttribute('href',/^tel:/);
      await expect(frame.getByRole('link',{name:'Nawiguj do klienta'})).toHaveAttribute('href',/google\.com\/maps\/search/);
      await page.waitForTimeout(240); // settle the 180 ms swipe animation before the hit-test
      const geometry=await frame.evaluate(el=>{const a=el.querySelector('.wawisSwipeAction.isPhone'),r=a.getBoundingClientRect();return {hit:a.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
      expect(geometry.hit).toBe(true);
      expect(geometry.overflow).toBeLessThanOrEqual(2);
      await swipe(page,frame,125);
      await expect(frame).not.toHaveClass(/isOpen/);
      await frame.locator('.mobileJobCardButton').click();
      await expect(page.locator('.mobileInlineJobDetails')).toBeVisible();
    });
  }
  test('vertical motion does not open swipe or mutate job',async({page})=>{
    const frame=await open(page,WORKER);
    const before=await page.evaluate(()=>JSON.stringify(window.__KLIMA_MOCK_SUPABASE__.getStore().jobs));
    await swipe(page,frame,-10,95);
    await expect(frame).not.toHaveClass(/isOpen/);
    await swipe(page,frame,-105);
    await expect(frame).toHaveClass(/isOpen/);
    await page.locator('.statusActionButton[title="Nowe"]').click();
    await expect(page.locator('.wawisSwipeFrame.isOpen')).toHaveCount(0);
    const after=await page.evaluate(()=>JSON.stringify(window.__KLIMA_MOCK_SUPABASE__.getStore().jobs));
    expect(after).toBe(before);
  });
  test('empty phone and address produce disabled actions, not broken links', async ({page})=>{
    await resetMockSupabase(page);
    await page.evaluate(()=>{
      const store=window.__KLIMA_MOCK_SUPABASE__.getStore();
      const job=store.jobs.find(j=>j.id==='mock-job-002');
      job.phone='';job.city='';job.street='';job.location='';
      localStorage.setItem('klima-mock-supabase-store-v3',JSON.stringify(store));
    });
    await loginWithoutReset(page,ADMIN);
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    const card=page.locator('.mobileJobCard').filter({hasText:'Klient Testowy B'}).first();
    const frame=card.locator('xpath=..').locator('xpath=..');
    await swipe(page,frame,-104);
    await expect(frame).toHaveClass(/isOpen/);
    await expect(frame.getByRole('link')).toHaveCount(0);
    await expect(frame.getByText('Brak tel.')).toBeVisible();
    await expect(frame.getByText('Brak adresu')).toBeVisible();
  });
});
