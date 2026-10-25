import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// WAWIS 13.62 — kolejka zdjęć: zgodność z bazami v3/v4/przyszłymi, brak fałszywego „Zapisano na telefonie”,
// zablokowana baza bez zawieszenia, utrata internetu, ponawianie oraz „Napraw kolejkę zdjęć”.
// Rzeczywiste moduły aplikacji (serwowane przez Vite) i prawdziwy IndexedDB przeglądarki.
// Uwaga: Chromium nie jest dowodem zachowania Safari/WebKit — patrz instrukcja testu na iPhonie.
const harnessPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'photo-queue-harness.js');

const SCENARIOS = [
  'S01_offline_zdjecie_nie_jest_zapisywane_online_wysylka',
  'S02_istniejaca_v3_z_niewyslanym_zdjeciem',
  'S03_istniejaca_v4_z_13_48',
  'S04_przyszla_wersja_bazy_nie_jest_obnizana',
  'S05_offline_komunikat_bez_falszywego_zapisano',
  'S06_brak_miejsca_online_wysylka_z_pamieci',
  'S07_zablokowana_baza_bez_zawieszenia_i_bez_pustej_listy',
  'S08_chwilowa_utrata_polaczenia_ponowienie_od_razu',
  'S09_ponowienie_po_400_i_503',
  'S10_status_tylko_po_commit_transakcji',
  'S11_naprawa_kolejki_usuwa_tylko_kolejke_zdjec',
  'S12_naprawa_przy_bazie_wyzszej_wersji',
  'S13_naprawa_zablokowana_nie_deklaruje_sukcesu',
  'S14_awaryjna_wysylka_z_pamieci_13_55',
  'S15_przypadek_pawla_v4_dwie_tabliczki_online',
  'S16_przypadek_kacpra_v4_zwykle_zdjecie_online',
  'S17_usuniecie_starych_zachowuje_nowe',
  'S18_nowa_instalacja_v3_powrot_do_13_61',
  'S19_start_online_nie_wysyla_starych_przed_decyzja',
  'S20_wysylka_bajtow_z_pamieci',
  'S21_pusty_plik_w_telefonie_jasny_blad',
  'S22_synchronizuj_teraz_zawieszone_wysylane',
  'S23_kolejka_zapisuje_bajty',
  'S24_zawieszony_odczyt_nie_blokuje_kolejki',
  'S25_tabliczki_bez_internetu_komunikat',
];

test.describe('@mobile kolejka zdjęć 13.62 — IndexedDB v3/v4', () => {
  for (const name of SCENARIOS) {
    test(`@mobile ${name}`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.route('**/__wawis_photo_queue_fixture__', (route) => route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><meta charset="utf-8"><title>photo queue fixture</title><body>fixture</body>',
      }));
      await page.goto('/__wawis_photo_queue_fixture__');
      await page.addScriptTag({ path: harnessPath });
      const names = await page.evaluate(() => window.__wawisQueueHarness.names);
      expect(names).toContain(name);
      const result = await page.evaluate((scenario) => window.__wawisQueueHarness.run(scenario), name);
      expect(result, JSON.stringify(result)).toMatchObject({ pass: true });
    });
  }
});
