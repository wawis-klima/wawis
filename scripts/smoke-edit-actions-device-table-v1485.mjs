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
assert.match(modal, /className=\{`row rightAlign\$\{editingJobId \? " jobFormEditActions" : ""\}`\}>\s*\{editingJobId \? <button type="button" className="btn jobFormEditClose" onClick=\{handleClose\}>Zamknij<\/button> : null\}\s*<button type="submit" className="btn primary saveJobBtn"/, '„Zamknij” przed „Zapisz zmiany” w dolnym rzędzie');
assert.match(modal, /jobFormQuickActions[\s\S]{0,200}jobFormCloseBtn/, 'nowe zlecenie: „Zamknij” u góry bez zmian');
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

console.log('PASS WAWIS 14.85 — edycja: Zamknij + Zapisz zmiany na dole; tabliczki: 3 kolumny bez wystającego znacznika.');
