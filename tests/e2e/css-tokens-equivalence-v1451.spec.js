// WAWIS 14.51+ — paleta kolorów (zmienne --wx-*) bez zmiany wyglądu: dowód w przeglądarce.
// Dla każdego przekonwertowanego pliku CSS na żywym ekranie aplikacji:
//   1. zapisujemy pełny styl obliczony (getComputedStyle, wszystkie właściwości, także ::before/::after)
//      każdego elementu ekranu;
//   2. wyłączamy przekonwertowany arkusz i W TYM SAMYM MIEJSCU wstawiamy oryginał (kolory zamiast zmiennych);
//   3. styl obliczony musi być identyczny co do znaku — inaczej konwersja zmieniła wygląd.
// Dodatkowo: każda deklaracja ze zmienną była poprawna w oryginale (CSS.supports) — inaczej przeglądarka
// zignorowałaby ją w oryginale, a po konwersji unieważniła dopiero przy liczeniu stylu (inny wynik kaskady).
// 14.52: scenariusze na telefonie (@mobile) i na komputerze, administrator i pracownik.
import fs from 'node:fs';
import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, login, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';
import { REGISTRY_FILE, TOKENS_FILE, readTokens, resolveTokens, scanDeclarationValues } from '../../scripts/css-tokens.mjs';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];

const tokens = readTokens(fs.readFileSync(TOKENS_FILE, 'utf8'));
const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')).files;

const SERVICE_CSS = 'src/mobile791/components/devices/ServiceAdminPanel.css';
const FUEL_CSS = 'src/components/fuel/FuelPanelV1034.css';
const SAVINGS_CSS = 'src/components/fuel/FuelSavingsPanel.css';
const CONTRACTORS_CSS = 'src/mobile791/v1062-contractors-mobile.css';
const MOBILE_DETAILS_CSS = 'src/mobile791/v1091-mobile-details-hardening.css';
const DESKTOP_DETAILS_CSS = 'src/components/job-details-desktop-v1215.css';
const DESKTOP_INVOICE_CSS = 'src/components/job-details-invoice-v1210.css';
const WIZARD_CSS = 'src/mobile791/components/devices/mobile-device-wizard.css';
const NAMEPLATE_CSS = 'src/mobile791/components/nameplate/nameplate-photo-capture.css';
const QR_SCANNER_CSS = 'src/mobile791/components/qr/QrStickerScanner.css';
const PUBLIC_QR_CSS = 'src/public-qr/public-qr.css';
const LEAK_TESTS_CSS = 'src/components/leak-tests/leak-tests.css';
const LEAK_SIGN_CSS = 'src/mobile791/components/leak-tests/leak-test-sign.css';
const SERVICE_REQUESTS_CSS = 'src/components/service-requests/service-requests.css';
const MOBILE_GLOBAL_CSS = [
  'src/mobile791/mobile.css', 'src/mobile791/v1048-runtime-fix.css', 'src/mobile791/v1057-new-job-form-fix.css',
  'src/mobile791/v1295-worker-ui.css', 'src/mobile791/v1297-admin-edit.css', 'src/mobile791/v1323-mobile-protocol-actions.css',
  'src/mobile791/components/pricelist/pricelist-mobile.css',
];
const SWIPE_CARD_CSS = 'src/mobile791/components/jobs/swipeable-job-card.css';
const MIC_CSS = 'src/mobile791/components/modals/new-job-comment-mic-v1311.css';
const MOBILE_DIAGNOSTICS_CSS = 'src/mobile791/components/diagnostics/MobileDiagnosticsPanel.css';
const DESKTOP_JOBS_TABLE_CSS = 'src/styles/desktop-jobs-table.css';
const ADMIN_NAV_BADGE_CSS = 'src/components/layout/admin-nav-badge.css';
const PUBLIC_QR_ENDPOINT = 'https://mock-supabase.invalid/functions/v1/qr-service-request';
const PUBLIC_QR_INFO = {
  ok: true, code: 'UYE8EYCQ', company: 'WaWis-Klima', phone: '606 553 984', phoneHref: '+48606553984',
  assigned: true, model: 'Rotenso Imoto 3.5 kW', installationDate: '20.11.2025', nextInspection: '20.10.2026', inspectionDueNow: true,
};
// Prosty obraz do kadrowania (bez tabliczki) — tylko po to, żeby otworzyć okno kadrowania.
const CROP_TEST_IMAGE = {
  name: 'kadr-test.svg', mimeType: 'image/svg+xml',
  buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#d9d9d9"/><rect x="200" y="200" width="800" height="400" fill="#f4f4f4"/></svg>'),
};

