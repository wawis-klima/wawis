import fs from 'node:fs';
import path from 'node:path';
import { devices, expect, test, webkit } from '@playwright/test';

const root = process.cwd();
const mobileStyles = [
  'src/mobile791/styles.css',
  'src/mobile791/v1090-details-width.css',
  'src/mobile791/v1091-mobile-details-hardening.css',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const mobileDetailsSource = fs.readFileSync(path.join(root, 'src/mobile791/components/JobDetailsPanel.jsx'), 'utf8');

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];

test.describe('@mobile 10.92 regressions', () => {
  test.use(iphone14);

  test('link Google Maps w komentarzu administratora nie rozszerza realnego gridu listy montaży na WebKit/iPhone', async () => {
    const browser = await webkit.launch();
    const context = await browser.newContext(iphone14);
    const page = await context.newPage();
    try {
      const longNote = 'Montaż i ustalenia '.repeat(28) + 'mapka dojazdu https://maps.app.goo.gl/pYtbjZTkYRLFqtYa7?g_st=ic';
      await page.setContent(`
        <style>${mobileStyles}</style>
        <div id="root">
          <main class="page">
            <div class="stack">
              <div class="mobileJobList">
                <div class="mobileJobCard">
                  <button class="mobileJobCardButton">
                    <div class="mobileJobTop"><strong class="mobileJobClient">KOROŚ PAWEŁ</strong></div>
                  </button>
                </div>
                <div class="mobileInlineJobDetails">
                  <div class="card premiumCard">
                    <section class="detailsSection">
                      <h4 class="sectionHeadingWithIcon"><span>Komentarz administratora</span></h4>
                      <div class="muted">${longNote}</div>
                    </section>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      `);

      const geometry = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const list = document.querySelector('.mobileJobList').getBoundingClientRect();
        const inline = document.querySelector('.mobileInlineJobDetails').getBoundingClientRect();
        const card = document.querySelector('.premiumCard').getBoundingClientRect();
        return {
          viewport,
          scrollWidth: document.documentElement.scrollWidth,
          listRight: list.right,
          inlineRight: inline.right,
          cardRight: card.right,
        };
      });

      expect(geometry.scrollWidth - geometry.viewport).toBeLessThanOrEqual(2);
      expect(geometry.listRight).toBeLessThanOrEqual(geometry.viewport + 2);
      expect(geometry.inlineRight).toBeLessThanOrEqual(geometry.viewport + 2);
      expect(geometry.cardRight).toBeLessThanOrEqual(geometry.viewport + 2);
    } finally {
      await context.close();
      await browser.close();
    }
  });

  test('administrator może zakończyć bez tabliczek, pracownik nadal nie może', async () => {
    expect(mobileDetailsSource).toContain('const effectiveNameplateComplete = isAdmin ? true : nameplateCompletion.isComplete;');

    const migrationFiles = fs.readdirSync(path.join(root, 'supabase/migrations'))
      .filter((name) => name.includes('admin_finish_without_nameplates_v1092') && name.endsWith('.sql'));
    expect(migrationFiles.length).toBeGreaterThan(0);

    const migrationSource = fs.readFileSync(path.join(root, 'supabase/migrations', migrationFiles.at(-1)), 'utf8');
    expect(migrationSource).toContain('public.current_user_is_admin()');
    expect(migrationSource).toMatch(/if\s+v_admin_bypass\s+then[\s\S]*return;/i);
    expect(migrationSource).toContain("raise exception 'job_nameplates_incomplete:");
    expect(migrationSource).toContain('from public.photos p');
    expect(migrationSource).not.toContain('from public.nameplate_manual_verifications mv');
  });
});
