// WAWIS 14.85 (zgłoszenie właściciela 22.11.2026): edycja montażu — „Zamknij” obok „Zapisz zmiany” na dole;
// tabela tabliczek w 3 kolumnach (bez wystającego znacznika i dublującego napisu „Zapisano w systemie”).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const modal = fs.readFileSync('src/mobile791/components/modals/JobFormModal.jsx', 'utf8');
const panel = fs.readFileSync('src/mobile791/components/JobDetailsPanel.jsx', 'utf8');
const css = fs.readFileSync('src/mobile791/v1485-edit-actions-device-table.css', 'utf8');
const main = fs.readFileSync('src/main.jsx', 'utf8');

const head = modal.slice(modal.indexOf('<div className="jobHead">'), modal.indexOf('{!editingJobId ? ('));
assert.doesNotMatch(head, /<button[^>]*>Zamknij/, 'w edycji bez „Zamknij” w nagłówku');
// 14.88: także nowe zlecenie — „Zamknij” na dole obok „Zapisz zlecenie”, bez „Wprowadź głosowo” u góry.
assert.match(modal, /<div className="row rightAlign jobFormEditActions">\s*<button type="button" className="btn jobFormEditClose" onClick=\{handleClose\}>Zamknij<\/button>\s*<button type="submit" className="btn primary saveJobBtn"/, '„Zamknij” przed przyciskiem zapisu w dolnym rzędzie');
assert.doesNotMatch(modal, /jobFormQuickActions|jobFormCloseBtn/, 'nowe zlecenie bez „Zamknij” i „Wprowadź głosowo” u góry');
assert.match(modal, /\{editingJobId \? <ClientVoiceInput onApply=\{applyVoiceClientData\} disabled=\{busy\} iconOnly=\{isAdmin\} \/> : null\}/, 'wprowadzanie głosowe zostaje w edycji');
assert.match(css, /adminContactPairV1302 \{\s*grid-template-columns: minmax\(0, 1fr\) auto !important;/, 'edycja: NIP i „Szukaj w GUS” w jednej linii');
assert.match(css, /adminContactPairV1302 > input\.input:first-child \{\s*grid-column: 1 \/ -1 !important;/, 'edycja: telefon w całej linii');
assert.match(css, /\.row\.jobFormEditActions \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, 'dwa równe przyciski');

const header = panel.match(/<div className="deviceUnitDocumentationTableHeader" aria-hidden="true">([\s\S]*?)<\/div>/)[1];
assert.deepEqual([...header.matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]), ['Urządzenie', 'Model / moc', 'Tabliczka']);
assert.match(panel, /deviceUnitDocumentationSync sync-/, 'napis stanu zostaje (dla innych stanów i czytnika ekranu)');
assert.match(css, /deviceUnitDocumentationRow \{\s*grid-template-columns: minmax\(0, 1\.25fr\) minmax\(0, 1fr\) 52px !important;/, '3 kolumny, bez minimalnych szerokości');
assert.match(css, /deviceUnitDocumentationStatus:has\(\.sync-uploaded\) \{[\s\S]*?clip: rect\(0 0 0 0\)/, '„Zapisano w systemie” tylko dla czytnika ekranu');
assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'bez kolorów w arkuszu');
const lastMobileCss = main.indexOf("import('./mobile791/v1485-edit-actions-device-table.css')");
assert.ok(lastMobileCss > main.indexOf("import('./mobile791/v1323-mobile-protocol-actions.css')"), 'arkusz po arkuszach telefonu');
assert.ok(lastMobileCss < main.indexOf("window.__wawisBootTrace?.mark?.('styles-ready')"), 'arkusz przed pierwszym renderem');

console.log('PASS WAWIS 14.85/14.88 — edycja i nowe zlecenie: Zamknij obok zapisu na dole; NIP + GUS w jednej linii; tabliczki: 3 kolumny.');
