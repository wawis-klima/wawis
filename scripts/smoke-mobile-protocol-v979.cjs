const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const appVersion = JSON.parse(read('app-version.json'));
const jobDetails = read('src', 'mobile791', 'components', 'JobDetailsPanel.jsx');
const modal = read('src', 'mobile791', 'components', 'modals', 'ProtocolTestModal.jsx');
const pdfModule = read('src', 'mobile791', 'modules', 'job-protocol-pdf.js');
const storageModule = read('src', 'mobile791', 'modules', 'job-protocol-storage.js');
const emailModule = read('src', 'mobile791', 'modules', 'job-protocol-email.js');
const paymentModule = read('src', 'mobile791', 'modules', 'job-payment-confirmation.js');
const mockSupabase = read('src', 'mobile791', 'lib', 'mockSupabaseClient.js');
const setupSql = read('supabase', 'setup-job-protocols-v9.79.sql');
const paymentSql = read('supabase', 'setup-job-payment-confirmation-v9.86.sql');
const styles = read('src', 'mobile791', 'styles.css');
const serviceWorker = read('public', 'push-sw.js');

assert.equal(packageJson.version, appVersion.version);
assert.equal(packageJson.dependencies.jspdf, '4.2.1', 'jsPDF must be pinned exactly.');
assert.equal(packageJson.dependencies['pdfjs-dist'], '5.4.394', 'PDF print renderer must be pinned exactly.');
assert.equal(packageJson.dependencies['dejavu-fonts-ttf'], '2.37.3', 'PDF font package must be pinned exactly.');
assert.equal(packageJson.scripts['test:smoke:mobile-protocol'], 'node scripts/smoke-mobile-protocol-v979.cjs');
assert.equal(packageJson.scripts['test:smoke:mobile-protocol-print'], 'node scripts/test-job-protocol-print-image-v1002.mjs');

