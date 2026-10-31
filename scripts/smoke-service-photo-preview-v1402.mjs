// WAWIS 14.02 — podgląd zdjęć serwisu (miniatury i pełny ekran jak w montażach).
// Zgłoszenie właściciela 31.10.2026: „jest tylko napisane, że jest, ale nie widzę zdjęcia”.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadServicePhotoUrls, servicePhotoUrlIsFresh, SERVICE_FILES_BUCKET } from '../src/mobile791/modules/service-visit-execution.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

// ---------- 1. Jedno zbiorcze zapytanie o podpisane adresy z prywatnego bucketu ----------
function fakeStorage(response) {
  const calls = [];
  return { calls, storage: { from(bucket) {
    return { createSignedUrls: async (paths, ttl) => { calls.push({ bucket, paths, ttl }); return response(paths); } };
  } } };
}
const photos = [
  { id: 'p1', storage_path: 'V/photos/I/a.jpg' },
  { id: 'p2', storage_path: 'V/photos/I/b.jpg' },
  { id: 'p3', storage_path: 'V/photos/I/c.jpg' },
  { id: null, storage_path: 'x' },
];
let db = fakeStorage(paths => ({ data: [
  { path: paths[0], signedUrl: 'https://s/a' },
  { path: paths[1], signedUrl: null, error: 'Object not found' },
  { path: paths[2], signedUrl: 'https://s/c' },
], error: null }));
const now = 1_000_000;
const urls = await loadServicePhotoUrls({ supabase: db, photos, now });
assert.equal(db.calls.length, 1, 'Jedno zapytanie dla wszystkich zdjęć urządzenia.');
assert.equal(db.calls[0].bucket, SERVICE_FILES_BUCKET);
assert.deepEqual(db.calls[0].paths, ['V/photos/I/a.jpg', 'V/photos/I/b.jpg', 'V/photos/I/c.jpg'], 'Bez wpisów bez identyfikatora.');
assert.equal(db.calls[0].ttl, 900);
assert.deepEqual(Object.keys(urls).sort(), ['p1', 'p3'], 'Brak adresu jednego zdjęcia nie ukrywa pozostałych.');
assert.equal(urls.p1.url, 'https://s/a');
assert.equal(urls.p1.validUntil, now + (900 - 120) * 1000, 'Zapas 2 minut przed wygaśnięciem linku.');
assert.equal(servicePhotoUrlIsFresh(urls.p1, now), true);
assert.equal(servicePhotoUrlIsFresh(urls.p1, urls.p1.validUntil + 1), false, 'Wygasły link jest odświeżany przed otwarciem.');
assert.equal(servicePhotoUrlIsFresh(null, now), false);

db = fakeStorage(() => ({ data: null, error: { message: 'network' } }));
await assert.rejects(loadServicePhotoUrls({ supabase: db, photos }), { message: 'network' }, 'Błąd jest zgłaszany, nie wygląda jak brak zdjęć.');
db = fakeStorage(() => { throw new Error('nie powinno być wywołane'); });
assert.deepEqual(await loadServicePhotoUrls({ supabase: db, photos: [] }), {}, 'Bez zdjęć — bez zapytania.');

// ---------- 2. Ekran: karty i podgląd z montaży ----------
const exec = read('src/mobile791/components/devices/ServiceExecutionPanel.jsx');
assert.match(exec, /import PreviewModal from '\.\.\/modals\/PreviewModal\.jsx';/, 'Ten sam podgląd pełnoekranowy co w montażach.');
assert.match(exec, /<PreviewModal previewImage=\{preview\?\.url\|\|null\}/);
assert.match(exec, /className="thumbGrid serviceAdminThumbGrid"/, 'Siatka miniatur z montaży.');
assert.match(exec, /className="thumbCard"/);
assert.match(exec, /className="thumbBtn desktopThumbBtn"[\s\S]{0,160}onClick=\{\(\)=>openPhoto\(item\.id,i\)\}/, 'Dotknięcie miniatury otwiera zdjęcie.');
assert.match(exec, /className="thumb desktopThumb"/);
assert.doesNotMatch(exec, /'Zdjęcia opcjonalne przy sprawnym urządzeniu\.':'/, 'Brak mylącego tekstu przy usterce ze zdjęciem.');
assert.match(exec, /draft\.result==='usterka'\?'Zdjęcia usterki zapisane w systemie\./);
assert.doesNotMatch(exec, /serviceAdminPhotoRow/, 'Lista tekstowa zastąpiona kartami.');
const css = read('src/mobile791/styles.css');
assert.match(css, /\.thumbGrid\{/, 'Style kart ładowane przy starcie (styles.css).');

console.log('WAWIS 14.02 service photo preview: PASS');
