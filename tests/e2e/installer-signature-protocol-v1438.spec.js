import { expect, test } from '@playwright/test';
import { ADMIN, login } from './mock-helpers.js';

// WAWIS 14.38 — protokół montażu: podpis instalatora ze wzoru w polu „Pieczątka i podpis instalatora”.
// Sprawdzamy liczbę wstawionych obrazów podpisu w PDF (klient + instalator). Dane fikcyjne.
test.use({ viewport: { width: 1280, height: 900 } });

test('14.38: protokół montażu z podpisem klienta i instalatora', async ({ page }) => {
  await login(page, ADMIN);
  const counts = await page.evaluate(async () => {
    const mod = await import('/src/mobile791/modules/job-protocol-pdf.js');
    const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 100;
    const ctx = canvas.getContext('2d'); ctx.strokeStyle = '#123'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(10, 60); ctx.bezierCurveTo(80, 10, 160, 90, 290, 30); ctx.stroke();
    const client = canvas.toDataURL('image/png');
    ctx.beginPath(); ctx.moveTo(10, 30); ctx.lineTo(290, 80); ctx.stroke();
    const installer = canvas.toDataURL('image/png');
    const job = { id: 'mock-job-x', client: 'Klient Testowy', city: 'Gdańsk', street: 'Testowa 1', device_model: 'LG Mock', device_serial_number: 'SN1', installation_date: '2026-11-08', status: 'W trakcie' };
    async function imagesIn(blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const text = new TextDecoder('latin1').decode(bytes);
      let count = 0;
      for (const match of text.matchAll(/stream\r?\n/g)) {
        const start = match.index + match[0].length;
        const end = text.indexOf('endstream', start);
        if (end < 0) continue;
        let stop = end;
        while (stop > start && (bytes[stop - 1] === 10 || bytes[stop - 1] === 13)) stop -= 1;
        let inflated = '';
        for (let len = stop; len <= end && !inflated; len += 1) {
          try {
            const out = new Blob([bytes.slice(start, len)]).stream().pipeThrough(new DecompressionStream('deflate'));
            inflated = new TextDecoder('latin1').decode(await new Response(out).arrayBuffer());
          } catch { /* nie ta długość albo obraz */ }
        }
        count += (inflated.match(/\/I\d+ Do\b/g) || []).length;
      }
      return count;
    }
    const without = await mod.createJobProtocolPdfFile({ job, profiles: [], signatureDataUrl: client });
    const withInstaller = await mod.createJobProtocolPdfFile({ job, profiles: [], signatureDataUrl: client, installerSignatureDataUrl: installer });
    const broken = await mod.createJobProtocolPdfFile({ job, profiles: [], signatureDataUrl: client, installerSignatureDataUrl: 'data:image/png;base64,AAAA' });
    return { without: await imagesIn(without.pdfBlob), withInstaller: await imagesIn(withInstaller.pdfBlob), broken: await imagesIn(broken.pdfBlob) };
  });
  expect(counts.withInstaller - counts.without).toBe(1);
  expect(counts.broken).toBe(counts.without);
  expect(counts.without).toBeGreaterThanOrEqual(1);
});
