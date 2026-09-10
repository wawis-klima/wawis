import { parseXlsxRows } from '../utils/xlsxImport.js';
import {
  ROTENSO_EAN_CATALOG,
  ROTENSO_EAN_CATALOG_COUNT,
  ROTENSO_EAN_CATALOG_VERSION,
  getBuiltInRotensoCatalogEntry,
} from '../data/rotenso-ean-catalog-v9.02.js';

const CATALOG_HEADER_ALIASES = new Map([
  ['ean', 'ean'],
  ['gtin', 'ean'],
  ['kod ean', 'ean'],
  ['kod gtin', 'ean'],
  ['barcode', 'ean'],
  ['marka', 'manufacturer'],
  ['producent', 'manufacturer'],
  ['manufacturer', 'manufacturer'],
  ['rodzina', 'family'],
  ['seria', 'family'],
  ['family', 'family'],
  ['kod modelu', 'model_code'],
  ['model code', 'model_code'],
  ['model_code', 'model_code'],
  ['model', 'model_name'],
  ['nazwa modelu', 'model_name'],
  ['model name', 'model_name'],
  ['model_name', 'model_name'],
  ['moc', 'capacity_kw'],
  ['moc kw', 'capacity_kw'],
  ['capacity', 'capacity_kw'],
  ['capacity kw', 'capacity_kw'],
  ['capacity_kw', 'capacity_kw'],
  ['typ', 'unit_type'],
  ['typ jednostki', 'unit_type'],
  ['unit type', 'unit_type'],
  ['unit_type', 'unit_type'],
  ['rewizja', 'revision'],
  ['revision', 'revision'],
  ['zrodlo', 'source_reference'],
  ['źródło', 'source_reference'],
  ['source', 'source_reference'],
  ['source reference', 'source_reference'],
  ['source_reference', 'source_reference'],
]);

