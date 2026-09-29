import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as desktop from '../src/modules/contractors.js';
import * as mobile from '../src/mobile791/modules/contractors.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

for (const mod of [desktop, mobile]) {
  assert.equal(mod.normalizeComparable('  Jan   Kowalski  '), 'jan kowalski');
  assert.equal(mod.normalizeComparable('GÓRSKI'), 'górski');
  assert.notEqual(mod.normalizeComparable('Górski'), mod.normalizeComparable('Gorski'));

  assert.equal(mod.normalizeSearchComparable('Górski'), 'gorski');
  assert.equal(mod.normalizeSearchComparable('Gorski'), 'gorski');
  assert.equal(mod.normalizeSearchComparable('  Jan   Kowalski  '), 'jan kowalski');

  const polish = ['500600700', '500 600 700', '+48 500 600 700', '0048 500 600 700', '48 500 600 700'];
  for (const value of polish) {
    assert.equal(mod.normalizeContractorPhone(value), '+48500600700', `phone normalization mismatch for ${value}`);
  }

  assert.equal(mod.normalizeContractorPhone('+49 151 2345678'), '+491512345678');
  assert.equal(mod.normalizeContractorPhone('0049 151 2345678'), '+491512345678');
  assert.equal(mod.normalizeContractorPhone('491512345678'), '491512345678', 'Nie zgadujemy kodu kraju bez +/00.');
  assert.equal(mod.normalizeContractorEmail(' TEST@Example.PL '), 'test@example.pl');
  assert.equal(mod.normalizeContractorNip('123-456-78-90'), '1234567890');

  const dupByPhone = mod.findContractorDuplicates([
    { id: 'a', company_name: 'Firma A', phone: '+48 500 600 700' },
  ], {
    company_name: 'Firma B',
    phone: '500600700',
  });
  assert.equal(dupByPhone.length, 1);
  assert.ok(dupByPhone[0].reasons.includes('telefon'));

  const accentOnlyName = mod.findContractorDuplicates([
    { id: 'g1', company_name: 'Górski', phone: '' },
  ], {
    company_name: 'Gorski',
    phone: '',
  });
  assert.equal(accentOnlyName.length, 0, 'Usunięcie polskich znaków nie może samo tworzyć duplikatu tożsamości.');
}

const desktopPanel = read('src', 'components', 'contractors', 'ContractorsPanel.jsx');
const mobilePanel = read('src', 'mobile791', 'components', 'contractors', 'ContractorsPanel.jsx');
for (const [label, source] of [['desktop', desktopPanel], ['mobile', mobilePanel]]) {
  assert.match(source, /normalizeSearchComparable/,`${label}: wyszukiwarka ma używać łagodnej normalizacji wyszukiwania`);
  assert.match(source, /normalizeContractorPhone/,`${label}: wyszukiwarka ma normalizować telefon`);
  assert.match(source, /normalizeContractorNip/,`${label}: wyszukiwarka ma normalizować NIP`);
  assert.match(source, /normalizeContractorAddresses\(item\)\.flatMap/,`${label}: wyszukiwanie ma obejmować wszystkie adresy kontrahenta`);
}

const migration = read('supabase', 'migrations', 'current', '20260929113000_contractor_normalization_v1179.sql');
assert.match(migration, /create or replace function public\.normalize_contractors_phone/i);
assert.match(migration, /when digits ~ '\^0048\[0-9\]\{9\}\$'/i);
assert.match(migration, /when digits ~ '\^48\[0-9\]\{9\}\$'/i);
assert.match(migration, /when digits ~ '\^\[0-9\]\{9\}\$'/i);
assert.match(migration, /drop index if exists public\.contractors_phone_lookup_idx/i);
assert.match(migration, /create index contractors_phone_lookup_idx/i);
assert.doesNotMatch(migration, /advisory|pg_advisory|unique index contractors_phone|lock key/i);

console.log('11.79 contractor stage 6 K12 normalization smoke OK; K14 intentionally excluded');
