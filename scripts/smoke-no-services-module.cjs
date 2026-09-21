const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');

function readTextFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...readTextFiles(absolutePath));
    } else if (/\.(jsx?|tsx?|css|md)$/i.test(entry.name)) {
      files.push({ path: absolutePath, source: fs.readFileSync(absolutePath, 'utf8') });
    }
  }
  return files;
}

assert(!fs.existsSync(path.join(root, 'src', 'components', 'services')), 'Nie powinno być katalogu src/components/services.');
assert(!fs.existsSync(path.join(root, 'src', 'modules', 'services-fetch.js')), 'Nie powinno być martwego modułu services-fetch.js.');
assert(!fs.existsSync(path.join(root, 'src', 'components', 'dashboard', 'Dashboard360Panel.jsx')), 'Stary panel Dashboard360Panel nie powinien wracać.');
assert(!fs.existsSync(path.join(root, 'src', 'components', 'client', 'Client360Panel.jsx')), 'Stary panel Client360Panel nie powinien wracać.');
assert(!fs.existsSync(path.join(root, 'services-module-stage-1.sql')), 'Wycofana migracja public.services nie powinna wracać.');
assert(!fs.existsSync(path.join(root, 'service-module-stage-1.sql')), 'Wycofana migracja service_orders nie powinna wracać.');
assert.doesNotMatch(appSource, /Osobny moduł Serwisy|moduł Serwisy|\bSerwisy\b/);

const forbiddenUiTexts = [/Osobny moduł Serwisy/i, /osobny moduł Serwisy/i, /moduł Serwisy/i];
for (const file of readTextFiles(path.join(root, 'src'))) {
  for (const pattern of forbiddenUiTexts) {
    assert.doesNotMatch(file.source, pattern, `Zakazany tekst serwisowy w ${path.relative(root, file.path)}`);
  }
}

console.log('No services module smoke OK');
process.exit(0);
