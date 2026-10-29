import fs from 'node:fs';
import path from 'node:path';
import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, login, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const artifactsDir = path.resolve(process.cwd(), 'visual-artifacts');

function ensureArtifactsDir() {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

async function getPageVisualHealth(page) {
  return page.evaluate(() => {
    const bodyStyle = getComputedStyle(document.body);
    const root = document.documentElement;
    const textNodes = [...document.querySelectorAll('h1,h2,h3,button,strong,label')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      })
      .slice(0, 160);
    const extremeText = textNodes.filter((element) => {
      const size = Number.parseFloat(getComputedStyle(element).fontSize || '0');
      return size > 72 || size < 8;
    }).map((element) => ({ text: element.textContent?.trim().slice(0, 60), size: getComputedStyle(element).fontSize }));

    return {
      fontFamily: bodyStyle.fontFamily,
      bodyFontSize: Number.parseFloat(bodyStyle.fontSize || '0'),
      horizontalOverflow: root.scrollWidth - root.clientWidth,
      extremeText,
      rootWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth,
    };
  });
}

// A visible element in the DOM can still be covered by an overlay (OCR in
// WAWIS 12.85). Test hit targets in the actual rendered desktop/mobile surfaces.
async function getVisibleActionHealth(page, surfaceSelector) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) return { found: false, checked: 0, blocked: [] };
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const candidates = [...root.querySelectorAll('button, input, select, textarea, [role="button"]')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width >= 12 && rect.height >= 12
          && rect.left < viewportWidth && rect.right > 0
          && rect.top < viewportHeight && rect.bottom > 0
          && style.display !== 'none' && style.visibility !== 'hidden'
          && style.opacity !== '0' && style.pointerEvents !== 'none'
          && !element.disabled && element.getAttribute('aria-hidden') !== 'true';
      }).slice(0, 80);
    function withinVisibleClips(element, x, y) {
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const bounds = ancestor.getBoundingClientRect();
        if (/auto|scroll|hidden|clip/.test(style.overflowX) && (x < bounds.left || x > bounds.right)) return false;
        if (/auto|scroll|hidden|clip/.test(style.overflowY) && (y < bounds.top || y > bounds.bottom)) return false;
      }
      return true;
    }
    const blocked = [];
    let checked = 0;
    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      // A scrollable table can have controls in the DOM but clipped outside
      // the visible scrollport. Those are not actionable until the user scrolls.
      const fractions = [[.5, .5], [.25, .25], [.75, .25], [.25, .75], [.75, .75]];
      const points = fractions.map(([fx, fy]) => ({
        x: rect.left + rect.width * fx,
        y: rect.top + rect.height * fy,
      })).filter(({ x, y }) =>
        x >= 0 && y >= 0 && x < viewportWidth && y < viewportHeight
        && withinVisibleClips(element, x, y)
      );
      if (!points.length) continue;
      checked += 1;
      const hittable = points.some(({ x, y }) => {
        const topmost = document.elementFromPoint(x, y);
        return topmost && (topmost === element || element.contains(topmost));
      });
      if (!hittable) {
        blocked.push({
          label: String(element.getAttribute('aria-label') || element.textContent || element.tagName).trim().slice(0, 60),
          reason: 'no unobstructed hit target inside visible scrollport',
        });
      }
    }
    return { found: true, checked, blocked };
  }, surfaceSelector);
}

