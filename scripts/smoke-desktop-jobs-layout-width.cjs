const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const columnsSource = fs.readFileSync(path.join(root, 'src', 'components', 'desktop-jobs-table.columns.jsx'), 'utf8');
const tableStyles = fs.readFileSync(path.join(root, 'src', 'styles', 'desktop-jobs-table.css'), 'utf8');
const appStyles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

assert.match(columnsSource, /key:\s*"client"[\s\S]*width:\s*"198px"/, 'Kolumna Klient w desktopowych Montażach ma być poszerzona o około 1/3 względem v8.01.');
assert.match(columnsSource, /key:\s*"status"[\s\S]*width:\s*"128px"/, 'Kolumna Status ma mieć przywróconą stałą szerokość 128px, żeby badge statusu był widoczny.');
assert.match(tableStyles, /\.desktopJobsTable\s*\{[\s\S]*table-layout:\s*fixed\s*!important;/, 'Desktopowa tabela Montaże ma używać fixed layout, żeby kolumna klienta nie rozszerzała całej tabeli.');
assert.match(tableStyles, /\[data-column="client"\]\s*\{[\s\S]*min-width:\s*176px\s*!important;[\s\S]*max-width:\s*224px\s*!important;/, 'Kolumna Klient ma mieć poszerzoną szerokość min/max.');
assert.match(tableStyles, /\[data-column="status"\]\s*\{[\s\S]*min-width:\s*var\(--desktop-jobs-col-status-width, 128px\)\s*!important;[\s\S]*max-width:\s*var\(--desktop-jobs-col-status-width, 128px\)\s*!important;/, 'Kolumna Status nie może być ściskana do 1%, bo ukrywa badge statusu.');
assert.match(appStyles, /\.desktopJobsTableCard \.jobTable\{min-width:720px\}/, 'Minimalna szerokość desktopowej tabeli Montaże ma być poszerzona po zwiększeniu kolumny klienta.');
assert.match(appStyles, /twoColDesktopStatusLeft:not\(\.singleModuleColumn\)[\s\S]*minmax\(0,1\.18fr\)[\s\S]*minmax\(500px,\.96fr\)/, 'Lewa tabela Montaży ma być szersza, a prawy panel szczegółów ma zachować co najmniej 500px na desktopie.');
assert.match(appStyles, /@media \(min-width:1400px\)[\s\S]*minmax\(0,1\.15fr\)[\s\S]*minmax\(560px,1fr\)/, 'Na szerszych monitorach lewa tabela ma pozostać poszerzona, a panel szczegółów ma zachować co najmniej 560px.');
assert.match(appStyles, /\.desktopDetailColumnTight[\s\S]*min-width:500px;/, 'Kolumna szczegółów po prawej stronie ma mieć wymuszoną czytelną szerokość.');

console.log('Desktop jobs layout width smoke OK');
process.exit(0);
