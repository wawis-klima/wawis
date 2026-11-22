// WAWIS 14.77 — Diagnostyka uporządkowana (decyzja właściciela 22.11.2026): działy zwijane, bez opisów,
// bez kart „AI tabliczek” i „Odczyt tabliczek bez internetu”. Funkcje bez zmian, rozmiary czcionek bez zmian.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(path, 'utf8');
let checks = 0;
const ok = (cond, message) => { assert.ok(cond, message); checks += 1; };

const card = read('src/components/common/CollapsibleCard.jsx');
ok(/<details ref=\{detailsRef\} className=\{cardClass\}/.test(card) && /<summary className="collapsibleCardSummary"/.test(card), 'dział = details/summary (zwijanie bez skryptu)');
ok(!/open=\{/.test(card) && /detailsRef\.current\.open = true/.test(card) && !/\.open = false/.test(card), 'domyślnie zwinięty; otwiera się programowo, nigdy nie zwija sam');

const usesCard = {
  'src/components/auth/MfaSettingsCard.jsx': 'Kod z telefonu przy logowaniu',
  'src/components/auth/UserAccessCard.jsx': 'Logowania i blokada kont',
  'src/mobile791/components/diagnostics/SignaturePatternCard.jsx': 'Wzór podpisu',
  'src/mobile791/components/diagnostics/StaffSignaturesAdminCard.jsx': 'Wzory podpisów pracowników',
  'src/components/diagnostics/StaffSignaturesCard.jsx': 'Wzory podpisów pracowników',
};
for (const [path, title] of Object.entries(usesCard)) {
  const src = read(path);
  ok(src.includes('<CollapsibleCard') && src.includes(`title="${title}"`) && !/<section className="(mobileDiagnosticsCard|diagnosticsEventsCard)"/.test(src), `${path}: dział zwijany „${title}”`);
}
// Opisy usunięte na prośbę właściciela.
ok(!read('src/components/auth/MfaSettingsCard.jsx').includes('Po haśle aplikacja prosi o 6 cyfr'), 'kod z telefonu: bez opisu');
ok(!read('src/components/auth/UserAccessCard.jsx').includes('O każdym nowym logowaniu dostajesz powiadomienie'), 'logowania: bez opisu');
ok(!read('src/mobile791/components/diagnostics/SignaturePatternCard.jsx').includes('Twój podpis, którym aplikacja sama podpisuje'), 'wzór podpisu: bez opisu');
ok(!read('src/components/diagnostics/StaffSignaturesCard.jsx').includes('Wzorem pracownika podpisują się automatycznie'), 'wzory pracowników (komputer): bez opisu');
// Brak wzoru podpisu — dział otwiera się sam (protokoły czekają na podpis).
ok(/defaultOpen=\{!loading && !loadError && !pattern\}/.test(read('src/mobile791/components/diagnostics/SignaturePatternCard.jsx')), 'brak wzoru → dział otwarty');

const mobile = read('src/mobile791/components/diagnostics/MobileDiagnosticsPanel.jsx');
ok(!mobile.includes('Odczyt tabliczek bez internetu') && !mobile.includes('diagnostics-prepare-readers'), 'bez karty czytników tabliczek');
ok(!mobile.includes('AI tabliczek') && !mobile.includes('getNameplateAiUsageSummary'), 'bez karty AI tabliczek');
ok(/testId="diagnostics-offline-card" title="Zmiany offline — to konto"/.test(mobile), 'zmiany offline: dział zwijany');
ok(/testId="diagnostics-actions-card" title="Akcje" defaultOpen/.test(mobile), 'akcje: dział otwarty domyślnie');
for (const id of ['diagnostics-sync-now', 'diagnostics-photo-queue-repair']) ok(mobile.includes(`data-testid="${id}"`), `akcja ${id} zostaje`);
// Czytniki nadal pobierają się same przy starcie aplikacji (bez przycisku w Diagnostyce).
ok(/scheduleNameplateReaderWarmup\(\)/.test(read('src/mobile791/App.jsx')), 'czytniki: automatyczne pobranie bez zmian');

// Wygląd: osobny arkusz (pliki z dowodem równoważności palety bez zmian), tylko istniejące zmienne kolorów,
// bez nowych rozmiarów czcionek na telefonie; na komputerze stan jak dotychczasowy nagłówek (12px).
ok(card.includes("import './collapsible-card.css';"), 'arkusz działu wczytywany z komponentem');
const css = read('src/components/common/collapsible-card.css').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css), 'tylko istniejące zmienne kolorów');
const sizes = [...css.matchAll(/([^{}]+)\{[^}]*font-size:([^;}]+)/g)].map((m) => [m[1].trim(), m[2].trim()]);
ok(sizes.length === 1 && sizes[0][0].startsWith('.diagnosticsEventsCard') && sizes[0][1] === '12px', `rozmiar czcionki tylko dla stanu na komputerze: ${JSON.stringify(sizes)}`);
const registry = JSON.parse(read('scripts/css-token-registry.json')).files;
ok(!registry['src/components/common/collapsible-card.css'], 'nowy arkusz poza rejestrem dowodu równoważności');

console.log(`smoke-diagnostics-collapsible-v1477: OK (${checks} checks)`);
