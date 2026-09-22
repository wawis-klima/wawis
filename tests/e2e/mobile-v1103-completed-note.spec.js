import { devices, expect, test } from '@playwright/test';
import { ADMIN, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const STORE_KEY = 'klima-mock-supabase-store-v3';

test.use(iphone14);

async function seedAdminNotes(page) {
  await resetMockSupabase(page);
  await page.evaluate((storeKey) => {
    const api = window.__KLIMA_MOCK_SUPABASE__;
    const store = api.getStore();
    const completedJob = store.jobs.find((job) => job.id === 'mock-job-003');
    const activeJob = store.jobs.find((job) => job.id === 'mock-job-002');
    const unrealizedJob = store.jobs.find((job) => job.id === 'mock-job-001');
    completedJob.admin_note = 'Długi komentarz zakończonego montażu, który ma być domyślnie zwinięty.';
    activeJob.admin_note = 'Komentarz aktywnego montażu pozostaje od razu widoczny.';
    unrealizedJob.status = 'Niezrealizowane';
    store.photos = [
      ...store.photos,
      { id: 'photo-completed-1', job_id: completedJob.id, image_url: 'data:image/png;base64,iVBORw0KGgo=', uploaded_by: completedJob.created_by, created_at: '2026-04-22T10:20:00.000Z', photo_kind: '' },
      { id: 'photo-completed-2', job_id: completedJob.id, image_url: 'data:image/png;base64,iVBORw0KGgo=', uploaded_by: completedJob.created_by, created_at: '2026-04-22T10:21:00.000Z', photo_kind: '' },
      { id: 'photo-unrealized-1', job_id: unrealizedJob.id, image_url: 'data:image/png;base64,iVBORw0KGgo=', uploaded_by: unrealizedJob.created_by, created_at: '2026-04-20T08:35:00.000Z', photo_kind: '' },
    ];
    window.localStorage.setItem(storeKey, JSON.stringify(store));
  }, STORE_KEY);
}

test.describe('@mobile 11.03 zwarte dane i komentarz administratora', () => {
  test('zakończony montaż zwija komentarz, a aktywny pozostawia go otwarty', async ({ page }) => {
    await seedAdminNotes(page);
    await loginWithoutReset(page, ADMIN);

    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();

    const toggle = page.getByRole('button', { name: 'Rozwiń komentarz administratora' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('Długi komentarz zakończonego montażu, który ma być domyślnie zwinięty.', { exact: true })).toHaveCount(0);

    await toggle.click();
    await expect(page.getByRole('button', { name: 'Zwiń komentarz administratora' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Długi komentarz zakończonego montażu, który ma być domyślnie zwinięty.', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Zamknij', exact: true }).click();
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();
    await expect(page.locator('.adminNoteToggle')).toHaveCount(0);
    await expect(page.getByText('Komentarz aktywnego montażu pozostaje od razu widoczny.', { exact: true })).toBeVisible();
  });

  test('zdjęcia są domyślnie zwinięte w zakończonych i niezrealizowanych, a w aktywnym pozostają otwarte', async ({ page }) => {
    await seedAdminNotes(page);
    await loginWithoutReset(page, ADMIN);

    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();

    const completedToggle = page.getByRole('button', { name: 'Rozwiń zdjęcia' });
    await expect(completedToggle).toBeVisible();
    await expect(completedToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(completedToggle).toContainText('Zdjęcia (2)');
    await expect(page.locator('.thumbCard')).toHaveCount(0);

    await completedToggle.click();
    await expect(page.getByRole('button', { name: 'Zwiń zdjęcia' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.thumbCard')).toHaveCount(2);

    const firstPhotoCard = page.locator('.thumbCard').first();
    await firstPhotoCard.locator('.thumbBtn').click();
    await expect(page.locator('.previewOverlay')).toBeVisible();
    const lockedPreviewState = await page.evaluate(() => {
      const overlay = document.querySelector('.previewOverlay');
      const overlayStyle = overlay ? getComputedStyle(overlay) : null;
      return {
        bodyPosition: document.body.style.position,
        bodyOverflow: document.body.style.overflow,
        bodyTop: document.body.style.top,
        rootOverflow: document.documentElement.style.overflow,
        rootOverscroll: document.documentElement.style.overscrollBehavior,
        overlayTouchAction: overlayStyle?.touchAction || '',
        overlayOverscroll: overlayStyle?.overscrollBehavior || '',
      };
    });
    expect(lockedPreviewState.bodyPosition).toBe('fixed');
    expect(lockedPreviewState.bodyOverflow).toBe('hidden');
    expect(lockedPreviewState.rootOverflow).toBe('hidden');
    expect(lockedPreviewState.rootOverscroll).toBe('none');
    expect(lockedPreviewState.overlayTouchAction).toBe('none');
    expect(lockedPreviewState.overlayOverscroll).toBe('none');
    expect(lockedPreviewState.bodyTop).toMatch(/^-?\d+px$/);

    await page.mouse.wheel(0, 500);
    const bodyTopAfterWheel = await page.evaluate(() => document.body.style.top);
    expect(bodyTopAfterWheel).toBe(lockedPreviewState.bodyTop);

    await page.keyboard.press('Escape');
    await expect(page.locator('.previewOverlay')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.position)).not.toBe('fixed');


    const firstPhotoMeta = firstPhotoCard.locator('.photoMeta');
    await expect(firstPhotoMeta.locator('.photoDateMeta')).toHaveText('22.04.26');
    await expect(firstPhotoMeta.locator('.photoInstallerMeta')).toBeHidden();
    await expect(firstPhotoCard.locator('.photoUploaderBadge')).toHaveText('AT');

    const photoMetaGeometry = await firstPhotoCard.evaluate((card) => {
      const cardRect = card.getBoundingClientRect();
      const thumb = card.querySelector('.thumbBtn').getBoundingClientRect();
      const date = card.querySelector('.photoDateMeta').getBoundingClientRect();
      const badge = card.querySelector('.photoUploaderBadge').getBoundingClientRect();
      const dateStyle = getComputedStyle(card.querySelector('.photoDateMeta'));
      const installerStyle = getComputedStyle(card.querySelector('.photoInstallerMeta'));
      const badgeStyle = getComputedStyle(card.querySelector('.photoUploaderBadge'));
      return {
        cardLeft: cardRect.left,
        cardRight: cardRect.right,
        dateLeft: date.left,
        dateRight: date.right,
        badgeLeft: badge.left,
        badgeRight: badge.right,
        badgeBottomOffset: thumb.bottom - badge.bottom,
        badgeWidth: badge.width,
        badgeHeight: badge.height,
        badgeBackground: badgeStyle.backgroundColor,
        badgeColor: badgeStyle.color,
        badgeFontSize: badgeStyle.fontSize,
        dateOverflow: dateStyle.overflow,
        dateTextOverflow: dateStyle.textOverflow,
        installerDisplay: installerStyle.display,
      };
    });
    expect(photoMetaGeometry.dateLeft).toBeGreaterThanOrEqual(photoMetaGeometry.cardLeft - 1);
    expect(photoMetaGeometry.dateRight).toBeLessThanOrEqual(photoMetaGeometry.cardRight + 1);
    expect(photoMetaGeometry.badgeLeft).toBeGreaterThanOrEqual(photoMetaGeometry.cardLeft);
    expect(photoMetaGeometry.badgeRight).toBeLessThanOrEqual(photoMetaGeometry.cardRight + 1);
    expect(photoMetaGeometry.badgeBottomOffset).toBeGreaterThanOrEqual(7);
    expect(photoMetaGeometry.badgeWidth).toBeGreaterThanOrEqual(15);
    expect(photoMetaGeometry.badgeWidth).toBeLessThanOrEqual(21);
    expect(photoMetaGeometry.badgeHeight).toBeGreaterThanOrEqual(12);
    expect(photoMetaGeometry.badgeHeight).toBeLessThanOrEqual(14);
    expect(photoMetaGeometry.badgeBackground).toBe('rgb(255, 255, 255)');
    expect(photoMetaGeometry.badgeColor).toBe('rgb(17, 24, 39)');
    expect(photoMetaGeometry.badgeFontSize).toBe('5.5px');
    expect(photoMetaGeometry.dateOverflow).toBe('visible');
    expect(photoMetaGeometry.dateTextOverflow).toBe('clip');
    expect(photoMetaGeometry.installerDisplay).toBe('none');

    await page.getByRole('button', { name: 'Zamknij', exact: true }).click();
    await page.locator('.statusActionButton[title="Niezrealizowane"]').click();
    await page.getByText('Klient Testowy A', { exact: true }).click();

    const unrealizedToggle = page.getByRole('button', { name: 'Rozwiń zdjęcia' });
    await expect(unrealizedToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(unrealizedToggle).toContainText('Zdjęcia (1)');
    await expect(page.locator('.thumbCard')).toHaveCount(0);

    await page.getByRole('button', { name: 'Zamknij', exact: true }).click();
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();

    await expect(page.locator('.photosSectionToggle')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Zdjęcia' })).toBeVisible();
  });

  test('e-mail i telefon są wyśrodkowane, a cztery podstawowe wiersze są niższe', async ({ page }) => {
    await seedAdminNotes(page);
    await loginWithoutReset(page, ADMIN);
    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();

    await expect(page.locator('.contactEmailInfoItem .emailLink')).toBeVisible();
    await expect(page.locator('.contactPhoneInfoItem .phoneLink')).toBeVisible();
    await expect(page.locator('.contactAddressInfoItem .addressLink')).toBeVisible();

    const geometry = await page.locator('.mobileInlineJobDetails').evaluate((root) => {
      const centerDifference = (rowSelector, linkSelector) => {
        const value = root.querySelector(`${rowSelector} .infoValue`).getBoundingClientRect();
        const link = root.querySelector(linkSelector).getBoundingClientRect();
        return Math.abs((value.left + value.width / 2) - (link.left + link.width / 2));
      };
      const rowHeight = (selector) => root.querySelector(selector).getBoundingClientRect().height;
      return {
        emailCenterDifference: centerDifference('.contactEmailInfoItem', '.contactEmailInfoItem .emailLink'),
        phoneCenterDifference: centerDifference('.contactPhoneInfoItem', '.contactPhoneInfoItem .phoneLink'),
        rowHeights: [
          rowHeight('.contactEmailInfoItem'),
          rowHeight('.contactPhoneInfoItem'),
          rowHeight('.contactAddressInfoItem'),
          rowHeight('.jobDateInfoItemV995'),
        ],
      };
    });

    expect(geometry.emailCenterDifference).toBeLessThanOrEqual(2);
    expect(geometry.phoneCenterDifference).toBeLessThanOrEqual(2);
    expect(Math.max(...geometry.rowHeights)).toBeLessThanOrEqual(32);
  });
});
