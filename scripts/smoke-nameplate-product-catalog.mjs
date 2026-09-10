import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const migration = read('nameplate-product-catalog-v8.92.sql');
assert.match(migration, /create table if not exists public\.nameplate_product_catalog/i);
assert.match(migration, /admin_upsert_nameplate_product/i);
assert.match(migration, /admin_import_nameplate_products/i);
assert.match(migration, /current_user_is_admin\(\)/i);

const seedMigration = read('nameplate-product-catalog-full-current-v9.02.sql');
assert.match(seedMigration, /pełny aktualny katalog Rotenso 2026\/2027/i);
assert.match(seedMigration, /5905567601170/); // Revio RO35Xo R14 zgłoszony przez użytkownika
assert.match(seedMigration, /5905567600814/); // Imoto I50Xi R14
assert.match(seedMigration, /5905567615139/); // Teta TO70Xo R17
assert.match(seedMigration, /5905567608599/); // Luve Pro Black LBP26Xi R16
assert.match(seedMigration, /5905567606182/); // Nevo N100Xi R15
assert.match(seedMigration, /5905567606113/); // Hiro HP HHP70Xm3 R15
assert.match(seedMigration, /on conflict \(ean\) do update/i);

const component = read('src/components/desktop/DesktopNameplateOcrButton.jsx');
assert.match(component, /lookupBuiltInRotensoProductByEan/);
assert.match(component, /lookupNameplateProductByEan/);
assert.match(component, /saveConfirmedNameplateProduct/);
assert.match(component, /wbudowanym katalogu Rotenso \${BUILT_IN_ROTENSO_CATALOG\.version}/i);
assert.match(component, /EAN \$\{result\.ean\} znaleziony we wbudowanym katalogu Rotenso/);
assert.match(component, /EAN \${result\.ean} · katalog Rotenso/);
assert.match(component, /Wbudowane: \{BUILT_IN_ROTENSO_CATALOG\.count\}/);
assert.match(component, /Importuj \{catalogImportPreview\.validRows\.length\} pozycji/);

const data = await import(pathToFileURL(path.join(root, 'src/data/rotenso-ean-catalog-v9.02.js')).href);
assert.equal(data.ROTENSO_EAN_CATALOG_VERSION, '9.02');
assert.equal(data.ROTENSO_EAN_CATALOG.length, 214);
assert.equal(data.ROTENSO_EAN_CATALOG_COUNT, 214);
assert.equal(data.ROTENSO_EAN_CURRENT_COUNT, 183);
assert.equal(data.ROTENSO_EAN_LEGACY_COUNT, 31);
assert.equal(new Set(data.ROTENSO_EAN_CATALOG.map((entry) => entry.ean)).size, 214);
for (const entry of data.ROTENSO_EAN_CATALOG) {
  assert.equal(data.isValidEan13(entry.ean), true, `Nieprawidłowa suma kontrolna EAN: ${entry.ean}`);
  assert.equal(entry.manufacturer, 'Rotenso');
  assert.ok(['indoor', 'outdoor'].includes(entry.unit_type));
  assert.ok(entry.model_code);
  assert.ok(entry.model_name);
  if (/Xi\b/i.test(entry.model_code)) assert.equal(entry.unit_type, 'indoor', entry.model_code);
  if (/Xo\b/i.test(entry.model_code)) assert.equal(entry.unit_type, 'outdoor', entry.model_code);
}
assert.equal(data.getBuiltInRotensoCatalogEntry('5905567601170')?.model_code, 'RO35Xo R14');
assert.equal(data.getBuiltInRotensoCatalogEntry('5905567600777')?.model_code, 'I26Xi R14');
assert.equal(data.getBuiltInRotensoCatalogEntry('5905567615115')?.model_code, 'TO35Xo R17');
assert.equal(data.getBuiltInRotensoCatalogEntry('5905567608933')?.model_code, 'FH26Xo R16');

assert.equal(data.getBuiltInRotensoCatalogEntry('5905567601668')?.model_code, 'H80Xm4 R15');
assert.equal(data.getBuiltInRotensoCatalogEntry('5905567606540')?.model_code, 'HN40Xm2 R15');
assert.equal(data.getBuiltInRotensoCatalogEntry('5905567606588')?.model_code, 'HN120Xm5 R15');
assert.equal(data.getBuiltInRotensoCatalogEntry('5905567606076')?.model_code, 'HHP50Xm2 R15');
assert.equal(data.getBuiltInRotensoCatalogEntry('5905567601200')?.model_code, 'TM35Xi R16');
assert.equal(data.getBuiltInRotensoCatalogEntry('2411950928074')?.model_code, 'TM35Xi R16');
assert.equal(data.getBuiltInRotensoCatalogEntry('5905567608599')?.model_code, 'LBP26Xi R16');
assert.equal(data.getBuiltInRotensoCatalogEntry('5905567606175')?.model_code, 'N90Xi R15');
assert.equal(data.getBuiltInRotensoCatalogEntry('5905567606113')?.model_code, 'HHP70Xm3 R15');
assert.equal(data.getBuiltInRotensoCatalogEntry('5905567606434')?.model_code, 'UO160Xo R15');

