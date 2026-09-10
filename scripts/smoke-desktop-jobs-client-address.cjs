const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const columnsSource = fs.readFileSync(path.join(root, 'src', 'components', 'desktop-jobs-table.columns.jsx'), 'utf8');
const stylesSource = fs.readFileSync(path.join(root, 'src', 'styles', 'desktop-jobs-table.css'), 'utf8');

assert.match(columnsSource, /function renderClientCell\(\{ job \}\) \{[\s\S]*const address = getJobAddress\(job\);/, 'Desktopowa komórka klienta musi pobierać pełny adres z getJobAddress(job).');
assert.match(columnsSource, /className="desktopClientName"/, 'Komórka klienta musi nadal pokazywać nazwę klienta.');
assert.match(columnsSource, /className="desktopClientAddress"/, 'Adres musi być pokazany pod nazwą klienta w tej samej komórce.');
assert.doesNotMatch(columnsSource, /key:\s*"address"/, 'Desktopowa tabela Montaże nie może już mieć osobnej kolumny Adres.');
assert.doesNotMatch(columnsSource, /label:\s*"Adres"/, 'Nagłówek Adres ma być usunięty z desktopowej tabeli Montaże.');
assert.doesNotMatch(columnsSource, /renderAddressCell/, 'Osobny renderer kolumny adresu ma być usunięty.');
assert.match(stylesSource, /\.desktopClientCell\s*\{[\s\S]*flex-direction:\s*column;/, 'Klient i adres mają być ułożone jeden pod drugim.');
assert.match(stylesSource, /\.desktopClientAddress\s*\{[\s\S]*font-size:\s*11px;/, 'Adres pod klientem ma być mniejszy i spokojniejszy wizualnie po zwężeniu kolumny.');
assert.doesNotMatch(stylesSource, /\[data-column="address"\]/, 'Style desktopowej tabeli nie powinny już definiować osobnej kolumny address.');

console.log('Desktop jobs client address smoke OK');
process.exit(0);
