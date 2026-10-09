const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

async function main() {
  const { getCustomerCardDisplayName: label } = await import(pathToFileURL(path.join(root, 'src/utils/customerCardDisplayName.js')).href);
  const powermat = 'PRZEDSIĘBIORSTWO HANDLOWE "POWERMAT" TADEUSZ BIJAK, MONIKA BIJAK, KRYSTIAN BIJAK SPÓŁKA JAWNA';
  assert.equal(label(powermat), 'POWERMAT');
  assert.equal(label('Firma "NOVA" Jan Kowalski i wspólnicy spółka z ograniczoną odpowiedzialnością'), 'NOVA');
  assert.equal(label('PRZEDSIĘBIORSTWO HANDLOWE (POWERMAT) TADEUSZ BIJAK I WSPÓLNICY SPÓŁKA JAWNA'), 'POWERMAT');
  assert.equal(label('Armii Krajowej'), 'Armii Krajowej');
  assert.equal(label('Firma "ABC" sp. z o.o.'), 'Firma "ABC" sp. z o.o.');
  assert.equal(label('PRZEDSIĘBIORSTWO HANDLOWE (oddział) TADEUSZ BIJAK I WSPÓLNICY SPÓŁKA JAWNA'),
    'PRZEDSIĘBIORSTWO HANDLOWE (oddział) TADEUSZ BIJAK I WSPÓLNICY sp.j.');
  assert.equal(label('PRZEDSIĘBIORSTWO HANDLOWE "ALFA" "BETA" TADEUSZ BIJAK SPÓŁKA JAWNA'),
    'PRZEDSIĘBIORSTWO HANDLOWE "ALFA" "BETA" TADEUSZ BIJAK sp.j.');
  assert.equal(label('DŁUGA NAZWA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ I DODATKOWE INFORMACJE'),
    'DŁUGA NAZWA sp. z o.o. I DODATKOWE INFORMACJE');
  assert.equal(label(''), '');

  const sourcePaths = [
    'src/mobile791/components/jobs/MobileJobsLayout.jsx',
  ];
  for (const p of sourcePaths) {
    const source = read(p);
    assert.match(source, /getCustomerCardDisplayName\(job\.client \|\| job\.title \|\| "Bez klienta"\)/);
    assert.match(source, /className="mobileJobClient" title=\{.*?\} aria-label=\{.*?\}/);
    assert.match(source, /mobile-job-card-name-v1292\.css/);
    assert.doesNotMatch(source, /job\.client\s*=/);
  }
  const style = read('src/mobile791/styles/mobile-job-card-name-v1292.css');
  assert.match(style, /-webkit-line-clamp:\s*2/);
  assert.match(style, /overflow-wrap:\s*anywhere/);
  assert.match(style, /mobileJobDate[\s\S]*?flex:\s*0 0 auto/);
  const e2e = read('tests/e2e/mobile-v1292-customer-card-name.spec.js');
  assert.match(e2e, /elementFromPoint/);
  assert.match(e2e, /mobileInlineJobDetails/);
  console.log('OK 12.92: nazwy mobilne, niejednoznaczne, pełne źródło, limit 2 linii, interakcja E2E.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
