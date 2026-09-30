import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composePostalCity, normalizePostalCode, splitPostalCity } from '../src/modules/postal-code.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

assert.deepEqual(splitPostalCity('42-480 Poręba'), { postalCode: '42-480', city: 'Poręba' });
assert.deepEqual(splitPostalCity('Poręba'), { postalCode: '', city: 'Poręba' });
assert.equal(composePostalCity('Poręba', '42480'), '42-480 Poręba');
assert.equal(composePostalCity('Poręba', '42-480'), '42-480 Poręba');
assert.equal(normalizePostalCode('42 480'), '42-480');

const mobile = read('src/mobile791/components/modals/JobFormModal.jsx');
const desktop = read('src/components/modals/JobFormModal.jsx');
const mobileCss = read('src/mobile791/styles.css');
const edge = read('supabase/functions/postal-code-lookup/index.ts');
const fakturownia = read('supabase/functions/fakturownia-client/index.ts');
const mobileApp = read('src/mobile791/App.jsx');
const desktopApp = read('src/App.jsx');

assert.match(mobile, /jobNipCompactInput/, 'Mobile NIP powinien mieć kompaktową wysokość.');
assert.match(mobile, /postalCityFieldRow/, 'Mobile musi mieć miejscowość i kod w jednym rzędzie.');
assert.ok(
  mobile.indexOf('placeholder="Ulica i numer"') < mobile.indexOf('className="postalCityFieldRow"'),
  'Mobile musi mieć ulicę przed miejscowością i kodem pocztowym.',
);
assert.match(mobile, /onBlur=\{\(\) => refreshPostalCode\(\)\}/, 'Mobile ma dobierać kod po wpisaniu miejscowości.');
assert.match(desktop, /postalCityFieldRow/, 'Desktop musi mieć osobne pole kodu pocztowego.');
assert.match(mobileCss, /grid-template-columns:minmax\(0,1fr\) 128px 44px/, 'Mobile ma wyrównany układ miejscowość/kod/mikrofon.');
assert.match(edge, /services\.gugik\.gov\.pl\/uug/, 'Lookup kodu ma korzystać z GUGiK UUG.');
assert.match(edge, /request.*GetAddress/s, 'Lookup ma używać GetAddress.');
assert.match(fakturownia, /post_code:\s*cityParts\.postalCode/, 'Fakturownia ma otrzymywać osobny kod pocztowy.');
assert.match(fakturownia, /city:\s*cityParts\.city/, 'Fakturownia ma otrzymywać miejscowość bez prefiksu kodu.');
assert.match(mobileApp, /supabase=\{supabase\}[\s\S]*isAdmin=\{isAdmin\}/, 'Mobile formularz musi dostać klienta Supabase.');
assert.match(desktopApp, /supabase=\{supabase\}/, 'Desktop formularz musi dostać klienta Supabase.');

console.log('OK: v11.96 automatyczny kod pocztowy, układ mobile i integracja Fakturowni.');
