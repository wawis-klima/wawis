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

test.describe('release visual desktop', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('pełna aplikacja desktopowa ma załadowany CSS, poprawne kolumny i zapisuje screenshot kontrolny', async ({ page }) => {
    ensureArtifactsDir();
    await login(page, ADMIN);
    await page.getByRole('button', { name: /Montaże/ }).click();
    await page.getByText('Klient Testowy A', { exact: true }).click();
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

    await page.screenshot({ path: path.join(artifactsDir, 'desktop-release-visual.png'), fullPage: true });
  });

  test('panel Diagnostyka jest dostępny i raport nie deklaruje danych klientów', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: 'Diagnostyka' }).click();
    await expect(page.getByRole('heading', { name: 'Diagnostyka' })).toBeVisible();
    await expect(page.getByText('Raport bez danych klientów')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pobierz raport diagnostyczny' })).toBeVisible();
  });
});

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];

test.describe('@mobile release visual iPhone', () => {
  test.use(iphone14);

  test('pełna aplikacja mobilna ma załadowany CSS, nie wychodzi poza ekran i zapisuje screenshot kontrolny', async ({ page }) => {
    ensureArtifactsDir();
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);
    await expect(page.locator('.mobileHeaderV2')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pobierz raport diagnostyczny' })).toBeVisible();
    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();
    await expect(page.getByText('Zakończone · tylko podgląd')).toBeVisible();
    await page.locator('.protocolTestButton').click();
    await expect(page.getByRole('heading', { name: 'Protokół klienta' })).toBeVisible();
    await expect(page.getByText(/WERSJA TESTOWA · 9\./)).toBeVisible();

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

    await page.screenshot({ path: path.join(artifactsDir, 'mobile-release-visual.png'), fullPage: true });
  });
});
