// WAWIS 14.84/14.90 — wspólne narzędzia testów motywu ciemnego (kontrast, zrzuty ekranów do przeglądu).
import { expect } from '@playwright/test';

// Kontrast każdego widocznego tekstu z tłem pod nim (pierwszy przodek z nieprzezroczystym tłem).
export async function contrastAudit(page) {
  return page.evaluate(() => {
    const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    function background(el) {
      const layers = [];
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        // Gradient: tło strony (html/body) — przybliżenie pierwszym kolorem; gradient elementu (awatar, wykres
        // kołowy) — tła pod tekstem nie da się wyznaczyć, więc tekstu nie oceniamy (14.90).
        const hasGradient = cs.backgroundImage && cs.backgroundImage !== 'none' && !/url\(/.test(cs.backgroundImage);
        if (hasGradient && e !== document.body && e !== document.documentElement) return null;
        const gradient = hasGradient ? parse(cs.backgroundImage) : null;
        const bg = gradient && gradient.a > 0 ? gradient : parse(cs.backgroundColor);
        if (bg && bg.a > 0) { layers.push(bg); if (bg.a >= 0.99) break; }
      }
      let out = { r: 255, g: 255, b: 255, a: 1 };
      if (document.documentElement.getAttribute('data-theme') === 'dark') out = { r: 12, g: 12, b: 13, a: 1 };
      for (const layer of layers.reverse()) out = blend(layer, out);
      return out;
    }
    const failures = [];
    let checked = 0;
    for (const el of document.querySelectorAll('body *')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!rect.width || !rect.height || cs.visibility === 'hidden' || Number(cs.opacity) < 0.3 || rect.bottom < 0 || rect.top > innerHeight) continue;
      if (el.closest('[aria-hidden="true"], svg, canvas, img')) continue;
      const fg = parse(cs.color); const bg = background(el);
      if (!fg || !bg) continue;
      const text = blend(fg, bg);
      const [a, b] = [lum(text), lum(bg)].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      checked += 1;
      if (ratio < 4.5) failures.push({ ratio: Number(ratio.toFixed(2)), text: el.textContent.trim().slice(0, 40), cls: String(el.className || el.tagName).slice(0, 60), color: cs.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})` });
    }
    return { checked, failures };
  });
}

export async function shot(page, testInfo, name) {
  await page.waitForTimeout(250);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
  // Podgląd do przeglądu wyglądu z logu CI (mały JPEG, w częściach): WAWIS-SHOT <projekt>/<nazwa> <nr>/<razem> <base64>
  const preview = (await page.screenshot({ type: 'jpeg', quality: 70, scale: 'css' })).toString('base64');
  const parts = Math.ceil(preview.length / 6000);
  for (let i = 0; i < parts; i += 1) console.log(`WAWIS-SHOT ${testInfo.project.name}/${name} ${i + 1}/${parts} ${preview.slice(i * 6000, (i + 1) * 6000)}`);
  const audit = await contrastAudit(page);
  await testInfo.attach(`${name}-kontrast.json`, { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });
  console.log(`WAWIS-CONTRAST ${testInfo.project.name}/${name} sprawdzone=${audit.checked} ponizej4.5=${JSON.stringify(audit.failures.slice(0, 25))}`);
  return audit;
}

export function expectReadable(audit, label) {
  // Twarda granica 3:1 (szacunek tła w przeglądarce), pełna lista < 4,5 w załączniku do przeglądu.
  const hard = audit.failures.filter((f) => f.ratio < 3);
  expect(audit.checked, `${label}: sprawdzone teksty`).toBeGreaterThan(5);
  expect(hard, `${label}: nieczytelny tekst w motywie ciemnym`).toEqual([]);
}