async function openMobileJob(page, status, client) {
  const close = page.getByRole('button', { name: 'Zamknij', exact: true });
  if (await close.count() && await close.first().isVisible()) await close.first().click();
  await page.locator(`.statusActionButton[title="${status}"]`).click();
  await page.getByText(client, { exact: true }).first().click();
  await expect(page.locator('.mobileInlineJobDetails .detailHeader')).toHaveCount(1);
  await expect(page.locator('.mobileInlineJobDetails .detailHeader')).toBeVisible();
}

async function openDesktopJob(page, statusPrefix, client) {
  await page.getByRole('button', { name: new RegExp(`^${statusPrefix}:`) }).click();
  await page.getByRole('table').getByText(client, { exact: true }).click();
  await expect(page.locator('.jobDetailsPanelCard .jobDetailsStickyTitle')).toHaveText(client);
}

async function seedDesktopFuel(page) {
  await page.evaluate(() => {
    window.__KLIMA_MOCK_SUPABASE__.mutate((store) => {
      const opening = {
        id: 'mock-fuel-tank-opening', movement_type: 'opening', delta_liters: 5000, fuel_entry_id: null,
        note: 'Stan początkowy zbiornika — dostawa 5000 l', happened_at: '2026-10-07T07:57:00.000Z', created_by: null,
        created_at: '2026-10-07T07:57:00.000Z', purchase_gross_per_liter: 7.25, purchase_vat_rate: 8, purchase_net_per_liter: 6.713,
      };
      const refuels = [
        ['mock-1452-e1', 'mock-fuel-vehicle-001', 56.9, '2026-10-09T12:48:01.000Z', 125000],
        ['mock-1452-e2', 'mock-fuel-vehicle-001', 56.73, '2026-10-12T05:49:27.000Z', 125600],
        ['mock-1452-e3', 'mock-fuel-vehicle-002', 51.87, '2026-10-21T06:07:59.000Z', 98000],
      ];
      store.fuel_entries = refuels.map(([id, vehicleId, liters, at, km]) => ({
        id, vehicle_id: vehicleId, liters, odometer_km: km, fueled_at: at, created_at: at, created_by: 'mock-admin-1', odometer_read_source: 'manual',
      }));
      store.fuel_tank_movements = [opening, ...refuels.map(([id, , liters, at]) => ({
        id: `mov-${id}`, movement_type: 'refuel', delta_liters: -liters, fuel_entry_id: id, note: 'Tankowanie pojazdu', happened_at: at, created_by: null, created_at: at,
      }))];
    });
  });
}

async function seedMobileFuel(page) {
  await resetMockSupabase(page);
  await page.evaluate(() => {
    const key = 'klima-mock-supabase-store-v3';
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    store.fuel_vehicles = [{ id: 'mock-fuel-vehicle-001', vehicle_name: 'Doblo', registration_number: 'SZA 6149G', is_active: true, tank_capacity_liters: null, last_odometer_km: null, last_fueled_at: null, created_at: '2026-09-08T10:00:00.000Z', updated_at: '2026-09-08T10:00:00.000Z' }];
    store.fuel_entries = [{ id: 'mock-1452-m1', vehicle_id: 'mock-fuel-vehicle-001', liters: 41.2, odometer_km: 125400, fueled_at: '2026-11-18T08:00:00.000Z', created_at: '2026-11-18T08:00:00.000Z', created_by: 'mock-admin-1', odometer_read_source: 'manual' }];
    localStorage.setItem(key, JSON.stringify(store));
  });
}

