const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const panelSource = fs.readFileSync(path.join(root, 'src', 'components', 'dashboard', 'Centrum360Panel.jsx'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const stylesSource = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

assert.match(panelSource, /job\.client\s*\|\|\s*job\.title/, 'Centrum 360 musi używać pola client/title jako nazwy klienta.');
assert.match(panelSource, /buildContractorsById/, 'Centrum 360 musi mieć fallback do nazwy kontrahenta po contractor_id.');
assert.match(panelSource, /getAssignedInstallerNames/, 'Centrum 360 musi pobierać przypisanych monterów z danych zlecenia.');
assert.match(panelSource, /renderInitialBadges\(getAssignedInstallerNames/, 'Centrum 360 ma pokazywać monterów jako okrągłe badge z inicjałami, bez pełnych imion i nazwisk.');
assert.match(panelSource, /getJobTypeClass\(job\)/, 'Statusy w Centrum 360 muszą używać tych samych klas badge co lista Montaże.');
assert.match(panelSource, /getJobTypeLabel\(job\)/, 'Statusy w Centrum 360 muszą używać tych samych etykiet co lista Montaże.');
assert.doesNotMatch(panelSource, /className=\"centrum360InstallerBadge\"/, 'Centrum 360 nie może używać osobnego tekstowego badge montera.');
assert.doesNotMatch(panelSource, /getJobInstaller\(/, 'Centrum 360 nie może sklejać pełnych nazw monterów w jeden tekst.');
assert.match(panelSource, /Array\.isArray\(job\.viewers\)/, 'Centrum 360 musi uwzględniać monterów z job.viewers.');
assert.match(appSource, /profiles=\{profiles\}/, 'Centrum 360 musi dostać profile, żeby wyświetlać nazwy monterów.');
assert.doesNotMatch(panelSource, /label:\s*'Urządzenia'/, 'Kafelek Urządzenia ma być usunięty z góry Centrum 360.');
assert.match(panelSource, /Montaże bieżący tydzień/, 'Kafelek tygodniowy ma mieć etykietę Montaże bieżący tydzień.');
assert.doesNotMatch(panelSource, /Montaże 7 dni/, 'Centrum 360 nie może już pokazywać mylącej etykiety Montaże 7 dni.');
assert.match(panelSource, /startOfIsoWeek/, 'Bieżący tydzień ma być liczony od poniedziałku, nie jako kolejne 7 dni.');
assert.match(stylesSource, /\.centrum360CardsGrid\s*\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, 'Górne kafelki Centrum 360 mają być w układzie 3-kolumnowym.');

assert.match(appSource, /loadSmsModuleData/, 'Centrum 360 musi pobierać snapshot SMS tak jak moduł SMS.');
assert.match(appSource, /fetchAdminDevices/, 'Centrum 360 musi pobierać urządzenia do licznika SMS, tak jak moduł SMS.');
assert.match(appSource, /buildSmsTargets\(\{\s*jobs,[\s\S]*devices:/, 'Centrum 360 musi liczyć SMS na podstawie targetów jobs+devices.');
assert.match(appSource, /deriveSmsQueue\(targets,[\s\S]*logs/, 'Licznik SMS w Centrum 360 musi używać tej samej kolejki co moduł SMS.');
assert.match(appSource, /setDashboardSmsQueueCount\(queue\.length\)/, 'Kafelek SMS do wysłania ma pokazywać liczbę klientów z kolejki SMS.');
assert.match(panelSource, /smsDueToday:\s*smsDueTodayCount/, 'Kafelek SMS do wysłania musi używać wyliczonej kolejki SMS, a nie samego RPC.');
assert.match(panelSource, /className="centrum360DateBadge"/, 'Nadchodzące montaże w Centrum 360 mają pokazywać tylko datę, bez godziny.');
assert.doesNotMatch(panelSource, /formatTime\(/, 'Nadchodzące montaże w Centrum 360 nie mogą pokazywać godziny 02:00 przy dacie montażu.');
assert.doesNotMatch(panelSource, /centrum360TimeBadge/, 'Centrum 360 nie może używać starego badge godziny przy nadchodzących montażach.');
assert.match(stylesSource, /\.centrum360DateBadge/, 'Style muszą zawierać nowy badge daty bez godziny.');

assert.match(stylesSource, /\.centrum360UpcomingItem\{[^}]*grid-template-columns:68px minmax\(0,1fr\) 128px 156px/, 'Nadchodzące montaże w Centrum 360 muszą mieć szerszą kolumnę monterów na 4 badge’e w jednej linii.');
assert.match(stylesSource, /\.centrum360StatusTag\{[^}]*min-width:128px!important/, 'Status w Centrum 360 ma mieć stałą szerokość 128px.');
assert.match(stylesSource, /\.centrum360InstallerBadges\{[^}]*min-width:156px;max-width:156px/, 'Badge monterów w Centrum 360 muszą mieć szerokość 156px, żeby zmieścić 4 inicjały w jednej linii.');
assert.match(stylesSource, /\.centrum360InstallerBadges\{[^}]*justify-content:center/, 'Badge monterów w Centrum 360 muszą być wyśrodkowane w poszerzonej kolumnie monterów.');
assert.match(stylesSource, /\.centrum360StatusTag\{[^}]*min-height:32px!important/, 'Status w Centrum 360 ma zachować wysokość 32px.');
assert.match(stylesSource, /\.centrum360InstallerBadges \.initialsRow\{[^}]*min-height:32px!important/, 'Wiersz badge’y monterów w Centrum 360 musi wymusić wysokość 32px nad globalnym CSS.');
assert.match(stylesSource, /\.centrum360InstallerBadges \.initialBadge\{[^}]*width:32px!important[^}]*height:32px!important/, 'Kółka monterów w Centrum 360 muszą wymuszać 32x32px nad globalnym CSS, jak w tabeli Montaże.');

assert.match(panelSource, /buildContractorsWithJobFallback/, 'Centrum 360 musi liczyć kontrahentów tak samo jak moduł Kontrahenci, razem z wpisami z montaży.');
assert.match(panelSource, /contractorsWithJobFallback\s*=\s*buildContractorsWithJobFallback\(contractors,\s*jobs\)/, 'Licznik Kontrahenci w bazie musi uwzględniać fallbacki z montaży.');
assert.match(panelSource, /contractorsCount:\s*contractorsWithJobFallback\.length/, 'Kafelek Kontrahenci w bazie nie może liczyć tylko surowej tabeli contractors.');
assert.match(panelSource, /isOpenJobForQuickInstallerCheck/, 'Licznik Zlecenia bez montera musi pomijać zamknięte historyczne zlecenia.');
assert.match(panelSource, /noInstaller\s*=\s*jobs\.filter\(\(job\)\s*=>\s*isOpenJobForQuickInstallerCheck\(job\)\s*&&\s*!hasInstaller\(job,\s*profilesById\)\)/, 'Zlecenia bez montera w Centrum 360 muszą liczyć tylko otwarte zlecenia bez przypisania.');
assert.match(panelSource, /status\s*===\s*'Nowe'\s*\|\|\s*status\s*===\s*'W trakcie'/, 'Szybki filtr bez montera ma dotyczyć tylko statusów Nowe i W trakcie.');


console.log('Centrum 360 data smoke OK');
process.exit(0);
