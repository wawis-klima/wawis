import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { devices, webkit } from 'playwright';

const root = process.cwd();
const mobileStyles = [
  'src/mobile791/styles.css',
  'src/mobile791/v1090-details-width.css',
  'src/mobile791/v1091-mobile-details-hardening.css',
  ...(fs.existsSync(path.join(root, 'src/mobile791/v1092-inline-width.css')) ? ['src/mobile791/v1092-inline-width.css'] : []),
].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
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
                  <div class="muted adminNoteText">${longNote}</div>
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

  console.log('v10.92 WebKit geometry', geometry);
  assert.ok(geometry.scrollWidth - geometry.viewport <= 2, `viewport overflow: ${geometry.scrollWidth - geometry.viewport}px`);
  assert.ok(geometry.listRight <= geometry.viewport + 2, `mobileJobList right=${geometry.listRight} viewport=${geometry.viewport}`);
  assert.ok(geometry.inlineRight <= geometry.viewport + 2, `mobileInlineJobDetails right=${geometry.inlineRight} viewport=${geometry.viewport}`);
  assert.ok(geometry.cardRight <= geometry.viewport + 2, `premiumCard right=${geometry.cardRight} viewport=${geometry.viewport}`);
} finally {
  await context.close();
  await browser.close();
}
