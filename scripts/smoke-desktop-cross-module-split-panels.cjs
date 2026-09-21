const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contractors = fs.readFileSync(path.join(root, 'src', 'components', 'contractors', 'ContractorsPanel.jsx'), 'utf8');
const devices = fs.readFileSync(path.join(root, 'src', 'components', 'devices', 'DevicesPanel.jsx'), 'utf8');
const calendar = fs.readFileSync(path.join(root, 'src', 'components', 'calendar', 'CalendarPanel.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

assert.match(contractors, /contractorsSplitWorkspace/, 'Kontrahenci powinni mieć układ tabela + panel boczny.');
assert.match(contractors, /contractorsSidePanel/, 'Kontrahenci powinni mieć prawy panel szczegółów.');
assert.match(contractors, /contractorsSideStickyBar/, 'Panel kontrahenta powinien mieć przyklejoną górną belkę.');
assert.match(contractors, /Powiązane montaże/, 'Panel kontrahenta musi pokazywać powiązane montaże.');
assert.match(contractors, /Urządzenia/, 'Panel kontrahenta musi pokazywać urządzenia.');
assert.match(contractors, /Historia SMS/, 'Panel kontrahenta musi pokazywać sekcję historii SMS.');
assert.match(contractors, /contractorsSelectedRow/, 'Wybrany kontrahent musi mieć podświetlony wiersz.');
assert.match(contractors, /aria-selected=\{isSelected \? 'true' : 'false'\}/, 'Wiersz kontrahenta powinien mieć aria-selected.');

assert.match(devices, /devicesSplitWorkspace/, 'Urządzenia powinny mieć układ lista + panel boczny.');
assert.match(devices, /devicesSidePanel/, 'Urządzenia powinny mieć prawy panel szczegółów.');
assert.match(devices, /devicesSideStickyBar/, 'Panel urządzenia powinien mieć przyklejoną górną belkę.');
assert.match(devices, /Braki do uzupełnienia/, 'Panel urządzenia musi wyróżniać braki danych.');
assert.match(devices, /Powiązany klient/, 'Panel urządzenia musi pokazywać powiązanego klienta.');
assert.match(devices, /Powiązany montaż/, 'Panel urządzenia musi pokazywać powiązany montaż.');
assert.match(devices, /Otwórz historię SMS/, 'Panel urządzenia musi mieć skrót do historii SMS.');
assert.match(devices, /devicesSelectedRow/, 'Wybrane urządzenie musi mieć podświetlony wiersz.');

assert.match(calendar, /calendarSplitWorkspace/, 'Kalendarz powinien mieć desktopowy split layout.');
assert.match(calendar, /calendarSplitDetailsPanel/, 'Kalendarz powinien mieć prawy panel dnia.');
assert.match(calendar, /calendarDetailsStickyHeader/, 'Prawy panel dnia powinien mieć sticky header.');
assert.match(calendar, /calendarJobDetailsCard/, 'Montaże w prawym panelu dnia powinny być kartami.');


assert.doesNotMatch(contractors, /<col className="contractorsColNip" \/>/, 'Desktopowa tabela kontrahentów nie powinna już mieć kolumny NIP.');
assert.doesNotMatch(contractors, /handleSort\('nip'\)/, 'Desktopowa tabela kontrahentów nie powinna sortować widocznej kolumny NIP.');
assert.match(styles, /\.devicesColContractor\{width:21%\}/, 'Kolumna klienta w urządzeniach powinna być zwężona do 21%.');
assert.match(styles, /\.contractorsSplitWorkspace\{[\s\S]*?grid-template-columns:\s*minmax\(0,1fr\) clamp\(440px,35vw,520px\);/, 'Panel kontrahenta powinien mieć poszerzony prawy panel.');
assert.match(styles, /\.devicesSplitWorkspace\{[\s\S]*?grid-template-columns:\s*minmax\(0,1fr\) clamp\(440px,35vw,520px\);/, 'Panel urządzenia powinien mieć poszerzony prawy panel.');

assert.match(styles, /\.contractorsSidePanel,[\s\S]*?\.devicesSidePanel\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?overflow:\s*auto;/, 'Panele kontrahentów i urządzeń muszą mieć osobne przewijanie.');
assert.match(styles, /\.calendarSplitWorkspace \.calendarCard\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?overflow:\s*auto;/, 'Lewy kalendarz musi być stabilny i przewijany osobno.');
assert.match(styles, /\.calendarSplitDetailsPanel\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?overflow:\s*auto;/, 'Prawy panel kalendarza musi mieć osobne przewijanie.');
assert.match(styles, /\.calendarDetailsStickyHeader\s*\{[\s\S]*?position:\s*sticky;/, 'Header dnia w kalendarzu musi być sticky.');

console.log('Desktop cross-module split panels smoke OK');
process.exit(0);