assert.equal(data.getBuiltInRotensoCatalogEntry('0000000000000'), null);

const csv = read('wawis-katalog-ean-rotenso-v9.02.csv').replace(/^\ufeff/, '').trim().split(/\r?\n/);
assert.equal(csv.length, 215, 'CSV powinien zawierać nagłówek i 214 pozycji.');
assert.match(csv.join('\n'), /5905567601170;Rotenso;Revio;RO35Xo R14/);

const catalog = await import(pathToFileURL(path.join(root, 'src/modules/nameplate-product-catalog.js')).href);
assert.equal(catalog.normalizeCatalogEan('5 905567 600814'), '5905567600814');
assert.equal(catalog.normalizeCatalogUnitType('JW', 'I50Xi R14'), 'indoor');
assert.equal(catalog.normalizeCatalogUnitType('JZ', 'I50Xo R14'), 'outdoor');
assert.equal(catalog.extractCatalogModelCode('Imoto 5,0 kW (I50Xi R14)'), 'I50XiR14');
assert.equal(catalog.getBuiltInRotensoCatalogStats().count, 214);
assert.ok(catalog.getBuiltInRotensoCatalogStats().families.includes('Revio'));

const builtIn = catalog.lookupBuiltInRotensoProductByEan('5905567601170');
assert.equal(builtIn.builtIn, true);
assert.equal(builtIn.resolution.code, 'RO35Xo R14');
assert.equal(builtIn.resolution.unitType, 'outdoor');

const noConnectionLookup = await catalog.lookupNameplateProductByEan({ supabase: null, ean: '5905567601170' });
assert.equal(noConnectionLookup.builtIn, true);
assert.equal(noConnectionLookup.unavailable, true);
assert.equal(noConnectionLookup.resolution.code, 'RO35Xo R14');

const missingTableSupabase = {
  from() {
    return {
      select() { return this; },
      eq() { return this; },
      async maybeSingle() { return { data: null, error: { code: '42P01', message: 'relation does not exist' } }; },
    };
  },
};
const missingTableLookup = await catalog.lookupNameplateProductByEan({ supabase: missingTableSupabase, ean: '5905567601170' });
assert.equal(missingTableLookup.builtIn, true);
assert.equal(missingTableLookup.authoritative, true);
assert.equal(missingTableLookup.unavailable, false);
assert.equal(missingTableLookup.resolution.code, 'RO35Xo R14');

const centralSupabase = {
  from() {
    return {
      select() { return this; },
      eq() { return this; },
      async maybeSingle() {
        return { data: {
          ean: '5905567601170', manufacturer: 'Rotenso', family: 'Revio', model_code: 'RO35Xo R14',
          model_name: 'Revio 3,5 kW (RO35Xo R14)', capacity_kw: 3.5, unit_type: 'outdoor', revision: 'R14', verified: true,
        }, error: null };
      },
    };
  },
};
const centralLookup = await catalog.lookupNameplateProductByEan({ supabase: centralSupabase, ean: '5905567601170' });
assert.equal(centralLookup.builtIn, true);
assert.equal(centralLookup.authoritative, true);
assert.equal(centralLookup.resolution.code, 'RO35Xo R14');

const csvFile = new File([
  '\ufeffEAN;Marka;Rodzina;Kod modelu;Model;Moc kW;Typ jednostki;Rewizja;Źródło\n' +
  '5905567600814;Rotenso;Imoto;I50Xi R14;Imoto 5,0 kW (I50Xi R14);5,0;JW;R14;producent\n' +
  '123;Rotenso;Imoto;X;Błędny;5,0;JW;R14;test\n'
], 'catalog.csv', { type: 'text/csv' });
const csvAnalysis = await catalog.parseNameplateCatalogFile(csvFile);
assert.equal(csvAnalysis.validRows.length, 1);
assert.equal(csvAnalysis.invalidRows.length, 1);

const dictionary = await import(pathToFileURL(path.join(root, 'src/modules/desktop-nameplate-model-dictionary.js')).href);
assert.equal(dictionary.resolveRotensoBarcodeModel('5905567600814')?.unitType, 'indoor');
assert.equal(dictionary.resolveRotensoBarcodeModel('5905567601170')?.unitType, 'outdoor');

console.log('Smoke OK: 183 aktualne EAN-y Rotenso + 31 kodów historycznych/aliasów, centralny katalog, import i typy JW/JZ');
