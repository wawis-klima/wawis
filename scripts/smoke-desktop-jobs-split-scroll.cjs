const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const layoutSource = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'AppAuthenticatedLayout.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

assert.match(
  layoutSource,
  /const\s+isDesktopJobsSplitScroll\s*=\s*!isMobile\s*&&\s*isAdmin\s*&&\s*activeModule\s*===\s*["']jobs["']\s*&&\s*Boolean\(detailsPanel\)/,
  'Niezależne przewijanie ma działać tylko dla desktopowego modułu Montaże z otwartym panelem szczegółów.'
);
assert.match(layoutSource, /function\s+useIndependentWheelScroll\(enabled\)/, 'Brakuje awaryjnej obsługi kółka myszy dla lewego panelu Montaży.');
assert.match(layoutSource, /addEventListener\(["']wheel["'],\s*onWheel,\s*\{\s*passive:\s*false,\s*capture:\s*true\s*\}\)/, 'Wheel powinien być przechwytywany przed wewnętrznym tableWrap.');
assert.match(layoutSource, /pane\.scrollTop\s*=\s*Math\.max\(/, 'Obsługa wheel musi przewijać bezpośrednio lewy panel.');
assert.match(layoutSource, /data-independent-scroll-pane=\{isDesktopJobsSplitScroll\s*\?\s*["']jobs-list["']/, 'Lewy panel powinien być jednoznacznie oznaczony jako niezależny scroll pane.');
assert.match(layoutSource, /ref=\{desktopJobsListPaneRef\}/, 'Ref obsługi kółka musi być podpięty do lewego panelu listy.');

assert.match(
  styles,
  /v9\.24 desktop Montaże:[\s\S]*\.adminDesktopPage\s+\.twoColDesktopStatusLeft\.desktopJobsSplitScroll\s*\{[\s\S]*height:\s*calc\(100dvh - 124px\)\s*!important;[\s\S]*overflow:\s*hidden\s*!important;/,
  'Tryb split 9.24 powinien mieć wysokość opartą o viewport i blokować wspólne przewijanie.'
);
assert.match(
  styles,
  /\.desktopJobsSplitScroll\s*>\s*\.desktopJobsListPane\s*\{[\s\S]*overflow-y:\s*scroll\s*!important;[\s\S]*overscroll-behavior-y:\s*contain;/,
  'Lewy panel Montaży ma być zawsze osobnym pionowym kontenerem przewijania.'
);
assert.match(
  styles,
  /\.desktopJobsSplitScroll\s*>\s*\.desktopJobsDetailsPane\s*\{[\s\S]*overflow-y:\s*auto\s*!important;/,
  'Prawy panel szczegółów ma zachować własne przewijanie.'
);
assert.match(
  styles,
  /\.desktopJobsSplitScroll\s+\.desktopJobsListPane\s+\.desktopJobsTableCard\s+\.tableWrap\s*\{[\s\S]*overscroll-behavior-y:\s*auto\s*!important;/,
  'Wewnętrzny tableWrap nie może blokować pionowego scrollowania rodzica.'
);

console.log('Desktop jobs split scroll v9.24 smoke OK');
process.exit(0);
