const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const panel = read('src/components/sms/SmsPanel.jsx');
const smsFetch = read('src/modules/sms-fetch.js');
const app = read('src/App.jsx');
const styles = read('src/styles.css');
const globalSearch = read('src/components/desktop/GlobalDesktopSearch.jsx');

assert(!panel.includes('void refreshQueueAutomatically({ showBusy: true });'),
  'SMS desktop nie może uruchamiać generatora równolegle z pierwszym odczytem.');
assert(panel.includes('lastAutoRefreshRef.current = Date.now();'),
  'SMS desktop powinien ustawić cooldown automatycznego odświeżenia przy wejściu.');
assert(panel.includes("now - lastAutoRefreshRef.current > 300000"),
  'focus/visibility nie może ponawiać ciężkiego odświeżenia częściej niż co 5 minut.');
assert(panel.includes('setDevices(buildFallbackDevicesFromJobs(jobs));'),
  'SMS desktop powinien od razu użyć lekkiego fallbacku urządzeń z montaży.');
assert(panel.indexOf('const data = await loadSmsModuleData') < panel.indexOf('void fetchAdminDevices'),
  'Pełna baza urządzeń ma być dociągana dopiero po snapshotcie SMS.');
assert(panel.includes("normalizeDatabaseErrorMessage(error, 'Nie udało się załadować modułu SMS.')"),
  'Błąd ładowania SMS musi być normalizowany do czytelnego komunikatu.');
assert(smsFetch.includes('const smsSnapshotRequests = new WeakMap();'),
  'Równoległe snapshoty SMS powinny być deduplikowane.');
assert(app.includes("if (!showModal && !globalSearchRequested && !['jobs', 'contractors'].includes(activeModule)) return;"),
  'Zmiana zakładki na SMS nie może pobierać katalogu kontrahentów.');
assert(!app.includes('loadSmsModuleData'),
  'Centrum 360 nie może pobierać pełnego snapshotu modułu SMS przy starcie desktopu.');
assert(!app.includes('dashboardAuxCacheRef'),
  'Centrum 360 nie może utrzymywać ciężkiego cache SMS+urządzenia tylko dla licznika.');
assert(app.includes('if (!globalSearchRequested)'),
  'Pełna baza urządzeń dla globalnego wyszukiwania ma być ładowana dopiero po użyciu wyszukiwarki.');
assert(app.includes('onSearchStart: () => setGlobalSearchRequested(true)'),
  'Globalne wyszukiwanie musi jawnie uruchamiać lazy-load danych pomocniczych.');
assert(globalSearch.includes('onSearchStart();'),
  'Pole globalnego wyszukiwania musi uruchomić lazy-load przy focusie.');
assert(app.includes("if (activeModule !== 'center360') return;"),
  'Metryki Centrum 360 nie powinny odpytywać bazy podczas pracy w SMS.');
assert(styles.includes('grid-template-columns:repeat(3,minmax(0,1fr))'),
  'Trzy kafle SMS powinny mieścić się w jednym rzędzie na desktopie.');

console.log('SMS v12.25 desktop load/performance smoke OK');