assert.match(jobDetails, /selectedJobIsCompleted = String\(selectedJob\?\.status \|\| ""\) === "Zakończone"/);
assert.match(jobDetails, /\{isCompletedJob && !protocolLoading && protocolBackendAvailable \? \(/);
assert.match(jobDetails, /<span className="mobileLabel">Protokół<\/span>/);
assert.match(jobDetails, /loadJobProtocolRecord/);
assert.doesNotMatch(jobDetails, /protocolDownloadButton|protocolEmailButton/);
assert.doesNotMatch(jobDetails, />Protokół TEST</);

assert.match(modal, /Potwierdzenie zapłaty/);
assert.match(modal, /editing \|\| paymentVisible\.enabled/);
assert.match(modal, />Uzupełnij protokół<\/button>/);
assert.doesNotMatch(modal, />Zmień protokół<\/button>/);
assert.doesNotMatch(modal, /Opcjonalnie dodawane do tego samego protokołu PDF/);
assert.doesNotMatch(modal, /Potwierdzenie zapłaty nie zostanie dodane do protokołu/);
assert.doesNotMatch(modal, /Zmiana danych wymaga ponownego podpisu klienta/);
assert.doesNotMatch(modal, /Zmiana protokołu wymaga ponownego podpisu klienta/);
assert.doesNotMatch(modal, /Nie zastępuje faktury, paragonu ani innego dokumentu księgowego/);
assert.doesNotMatch(modal, /Podpis klienta potwierdzi zakończenie montażu/);
assert.doesNotMatch(modal, /Podpis klienta potwierdza zakończenie montażu/);
assert.doesNotMatch(modal, /Brak podpisu klienta/);
assert.doesNotMatch(modal, /Podpis zostanie złożony na osobnym, nieruchomym ekranie/);
assert.match(modal, /Drukuj protokół/);
assert.match(modal, /Drukuj lub wyślij/);
assert.match(modal, /Wyślij z \$\{JOB_PROTOCOL_EMAIL_SENDER\}/);
assert.match(modal, /sendJobProtocolEmail/);
assert.match(modal, /saveJobPaymentConfirmation/);
assert.match(modal, /onPointerDown=\{startDrawing\}/);
assert.match(modal, /onPointerMove=\{continueDrawing\}/);
assert.match(modal, /Wyczyść podpis/);
assert.match(modal, /Zapisz protokół/);
assert.match(modal, /storeJobProtocol/);
assert.match(modal, /replaceExisting: Boolean\(savedRecord\)/);

assert.match(storageModule, /normalizeText\(job\?\.status\) !== "Zakończone"/);
assert.match(storageModule, /\.from\(PROTOCOLS_BUCKET\)[\s\S]*?\.upload\(/);
assert.match(storageModule, /\.from\(PROTOCOLS_TABLE\)[\s\S]*?\.insert\(row\)/);
assert.match(storageModule, /\.download\(record\.storage_path\)/);
assert.match(storageModule, /navigator\.share/);
assert.match(storageModule, /intent !== "print"/);
assert.match(storageModule, /navigator\.share\(\{ files: \[file\] \}\)/);
assert.match(storageModule, /PRINT_IMAGE_MIME_TYPE = "image\/png"/);
assert.match(storageModule, /createProtocolPrintImage/);
assert.match(storageModule, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
assert.match(storageModule, /return \{ method: "share-image" \}/);
assert.doesNotMatch(storageModule, /title: `Drukuj protokół|text: "Wybierz aplikację Phomemo/);
assert.doesNotMatch(storageModule, /triggerBrowserDownload\(blob, record\.file_name\);\s*return \{ method: "download" \};/);
assert.doesNotMatch(storageModule, /mailto:|createSignedUrl|EMAIL_LINK_TTL_SECONDS/);
assert.match(emailModule, /send-job-protocol-email/);
assert.match(emailModule, /biuro@wawis\.pl/);
assert.doesNotMatch(emailModule, /SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY/);

assert.match(setupSql, /create table if not exists public\.job_protocols/);
assert.match(setupSql, /job_id uuid not null unique/);
assert.match(setupSql, /j\.status = 'Zakończone'/);
assert.match(setupSql, /alter table public\.job_protocols enable row level security/);
assert.match(setupSql, /public\.current_user_can_access_job\(job_id\)/);
assert.match(setupSql, /values \('job-protocols', 'job-protocols', false/);
assert.match(setupSql, /array\['application\/pdf'\]/);
assert.match(paymentSql, /payment_confirmation_enabled/);
assert.match(paymentSql, /payment_amount numeric\(12,2\)/);
assert.match(paymentSql, /jobs_payment_confirmation_consistent/);
assert.match(paymentSql, /job_protocols_update_owner_or_admin/);
assert.match(paymentModule, /PAYMENT_METHODS/);
assert.match(paymentModule, /Zapłacono całość/);
assert.match(paymentModule, /Wpłacono zaliczkę/);
assert.match(paymentModule, /saveJobPaymentConfirmation/);

assert.match(pdfModule, /createJobProtocolPdfFile/);
assert.match(pdfModule, /DejaVuSans\.ttf\?url/);
assert.match(pdfModule, /WAWIS CHŁODNICTWO I KLIMATYZACJA/);
assert.doesNotMatch(pdfModule, /doc\.text\("WERSJA TESTOWA"/);
assert.match(pdfModule, /Piotr Wasik/);
assert.match(pdfModule, /ul\. Rolnicza 40, 42-400 Zawiercie/);
assert.match(pdfModule, /606 553 984/);
assert.match(pdfModule, /biuro@wawis\.pl/);
assert.match(pdfModule, /6492040094/);
assert.doesNotMatch(pdfModule, /REGON|240887046/);
assert.match(pdfModule, /\$\{PROTOCOL_COMPANY\.name\}  \|  \$\{PROTOCOL_COMPANY\.owner\}/);
assert.match(pdfModule, /\$\{PROTOCOL_COMPANY\.address\}  \|  NIP \$\{PROTOCOL_COMPANY\.nip\}/);
assert.match(pdfModule, /tel\. \$\{PROTOCOL_COMPANY\.phone\}  \|  \$\{PROTOCOL_COMPANY\.email\}  \|  www\.wawis\.pl/);
assert.match(pdfModule, /const OUTER_MARGIN = 12/);
assert.match(pdfModule, /const CARD_WIDTH = PAGE_WIDTH - \(OUTER_MARGIN \* 2\)/);
assert.match(pdfModule, /const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT/);
assert.match(pdfModule, /const bodyFontSize = 9\.4/);
assert.match(pdfModule, /const lineHeight = 10\.5/);
assert.match(pdfModule, /drawCard\(doc, y \+ 8, 64\)/);
assert.match(pdfModule, /doc\.circle\(34, 36, 21/);
assert.match(pdfModule, /Potwierdzenie zapłaty/);
assert.doesNotMatch(pdfModule, /Dokumentacja zapisana w aplikacji/);
assert.doesNotMatch(pdfModule, /nie zastępuje faktury, paragonu/);
assert.match(pdfModule, /INFORMACJA O PRZETWARZANIU DANYCH OSOBOWYCH/);
assert.match(pdfModule, /ZAGOSPODAROWANIE ODPADÓW/);
assert.match(pdfModule, /art\. 6 ust\. 1 lit\. b, c i f RODO/);
assert.match(pdfModule, /art\. 3 ust\. 1 pkt 32 ustawy z dnia 14 grudnia 2012 r\. o odpadach/);
assert.doesNotMatch(pdfModule, /Inspektor Danych Osobowych zostanie powołany/);
assert.doesNotMatch(pdfModule, /art\. 32 ust\. 1 pkt 6 ustawy o ochronie danych osobowych/);
assert.doesNotMatch(pdfModule, /ZGODA NA PRZETWARZANIE DANYCH OSOBOWYCH/);
assert.doesNotMatch(pdfModule, /Potwierdzenie zakończenia montażu/);
assert.match(pdfModule, /const clientSignatureLeft = CONTENT_LEFT/);
assert.match(pdfModule, /const clientSignatureWidth = 240/);
assert.match(pdfModule, /const clientSignatureMaxWidth = 236/);
assert.match(pdfModule, /const clientSignatureMaxHeight = 64/);
assert.match(pdfModule, /doc\.getImageProperties\(signatureDataUrl\)/);
assert.match(pdfModule, /getContainedSignatureSize\(image\.width, image\.height, clientSignatureMaxWidth, clientSignatureMaxHeight\)/);
assert.match(pdfModule, /doc\.addImage\(signatureDataUrl, "PNG", signatureX, signatureY, signatureSize\.width, signatureSize\.height/);
assert.match(pdfModule, /doc\.line\(clientSignatureLeft, clientSignatureLineY, clientSignatureLeft \+ clientSignatureWidth, clientSignatureLineY\)/);
assert.match(pdfModule, /const installerSignatureLeft = CONTENT_RIGHT - clientSignatureWidth/);
assert.match(pdfModule, /doc\.line\(installerSignatureLeft, clientSignatureLineY, installerSignatureLeft \+ clientSignatureWidth, clientSignatureLineY\)/);
assert.match(pdfModule, /doc\.text\("Podpis klienta złożony palcem na ekranie telefonu", clientSignatureLeft, y \+ 129\)/);
assert.match(pdfModule, /doc\.text\("Pieczątka i podpis instalatora", installerSignatureLeft \+ \(clientSignatureWidth \/ 2\), y \+ 129, \{ align: "center" \}\)/);
assert.match(pdfModule, /doc\.text\("INFORMACJA O PRZETWARZANIU DANYCH OSOBOWYCH", PAGE_WIDTH \/ 2, y \+ 25, \{ align: "center" \}\)/);
assert.match(pdfModule, /doc\.text\("ZAGOSPODAROWANIE ODPADÓW", PAGE_WIDTH \/ 2, wasteTitleY, \{ align: "center" \}\)/);
assert.doesNotMatch(pdfModule, /doc\.text\(data\.signedAt, 549, y \+ 100/);
assert.match(modal, /function getTrimmedSignatureDataUrl\(canvas\)/);
assert.match(modal, /context\.getImageData\(0, 0, width, height\)/);
assert.match(modal, /setSignatureDataUrl\(getTrimmedSignatureDataUrl\(canvasRef\.current\)\)/);
assert.match(modal, /drawSignaturePreview\(context, image, rect\.width, rect\.height\)/);
assert.match(modal, /context\.lineWidth = 2\.8/);
const protocolTextColors = [...pdfModule.matchAll(/doc\.setTextColor\(([^)]+)\)/g)].map((match) => match[1]);
assert.ok(protocolTextColors.length > 0, 'Protocol must set text colors explicitly.');
assert.ok(protocolTextColors.every((color) => color === '0, 0, 0'), 'Every protocol text element must be black for thermal printing.');
assert.match(pdfModule, /getJobNameplateCompletion\(job, \{ allowLocal: true \}\)/);
assert.doesNotMatch(pdfModule, /device_serial_number|serial_number|Numer seryjny/i, 'Protocol must not expose serial numbers.');
assert.match(mockSupabase, /job_protocols: \[\]/);
assert.match(mockSupabase, /async download\(path\)/);
assert.match(styles, /\.protocolTestSignatureCanvas[\s\S]*?touch-action:none/);
assert.match(styles, /\.protocolStoredStatus/);
assert.ok(serviceWorker.includes(`wawis-app-shell-v${packageJson.version}`));

const storageResult = spawnSync(process.execPath, ['scripts/test-job-protocol-storage-v979.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
assert.equal(storageResult.status, 0, storageResult.stderr || 'Protocol storage test failed.');

const paymentResult = spawnSync(process.execPath, ['scripts/test-job-payment-confirmation-v986.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
assert.equal(paymentResult.status, 0, paymentResult.stderr || 'Payment confirmation test failed.');

const emailResult = spawnSync(process.execPath, ['scripts/test-job-protocol-email-v987.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
assert.equal(emailResult.status, 0, emailResult.stderr || 'Firm protocol email test failed.');

const renderResult = spawnSync(process.execPath, ['scripts/render-mobile-protocol-fixture.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
assert.equal(renderResult.status, 0, renderResult.stderr || 'Actual PDF render failed.');
const renderedPdfPath = path.join(root, 'output', 'pdf', 'wawis-protokol-v1009-wiekszy-podpis-i-tekst.pdf');
assert.ok(fs.existsSync(renderedPdfPath), 'Verification PDF was not created.');
assert.ok(fs.statSync(renderedPdfPath).size > 10_000, 'Verification PDF is unexpectedly small.');

console.log('PASS smoke-mobile-protocol-v979');