function normalizeHeader(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeCatalogEan(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function normalizeCapacity(value = '') {
  const match = String(value || '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  if (!match) return '';
  const number = Number(match[0]);
  return Number.isFinite(number) && number > 0 ? String(number) : '';
}

export function normalizeCatalogUnitType(value = '', modelCode = '') {
  const normalizedCode = String(modelCode || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
  // Kod modelu jest jednoznaczny i ma pierwszeństwo nad historyczną wartością
  // unit_type: Xi = JW, Xo = JZ, Xm2..Xm5 = agregat zewnętrzny JZ.
  if (/xo(?:r\d+)?$/.test(normalizedCode) || /xm[2-5](?:r\d+)?$/.test(normalizedCode)) return 'outdoor';
  if (/xi(?:r\d+)?$/.test(normalizedCode)) return 'indoor';

  const source = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/\b(jz|zewnetrzna|outdoor)\b/.test(source)) return 'outdoor';
  if (/\b(jw|wewnetrzna|indoor)\b/.test(source)) return 'indoor';
  return 'unknown';
}

function extractRevision(modelCode = '') {
  return String(modelCode || '').toUpperCase().match(/\bR\s*\d{1,2}\b/)?.[0]?.replace(/\s+/g, '') || '';
}

export function extractCatalogModelCode(modelName = '') {
  const source = String(modelName || '').toUpperCase();
  const exact = source.match(/\b[A-Z]{1,4}\s*\d{2,3}\s*X\s*[IO0]\s*(?:R\s*\d{1,2})?\b/i)?.[0];
  return exact ? exact.replace(/\s+/g, '').replace(/X0/i, 'Xo').replace(/XI/i, 'Xi').replace(/XO/i, 'Xo') : '';
}

function normalizeCatalogRow(row = {}, rowNumber = 0) {
  const ean = normalizeCatalogEan(row.ean);
  const manufacturer = String(row.manufacturer || '').trim();
  const family = String(row.family || '').trim();
  const modelCode = String(row.model_code || extractCatalogModelCode(row.model_name)).trim();
  const capacityKw = normalizeCapacity(row.capacity_kw || row.model_name);
  const unitType = normalizeCatalogUnitType(row.unit_type, modelCode);
  const revision = String(row.revision || extractRevision(modelCode)).trim().toUpperCase();
  const modelName = String(row.model_name || '').trim()
    || [family, capacityKw ? `${String(capacityKw).replace('.', ',')} kW` : '', modelCode ? `(${modelCode})` : '']
      .filter(Boolean)
      .join(' ');
  const sourceReference = String(row.source_reference || '').trim();

  const errors = [];
  if (!/^\d{13}$/.test(ean)) errors.push('EAN/GTIN musi mieć 13 cyfr');
  if (!manufacturer) errors.push('brak marki');
  if (!modelName) errors.push('brak nazwy modelu');

  return {
    rowNumber,
    valid: errors.length === 0,
    errors,
    value: {
      ean,
      manufacturer,
      family,
      model_code: modelCode,
      model_name: modelName,
      capacity_kw: capacityKw,
      unit_type: unitType,
      revision,
      source_type: 'import',
      source_reference: sourceReference,
      verified: true,
    },
  };
}

function parseCsvLine(line = '', delimiter = ';') {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseCsvRows(text = '') {
  const source = String(text || '').replace(/^\ufeff/, '');
  const lines = source.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const semicolons = (lines[0].match(/;/g) || []).length;
  const commas = (lines[0].match(/,/g) || []).length;
  const delimiter = semicolons >= commas ? ';' : ',';
  return lines.map((line) => parseCsvLine(line, delimiter));
}

function rowsToCatalogAnalysis(rows = []) {
  if (!rows.length) return { validRows: [], invalidRows: [], total: 0 };
  const [headers = [], ...dataRows] = rows;
  const fields = headers.map((header) => CATALOG_HEADER_ALIASES.get(normalizeHeader(header)) || null);
  const normalized = dataRows
    .map((cells, index) => {
      const raw = {};
      cells.forEach((cell, cellIndex) => {
        const field = fields[cellIndex];
        if (field) raw[field] = String(cell || '').trim();
      });
      if (!Object.values(raw).some((value) => String(value || '').trim())) return null;
      return normalizeCatalogRow(raw, index + 2);
    })
    .filter(Boolean);

  return {
    validRows: normalized.filter((entry) => entry.valid).map((entry) => entry.value),
    invalidRows: normalized.filter((entry) => !entry.valid),
    total: normalized.length,
  };
}

export async function parseNameplateCatalogFile(file) {
  if (!file) throw new Error('Nie wybrano pliku katalogu.');
  const lowerName = String(file.name || '').toLowerCase();
  const rows = lowerName.endsWith('.csv')
    ? parseCsvRows(await file.text())
    : await parseXlsxRows(file);
  return rowsToCatalogAnalysis(rows);
}

export function catalogEntryToResolution(entry = null) {
  if (!entry) return null;
  const capacityNumber = Number(entry.capacity_kw);
  const capacity = entry.capacity_kw === null || entry.capacity_kw === undefined || entry.capacity_kw === '' || !Number.isFinite(capacityNumber)
    ? ''
    : (Number.isInteger(capacityNumber) ? capacityNumber.toFixed(1) : capacityNumber.toFixed(2).replace(/0$/, '')).replace('.', ',');
  const modelCode = String(entry.model_code || '').trim();
  const family = String(entry.family || '').trim();
  const model = String(entry.model_name || '').trim()
    || [family, capacity ? `${capacity} kW` : '', modelCode ? `(${modelCode})` : ''].filter(Boolean).join(' ');
  const normalizedUnitType = normalizeCatalogUnitType(entry.unit_type, modelCode || model);
  return {
    manufacturer: entry.manufacturer || '',
    family,
    capacityKw: capacity,
    unitType: normalizedUnitType === 'unknown' ? '' : normalizedUnitType,
    unitLabel: normalizedUnitType === 'indoor'
      ? 'jednostka wewnętrzna'
      : normalizedUnitType === 'outdoor'
        ? 'jednostka zewnętrzna'
        : '',
    revision: entry.revision || '',
    code: modelCode,
    model,
    ean: entry.ean || '',
    catalogVerified: Boolean(entry.verified),
  };
}

function isMissingCatalogError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === '42P01' || code === 'PGRST205' || /nameplate_product_catalog.*does not exist|schema cache/i.test(message);
}

export function lookupBuiltInRotensoProductByEan(ean) {
  const normalizedEan = normalizeCatalogEan(ean);
  const entry = getBuiltInRotensoCatalogEntry(normalizedEan);
  return {
    entry,
    resolution: catalogEntryToResolution(entry),
    builtIn: Boolean(entry),
  };
}

export function getBuiltInRotensoCatalogStats() {
  return {
    count: ROTENSO_EAN_CATALOG_COUNT,
    version: ROTENSO_EAN_CATALOG_VERSION,
    families: [...new Set(ROTENSO_EAN_CATALOG.map((entry) => entry.family))].sort(),
  };
}

export async function lookupNameplateProductByEan({ supabase, ean }) {
  const normalizedEan = normalizeCatalogEan(ean);
  if (!/^\d{13}$/.test(normalizedEan)) return { entry: null, resolution: null, unavailable: false, builtIn: false };

  const fallback = lookupBuiltInRotensoProductByEan(normalizedEan);
  // Oficjalny, wbudowany katalog Rotenso jest źródłem nadrzędnym dla znanych EAN-ów.
  // Nie pozwalamy, aby historycznie błędny rekord centralny nadpisał Xi/Xo/JW/JZ.
  if (fallback.entry) return { ...fallback, unavailable: !supabase, authoritative: true };
  if (!supabase) return { ...fallback, unavailable: true };

  const { data, error } = await supabase
    .from('nameplate_product_catalog')
    .select('ean,manufacturer,family,model_code,model_name,capacity_kw,unit_type,revision,source_type,source_reference,verified,updated_at')
    .eq('ean', normalizedEan)
    .maybeSingle();
  if (error) {
    if (fallback.entry) return { ...fallback, unavailable: isMissingCatalogError(error), fallbackError: error };
    if (isMissingCatalogError(error)) return { entry: null, resolution: null, unavailable: true, builtIn: false };
    throw error;
  }
  if (data) return { entry: data, resolution: catalogEntryToResolution(data), unavailable: false, builtIn: false };
  return { ...fallback, unavailable: false };
}

export async function saveConfirmedNameplateProduct({
  supabase,
  ean,
  manufacturer,
  family = '',
  modelCode = '',
  modelName,
  capacityKw = '',
  unitType = 'unknown',
  revision = '',
  sourceReference = '',
}) {
  const normalizedEan = normalizeCatalogEan(ean);
  if (!supabase || !/^\d{13}$/.test(normalizedEan) || !String(manufacturer || '').trim() || !String(modelName || '').trim()) {
    return { saved: false, skipped: true };
  }
  const protectedEntry = getBuiltInRotensoCatalogEntry(normalizedEan);
  if (protectedEntry) {
    return { saved: false, skipped: true, protectedBuiltIn: true, entry: protectedEntry };
  }
  const { data, error } = await supabase.rpc('admin_upsert_nameplate_product', {
    p_ean: normalizedEan,
    p_manufacturer: String(manufacturer).trim(),
    p_family: String(family || '').trim() || null,
    p_model_code: String(modelCode || extractCatalogModelCode(modelName)).trim() || null,
    p_model_name: String(modelName).trim(),
    p_capacity_kw: normalizeCapacity(capacityKw || modelName) || null,
    p_unit_type: normalizeCatalogUnitType(unitType, modelCode || modelName),
    p_revision: String(revision || extractRevision(modelCode || modelName)).trim() || null,
    p_source_type: 'confirmed_scan',
    p_source_reference: String(sourceReference || '').trim() || null,
    p_verified: true,
  });
  if (error) {
    if (isMissingCatalogError(error) || /admin_upsert_nameplate_product/i.test(String(error.message || ''))) {
      return { saved: false, unavailable: true, error };
    }
    throw error;
  }
  return { saved: true, entry: data || null };
}

export async function importNameplateCatalogRows({ supabase, rows = [] }) {
  if (!supabase) throw new Error('Brak połączenia z Supabase.');
  if (!rows.length) throw new Error('Brak poprawnych pozycji do importu.');
  const { data, error } = await supabase.rpc('admin_import_nameplate_products', { p_rows: rows });
  if (error) {
    if (isMissingCatalogError(error) || /admin_import_nameplate_products/i.test(String(error.message || ''))) {
      throw new Error('Najpierw uruchom w Supabase plik nameplate-product-catalog-v8.92.sql.');
    }
    throw error;
  }
  return data || { imported: 0, invalid: 0, errors: [] };
}


function downloadCatalogCsvRows(rows, filename) {
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadBuiltInRotensoCatalogCsv() {
  const header = ['EAN', 'Marka', 'Rodzina', 'Kod modelu', 'Model', 'Moc kW', 'Typ jednostki', 'Rewizja', 'Źródło'];
  const dataRows = ROTENSO_EAN_CATALOG.map((entry) => [
    entry.ean,
    entry.manufacturer,
    entry.family,
    entry.model_code,
    entry.model_name,
    String(entry.capacity_kw || '').replace('.', ','),
    entry.unit_type === 'indoor' ? 'JW' : entry.unit_type === 'outdoor' ? 'JZ' : '',
    entry.revision,
    entry.source_reference,
  ]);
  downloadCatalogCsvRows([header, ...dataRows], `wawis-katalog-ean-rotenso-v${ROTENSO_EAN_CATALOG_VERSION}.csv`);
}

export function downloadNameplateCatalogCsvTemplate() {
  const rows = [
    ['EAN', 'Marka', 'Rodzina', 'Kod modelu', 'Model', 'Moc kW', 'Typ jednostki', 'Rewizja', 'Źródło'],
    ['5905567600814', 'Rotenso', 'Imoto', 'I50Xi R14', 'Imoto 5,0 kW (I50Xi R14)', '5,0', 'JW', 'R14', 'katalog producenta'],
    ['5905567601132', 'Rotenso', 'Revio', 'RO35Xi R14', 'Revio 3,5 kW (RO35Xi R14)', '3,5', 'JW', 'R14', 'katalog producenta'],
    ['5905567601170', 'Rotenso', 'Revio', 'RO35Xo R14', 'Revio 3,5 kW (RO35Xo R14)', '3,5', 'JZ', 'R14', 'katalog producenta'],
  ];
  downloadCatalogCsvRows(rows, 'wawis-katalog-ean-wzor.csv');
}
