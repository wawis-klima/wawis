// WAWIS 13.76: lista wszystkich plików zbudowanej aplikacji dla service workera (pełne pobranie wersji).
// Po zakończeniu `vite build` zapisuje dist/precache-manifest.json:
//   { version, generatedAt, totalBytes, critical: [...], optional: [...] }
// critical — strona startowa i wszystkie skrypty/style (bez nich ekran nie otworzy się bez internetu);
// optional — obrazy, ikony, pozostałe pliki statyczne. Czytniki tabliczek (/ocr/*) mają własny cache (13.70).
import fs from 'node:fs';
import path from 'node:path';

const EXCLUDED_PREFIXES = ['ocr/'];
const EXCLUDED_FILES = new Set(['push-sw.js', 'app-version.json', 'precache-manifest.json']);
const EXCLUDED_EXTENSIONS = new Set(['.map', '.txt']);

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

export function buildPrecacheManifest(outDir, version) {
  const files = walk(outDir)
    .filter((file) => !EXCLUDED_FILES.has(file))
    .filter((file) => !EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix)))
    .filter((file) => !EXCLUDED_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort();
  const critical = [];
  const optional = [];
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += fs.statSync(path.join(outDir, file)).size;
    const url = file === 'index.html' ? '/' : `/${file}`;
    if (url === '/' || /\.(?:js|mjs|css)$/i.test(file)) critical.push(url);
    else optional.push(url);
  }
  return { version, generatedAt: new Date().toISOString(), totalBytes, critical, optional };
}

export default function precacheManifestPlugin({ version }) {
  let outDir = 'dist';
  return {
    name: 'wawis-precache-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const manifest = buildPrecacheManifest(outDir, version);
      fs.writeFileSync(path.join(outDir, 'precache-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(`[wawis-precache] ${manifest.critical.length} plików krytycznych, ${manifest.optional.length} dodatkowych, ${(manifest.totalBytes / 1048576).toFixed(2)} MB`);
    },
  };
}