test.describe('release visual desktop', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('pełna aplikacja desktopowa ma załadowany CSS, poprawne kolumny i zapisuje screenshot kontrolny', async ({ page }) => {
    ensureArtifactsDir();
    await login(page, ADMIN);
    await page.getByRole('button', { name: /^Montaże$/ }).click();
    await page.getByRole('button', { name: /W trakcie:/ }).click();
    await page.getByText('Klient Testowy B', { exact: true }).click();
    await expect(page.locator('.adminDesktopShell')).toBeVisible();
    await expect(page.locator('.desktopJobsListPane')).toBeVisible();
    await expect(page.locator('.desktopJobsDetailsPane')).toBeVisible();

    const layout = await page.evaluate(() => {
      const shell = document.querySelector('.adminDesktopShell')?.getBoundingClientRect();
      const list = document.querySelector('.desktopJobsListPane')?.getBoundingClientRect();
      const details = document.querySelector('.desktopJobsDetailsPane')?.getBoundingClientRect();
      return {
        shellVisible: Boolean(shell?.width && shell?.height),
        listVisible: Boolean(list?.width && list?.height),
        detailsVisible: Boolean(details?.width && details?.height),
        columnsSeparated: Boolean(list && details && details.left >= list.right - 2),
        detailsInsideViewport: Boolean(details && details.right <= document.documentElement.clientWidth + 1),
      };
    });
    expect(layout).toEqual({
      shellVisible: true,
      listVisible: true,
      detailsVisible: true,
      columnsSeparated: true,
      detailsInsideViewport: true,
    });

    const health = await getPageVisualHealth(page);
    expect(health.fontFamily.toLowerCase()).not.toContain('times new roman');
    expect(health.bodyFontSize).toBeGreaterThanOrEqual(12);
    expect(health.horizontalOverflow).toBeLessThanOrEqual(2);
    expect(health.extremeText).toEqual([]);

    const desktopActions = await getVisibleActionHealth(page, '.desktopJobsListPane');
    expect(desktopActions.found).toBe(true);
    expect(desktopActions.checked).toBeGreaterThan(0);
    expect(desktopActions.blocked).toEqual([]);

    await page.screenshot({ path: path.join(artifactsDir, 'desktop-release-visual.png'), fullPage: true });
  });

  test('panel Diagnostyka jest dostępny i raport nie deklaruje danych klientów', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: 'Diagnostyka' }).click();
    await expect(page.getByRole('heading', { name: 'Diagnostyka', exact: true })).toBeVisible();
    await expect(page.getByText('Raport bez danych klientów')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pobierz raport diagnostyczny' })).toBeVisible();
  });
});

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];