// Każdy przekonwertowany plik musi być sprawdzany w co najmniej jednym scenariuszu (bez tego test nie przejdzie).
// state.files — arkusze obecne na stronie w danym widoku (np. oszczędności ładują się dopiero po rozwinięciu).
const SCENARIOS = [
  {
    id: 'urzadzenia-telefon-administrator', platform: 'mobile', root: '.serviceAdminPage', widths: [360, 390, 430],
    negativeControl: [SERVICE_CSS, 'padding-bottom:18px;color:#172b45}', 'padding-bottom:18px;color:#ff00ff}'],
    async open(page) {
      await login(page, ADMIN);
      await page.locator('.moduleSwitcherMobile button[data-module="devices"]').click();
      await expect(page.locator('.serviceAdminPage')).toBeVisible();
    },
    states: ['Szukaj', 'Zaplanowane', 'Wykonane', 'Kosz'].map((name) => ({
      name, files: [SERVICE_CSS],
      async go(page) { await page.locator('.serviceAdminNav button', { hasText: name }).click(); },
    })),
  },
  {
    id: 'paliwo-telefon-pracownik', platform: 'mobile', root: '.fuelModule', widths: [360, 390, 430],
    async open(page) {
      await seedMobileFuel(page);
      await loginWithoutReset(page, WORKER);
      await page.getByRole('button', { name: 'Paliwo' }).click();
      await expect(page.locator('.fuelModule')).toBeVisible();
    },
    states: [{ name: 'Formularz i historia', files: [FUEL_CSS], async go() {} }],
  },
  {
    id: 'paliwo-telefon-administrator', platform: 'mobile', root: '.fuelModule', widths: [360, 390, 430],
    async open(page) {
      await seedMobileFuel(page);
      await loginWithoutReset(page, ADMIN);
      await page.getByRole('button', { name: 'Paliwo' }).click();
      await expect(page.locator('.fuelModule')).toBeVisible();
    },
    states: [
      { name: 'Formularz', files: [FUEL_CSS], async go() {} },
      {
        name: 'Wybrany samochód', files: [FUEL_CSS],
        async go(page) { await page.getByLabel('Numer rejestracyjny').selectOption({ label: 'Doblo — SZA 6149G' }); },
      },
    ],
  },
  {
    // 14.53: Kontrahenci na telefonie (tylko administrator) — lista, rozwinięta karta, formularz nowego kontrahenta.
    id: 'kontrahenci-telefon-administrator', platform: 'mobile', root: '.contractorsV1062Page', widths: [360, 390, 430],
    async open(page) {
      await login(page, ADMIN);
      await page.locator('.moduleSwitcherMobile button[data-module="contractors"]').click();
      await expect(page.locator('.contractorsV1062Card').first()).toBeVisible();
    },
    states: [
      {
        name: 'Lista', files: [CONTRACTORS_CSS],
        async go(page) {
          const close = page.locator('.contractorsV1062Editor button', { hasText: 'Anuluj' });
          if (await close.count()) await close.first().click();
          const expanded = page.locator('.contractorsV1062Card.isExpanded .contractorsV1062CardMain');
          if (await expanded.count()) await expanded.first().click();
          await expect(page.locator('.contractorsV1062Card.isExpanded')).toHaveCount(0);
        },
      },
      {
        name: 'Rozwinięta karta', files: [CONTRACTORS_CSS],
        async go(page) {
          await page.locator('.contractorsV1062CardMain').first().click();
          await expect(page.locator('.contractorsV1062Card.isExpanded')).toHaveCount(1);
        },
      },
      {
        name: 'Nowy kontrahent', files: [CONTRACTORS_CSS],
        async go(page) {
          await page.locator('.contractorsV1062ActionCard', { hasText: 'Nowy' }).click();
          await expect(page.locator('.contractorsV1062Editor')).toBeVisible();
        },
      },
    ],
  },
  {
    // 14.54: szczegóły montażu na telefonie (administrator) — montaż w trakcie i zakończony.
    id: 'szczegoly-montazu-telefon-administrator', platform: 'mobile', root: '.mobileInlineJobDetails', widths: [360, 390, 430],
    async open(page) { await login(page, ADMIN); },
    states: [
      { name: 'W trakcie', files: [MOBILE_DETAILS_CSS], async go(page) { await openMobileJob(page, 'W trakcie', 'Klient Testowy B'); } },
      { name: 'Zakończony', files: [MOBILE_DETAILS_CSS], async go(page) { await openMobileJob(page, 'Zakończone', 'Klient Testowy C Zakończony'); } },
    ],
  },
  {
    // 14.54: szczegóły montażu na komputerze (administrator) — w trakcie oraz zakończony z paskiem faktury VAT.
    id: 'szczegoly-montazu-komputer-administrator', platform: 'desktop', root: '.jobDetailsPanelCard', widths: [1280, 1440, 1920],
    async open(page) {
      await login(page, ADMIN);
      await page.getByRole('button', { name: /^Montaże$/ }).click();
    },
    states: [
      { name: 'W trakcie', files: [DESKTOP_DETAILS_CSS, DESKTOP_INVOICE_CSS], async go(page) { await openDesktopJob(page, 'W trakcie', 'Klient Testowy B'); } },
      {
        name: 'Zakończony z fakturą', files: [DESKTOP_DETAILS_CSS, DESKTOP_INVOICE_CSS],
        async go(page) {
          await openDesktopJob(page, 'Zakończone', 'Klient Testowy C Zakończony');
          await expect(page.locator('.desktopInvoiceActionsRowV1210')).toBeVisible();
        },
      },
    ],
  },
  {
    // 14.55: kreator urządzeń i zdjęcie tabliczki na telefonie (pracownik): lista urządzeń → urządzenie →
    // zdjęcie tabliczki JW → okno kadrowania. Dla każdej szerokości kreator otwierany od nowa.
    id: 'kreator-urzadzen-telefon-pracownik', platform: 'mobile', root: '.mobileDeviceWizardModal', widths: [360, 390, 430],
    reopenPerWidth: true, timeout: 420_000,
    async open(page) {
      await resetMockSupabase(page);
      await loginWithoutReset(page, WORKER);
      await page.locator('.statusActionButton[title="W trakcie"]').click();
      await page.getByText('Klient Testowy Multi-Split', { exact: true }).click();
      await page.getByRole('button', { name: 'Tabliczki', exact: true }).click();
      await expect(page.locator('.mobileDeviceOverviewOpen').first()).toBeVisible({ timeout: 20_000 });
    },
    states: [
      { name: 'Lista urządzeń', files: [WIZARD_CSS, NAMEPLATE_CSS], async go() {} },
      {
        name: 'Urządzenie', files: [WIZARD_CSS, NAMEPLATE_CSS],
        async go(page) {
          await page.locator('.mobileDeviceOverviewOpen').first().click();
          await expect(page.locator('.mobileMultiIndoorCard').first()).toBeVisible();
        },
      },
      {
        name: 'Zdjęcie tabliczki JW', files: [WIZARD_CSS, NAMEPLATE_CSS],
        async go(page) {
          await page.locator('.mobileMultiIndoorCard').first().click();
          await expect(page.locator('.nameplateGalleryInput')).toHaveCount(1);
        },
      },
      {
        name: 'Kadrowanie', root: '.nameplateCropModal', files: [NAMEPLATE_CSS, WIZARD_CSS],
        async go(page) {
          await page.locator('.nameplateGalleryInput').setInputFiles(CROP_TEST_IMAGE);
          await expect(page.locator('.nameplateCropModal')).toBeVisible();
        },
      },
    ],
  },
  {
    // 14.55: ten sam kreator w oknie na komputerze (administrator, „Dodaj / edytuj urządzenia i tabliczki”).
    id: 'kreator-urzadzen-komputer-administrator', platform: 'desktop', root: '.desktopAdminDeviceWizardModal', widths: [1280, 1440, 1920],
    reopenPerWidth: true, timeout: 420_000,
    async open(page) {
      await resetMockSupabase(page);
      await login(page, ADMIN);
      await page.getByRole('button', { name: /^Montaże$/ }).click();
      await page.getByRole('button', { name: /W trakcie:/ }).click();
      await page.getByRole('table').getByText('Klient Testowy B', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Dodaj / edytuj urządzenia i tabliczki' }).click();
      await expect(page.locator('.desktopAdminDeviceWizardModal .mobileDeviceOverviewCard').first()).toBeVisible();
    },
    states: [
      { name: 'Lista urządzeń', files: [WIZARD_CSS, NAMEPLATE_CSS], async go() {} },
      {
        name: 'Urządzenie', files: [WIZARD_CSS, NAMEPLATE_CSS],
        async go(page) {
          await page.locator('.desktopAdminDeviceWizardModal .mobileDeviceOverviewOpen').first().click();
          await expect(page.locator('.desktopAdminDeviceWizardModal .mobileDeviceWizardFooter')).toBeVisible();
        },
      },
    ],
  },
  {
    // 14.56: strona klienta po zeskanowaniu naklejki QR (bez logowania) — informacje i formularz awarii.
    id: 'naklejka-qr-strona-klienta', platform: 'mobile', root: '[data-testid="public-qr-page"]', widths: [360, 390, 430],
    reopenPerWidth: true,
    async open(page) {
      await page.unroute(PUBLIC_QR_ENDPOINT).catch(() => {});
      await page.route(PUBLIC_QR_ENDPOINT, async (route) => {
        const request = route.request();
        const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
        const body = JSON.parse(request.postData() || '{}');
        const payload = body.action === 'info' ? PUBLIC_QR_INFO : { ok: true };
        return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      });
      await page.goto('/?qr=UYE8EYCQ');
      await expect(page.getByTestId('public-qr-page')).toBeVisible();
      await expect(page.getByTestId('public-qr-call')).toBeVisible();
    },
    states: [
      { name: 'Informacje o urządzeniu', files: [PUBLIC_QR_CSS], async go() {} },
      {
        name: 'Formularz awarii', files: [PUBLIC_QR_CSS],
        async go(page) { await page.getByRole('button', { name: 'Zgłoś awarię' }).click(); },
      },
    ],
  },
  {
    // 14.56: okno skanera naklejki QR (pracownik przypisuje naklejkę do urządzenia).
    id: 'skaner-qr-telefon-pracownik', platform: 'mobile', root: '.qrScannerModal', widths: [360, 390, 430],
    reopenPerWidth: true,
    async open(page) {
      await login(page, WORKER);
      await page.getByText('Klient Testowy Multi-Split', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Rozwiń Urządzenie 1' }).click();
      await page.getByTestId('job-device-qr-sticker').first().getByRole('button', { name: 'Przypisz naklejkę QR' }).click();
      await expect(page.locator('.qrScannerModal')).toBeVisible();
      // Aparat startuje asynchronicznie (starting → live/unavailable) — porównujemy dopiero stan ustalony.
      await expect(page.locator('.qrScannerViewport')).toHaveClass(/(^|\s)(live|unavailable)(\s|$)/, { timeout: 15_000 });
    },
    states: [{ name: 'Skaner', files: [QR_SCANNER_CSS], async go() {} }],
  },
  {
    // 14.56: wzór podpisu pracownika (Diagnostyka → Wzór podpisu) — pole podpisu z leak-test-sign.css.
    id: 'wzor-podpisu-telefon-pracownik', platform: 'mobile', root: '.leakSignOverlay', widths: [360, 390, 430],
    reopenPerWidth: true,
    async open(page) {
      await resetMockSupabase(page);
      await loginWithoutReset(page, WORKER);
      await expect(page.locator('.statusButtonsBar')).toBeVisible();
      await page.locator('.wawisVersionDiagnosticsButton').click();
      await page.getByTestId('signature-pattern-card').getByTestId('signature-pattern-open').click();
      await expect(page.getByRole('dialog', { name: 'Wzór podpisu' })).toBeVisible();
    },
    states: [{ name: 'Wzór podpisu', files: [LEAK_SIGN_CSS], async go() {} }],
  },
  {
    // 14.56: Protokoły szczelności na komputerze (administrator) — do uzupełnienia i wszystkie.
    id: 'protokoly-szczelnosci-komputer-administrator', platform: 'desktop', root: '[data-testid="leak-tests-panel"]', widths: [1280, 1440, 1920],
    async open(page) {
      await page.route(/open-meteo\.com/, (route) => route.abort());
      await login(page, ADMIN);
      await page.getByRole('button', { name: /^Protokoły$/ }).click();
      await expect(page.getByTestId('leak-test-row').first()).toBeVisible();
    },
    states: [
      { name: 'Do uzupełnienia', files: [LEAK_TESTS_CSS], async go(page) { await page.getByTestId('leak-tests-panel').getByRole('tab', { name: 'Do uzupełnienia' }).click(); } },
      { name: 'Wszystkie', files: [LEAK_TESTS_CSS], async go(page) { await page.getByTestId('leak-tests-panel').getByRole('tab', { name: 'Wszystkie' }).click(); } },
    ],
  },
  {
    // 14.56: Zgłoszenia klientów na komputerze (administrator) — awarie i przeglądy.
    id: 'zgloszenia-komputer-administrator', platform: 'desktop', root: '[data-testid="service-requests-panel"]', widths: [1280, 1440, 1920],
    async open(page) {
      await login(page, ADMIN);
      await page.getByRole('button', { name: /^Zgłoszenia$/ }).click();
      await expect(page.getByTestId('service-requests-panel')).toBeVisible();
    },
    states: [
      { name: 'Awarie', files: [SERVICE_REQUESTS_CSS], async go(page) { await page.getByTestId('service-requests-panel').getByRole('tab', { name: /Awarie/ }).click(); } },
      { name: 'Przeglądy', files: [SERVICE_REQUESTS_CSS], async go(page) { await page.getByTestId('service-requests-panel').getByRole('tab', { name: /Przeglądy/ }).click(); } },
    ],
  },
  {
    // 14.57: ogólne style telefonu (menu, lista montaży, karty, szczegóły z akcjami pracownika) — cała aplikacja.
    id: 'lista-montazy-telefon-pracownik', platform: 'mobile', root: '#root', widths: [360, 390, 430],
    async open(page) {
      await login(page, WORKER);
      await expect(page.locator('.statusButtonsBar')).toBeVisible();
    },
    states: [
      { name: 'Lista montaży', files: [...MOBILE_GLOBAL_CSS, SWIPE_CARD_CSS], async go(page) { await page.locator('.statusActionButton[title="W trakcie"]').click(); } },
      {
        name: 'Szczegóły z akcjami pracownika', files: [...MOBILE_GLOBAL_CSS, SWIPE_CARD_CSS],
        async go(page) {
          if (!(await page.locator('.mobileInlineJobDetails').count())) await page.getByText('Klient Testowy B', { exact: true }).click();
          await expect(page.locator('.mobileInlineJobDetails .workerDetailsActionGridV1295')).toBeVisible();
        },
      },
    ],
  },
  {
    // 14.57: administrator na telefonie — lista, edycja montażu (v1297), formularz nowego klienta z mikrofonem.
    id: 'montaze-telefon-administrator', platform: 'mobile', root: '#root', widths: [360, 390, 430],
    reopenPerWidth: true,
    async open(page) {
      await login(page, ADMIN);
      await expect(page.locator('.statusButtonsBar')).toBeVisible();
    },
    states: [
      { name: 'Lista montaży', files: [...MOBILE_GLOBAL_CSS, SWIPE_CARD_CSS], async go() {} },
      {
        name: 'Edycja montażu', files: [...MOBILE_GLOBAL_CSS],
        async go(page) {
          await page.locator('.statusActionButton[title="W trakcie"]').click();
          await page.getByText('Klient Testowy B', { exact: true }).click();
          await page.locator('.mobileInlineJobDetails .detailActionsBottom.mobileFourButtons').getByRole('button', { name: 'Edytuj', exact: true }).click();
          await expect(page.locator('.formModal.adminMobileEditModalV1297')).toBeVisible();
        },
      },
    ],
  },
  {
    // 14.57: formularz nowego klienta (pracownik) — przycisk mikrofonu i poprawki formularza.
    id: 'nowy-klient-telefon-pracownik', platform: 'mobile', root: '#root', widths: [360, 390, 430],
    reopenPerWidth: true,
    async open(page) {
      await login(page, WORKER);
      await page.getByRole('button', { name: /Dodaj nowego klienta/ }).first().click();
      await expect(page.locator('.formModal').first()).toBeVisible();
    },
    states: [{ name: 'Formularz nowego klienta', files: [...MOBILE_GLOBAL_CSS, MIC_CSS], async go() {} }],
  },
  {
    // 14.57: Diagnostyka na telefonie (pracownik).
    id: 'diagnostyka-telefon-pracownik', platform: 'mobile', root: '.mobileDiagnosticsPage', widths: [360, 390, 430],
    async open(page) {
      await login(page, WORKER);
      await page.locator('.wawisVersionDiagnosticsButton').click();
      await expect(page.locator('.mobileDiagnosticsPage')).toBeVisible();
    },
    states: [{ name: 'Diagnostyka', files: [MOBILE_DIAGNOSTICS_CSS], async go() {} }],
  },
  {
    // 14.57: lista montaży na komputerze (tabela) i licznik w menu administratora.
    id: 'lista-montazy-komputer-administrator', platform: 'desktop', root: '#root', widths: [1280, 1440, 1920],
    async open(page) {
      await login(page, ADMIN);
      await page.getByRole('button', { name: /^Montaże$/ }).click();
      await expect(page.getByRole('table')).toBeVisible();
    },
    states: [
      { name: 'Wszystkie', files: [DESKTOP_JOBS_TABLE_CSS, ADMIN_NAV_BADGE_CSS], async go() {} },
      { name: 'W trakcie', files: [DESKTOP_JOBS_TABLE_CSS, ADMIN_NAV_BADGE_CSS], async go(page) { await page.getByRole('button', { name: /^W trakcie:/ }).click(); } },
    ],
  },
  {
    id: 'paliwo-komputer-administrator', platform: 'desktop', root: '.fuelModule', widths: [1280, 1440, 1920],
    async open(page) {
      await login(page, ADMIN);
      await seedDesktopFuel(page);
      await page.getByRole('button', { name: /Tankowania|Paliwo/ }).click();
      await expect(page.locator('.fuelModule')).toBeVisible();
    },
    states: [
      { name: 'Zestawienie', files: [FUEL_CSS], async go() {} },
      {
        name: 'Historia samochodu', files: [FUEL_CSS],
        async go(page) {
          const row = page.locator('.fuelVehicleSummaryRow').filter({ hasText: 'SZA 6149G' });
          if (!((await row.getAttribute('class')) || '').includes('isActive')) await row.click();
          await expect(page.locator('.fuelHistoryRow').first()).toBeVisible();
        },
      },
      {
        name: 'Oszczędności', files: [FUEL_CSS, SAVINGS_CSS],
        async go(page) {
          const panel = page.getByTestId('fuel-savings-panel');
          if (!(await panel.isVisible())) {
            const section = page.getByTestId('fuel-savings-section');
            await expect(section).toBeVisible({ timeout: 20_000 });
            await section.getByRole('button', { name: 'Rozwiń oszczędności na własnym zbiorniku' }).click();
          }
          await expect(panel).toBeVisible({ timeout: 20_000 });
        },
      },
    ],
  },
];

function declarationsWithTokens(css) {
  const out = [];
  for (const value of scanDeclarationValues(css)) {
    const text = css.slice(value.start, value.end);
    if (!/var\(--wx-/.test(text)) continue;
    let p = value.start - 2;
    while (p >= 0 && !/[;{}]/.test(css[p])) p -= 1;
    const property = css.slice(p + 1, value.start - 1).trim();
    const original = resolveTokens(text, tokens).replace(/!\s*important\s*$/i, '').trim();
    out.push({ property, original });
  }
  return out;
}

async function swapAndCompare(page, file, rootSelector, originalCss) {
  return page.evaluate(async ({ file, rootSelector, originalCss }) => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const styleEl = [...document.querySelectorAll('style[data-vite-dev-id]')]
      .find((el) => el.getAttribute('data-vite-dev-id').replace(/\\/g, '/').endsWith(`/${file}`));
    if (!styleEl) return { error: `brak arkusza ${file} na stronie` };
    const root = document.querySelector(rootSelector);
    if (!root) return { error: `brak ekranu ${rootSelector}` };
    // 14.53: animacje i przejścia zatrzymane na czas porównania (np. pulsujący przycisk mikrofonu zmieniał tło
    // między zapisami). Ten sam styl obowiązuje przy obu zapisach, więc porównanie arkuszy zostaje ścisłe.
    const freeze = document.createElement('style');
    freeze.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
    document.head.appendChild(freeze);
    await frame();
    const elements = [document.documentElement, document.body, root, ...root.querySelectorAll('*')];
    const snapshot = () => elements.map((el) => {
      const parts = [];
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        // 14.53: pseudo-element bez treści (content: none) nie jest rysowany — zapisujemy tylko to (szybciej na komputerze).
        if (pseudo && cs.getPropertyValue('content') === 'none') { parts.push('content=none'); continue; }
        const props = [];
        for (let i = 0; i < cs.length; i += 1) props.push(`${cs[i]}=${cs.getPropertyValue(cs[i])}`);
        parts.push(props.join(';'));
      }
      return parts.join('||');
    });
    const before = snapshot();
    const original = document.createElement('style');
    original.textContent = originalCss;
    styleEl.after(original);
    styleEl.sheet.disabled = true;
    await frame();
    const after = snapshot();
    original.remove();
    styleEl.sheet.disabled = false;
    freeze.remove();
    await frame();
    const diffs = [];
    for (let i = 0; i < elements.length && diffs.length < 5; i += 1) {
      if (before[i] === after[i]) continue;
      const a = before[i].split(/;|\|\|/);
      const b = after[i].split(/;|\|\|/);
      const changed = a.filter((x, k) => x !== b[k]).slice(0, 3);
      diffs.push({ element: `${elements[i].tagName.toLowerCase()}.${String(elements[i].className || '').split(' ').join('.')}`, changed });
    }
    return { elements: elements.length, diffs };
  }, { file, rootSelector, originalCss });
}

const originals = Object.fromEntries(Object.keys(registry).map((file) => [file, resolveTokens(fs.readFileSync(file, 'utf8'), tokens)]));

async function runScenario(page, scenario) {
  await scenario.open(page);

  // Paleta jest wczytana w aplikacji (wartości zmiennych = kolory z tokens.css).
  const loaded = await page.evaluate((names) => {
    const cs = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((name) => [name, cs.getPropertyValue(name).trim()]));
  }, Object.keys(tokens));
  expect(loaded).toEqual(tokens);

  // Każda deklaracja ze zmienną była poprawna w oryginale.
  const files = [...new Set(scenario.states.flatMap((state) => state.files))];
  for (const file of files) {
    const declarations = declarationsWithTokens(fs.readFileSync(file, 'utf8'));
    expect(declarations.length, file).toBeGreaterThan(0);
    const invalid = await page.evaluate((list) => list.filter(({ property, original }) =>
      CSS.supports(property, 'inherit') && !CSS.supports(property, original)), declarations);
    expect(invalid, `${file}: deklaracje niepoprawne w oryginale`).toEqual([]);
  }

  // Kontrola samego testu: celowo zmieniony kolor w „oryginale” MUSI zostać wykryty.
  if (scenario.negativeControl) {
    const [file, from, to] = scenario.negativeControl;
    expect(originals[file].includes(from), 'kontrola negatywna: fragment w oryginale').toBe(true);
    const tampered = await swapAndCompare(page, file, scenario.root, originals[file].replace(from, to));
    expect(tampered.error).toBeUndefined();
    expect(tampered.diffs.length, 'zmieniony kolor musi być wykryty').toBeGreaterThan(0);
  }

  for (const [index, width] of scenario.widths.entries()) {
    await page.setViewportSize({ width, height: scenario.platform === 'mobile' ? 844 : 1000 });
    if (scenario.reopenPerWidth && index > 0) await scenario.open(page);
    for (const state of scenario.states) {
      await state.go(page);
      const root = state.root || scenario.root;
      await expect(page.locator(root).first()).toBeVisible();
      for (const file of state.files) {
        const label = `${scenario.id} / ${state.name} @${width}px / ${file}`;
        const result = await swapAndCompare(page, file, root, originals[file]);
        expect(result.error, label).toBeUndefined();
        expect(result.elements, `${label}: elementy na ekranie`).toBeGreaterThan(5);
        expect(result.diffs, `${label}: styl po podmianie na oryginał`).toEqual([]);
      }
    }
  }
}

