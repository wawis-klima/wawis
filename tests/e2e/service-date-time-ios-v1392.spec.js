import { devices, expect, test } from '@playwright/test';
import { ADMIN, login } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

test.describe('@mobile WebKit Safari — serwis data i godzina', () => {
  test('13.92: czytelna data i godzina wewnątrz kompaktowych pól Safari', async ({ page }) => {
    await login(page, ADMIN);
    await page.locator('.moduleSwitcherMobile button[data-module="devices"]').click();
    await expect(page.locator('.serviceAdminPage')).toBeVisible();
    // Ten sam komponent i style co w obu formularzach, w tym widoczny tekst
    // niezależny od natywnego (często ucinanego) widgetu Safari.
    await page.locator('.serviceAdminPage').evaluate(element => {
      const card=document.createElement('div');
      card.className='card serviceAdminCard';
      card.id='service-picker-visual-check';
      card.innerHTML='<div class="serviceAdminTwoFields serviceAdminDateTimeFields">'
        +'<label>Data<span class="serviceAdminPickerSurface"><span class="serviceAdminPickerValue" aria-hidden="true">29.10.2026</span><input class="serviceAdminNativePicker" type="date" aria-label="Data" value="2026-10-29"></span></label>'
        +'<label>Godzina<span class="serviceAdminPickerSurface"><span class="serviceAdminPickerValue" aria-hidden="true">07:25</span><input class="serviceAdminNativePicker" type="time" aria-label="Godzina" value="07:25"></span></label>'
        +'</div>';
      element.appendChild(card);
    });
    for (const width of [320,360,375,390,430]) {
      await page.setViewportSize({width,height:780});
      const result=await page.locator('#service-picker-visual-check').evaluate(card=>{
        const boxes=[...card.querySelectorAll('.serviceAdminPickerSurface')];
        const row=card.querySelector('.serviceAdminDateTimeFields').getBoundingClientRect();
        return {viewport:document.documentElement.clientWidth,rowRight:row.right,
          boxes:boxes.map(box=>{
            const b=box.getBoundingClientRect();
            const value=box.querySelector('.serviceAdminPickerValue');
            const t=value.getBoundingClientRect();
            const input=box.querySelector('input');
            const i=input.getBoundingClientRect();
            return {
              text:value.textContent,boxLeft:b.left,boxRight:b.right,boxY:b.y,boxHeight:b.height,
              textLeft:t.left,textRight:t.right,textMidY:t.y+t.height/2,
              scrollWidth:value.scrollWidth,clientWidth:value.clientWidth,
              inputLeft:i.left,inputRight:i.right,inputHeight:i.height,
              opacity:getComputedStyle(input).opacity
            };
          })};
      });
      expect(result.rowRight).toBeLessThanOrEqual(result.viewport+1);
      expect(result.boxes.map(x=>x.text)).toEqual(['29.10.2026','07:25']);
      for(const box of result.boxes) {
        expect(box.boxHeight).toBeGreaterThanOrEqual(44);
        expect(box.boxHeight).toBeLessThanOrEqual(48);
        expect(box.textLeft).toBeGreaterThanOrEqual(box.boxLeft+1);
        expect(box.textRight).toBeLessThanOrEqual(box.boxRight-1);
        expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth+1);
        expect(Math.abs(box.textMidY-(box.boxY+box.boxHeight/2))).toBeLessThanOrEqual(1);
        expect(box.inputLeft).toBeGreaterThanOrEqual(box.boxLeft-1);
        expect(box.inputRight).toBeLessThanOrEqual(box.boxRight+1);
        expect(box.inputHeight).toBeGreaterThanOrEqual(44);
        expect(box.opacity).toBe('0');
      }
    }
    const date=page.locator('#service-picker-visual-check input[type=date]');
    const time=page.locator('#service-picker-visual-check input[type=time]');
    await date.fill('2026-11-03');
    await time.fill('13:45');
    await expect(date).toHaveValue('2026-11-03');
    await expect(time).toHaveValue('13:45');
  });

  test('14.03: karty zdjęć serwisu jak w montażach — pełna data, inicjały, klikalne Usuń', async ({ page }) => {
    await login(page, ADMIN);
    await page.locator('.moduleSwitcherMobile button[data-module="devices"]').click();
    await expect(page.locator('.serviceAdminPage')).toBeVisible();
    const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await page.locator('.serviceAdminPage').evaluate((element, src) => {
      const card = document.createElement('div');
      card.className = 'card serviceAdminCard';
      card.id = 'service-photo-visual-check';
      // 14.03: dokładnie struktura kart z montaży (JobDetailsPanel): wrapper, inicjały, data, „Usuń”.
      const one = i => '<div class="thumbCard"><button type="button" class="thumbBtn desktopThumbBtn" aria-label="Powiększ zdjęcie ' + i + '">'
        + '<img src="' + src + '" class="thumb desktopThumb" alt="Zdjęcie ' + i + '">'
        + '<span class="photoUploaderBadge">PW</span></button>'
        + '<div class="photoMeta"><span class="photoMetaText photoDateMeta">31.10.26</span><span class="photoMetaText photoInstallerMeta">PW</span></div>'
        + '<div class="photoQueueActions"><button type="button" class="btn premiumActionBtn premiumDangerBtn photoDeleteBtn compactDangerBtn">Usuń</button></div></div>';
      card.innerHTML = '<div class="mobileInlineJobDetails serviceAdminPhotosV1403"><div class="thumbGrid">' + one(1) + one(2) + one(3) + '</div></div>';
      element.appendChild(card);
    }, pixel);
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 780 });
      await page.waitForFunction(w => window.innerWidth === w, width, { timeout: 5000 });
      const r = await page.locator('#service-photo-visual-check').evaluate(card => {
        const vw = document.documentElement.clientWidth;
        const cardBox = card.getBoundingClientRect();
        return {
          vw, pageOverflow: document.documentElement.scrollWidth - vw, cardRight: cardBox.right,
          items: [...card.querySelectorAll('.thumbCard')].map(c => {
            const btn = c.querySelector('.thumbBtn').getBoundingClientRect();
            const del = c.querySelector('.photoDeleteBtn').getBoundingClientRect();
            const img = c.querySelector('img').getBoundingClientRect();
            const hit = (b, el) => { const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return t === el || el.contains(t); };
            const date = c.querySelector('.photoDateMeta');
            const badge = c.querySelector('.photoUploaderBadge');
            const badgeBox = badge.getBoundingClientRect();
            return { right: c.getBoundingClientRect().right, btnH: btn.height, imgW: img.width, imgH: img.height,
              delH: del.height, thumbHit: hit(btn, c.querySelector('.thumbBtn')), delHit: hit(del, c.querySelector('.photoDeleteBtn')),
              dateFull: date.scrollWidth <= date.clientWidth + 1 && date.getBoundingClientRect().right <= c.getBoundingClientRect().right + 1,
              badgeVisible: getComputedStyle(badge).display !== 'none' && badgeBox.width > 0
                && badgeBox.right <= btn.right + 1 && badgeBox.bottom <= btn.bottom + 1 };
          }),
        };
      });
      expect(r.pageOverflow).toBeLessThanOrEqual(2);
      for (const item of r.items) {
        expect(item.right).toBeLessThanOrEqual(r.cardRight + 1);
        expect(item.btnH).toBeGreaterThanOrEqual(44);
        expect(item.imgW).toBeGreaterThan(40);
        expect(item.imgH).toBeGreaterThan(40);
        expect(item.delH).toBeGreaterThanOrEqual(30);
        expect(item.thumbHit).toBe(true);
        expect(item.delHit).toBe(true);
        expect(item.dateFull).toBe(true);
        expect(item.badgeVisible).toBe(true);
      }
    }
  });
});
