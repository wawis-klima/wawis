import { expect, test } from '@playwright/test';
import { ADMIN, login } from './mock-helpers.js';

// WAWIS 14.39 — podpis instalatora dopisany do protokołu montażu zapisanego przed 14.38. Prawdziwy PDF protokołu
// (generator aplikacji) w testowym Storage; po operacji: nowa wersja z +1 obrazem w polu instalatora, oryginał
// w historii i w Storage bez zmian, podpis klienta i data bez zmian. Dane fikcyjne.
test.use({ viewport: { width: 1440, height: 1000 } });

test('14.39: dopisanie podpisu instalatora do starego protokołu montażu', async ({ page }) => {
  await page.route(/open-meteo\.com/, (route) => route.abort());
  await login(page, ADMIN);
  const original = await page.evaluate(async () => {
    const mock = window.__KLIMA_MOCK_SUPABASE__;
    const store = mock.getStore();
    const job = store.jobs.find((item) => item.id === 'mock-job-003');
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 200;
    const ctx = canvas.getContext('2d'); ctx.lineWidth = 8; ctx.strokeStyle = '#123456';
    ctx.beginPath(); ctx.moveTo(20, 150); ctx.bezierCurveTo(150, 10, 350, 190, 580, 40); ctx.stroke();
    const client = canvas.toDataURL('image/png');
    ctx.clearRect(0, 0, 600, 200); ctx.beginPath(); ctx.moveTo(30, 40); ctx.lineTo(570, 170); ctx.stroke();
    const installer = canvas.toDataURL('image/png');
    const { createJobProtocolPdfFile } = await import('/src/mobile791/modules/job-protocol-pdf.js');
    const { pdfBlob } = await createJobProtocolPdfFile({ job, profiles: store.profiles, signatureDataUrl: client, signedAt: new Date('2026-05-06T10:45:00Z') });
    mock.putFile('job-protocols', 'mock-job-003/protocol-testowy.pdf', pdfBlob);
    mock.mutate((s) => { s.leak_test_signatures = [{ id: 'sig-w', profile_id: job.completed_by, image_png: installer, created_at: '2026-11-07T10:00:00Z' }]; });
    const { findInstallerSignatureBox } = await import('/src/modules/pdf-stamp.js');
    const box = await findInstallerSignatureBox(new Uint8Array(await pdfBlob.arrayBuffer()));
    return { size: pdfBlob.size, images: box.images, pages: box.numPages };
  });

  await page.getByRole('button', { name: /^Protokoły$/ }).click();
  const card = page.getByTestId('installer-signature-backfill-card');
  await expect(card.getByTestId('installer-signature-backfill-count')).toContainText('Do uzupełnienia: 1');
  await card.getByTestId('installer-signature-backfill-run').click();
  await expect(card.getByTestId('installer-signature-backfill-result')).toContainText('Dodano podpis instalatora: 1.', { timeout: 30_000 });

  const after = await page.evaluate(async () => {
    const mock = window.__KLIMA_MOCK_SUPABASE__;
    const record = mock.getStore().job_protocols.find((item) => item.job_id === 'mock-job-003');
    const fresh = mock.getFile('job-protocols', record.storage_path);
    const old = mock.getFile('job-protocols', 'mock-job-003/protocol-testowy.pdf');
    const { findInstallerSignatureBox } = await import('/src/modules/pdf-stamp.js');
    const freshBytes = new Uint8Array(await fresh.arrayBuffer());
    const oldBytes = new Uint8Array(await old.arrayBuffer());
    const box = await findInstallerSignatureBox(freshBytes);
    const prefixSame = oldBytes.every((value, index) => freshBytes[index] === value);
    return { path: record.storage_path, signedAt: record.signed_at, history: record.revision_history,
      images: box.images, pages: box.numPages, oldSize: old.size, prefixSame };
  });
  expect(after.path).toMatch(/^mock-job-003\/protocol-.*-podpis-instalatora-.*\.pdf$/);
  expect(after.signedAt).toBe('2026-05-06T10:45:00.000Z');
  expect(after.images).toBe(original.images + 1);
  expect(after.pages).toBe(original.pages);
  expect(after.oldSize).toBe(original.size);
  expect(after.prefixSame).toBe(true);
  expect(after.history.at(-1)).toMatchObject({ storage_path: 'mock-job-003/protocol-testowy.pdf', reason: 'installer_signature_added' });

  // Ponownie: nic do zrobienia — karta znika po odświeżeniu listy.
  await page.getByRole('button', { name: /^Diagnostyka$/ }).click();
  await page.getByRole('button', { name: /^Protokoły$/ }).click();
  await expect(page.getByTestId('protocols-export-card')).toBeVisible();
  await expect(page.getByTestId('installer-signature-backfill-card')).toHaveCount(0);
});
