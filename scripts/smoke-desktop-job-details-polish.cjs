const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const panelSource = fs.readFileSync(path.join(root, 'src', 'components', 'JobDetailsPanel.jsx'), 'utf8');
const rowSource = fs.readFileSync(path.join(root, 'src', 'components', 'DesktopJobsTableRow.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const compactStyles = fs.readFileSync(path.join(root, 'src', 'components', 'job-details-desktop-v1215.css'), 'utf8');

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
assert.doesNotMatch(panelSource, /<span>Adres i termin<\/span>/, 'Panel szczegółów nie powinien mieć osobnej sekcji Adres i termin.');
assert.match(
  panelSource,
  /<span>Klient<\/span>[\s\S]*?<span>Adres<\/span>[\s\S]*?<span>Email<\/span>[\s\S]*?<span>Telefon<\/span>[\s\S]*?<span>Data montażu<\/span>[\s\S]*?<span>Zakończono<\/span>[\s\S]*?DesktopJobProtocolCard/,
  'Sekcja Klient powinna zawierać kolejno adres, kontakt i daty przed protokołem.'
);
assert.match(panelSource, /Urządzenia/, 'Panel szczegółów powinien mieć sekcję Urządzenia.');
assert.match(panelSource, /jobDetailsClientMeta/, 'Sekcja Klient powinna mieć własny zwarty układ desktopowy.');
assert.match(panelSource, /jobDetailsClientCompactItem/, 'Kontakt i daty powinny używać węższych kafelków.');
assert.match(panelSource, /jobCompletionByBadge/, 'Osoba kończąca zlecenie powinna być pokazana jako mały badge.');
assert.match(panelSource, /getInitials\(completedByLabel\)/, 'Badge zakończenia powinien zawierać inicjały zamiast pełnego napisu „Przez”.');
assert.doesNotMatch(panelSource, /Przez:\s*\{completedByLabel\}/, 'Desktop nie powinien pokazywać pełnego napisu „Przez: imię nazwisko”.');
assert.match(panelSource, /desktopDevicesExpanded/, 'Urządzenia muszą mieć stan zwijania na desktopie.');
assert.match(panelSource, /desktopPhotosExpanded/, 'Zdjęcia muszą mieć stan zwijania na desktopie.');
assert.match(panelSource, /setDesktopDevicesExpanded\(!selectedJobIsCompleted\)/, 'Urządzenia mają startować zwinięte wyłącznie dla zakończonych montaży.');
assert.match(panelSource, /setDesktopPhotosExpanded\(!selectedJobIsCompleted\)/, 'Zdjęcia mają startować zwinięte wyłącznie dla zakończonych montaży.');
assert.match(panelSource, /!isCompletedJob \|\| desktopDevicesExpanded/, 'Urządzenia w niezakończonych montażach muszą pozostać stale rozwinięte.');
assert.match(panelSource, /!isCompletedJob \|\| desktopPhotosExpanded/, 'Zdjęcia w niezakończonych montażach muszą pozostać stale rozwinięte.');
assert.doesNotMatch(panelSource, /desktopCommentsExpanded|desktopAdminNoteExpanded|desktopViewersExpanded/, 'Na desktopie nie wolno zwijać pozostałych sekcji.');


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
assert.match(compactStyles, /jobDetailsClientCompactItem[\s\S]*flex:\s*0 1 180px[\s\S]*width:\s*180px/, 'Kafelki kontaktu i dat powinny być wyraźnie węższe niż pełna szerokość panelu.');
assert.match(compactStyles, /jobCompletionByBadge[\s\S]*width:\s*22px[\s\S]*height:\s*22px/, 'Badge osoby kończącej zlecenie powinien być mały.');
assert.match(compactStyles, /desktopDetailsSectionToggle[\s\S]*cursor:\s*pointer/, 'Nagłówki zwijanych sekcji muszą być klikalne.');
assert.match(panelSource, /desktopJobDevicesSection[\\s\\S]*isExpanded[\\s\\S]*isCollapsed/, 'Sekcja Urządzenia musi oznaczać stan zwinięty/rozwinięty.');
assert.match(panelSource, /desktopJobPhotosSection[\\s\\S]*isExpanded[\\s\\S]*isCollapsed/, 'Sekcja Zdjęcia musi oznaczać stan zwinięty/rozwinięty.');
assert.match(panelSource, /desktopDetailsSectionChevron\" aria-hidden=\"true\" \\/>/, 'Chevron powinien być ikoną bez dodatkowego tekstu.');
assert.match(compactStyles, /desktopCompletedCollapsibleSection\\.isCollapsed[\\s\\S]*justify-self:\\s*start[\\s\\S]*background:\\s*transparent\\s*!important/, 'Zwinięty kafelek powinien być kompaktowy, a nie rozciągnięty na całą szerokość.');
assert.match(compactStyles, /desktopJobDevicesSection\\.isCollapsed[\\s\\S]*248px/, 'Zwinięte Urządzenia powinny mieć zwartą szerokość.');
assert.match(compactStyles, /desktopJobPhotosSection\\.isCollapsed[\\s\\S]*278px/, 'Zwinięte Zdjęcia powinny mieć zwartą szerokość.');
assert.match(compactStyles, /desktopDetailsSectionChevron[\\s\\S]*width:\\s*28px[\\s\\S]*height:\\s*28px[\\s\\S]*border:/, 'Chevron powinien mieć wyraźny, większy holder.');
assert.match(compactStyles, /desktopDetailsSectionChevron::before[\\s\\S]*border-right:\\s*2px solid currentColor[\\s\\S]*border-bottom:\\s*2px solid currentColor/, 'Chevron powinien być rysowany grubszą, czytelną kreską.');


console.log('Desktop job details polish smoke OK');
process.exit(0);
