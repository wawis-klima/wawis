const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src/main.jsx'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mobileCssPath = path.join(root, 'src/mobile791/styles.css');
const mobileTableCssPath = path.join(root, 'src/mobile791/styles/desktop-jobs-table.css');
const mobileCss = fs.readFileSync(mobileCssPath, 'utf8');

assert.match(main, /Promise\.all\([\s\S]*import\('\.\/mobile791\/App\.jsx'\)[\s\S]*import\('\.\/mobile791\/styles\.css'\)[\s\S]*import\('\.\/mobile791\/styles\/desktop-jobs-table\.css'\)/, 'Mobilna aplikacja, główny CSS i CSS tabeli muszą być ładowane razem przed renderem.');
assert.match(main, /const App = appModule\.default[\s\S]*ReactDOM\.createRoot/, 'React może zostać uruchomiony dopiero po zakończeniu importu stylów.');
assert.ok(fs.statSync(mobileCssPath).size > 150_000, 'Główny mobilny arkusz CSS wygląda na niepełny.');
assert.ok(fs.statSync(mobileTableCssPath).size > 5_000, 'Arkusz tabel mobilnych wygląda na niepełny.');
assert.match(mobileCss, /body\s*\{[^}]*font-family:/, 'Mobilny CSS musi ustawiać font całej aplikacji.');
assert.match(mobileCss, /\.page\s*\{/, 'Mobilny CSS musi zawierać podstawowy układ strony.');
assert.match(index, /id="wawis-critical-shell"/, 'index.html musi zawierać awaryjny styl bazowy.');
assert.match(index, /font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif/, 'Awaryjny styl nie może dopuścić domyślnego fontu szeryfowego.');
console.log('OK: mobilne style są ładowane przed aplikacją, a index ma bezpieczny fallback.');
