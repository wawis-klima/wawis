import fs from 'node:fs';
import path from 'node:path';
import { devices, expect, test } from '@playwright/test';

const root = process.cwd();
const mobileStyles = [
  'src/mobile791/styles.css',
  'src/mobile791/v1090-details-width.css',
  'src/mobile791/v1091-mobile-details-hardening.css',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const mobileDetailsSource = fs.readFileSync(path.join(root, 'src/mobile791/components/JobDetailsPanel.jsx'), 'utf8');
const backendGuardSource = fs.readFileSync(path.join(root, 'supabase/migrations/20260917093000_admin_manual_nameplate_completion_v1090.sql'), 'utf8');

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];

test.describe('@mobile 10.91 regressions', () => {
  test.use(iphone14);

  test('długi email i adres nie rozszerzają karty ani viewportu iPhone', async ({ page }) => {
    await page.setContent(`
      <style>${mobileStyles}</style>
      <div id="root">
        <main class="page">
          <div class="stack">
            <article class="card premiumCard">
              <div class="jobHead detailHeader">
                <div class="detailIdentity">
                  <h2 class="detailTitle">KOROŚ PAWEŁ</h2>
                  <div class="detailMeta">
                    <div class="infoItem">
                      <span class="infoLabel infoLabelWithIcon"><span>EMAIL</span></span>
                      <div class="infoValue"><div class="infoValueActions"><a class="emailLink">bardzo.dlugi.adres.email.ktory.nie.moze.rozszerzyc.karty@przyklad-bardzo-dluga-domena.pl</a></div></div>
                    </div>
                    <div class="infoItem">
                      <span class="infoLabel infoLabelWithIcon"><span>ADRES</span></span>
                      <div class="infoValue"><a class="addressLink">Parkoszowice, Krajobrazowa 39 — bardzo długi dodatkowy opis adresu montażu</a></div>
                    </div>
                  </div>
                  <div class="detailActions mobileFourButtons">
                    <button>Edytuj</button><button>Urządzenia</button><button>Zakończ</button><button>Zamknij</button>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </main>
      </div>
    `);

    const geometry = await page.evaluate(() => {
      const viewport = document.documentElement.clientWidth;
      const card = document.querySelector('.premiumCard').getBoundingClientRect();
      const email = document.querySelector('.emailLink').getBoundingClientRect();
      const address = document.querySelector('.addressLink').getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - viewport,
        cardRight: card.right,
        emailRight: email.right,
        addressRight: address.right,
        viewport,
      };
    });

    expect(geometry.overflow).toBeLessThanOrEqual(2);
    expect(geometry.cardRight).toBeLessThanOrEqual(geometry.viewport + 2);
    expect(geometry.emailRight).toBeLessThanOrEqual(geometry.viewport + 2);
    expect(geometry.addressRight).toBeLessThanOrEqual(geometry.viewport + 2);
  });

  test('mobilny administrator ma jawne ręczne potwierdzenie JZ/JW, a zakończenie wymaga zdjęcia albo potwierdzenia', async () => {
    expect(mobileDetailsSource).toContain('setManualNameplateVerification');
    expect(mobileDetailsSource).toContain('Potwierdź ręcznie');
    expect(mobileDetailsSource).toContain('Cofnij ręczne');
    expect(mobileDetailsSource).toContain('manualVerificationBusyKey');
    expect(mobileDetailsSource).toContain('effectiveMissingNameplateUnits');
    expect(mobileDetailsSource).toContain('effectiveNameplateComplete');
    expect(mobileDetailsSource).toContain('!unit.ready && !getManualNameplateVerification');
    expect(mobileDetailsSource).toContain('disabled={busy || showDetailsLoading || !effectiveNameplateComplete}');

    expect(backendGuardSource).toContain('public.current_user_is_admin()');
    expect(backendGuardSource).toContain('public.nameplate_manual_verifications');
    expect(backendGuardSource).toContain("raise exception 'job_nameplates_incomplete:");
  });
});
