const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const panelSource = fs.readFileSync(path.join(root, 'src', 'components', 'JobDetailsPanel.jsx'), 'utf8');
const rowSource = fs.readFileSync(path.join(root, 'src', 'components', 'DesktopJobsTableRow.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

assert.match(panelSource, /jobDetailsStickyBar/, 'Prawy panel Montaże musi mieć przyklejoną górną belkę.');
assert.match(panelSource, /jobDetailsQuickActions/, 'Prawy panel Montaże musi mieć kontener szybkich akcji.');
assert.match(panelSource, /Edytuj/, 'Szybkie akcje powinny zawierać edycję montażu.');
assert.match(panelSource, /Zamknij/, 'Szybkie akcje powinny zawierać zamknięcie panelu.');
assert.doesNotMatch(panelSource, />\s*Zadzwoń\s*</, 'Szybkie akcje w prawym panelu nie powinny zawierać telefonu.');
assert.doesNotMatch(panelSource, />\s*SMS\s*</, 'Szybkie akcje w prawym panelu nie powinny zawierać SMS-a.');
assert.doesNotMatch(panelSource, />\s*Mapa\s*</, 'Szybkie akcje w prawym panelu nie powinny zawierać mapy.');
assert.doesNotMatch(panelSource, />\s*Kalendarz\s*</, 'Szybkie akcje w prawym panelu nie powinny zawierać kalendarza.');
assert.match(panelSource, /jobTypeTag desktopJobTypeTag jobDetailsStatusChip/, 'Status w prawym panelu powinien używać tego samego stylu badge co tabela Montaże.');
assert.match(panelSource, /jobDetailsSectionCard/, 'Szczegóły montażu powinny być uporządkowane w karty/sekcje.');
assert.match(panelSource, /Klient/, 'Panel szczegółów powinien mieć sekcję Klient.');
assert.match(panelSource, /Adres i termin/, 'Panel szczegółów powinien mieć sekcję Adres i termin.');
assert.match(panelSource, /Urządzenia/, 'Panel szczegółów powinien mieć sekcję Urządzenia.');

assert.match(rowSource, /desktopSelectedJobRow/, 'Wybrany wiersz w tabeli Montaże musi mieć wyraźną klasę zaznaczenia.');
assert.match(rowSource, /aria-selected=\{selected \? "true" : "false"\}/, 'Wybrany wiersz powinien mieć aria-selected.');

assert.match(
  styles,
  /@media\s*\(min-width:701px\)\s*\{[\s\S]*\.desktopJobsSplitScroll\s+\.jobDetailsStickyBar\s*\{[\s\S]*position:\s*sticky;[\s\S]*top:\s*0;/,
  'Sticky belka panelu szczegółów ma działać tylko w desktopowym układzie Montaży.'
);
assert.match(styles, /\.jobDetailsSectionCard\s*\{[\s\S]*border-radius:\s*18px;[\s\S]*background:/, 'Karty szczegółów muszą mieć styl sekcji.');
assert.match(styles, /\.jobDetailsStatusChip\s*\{[\s\S]*min-height:\s*32px[\s\S]*padding:\s*4px 12px/, 'Status w prawym panelu ma mieć rozmiar zgodny z badge z tabeli.');
assert.match(styles, /\.desktopJobsTable tbody tr\.desktopSelectedJobRow,[\s\S]*box-shadow:\s*inset 4px 0 0/, 'Wybrany wiersz musi mieć mocniejsze podświetlenie.');

console.log('Desktop job details polish smoke OK');
process.exit(0);
