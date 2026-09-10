const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

(async () => {
  const root = path.resolve(__dirname, '..');
  const wizardPath = path.join(root, 'src/mobile791/components/devices/MobileDeviceWizard.jsx');
  const wizard = fs.readFileSync(wizardPath, 'utf8');
  const storage = new Map();
  global.window = {
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
  };

  const moduleUrl = `${pathToFileURL(path.join(root, 'src/mobile791/modules/rotenso-model-history.js')).href}?smoke=${Date.now()}`;
  const history = await import(moduleUrl);
  const context = { deviceType: 'single-split', unitRef: 'jz' };
  history.recordRotensoModelUsage('Ukura', context);
  history.recordRotensoModelUsage('Ukura', context);
  history.recordRotensoModelUsage('Teta', context);
  const sections = history.getRotensoModelHistorySections(['Ukura', 'Teta', 'Imoto'], context);

  assert.strictEqual(sections.recent[0], 'Teta', 'Ostatnio używany model powinien być pierwszy.');
  assert(sections.frequent.includes('Ukura'), 'Najczęściej wybierany model nie został zapisany.');
  assert(wizard.includes('Ostatnio używane'), 'Brak sekcji ostatnio używanych modeli.');
  assert(wizard.includes('Najczęściej wybierane'), 'Brak sekcji najczęściej wybieranych modeli.');
  assert(wizard.indexOf('Ostatnio używane') < wizard.indexOf('Pełny katalog'), 'Szybkie sekcje powinny być nad pełnym katalogiem.');
  assert(wizard.includes('recordRotensoModelUsage'), 'Wybór modelu nie aktualizuje historii.');

  console.log('OK smoke-rotenso-model-history');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
