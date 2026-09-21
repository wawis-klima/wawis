const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const distAssets = path.join(root, 'dist', 'assets');
const maxIndexChunkBytes = Number(process.env.MAX_INDEX_CHUNK_BYTES || 320 * 1024);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(distAssets)) {
  fail('Brak dist/assets. Uruchom npm run build przed verify:bundle.');
}

const files = fs.readdirSync(distAssets);
const indexJs = files.find((file) => /^index-[\w-]+\.js$/.test(file));
const vendorReact = files.find((file) => /^vendor-react-[\w-]+\.js$/.test(file));
const vendorSupabase = files.find((file) => /^vendor-supabase-[\w-]+\.js$/.test(file));

if (!indexJs) fail('Nie znaleziono głównego chunku index-*.js w dist/assets.');
if (!vendorReact) fail('Nie znaleziono chunku vendor-react-*.js.');
if (!vendorSupabase) fail('Nie znaleziono chunku vendor-supabase-*.js.');

const indexPath = path.join(distAssets, indexJs);
const size = fs.statSync(indexPath).size;
if (size > maxIndexChunkBytes) {
  fail(`Główny chunk startowy jest za duży: ${size} B > ${maxIndexChunkBytes} B (${indexJs}).`);
}

console.log(`Bundle budget OK: ${indexJs} ${size} B <= ${maxIndexChunkBytes} B; vendor chunks present.`);
process.exit(0);