test.describe('@mobile release visual iPhone', () => {
  test.use(iphone14);

  async function inspectMenuRow(page, expectedLabels) {
    const menu = page.locator('.moduleSwitcherMobile');
    await expect(menu).toBeVisible();
    const info = await menu.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const buttons = [...element.querySelectorAll('button')];
      const data = buttons.map(button => {
        const label = button.querySelector('.moduleSwitcherLabel');
        const b = button.getBoundingClientRect();
        const t = label?.getBoundingClientRect();
        const fontSize = Number.parseFloat(getComputedStyle(button).fontSize);
        const cx = b.left + b.width / 2;
        const cy = b.top + b.height / 2;
        const target = document.elementFromPoint(cx, cy);
        return {
          text: label?.textContent?.trim(),
          buttonLeft: b.left,
          buttonRight: b.right,
          buttonTop: b.top,
          buttonHeight: b.height,
          labelLeft: t?.left,
          labelRight: t?.right,
          fontSize,
          transform: label ? getComputedStyle(label).transform : null,
          overflow: getComputedStyle(button).overflowX,
          textOverflow: getComputedStyle(button).textOverflow,
          whiteSpace: getComputedStyle(button).whiteSpace,
          clickable: target === button || button.contains(target),
        };
      });
      return {
        labels: data.map(item => item.text),
        menuLeft: bounds.left,
        menuRight: bounds.right,
        viewportWidth: document.documentElement.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        data,
      };
    });
    expect(info.labels).toEqual(expectedLabels);
    expect(info.pageOverflow).toBeLessThanOrEqual(2);
    expect(info.menuLeft).toBeGreaterThanOrEqual(-1);
    expect(info.menuRight).toBeLessThanOrEqual(info.viewportWidth + 1);
    for (const item of info.data) {
      expect(item.buttonTop).toBeCloseTo(info.data[0].buttonTop, 0);
      expect(item.buttonHeight).toBeGreaterThanOrEqual(43);
      expect(item.fontSize).toBeGreaterThanOrEqual(10);
      expect(item.transform).toBe('none');
      expect(item.buttonLeft).toBeGreaterThanOrEqual(info.menuLeft - 1);
      expect(item.buttonRight).toBeLessThanOrEqual(info.menuRight + 1);
      expect(item.labelLeft).toBeGreaterThanOrEqual(item.buttonLeft - .5);
      expect(item.labelRight).toBeLessThanOrEqual(item.buttonRight + .5);
      expect(item.textOverflow).not.toBe('ellipsis');
      expect(item.whiteSpace).toBe('nowrap');
      expect(item.clickable).toBe(true);
    }
    return info;
  }

  test('13.91: data i godzina przeglądu mieszczą się w dwóch kolumnach na iPhonie', async ({ page }) => {
    await login(page, ADMIN);
    await page.locator('.moduleSwitcherMobile button[data-module="devices"]').click();
    await expect(page.locator('.serviceAdminPage')).toBeVisible();
    await page.locator('.serviceAdminPage').evaluate(el => {
      const card=document.createElement('div');
      card.id='service-fields-geometry';
      card.className='card serviceAdminCard';
      card.innerHTML='<div class="serviceAdminTwoFields serviceAdminDateTimeFields"><label>Data<input class="input" type="date" value="2026-10-29"></label><label>Godzina<input class="input" type="time" value="07:02"></label></div>';
      el.appendChild(card);
    });
    for(const width of [320,360,375,390,430]){
      await page.setViewportSize({width,height:780});
      const result=await page.locator('#service-fields-geometry').evaluate(card=>{
        const row=card.querySelector('.serviceAdminDateTimeFields');
        const bounds=row.getBoundingClientRect();
        const cells=[...row.querySelectorAll('label')].map(label=>{
          const b=label.getBoundingClientRect(),i=label.querySelector('input').getBoundingClientRect();
          return {left:b.left,right:b.right,inputLeft:i.left,inputRight:i.right,font:parseFloat(getComputedStyle(label.querySelector('input')).fontSize)};
        });
        return {left:bounds.left,right:bounds.right,viewport:document.documentElement.clientWidth,cells};
      });
      expect(result.left).toBeGreaterThanOrEqual(0);
      expect(result.right).toBeLessThanOrEqual(result.viewport+1);
      expect(result.cells).toHaveLength(2);
      for(const cell of result.cells){
        expect(cell.inputLeft).toBeGreaterThanOrEqual(cell.left-1);
        expect(cell.inputRight).toBeLessThanOrEqual(cell.right+1);
        expect(cell.font).toBeLessThanOrEqual(14.1);
      }
    }
  });

  test('administrator ma pięć pełnych nazw przycisków w jednym rzędzie na wąskim iPhonie', async ({ page }) => {
    await login(page, ADMIN);
    const names = ['Montaże','Kontrahenci','Paliwo','Urządzenia','Cennik'];
    for (const width of [320, 360, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 780 });
      const menu = await inspectMenuRow(page, names);
      expect(menu.data[0].fontSize).toBeGreaterThanOrEqual(width >= 390 ? 13 : 11);
    }
    await page.locator('.moduleSwitcherMobile button[data-module="devices"]').click();
    await expect(page.locator('.serviceAdminPage')).toBeVisible();
    await expect(page.locator('#service-device-search')).toBeVisible();
    await expect(page.locator('.serviceAdminClientRow')).toHaveCount(0);
    await page.locator('.moduleSwitcherMobile button[data-module="pricelist"]').click();
    await expect(page.locator('.wawisPricelist')).toBeVisible();
    await expect(page.locator('.wawisPricelistIntro')).toHaveCount(0);
    await expect(page.locator('.wawisPricelistSearch')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Cennik', exact: true })).toHaveCount(0);
    await expect(page.getByText(/36 pozycji z cennika WAWIS/)).toBeVisible();
    const allGroups = page.locator('.wawisPricelistGroup');
    await expect(allGroups).toHaveCount(10);
    await expect(page.locator('.wawisPricelistGroup[open]')).toHaveCount(0);
    // Dwie długie nazwy Hiro skrócone dokładnie tak samo na każdym mobilnym rozmiarze.
    await expect(page.locator('.wawisPricelistCompactMulti')).toHaveText([
      'Rotenso Hiro Multi Jedn. Zew.',
      'Rotenso Hiro Imoto Multi Jedn. Wew.',
    ]);
    // Kompaktowość bez obcinania nazw i zmniejszania stref dotykowych poniżej 44 px.
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const compact = await allGroups.evaluateAll((nodes) => {
        const headers = nodes.map((node) => node.querySelector('summary'));
        const rows = headers.map((header) => {
          const rect = header.getBoundingClientRect();
          const label = header.querySelector('span:first-child');
          const labelRect = label.getBoundingClientRect();
          const marker = header.querySelector('.wawisPricelistCount').getBoundingClientRect();
          return {
            top: rect.top,
            height: rect.height,
            minHeightStyle: parseFloat(getComputedStyle(header).minHeight),
            paddingTopStyle: parseFloat(getComputedStyle(header).paddingTop),
            labelHeight: labelRect.height,
            labelScrollHeight: label.scrollHeight,
            labelClientHeight: label.clientHeight,
            labelScrollWidth: label.scrollWidth,
            labelClientWidth: label.clientWidth,
            fontSize: parseFloat(getComputedStyle(header).fontSize),
            markerRight: marker.right,
            headerRight: rect.right,
          };
        });
        const style = getComputedStyle(nodes[0].parentElement);
        const gaps = rows.slice(1).map((row, index) => row.top - (rows[index].top + rows[index].height) - 2);
        return {
          count: rows.length,
          maxGap: Math.max(...gaps),
          declaredGap: parseFloat(style.rowGap || style.gap),
          maxSingleLine: Math.max(...rows.filter(row => row.labelHeight < 22).map(row => row.height)),
          maxHeight: Math.max(...rows.map(row => row.height)),
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          rows,
        };
      });
      const labels = await page.locator('.wawisPricelistCompactMulti').evaluateAll((nodes) =>
        nodes.map(node => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return {
            label: node.textContent.trim(),
            height: rect.height,
            lineHeight: parseFloat(style.lineHeight),
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
            whiteSpace: style.whiteSpace,
          };
        })
      );
      expect(labels).toHaveLength(2);
      for (const label of labels) {
        expect(label.whiteSpace).toBe('nowrap');
        expect(label.height).toBeLessThanOrEqual(label.lineHeight + 1);
        expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth + 1);
      }
      expect(compact.count).toBe(10);
      expect(compact.declaredGap).toBeLessThanOrEqual(7);
      expect(compact.maxGap).toBeLessThanOrEqual(8);
      expect(compact.maxSingleLine).toBeLessThanOrEqual(55);
      expect(compact.maxHeight).toBeLessThanOrEqual(85);
      expect(compact.pageOverflow).toBeLessThanOrEqual(2);
      for (const row of compact.rows) {
        expect(row.height).toBeGreaterThanOrEqual(44);
        expect(row.minHeightStyle).toBe(44);
        expect(row.paddingTopStyle).toBe(7);
        expect(row.fontSize).toBeGreaterThanOrEqual(13);
        expect(row.labelScrollWidth).toBeLessThanOrEqual(row.labelClientWidth + 1);
        expect(row.labelScrollHeight).toBeLessThanOrEqual(row.labelClientHeight + 1);
        expect(row.markerRight).toBeLessThanOrEqual(row.headerRight);
      }
    }
    const ukura = allGroups.filter({ has: page.locator('summary', { hasText: 'Rotenso UKURA H' }) });
    const imoto = allGroups.filter({ has: page.locator('summary', { hasText: 'Rotenso IMOTO' }) });
    // UKURA otwarta po kliknięciu.
    await ukura.locator('summary').click();
    await expect(ukura).toHaveAttribute('open', '');
    await expect(page.locator('.wawisPricelistGroup[open]')).toHaveCount(1);
    await expect(page.getByRole('row', { name: /2,6 kW 65–80 m³ 2.*150 zł 2.*322 zł/ })).toBeVisible();
    // Rozwinięcie IMOTO automatycznie zwija UKURA.
    await imoto.locator('summary').click();
    await expect(imoto).toHaveAttribute('open', '');
    await expect(ukura).not.toHaveAttribute('open', '');
    await expect(page.locator('.wawisPricelistGroup[open]')).toHaveCount(1);
    // Ponowne kliknięcie tej samej grupy ją zamyka.
    await imoto.locator('summary').click();
    await expect(page.locator('.wawisPricelistGroup[open]')).toHaveCount(0);
    // Brak wyszukiwarki: po zamknięciu IMOTO nadal widać wszystkie modele.
    await expect(page.locator('.wawisPricelistGroup')).toHaveCount(10);
    await expect(page.locator('.wawisPricelistGroup[open]')).toHaveCount(0);
    const hiroOutdoor = page.locator('.wawisPricelistGroup').filter({ has: page.locator('summary', { hasText: 'Rotenso Hiro Multi Jedn. Zew.' }) });
    await hiroOutdoor.locator('summary').click();
    await expect(page.getByText('Liczba jednostek')).toBeVisible();
    await expect(page.getByText('5 JW', {exact: true})).toBeVisible();
    await inspectMenuRow(page,names);
    await page.locator('.moduleSwitcherMobile button[data-module="jobs"]').click();
    await expect(page.locator('.moduleSwitcherMobile button[data-module="jobs"]')).toHaveClass(/active/);
    await expect(page.locator('.statusActionButton[title="Zakończone"]')).toBeVisible();
  });

  test('pracownik ma trzy pełne nazwy przycisków i dostęp do cennika, bez Kontrahentów', async ({ page }) => {
    await login(page, WORKER);
    const names = ['Montaże','Paliwo','Cennik'];
    for (const width of [320,375,390]) {
      await page.setViewportSize({ width, height: 780 });
      await inspectMenuRow(page,names);
    }
    await page.locator('.moduleSwitcherMobile button[data-module="pricelist"]').click();
    await expect(page.locator('.wawisPricelist')).toBeVisible();
    await expect(page.locator('.wawisPricelistIntro')).toHaveCount(0);
    await expect(page.locator('.wawisPricelistSearch')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Cennik', exact: true })).toHaveCount(0);
    await expect(page.getByText(/36 pozycji z cennika WAWIS/)).toBeVisible();
    await expect(page.locator('.wawisPricelistGroup[open]')).toHaveCount(0);
    await inspectMenuRow(page,names);
  });

  test('pełna aplikacja mobilna ma załadowany CSS, nie wychodzi poza ekran i zapisuje screenshot kontrolny', async ({ page }) => {
    ensureArtifactsDir();
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);
    await expect(page.locator('.mobileHeaderV2')).toBeVisible();
    const versionDiagnostics = page.getByRole('button', { name: /^Wersja aplikacji \d+\.\d{2} — otwórz diagnostykę$/ });
    await expect(versionDiagnostics).toBeVisible();
    await expect(versionDiagnostics).toHaveAttribute('aria-expanded', 'false');
    await versionDiagnostics.click();
    await expect(versionDiagnostics).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('heading', { name: 'Diagnostyka mobilna' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pobierz raport diagnostyczny' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Wyślij test push' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Wróć do montaży' }).click();
    await expect(versionDiagnostics).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.statusActionButton[title="Zakończone"]')).toBeVisible();
    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();
    await expect(page.locator('.workerReadOnlyNote')).toHaveText('Zakończone');
    await page.locator('.protocolTestButton').click();
    await expect(page.getByRole('heading', { name: 'Protokół klienta' })).toBeVisible();
    await expect(page.locator('.protocolTestVersionStep')).toHaveCount(0);
    await expect(page.getByText(/Wersja testowa/i)).toHaveCount(0);

    const health = await getPageVisualHealth(page);
    expect(health.fontFamily.toLowerCase()).not.toContain('times new roman');
    expect(health.bodyFontSize).toBeGreaterThanOrEqual(12);
    expect(health.horizontalOverflow).toBeLessThanOrEqual(2);
    expect(health.extremeText).toEqual([]);

    const mobileGeometry = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const visibleCards = [...document.querySelectorAll('.card,.mobileJobCard,.premiumCard')]
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const protocol = document.querySelector('.mobileProtocolWizard');
      const protocolRect = protocol?.getBoundingClientRect();
      const protocolStyle = protocol ? getComputedStyle(protocol) : null;
      return {
        cardsInsideViewport: visibleCards.every((rect) => rect.left >= -2 && rect.right <= viewportWidth + 2),
        actionButtonsInsideViewport: [...document.querySelectorAll('.mobileHeaderActions button')]
          .map((element) => element.getBoundingClientRect())
          .every((rect) => rect.left >= 0 && rect.right <= viewportWidth),
        protocolVisible: Boolean(protocolRect?.width && protocolRect?.height),
        protocolInsideViewport: Boolean(
          protocolRect
          && protocolRect.left >= -2
          && protocolRect.right <= viewportWidth + 2
          && protocolRect.top >= -2
          && protocolRect.bottom <= viewportHeight + 2
        ),
        protocolDisplay: protocolStyle?.display,
        protocolBackground: protocolStyle?.backgroundColor,
        protocolTextAlignedLeft: protocolStyle?.textAlign === 'left' || protocolStyle?.textAlign === 'start',
      };
    });
    expect(mobileGeometry).toEqual({
      cardsInsideViewport: true,
      actionButtonsInsideViewport: true,
      protocolVisible: true,
      protocolInsideViewport: true,
      protocolDisplay: 'flex',
      protocolBackground: 'rgb(255, 255, 255)',
      protocolTextAlignedLeft: true,
    });

    const mobileActions = await getVisibleActionHealth(page, '.mobileProtocolWizard');
    expect(mobileActions.found).toBe(true);
    expect(mobileActions.checked).toBeGreaterThan(0);
    expect(mobileActions.blocked).toEqual([]);

    await page.screenshot({ path: path.join(artifactsDir, 'mobile-release-visual.png'), fullPage: true });
  });
});
