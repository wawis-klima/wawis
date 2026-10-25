// WAWIS 13.62 — fail-closed dowód E2E kolejki zdjęć na zbudowanej aplikacji.
// Czyta raport JSON Playwrighta, publikuje podsumowanie jako adnotację GitHub Actions
// i kończy się błędem, jeśli liczba wykonanych i zaliczonych testów nie zgadza się z oczekiwaną.
const fs = require('node:fs');

const reportPath = process.argv[2] || 'playwright-report-built/results.json';
const expected = Number(process.argv[3] || 4);

function collect(suite, out = []) {
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const results = test.results || [];
      const last = results[results.length - 1] || {};
      out.push({ title: spec.title, file: spec.file || suite.file || '', status: last.status || 'missing', retries: Math.max(0, results.length - 1) });
    }
  }
  for (const child of suite.suites || []) collect(child, out);
  return out;
}

if (!fs.existsSync(reportPath)) {
  console.log(`::error title=Built E2E::Brak raportu ${reportPath} — testy nie zostały wykonane.`);
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const tests = (report.suites || []).flatMap((suite) => collect(suite));
const passed = tests.filter((t) => t.status === 'passed');
const failed = tests.filter((t) => t.status !== 'passed');
const summary = `wykonane=${tests.length} zaliczone=${passed.length} niezaliczone=${failed.length} oczekiwane=${expected}`;
console.log(`::notice title=Built E2E wynik::${summary}`);
for (const t of tests) console.log(`::notice title=Built E2E ${t.status}::${t.file} › ${t.title}${t.retries ? ` (ponowienia: ${t.retries})` : ''}`);
if (tests.length !== expected || failed.length) {
  console.log(`::error title=Built E2E::NO-GO — ${summary}`);
  process.exit(1);
}
console.log(`Built E2E: GO — ${summary}`);