test('paleta kolorów — każdy przekonwertowany plik ma ekran do sprawdzenia', () => {
  const covered = new Set(SCENARIOS.flatMap((scenario) => scenario.states.flatMap((state) => state.files)));
  expect(Object.keys(registry).filter((file) => !covered.has(file))).toEqual([]);
  expect([...covered].filter((file) => !registry[file])).toEqual([]);
});

test.describe('@mobile paleta kolorów — wygląd identyczny z oryginałem (telefon)', () => {
  test.use(iphone14);
  for (const scenario of SCENARIOS.filter((s) => s.platform === 'mobile')) {
    test(`${scenario.id}: podmiana na oryginał nie zmienia stylu obliczonego`, async ({ page }) => {
      // Pełny styl obliczony wszystkich elementów × widoki × szerokości — dłużej niż domyślne 60 s.
      test.setTimeout(scenario.timeout || 240_000);
      await runScenario(page, scenario);
    });
  }
});

test.describe('paleta kolorów — wygląd identyczny z oryginałem (komputer)', () => {
  for (const scenario of SCENARIOS.filter((s) => s.platform === 'desktop')) {
    test(`${scenario.id}: podmiana na oryginał nie zmienia stylu obliczonego`, async ({ page }) => {
      // Pełny styl obliczony wszystkich elementów × widoki × szerokości — dłużej niż domyślne 60 s.
      test.setTimeout(scenario.timeout || 240_000);
      await runScenario(page, scenario);
    });
  }
});
