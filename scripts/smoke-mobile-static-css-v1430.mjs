// WAWIS 14.30 — regresja 14.29: okno podpisu protokołów szczelności na telefonie bez stylów.
// Mechanizm: main.jsx ładuje App telefonu i App komputera jednym `import()` w operatorze `? :`. Vite (build)
// dokłada wtedy do obu gałęzi JEDNĄ listę zależności — tej z komputera. CSS zaimportowany statycznie przez
// moduły z drzewa src/mobile791/App.jsx trafia do pliku App-*.css, którego telefon nigdy nie wczytuje.
// Test w trybie deweloperskim tego nie pokaże (tam CSS wstrzykuje JS modułu), więc pilnujemy tego statycznie:
// w statycznym drzewie importów mobile791/App.jsx nie może być żadnego `.css` — style telefonu ładuje main.jsx.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'src/mobile791/App.jsx');
const EXT = ['', '.js', '.jsx', '.mjs', '.ts', '.tsx', '/index.js', '/index.jsx'];
const STATIC_IMPORT = /^\s*(?:import\s+(?:[^'"`;]*?\s+from\s+)?|export\s+[^'"`;]*?\s+from\s+)['"]([^'"]+)['"]/gm;

function resolve(fromFile, spec) {
  if (!spec.startsWith('.')) return null; // pakiety npm — poza zakresem
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const ext of EXT) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Nie znaleziono importu ${spec} w ${path.relative(root, fromFile)}`);
}

export function staticCssImports(start) {
  const seen = new Set();
  const css = [];
  const stack = [start];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of source.matchAll(STATIC_IMPORT)) {
      const target = resolve(file, match[1]);
      if (!target) continue;
      if (/\.(css|scss|less)$/i.test(target)) css.push(`${path.relative(root, file)} → ${path.relative(root, target)}`);
      else if (/\.(jsx?|mjs|tsx?)$/i.test(target)) stack.push(target);
    }
  }
  return { css, modules: seen.size };
}

const { css, modules } = staticCssImports(entry);
assert.ok(modules > 20, `Analiza drzewa importów telefonu wygląda na niepełną (${modules} modułów).`);
assert.deepEqual(css, [], `CSS w statycznym drzewie mobile791/App.jsx nie dotrze do telefonu po buildzie. Przenieś import do main.jsx (blok useMobile791):\n${css.join('\n')}`);

const main = fs.readFileSync(path.join(root, 'src/main.jsx'), 'utf8');
assert.match(
  main,
  /if \(useMobile791\) \{[\s\S]*await import\('\.\/mobile791\/components\/leak-tests\/leak-test-sign\.css'\)[\s\S]*\}[\s\S]*window\.__wawisBootTrace\?\.mark\?\.\('styles-ready'\)/,
  'Styl okna podpisu protokołów szczelności musi być ładowany w main.jsx przed renderem aplikacji telefonu.'
);
const banner = fs.readFileSync(path.join(root, 'src/mobile791/components/leak-tests/LeakTestSignBanner.jsx'), 'utf8');
assert.doesNotMatch(banner, /import\s+['"][^'"]+\.css['"]/, 'LeakTestSignBanner nie może sam importować CSS (nie dotrze do telefonu).');
console.log(`OK: ${modules} modułów telefonu bez statycznego CSS; styl podpisu ładowany w main.jsx.`);
