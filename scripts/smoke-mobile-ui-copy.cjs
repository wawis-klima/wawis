const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const panel = read('src', 'mobile791', 'components', 'JobDetailsPanel.jsx');
const wizard = read('src', 'mobile791', 'components', 'devices', 'MobileDeviceWizard.jsx');
const capture = read('src', 'mobile791', 'components', 'nameplate', 'NameplatePhotoCapture.jsx');
const pagination = read('src', 'mobile791', 'components', 'jobs', 'JobsPagination.jsx');
const paginationStyles = read('src', 'mobile791', 'components', 'jobs', 'mobile-jobs-pagination-v999.css.js');
const styles = read('src', 'mobile791', 'styles.css');

assert.equal((panel.match(/Zakończone · tylko podgląd/g) || []).length, 1, 'Status tylko do podglądu powinien wystąpić dokładnie raz.');
assert.doesNotMatch(panel, /karta jest tylko do podglądu dla pracownika/);
assert.doesNotMatch(panel, /pracownik nie może już dodawać ani usuwać zdjęć/);
assert.doesNotMatch(panel, /pracownik nie może już dodawać komentarzy ani pytań/);
assert.match(panel, /Brak urządzeń\./);
assert.match(panel, /Brak zdjęć\./);
assert.match(panel, /Ładowanie zdjęć…/);
assert.match(panel, /Ładowanie komentarzy…/);
assert.match(panel, /const showCommentsSection = !isWorkerCompletedLock \|\| showDetailsLoading \|\| comments\.length > 0;/, 'Pusta sekcja komentarzy zakończonego zlecenia pracownika powinna być ukrywana po załadowaniu szczegółów.');
assert.match(panel, /\{showCommentsSection \? \(/, 'Renderowanie sekcji komentarzy musi zależeć od showCommentsSection.');
assert.doesNotMatch(panel, /Brak zapisanych urządzeń i zdjęć tabliczek/);
assert.doesNotMatch(panel, /Brak pozostałych zdjęć montażu/);
assert.doesNotMatch(wizard, /<h3>Tabliczki znamionowe<\/h3>/);
assert.doesNotMatch(wizard, /<h3>Tabliczka znamionowa<\/h3>/);
assert.doesNotMatch(wizard, /Niepełny zestaw możesz zapisać\. Zlecenia nie da się zakończyć bez tabliczki JZ i każdej JW\./);
assert.match(capture, /<strong>Tabliczka znamionowa<\/strong>/, 'Podpis pola zdjęcia tabliczki musi pozostać.');
for (const status of ['Zapisano na telefonie', 'Wysyłanie', 'Zapisano w systemie', 'Błąd wysyłania']) {
  assert.match(panel, new RegExp(status), `Brak statusu operacyjnego zdjęcia: ${status}`);
}

assert.match(pagination, /currentPage - 1/, 'Mobilna paginacja powinna pokazywać najwyżej jedną sąsiednią stronę z lewej.');
assert.match(pagination, /currentPage \+ 1/, 'Mobilna paginacja powinna pokazywać najwyżej jedną sąsiednią stronę z prawej.');
assert.match(styles, /\.jobsPagination\{[\s\S]*?flex-wrap:nowrap !important;/, 'Mobilna paginacja musi pozostać w jednym rzędzie.');
assert.match(styles, /\.jobsPaginationBtn\{[\s\S]*?width:34px !important;/, 'Mobilne przyciski paginacji powinny mieć zwartą szerokość.');
assert.match(panel, /jobDateInfoValue/, 'Data montażu wymaga osobnego wyrównania mobilnego.');
assert.match(panel, /jobCompletionInfoValue/, 'Data zakończenia wymaga osobnego wyrównania mobilnego.');
assert.match(pagination, /data-pagination-layout="9\.99"/, 'Mobilna paginacja musi używać aktywnego układu 9.99.');
assert.match(pagination, /MOBILE_JOBS_PAGINATION_V999_CSS/, 'Krytyczny układ paginacji musi być dołączony do komponentu, aby nie zależał od starego cache CSS.');
assert.match(paginationStyles, /flex-flow:\s*row nowrap\s*!important;/, 'Aktywna paginacja 9.99 musi wymuszać jeden rząd.');
assert.match(paginationStyles, /\.jobsPaginationV999 \.jobsPaginationBtnV999[\s\S]*?width:\s*28px\s*!important;/, 'Aktywne mobilne przyciski paginacji muszą mieć 28 px.');
assert.match(paginationStyles, /\.jobsPaginationV999 \.jobsPaginationDotsV999[\s\S]*?width:\s*9px\s*!important;/, 'Wielokropek paginacji musi mieć zwartą szerokość 9 px.');
assert.match(styles, /\.jobCompletionInfoItemV995\{[\s\S]*?column-gap:14px !important;/, 'Wiersz zakończenia musi mieć bezpieczny odstęp między etykietą a datą.');
assert.match(styles, /\.jobCompletionInfoValueV995[\s\S]*?text-align:center !important;/, 'Data i wykonawca zakończenia muszą być wyśrodkowane w prawej kolumnie.');
assert.doesNotMatch(panel, /Przez:\s*\{completedByLabel\}/, 'Mobilny wykonawca zakończenia nie może zawierać prefiksu Przez:.');

console.log('Mobile UI copy smoke OK');
