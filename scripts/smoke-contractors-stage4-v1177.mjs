import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeContractorImportRows,
  findContractorDuplicates,
} from '../src/modules/contractors.js';
import {
  parseContractorImportRow as parseDesktopRow,
  parseContractorStatusValue as parseDesktopStatus,
} from '../src/utils/xlsxImport.js';
import {
  parseContractorImportRow as parseMobileRow,
  parseContractorStatusValue as parseMobileStatus,
} from '../src/mobile791/utils/xlsxImport.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

for (const parseStatus of [parseDesktopStatus, parseMobileStatus]) {
  assert.deepEqual(parseStatus('Aktywny'), { ok: true, value: true });
  assert.deepEqual(parseStatus('Nieaktywny'), { ok: true, value: false });
  assert.deepEqual(parseStatus('true'), { ok: true, value: true });
  assert.deepEqual(parseStatus('false'), { ok: true, value: false });
  assert.equal(parseStatus('nieznany').ok, false);
  assert.equal(parseStatus('').ok, false);
}

const headers = ['company_name', 'phone', 'addresses_json', 'status'];
for (const parseRow of [parseDesktopRow, parseMobileRow]) {
  const inactive = parseRow({
    row: ['Firma Nieaktywna', '0500123456', '[{"id":"a-1","label":"Magazyn","city":"Łódź","street":"Testowa 2","is_primary":true}]', 'Nieaktywny'],
    normalizedHeaders: headers,
    sourceRowNumber: 7,
    hasStatusColumn: true,
  });
  assert.equal(inactive.company_name, 'Firma Nieaktywna');
  assert.equal(inactive.phone, '0500123456');
  assert.equal(inactive.is_active, false);
  assert.equal(inactive.__source_row_number, 7);
  assert.equal(inactive.__parse_errors.length, 0);
  assert.equal(inactive.addresses.length, 1);
  assert.equal(inactive.addresses[0].city, 'Łódź');

  const badJson = parseRow({
    row: ['Firma JSON', '', '{zły json', 'Aktywny'],
    normalizedHeaders: headers,
    sourceRowNumber: 11,
    hasStatusColumn: true,
  });
  assert.match(badJson.__parse_errors.join(' '), /Nieprawidłowy JSON/);

  const badStatus = parseRow({
    row: ['Firma Status', '', '', 'Wstrzymany'],
    normalizedHeaders: headers,
    sourceRowNumber: 13,
    hasStatusColumn: true,
  });
  assert.match(badStatus.__parse_errors.join(' '), /Nieznany status/);

  const legacyNoStatus = parseRow({
    row: ['Firma Legacy', '500600700'],
    normalizedHeaders: ['company_name', 'phone'],
    sourceRowNumber: 15,
    hasStatusColumn: false,
  });
  assert.equal(legacyNoStatus.is_active, true, 'Plik bez kolumny Status zachowuje kompatybilność: aktywny=true.');
}

const invalidAnalysis = analyzeContractorImportRows([], [{
  company_name: 'Firma JSON',
  is_active: true,
  __source_row_number: 23,
  __parse_errors: ['Nieprawidłowy JSON w kolumnie Adresy (JSON).'],
}]);
assert.equal(invalidAnalysis.summary.total, 1);
assert.equal(invalidAnalysis.summary.invalid, 1);
assert.equal(invalidAnalysis.invalidRows[0].rowNumber, 23);
assert.match(invalidAnalysis.invalidRows[0].reason, /Nieprawidłowy JSON/);

// K13: kontakt współdzielony przez dwa różne istniejące rekordy jest wykrywany,
// ale desktop ma traktować telefon/e-mail jako ostrzeżenie przy edycji.
const contractors = [
  { id: 'a', company_name: 'Firma A', phone: '500600700', email: 'wspolny@example.test', notes: '' },
  { id: 'b', company_name: 'Firma B', phone: '500600700', email: 'wspolny@example.test', notes: '' },
];
const editMatches = findContractorDuplicates(contractors, {
  ...contractors[0],
  notes: 'Nowa notatka',
});
assert.equal(editMatches.length, 1);
assert.deepEqual(editMatches[0].reasons.sort(), ['email', 'telefon']);

const renameMatches = findContractorDuplicates(contractors, {
  ...contractors[0],
  company_name: 'Firma B',
  notes: 'Nowa notatka',
});
assert.ok(renameMatches.some(({ reasons }) => reasons.includes('nazwa')));

const desktopPanel = read('src', 'components', 'contractors', 'ContractorsPanel.jsx');
assert.match(desktopPanel, /if \(!form\.id\) return duplicateMatches;/);
assert.match(desktopPanel, /reasons\.includes\('nazwa'\)/);
assert.match(desktopPanel, /if \(blockingDuplicateMatches\.length\)/);
assert.match(desktopPanel, /disabled=\{saveBusy \|\| deleteBusy \|\| importBusy \|\| exportBusy \|\| blockingDuplicateMatches\.length\}/);
assert.match(desktopPanel, /To tylko ostrzeżenie dla istniejącego rekordu/);

for (const sourcePath of ['src/utils/xlsxImport.js', 'src/mobile791/utils/xlsxImport.js']) {
  const source = read(...sourcePath.split('/'));
  assert.match(source, /\['status', 'status'\]/);
  assert.match(source, /\.filter\(\(row\) => row\.some\(/);
  assert.match(source, /sourceRowNumber:\s*Number\(row\.sourceRowNumber\)/);
  assert.match(source, /__parse_errors/);
  assert.match(source, /Nieprawidłowy JSON w kolumnie Adresy \(JSON\)/);
}

console.log('11.77 contractor stage 4 (K11/K13) smoke OK');
