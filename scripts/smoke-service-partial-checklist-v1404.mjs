// WAWIS 14.04 — wynik przeglądu bez kompletu sześciu czynności + wyraźne podpowiedzi blokad.
// Zgłoszenie właściciela 31.10.2026 (zrzuty 19:48): „nic nie jest podświetlone, coś się zablokowało”
// — zaznaczone 2 z 6 czynności, a zapis wymagał wszystkich sześciu (szary, łatwy do przeoczenia tekst).
// Zachowanie bazy sprawdza scripts/service-visit-sql-v1399.sh (RED bez migracji v1404).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const exec = read('src/mobile791/components/devices/ServiceExecutionPanel.jsx');
// Wykonanie rzeczywistej logiki blokady z pliku komponentu (bez zgadywania przez regex).
const block = exec.match(/const doneChecks=[\s\S]*?:needPhoto\?'Dodaj zdjęcie usterki, aby zapisać wynik\.':'';/)?.[0];
assert.ok(block, 'Logika blokady zapisu istnieje.');
const { SERVICE_VISIT_CHECKS } = await import('../src/mobile791/modules/service-visit-checklist.js');
const evaluate = (checklist, result, needPhoto) => new Function('SERVICE_VISIT_CHECKS', 'draft', 'needPhoto',
  block + '\nreturn {doneChecks,anyCheckDone,skippedChecks,saveBlockReason};')(SERVICE_VISIT_CHECKS, { checklist, result }, needPhoto);
const all = v => Object.fromEntries(SERVICE_VISIT_CHECKS.map(({ key }) => [key, v]));
const two = { ...all(false), filtry: true, jednostka_wewnetrzna: true };

let r = evaluate(two, 'usterka', false);
assert.equal(r.saveBlockReason, '', 'Zrzut właściciela: 2 z 6 + usterka + zdjęcie → zapis dozwolony.');
assert.equal(r.skippedChecks, 4);
r = evaluate(all(false), 'sprawne', false);
assert.equal(r.saveBlockReason, 'Zaznacz co najmniej jedną wykonaną czynność.');
r = evaluate(two, '', false);
assert.equal(r.saveBlockReason, 'Wybierz wynik: „Sprawne” albo „Usterka”.');
r = evaluate(two, 'usterka', true);
assert.equal(r.saveBlockReason, 'Dodaj zdjęcie usterki, aby zapisać wynik.');
r = evaluate(all(true), 'sprawne', false);
assert.equal(r.saveBlockReason, '');
assert.equal(r.skippedChecks, 0);

assert.match(exec, /disabled=\{Boolean\(busy\)\|\|Boolean\(saveBlockReason\)\}/, 'Przycisk zablokowany dokładnie z pokazanego powodu.');
assert.match(exec, /<p className="serviceAdminHint" role="note">\{saveBlockReason\}<\/p>/, 'Powód blokady widoczny pod przyciskiem.');
assert.match(exec, /Najpierw zapisz wynik co najmniej jednego urządzenia — wtedy odblokuje się podpis\./, 'Powód blokady podpisu widoczny.');
assert.match(exec, /Wynik nie jest jeszcze zapisany — naciśnij „Zapisz wynik urządzenia”\./);
assert.doesNotMatch(exec, /mandatoryChecksDone|wszystkich sześciu czynności/, 'Brak starej zasady „wszystkie sześć”.');
assert.match(read('src/mobile791/components/devices/ServiceAdminPanel.css'), /\.serviceAdminPage \.serviceAdminHint\{/);

const pdf = read('src/mobile791/modules/service-visit-pdf.js');
assert.match(pdf, /`✗  \$\{label\} — nie wykonano`/, 'PDF oznacza niewykonane czynności.');

const sql = read('supabase/migrations/20261031200000_service_visit_partial_checklist_v1404.sql');
assert.match(sql, /not exists\(select 1 from jsonb_each\(p_checklist\) k where k\.value = 'true'::jsonb\)/, 'Serwer: co najmniej jedna czynność.');
assert.doesNotMatch(sql, /k\.value <> 'true'::jsonb/, 'Serwer: bez wymogu wszystkich sześciu.');
assert.match(sql, /Do każdej wykrytej usterki wymagane jest zapisane zdjęcie/, 'Zasada zdjęcia usterki zachowana.');
console.log('WAWIS 14.04 partial checklist + hints: PASS');
