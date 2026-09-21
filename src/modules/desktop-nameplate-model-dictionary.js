import { ROTENSO_EAN_CATALOG } from '../data/rotenso-ean-catalog-v9.02.js';

function normalizePrintedRotensoModelCode(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[–—−]/g, '-')
    .replace(/[^A-Z0-9]/g, '')
    .replace(/X[1L]/g, 'XI')
    .replace(/X[0Q]/g, 'XO');
}

function stripPrintedRotensoRevision(value = '') {
  return String(value || '').replace(/R[0-9]{1,2}$/i, '');
}

function foldPrintedRotensoOcrCharacters(value = '') {
  return normalizePrintedRotensoModelCode(value)
    .replace(/[OQD]/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/Z/g, '2')
    .replace(/G/g, '6');
}

const ROTENSO_CATALOG_MODEL_CANDIDATES = Object.freeze(
  ROTENSO_EAN_CATALOG
    .filter((entry) => entry?.model_code)
    .map((entry) => {
      const compactCode = normalizePrintedRotensoModelCode(entry.model_code);
      const baseCode = stripPrintedRotensoRevision(compactCode);
      return Object.freeze({
        entry,
        compactCode,
        baseCode,
        foldedCode: foldPrintedRotensoOcrCharacters(compactCode),
        foldedBaseCode: foldPrintedRotensoOcrCharacters(baseCode),
      });
    }),
);

function formatCatalogCapacityKw(value = '') {
  const number = Number(String(value || '').replace(',', '.'));
  if (!Number.isFinite(number) || number <= 0) return '';
  return (Number.isInteger(number) ? number.toFixed(1) : String(number)).replace('.', ',');
}

function catalogEntryToResolution(entry) {
  if (!entry) return null;
  const code = String(entry.model_code || '').trim();
  const compactCode = normalizePrintedRotensoModelCode(code);
  const codeParts = stripPrintedRotensoRevision(compactCode).match(/^([A-Z]{1,4})([0-9]{2,3})X(?:[IO]|M[2-5])$/i);
  const unitType = String(entry.unit_type || '').toLowerCase();
  return {
    manufacturer: entry.manufacturer || 'Rotenso',
    prefix: codeParts?.[1] || '',
    capacityCode: codeParts?.[2] || '',
    family: entry.family || '',
    capacityKw: formatCatalogCapacityKw(entry.capacity_kw),
    unitType,
    systemType: /XM[2-5]/i.test(code) ? 'multi-split' : (unitType === 'outdoor' ? 'single-split' : ''),
    unitLabel: unitType === 'outdoor' ? 'jednostka zewnętrzna' : 'jednostka wewnętrzna',
    revision: entry.revision || '',
    code,
    model: entry.model_name || code,
    ean: entry.ean || '',
    evidence: 'catalog_model_code',
    catalogVerified: Boolean(entry.verified),
  };
}

export function resolveRotensoCatalogModelCode(rawText = '') {
  const compact = normalizePrintedRotensoModelCode(rawText);
  if (!compact) return null;
  const folded = foldPrintedRotensoOcrCharacters(rawText);
  const matches = ROTENSO_CATALOG_MODEL_CANDIDATES
    .map((candidate) => {
      let score = 0;
      let evidence = 'catalog_model_code';
      let revisionObserved = false;
      if (compact.includes(candidate.compactCode)) {
        score = 1200;
        revisionObserved = true;
      }
      else if (folded.includes(candidate.foldedCode)) {
        score = 1150;
        evidence = 'catalog_model_code_ocr';
        revisionObserved = true;
      } else if (compact.includes(candidate.baseCode)) score = 1100;
      else if (folded.includes(candidate.foldedBaseCode)) {
        score = 900;
        evidence = 'catalog_model_code_ocr';
      }
      return score ? { ...candidate, score, evidence, revisionObserved } : null;
    })
    .filter(Boolean)
    .sort((left, right) => (
      right.score - left.score
      || right.compactCode.length - left.compactCode.length
      || Number(Boolean(right.entry.verified)) - Number(Boolean(left.entry.verified))
    ));
  if (!matches.length) return null;
  const resolution = catalogEntryToResolution(matches[0].entry);
  return resolution ? {
    ...resolution,
    evidence: matches[0].evidence,
    revisionObserved: matches[0].revisionObserved,
  } : null;
}

export const AIR_CONDITIONER_MODEL_DICTIONARY = Object.freeze({
  Rotenso: [
    'Mirai',
    'Luve Pro Black',
    'Luve Pro',
    'Luve Black',
    'Luve',
    'Fresh',
    'Versu Mirror',
    'Versu Pure',
    'Versu Cloth Stone',
    'Versu Cloth Caramel',
    'Versu',
    'Revio',
    'Imoto',
    'Imoto X',
    'Teta Mirror',
    'Teta',
    'Ukura H',
    'Ukura',
    'Elis Silver',
    'Elis',
    'Roni',
    'Hiro HP',
    'Hiro S',
    'Hiro N',
    'Hiro',
    'Kasi',
    'Sole',
    'Tenji CC',
    'Tenji CS',
    'Jato',
    'Nevo',
    'Aneru AN',
    'Aneru',
    'Unico',
    'Sawa',
  ],
  Gree: ['Amber Standard', 'Amber Prestige', 'Fairy', 'Pular', 'Clivia', 'Airy'],
  Daikin: ['Perfera', 'Stylish', 'Emura', 'Sensira', 'Comfora'],
  Midea: ['Xtreme Save', 'Breezeless E', 'All Easy Pro', 'Blanc'],
  Kaisai: ['Fly', 'Eco', 'Pro Heat+', 'Ice', 'Geo'],
  LG: ['Artcool', 'Dualcool', 'Standard Plus', 'Deluxe'],
  Samsung: ['WindFree Comfort', 'WindFree Elite', 'Cebu'],
  'Mitsubishi Electric': ['MSZ-AP', 'MSZ-LN', 'MSZ-HR', 'MSZ-AY'],
  Panasonic: ['Etherea', 'TZ', 'Compact', 'Heatcharge'],
  Haier: ['Flexis Plus', 'Pearl', 'Revive Plus', 'Jade Plus'],
  Hisense: ['Energy Pro X', 'Wings Pro', 'New Comfort'],
  Fujitsu: ['KM', 'KG', 'KE', 'Nordic'],
  AUX: ['Freedom Plus', 'Halo Deluxe', 'J-Smart'],
  Bosch: ['Climate 3000i', 'Climate 5000i', 'Climate 7000i'],
  Sinclair: ['Terrel', 'Marvin', 'Spectrum Plus'],
  Toshiba: ['Seiya', 'Shorai Edge', 'Haori', 'Daiseikai'],
});

export const ROTENSO_MODEL_FAMILIES = Object.freeze({
  LEP: 'Luve Pro',
  LBP: 'Luve Pro Black',
  LOP: 'Luve Pro',
  VCS: 'Versu Cloth Stone',
  VCC: 'Versu Cloth Caramel',
  I: 'Imoto',
  M: 'Mirai',
  FH: 'Fresh',
  LE: 'Luve',
  LO: 'Luve',
  LB: 'Luve Black',
  VM: 'Versu Mirror',
  VP: 'Versu Pure',
  VO: 'Versu',
  U: 'Ukura',
  UH: 'Ukura H',
  HHP: 'Hiro HP',
  H: 'Hiro',
  HN: 'Hiro N',
  R: 'Roni',
  RO: 'Revio',
  E: 'Elis',
  ES: 'Elis Silver',
  EO: 'Elis',
  T: 'Teta',
  TA: 'Teta',
  TO: 'Teta',
  TM: 'Teta Mirror',
  UO: 'Unico',
  TCC: 'Tenji CC',
  TCS: 'Tenji CS',
  J: 'Jato',
  N: 'Nevo',
  AN: 'Aneru AN',
  A: 'Aneru',
  K: 'Kasi',
  S: 'Sole',
  V: 'Versu',
  F: 'Fresh',
});

const ROTENSO_CAPACITY_KW = Object.freeze({
  21: '2,1',
  26: '2,6',
  27: '2,7',
  34: '3,4',
  35: '3,5',
  36: '3,6',
  40: '4,0',
  50: '5,0',
  51: '5,1',
  52: '5,2',
  53: '5,3',
  60: '6,0',
  68: '6,8',
  69: '6,9',
  70: '7,0',
  71: '7,1',
  73: '7,3',
  80: '8,0',
  90: '9,0',
  100: '10,0',
  105: '10,5',
  120: '12,0',
  140: '14,0',
  160: '16,0',
});

const ROTENSO_FAMILY_CAPACITY_KW = Object.freeze({
  TA: Object.freeze({ 50: '5,2' }),
  TO: Object.freeze({ 50: '5,2' }),
  TCS: Object.freeze({ 160: '15,2' }),
  J: Object.freeze({ 160: '15,2' }),
  N: Object.freeze({ 160: '15,2' }),
});

const ROTENSO_MULTI_CAPACITY_KW = Object.freeze({
  H: Object.freeze({
    40: '4,1',
    50: '5,3',
    60: '6,2',
    70: '7,9',
    80: '8,2',
    100: '10,5',
    120: '12,3',
  }),
  HN: Object.freeze({
    40: '4,1',
    50: '5,1',
    60: '6,0',
    70: '7,5',
    90: '9,4',
    120: '11,8',
  }),
  HHP: Object.freeze({
    50: '5,3',
    70: '7,9',
    100: '10,0',
  }),
});

const ROTENSO_OUTDOOR_CATALOG_GROUPS = Object.freeze([
  Object.freeze({ family: 'Imoto', codes: Object.freeze(['I26Xo', 'I35Xo', 'I52Xo', 'I70Xo']) }),
  Object.freeze({ family: 'Ukura', codes: Object.freeze(['U21Xo', 'U26Xo', 'U35Xo', 'U52Xo', 'U70Xo']) }),
  Object.freeze({ family: 'Ukura H', codes: Object.freeze(['UH26Xo', 'UH35Xo', 'UH52Xo', 'UH70Xo']) }),
  Object.freeze({ family: 'Versu', codes: Object.freeze(['VO26Xo', 'VO35Xo', 'VO52Xo']) }),
  Object.freeze({ family: 'Mirai', codes: Object.freeze(['M35Xo']) }),
  Object.freeze({ family: 'Revio', codes: Object.freeze(['RO26Xo', 'RO35Xo', 'RO52Xo']) }),
  Object.freeze({ family: 'Fresh', codes: Object.freeze(['FH35Xo', 'F35Xo']) }),
  Object.freeze({ family: 'Luve', codes: Object.freeze(['LE26Xo', 'LE35Xo', 'LE52Xo']) }),
  Object.freeze({ family: 'Teta', codes: Object.freeze(['T35Xo', 'T52Xo']) }),
  Object.freeze({ family: 'Elis', codes: Object.freeze(['E26Xo', 'E35Xo', 'E52Xo']) }),
  Object.freeze({ family: 'Roni', codes: Object.freeze(['R26Xo', 'R35Xo']) }),
  Object.freeze({
    family: 'Unico',
    codes: Object.freeze([
      'UO35Xo', 'UO50Xo', 'UO52Xo', 'UO70Xo', 'UO90Xo',
      'UO100Xo', 'UO100Xoa', 'UO120Xo', 'UO120Xoa',
      'UO140Xo', 'UO140Xoa', 'UO160Xo', 'UO160Xoa',
    ]),
  }),
  Object.freeze({
    family: 'Hiro S',
    multi: true,
    codes: Object.freeze(['H40Xm2', 'H50Xm3', 'H60Xm3', 'H70Xm4', 'H80Xm4', 'H100Xm4', 'H120Xm5']),
  }),
  Object.freeze({
    family: 'Hiro HP',
    multi: true,
    codes: Object.freeze(['HHP50Xm2', 'HHP70Xm3', 'HHP100Xm4']),
  }),
  Object.freeze({
    family: 'Hiro N',
    multi: true,
    codes: Object.freeze(['HN40Xm2', 'HN50Xm2', 'HN60Xm3', 'HN70Xm4']),
  }),
  Object.freeze({ family: 'Kasi', codes: Object.freeze(['K26O', 'K35O', 'K52O', 'K70O']) }),
  Object.freeze({
    family: 'Ukura',
    codes: Object.freeze(['U26W', 'U35W', 'U52W', 'U70W', 'U26V', 'U35V', 'U52V', 'U70V']),
  }),
  Object.freeze({
    family: 'Imoto',
    codes: Object.freeze(['I26W', 'I35W', 'I52W', 'I70W', 'I26V', 'I35V', 'I52V', 'I70V']),
  }),
  Object.freeze({
    family: 'Versu',
    codes: Object.freeze(['V26W', 'V35W', 'V52W', 'V26O', 'V35O', 'V52O']),
  }),
  Object.freeze({ family: 'Mirai', codes: Object.freeze(['M35W', 'M53W']) }),
  Object.freeze({ family: 'Jato', codes: Object.freeze(['J26O', 'J35O', 'J52O']) }),
  Object.freeze({ family: 'Sole', codes: Object.freeze(['S26O', 'S35O', 'S52O', 'S70O']) }),
  Object.freeze({ family: 'Elis', codes: Object.freeze(['E26W', 'E35W', 'E52W']) }),
  Object.freeze({ family: 'Roni', codes: Object.freeze(['R26W', 'R35W']) }),
  Object.freeze({
    family: 'Hiro',
    multi: true,
    codes: Object.freeze([
      'H40W2', 'H50W2', 'H60W3', 'H70W3', 'H80W4', 'H100W4', 'H120W5',
      'H40V2', 'H50V2', 'H60V3', 'H70V3', 'H80V4', 'H100V4', 'H120V5',
    ]),
  }),
]);

export const ROTENSO_SUPPORTED_OUTDOOR_CODES = Object.freeze(
  ROTENSO_OUTDOOR_CATALOG_GROUPS.flatMap((group) => group.codes),
);

const ROTENSO_OUTDOOR_CATALOG = Object.freeze(Object.fromEntries(
  ROTENSO_OUTDOOR_CATALOG_GROUPS.flatMap((group) => group.codes.map((code) => [
    code.toUpperCase(),
    Object.freeze({
      code,
      family: group.family,
      multi: Boolean(group.multi),
    }),
  ])),
));

const ROTENSO_EXACT_CAPACITY_KW = Object.freeze({
  UO50XO: '5,3',
  UO90XO: '8,8',
  UO100XO: '10,6',
  UO100XOA: '10,6',
  UO120XO: '12,1',
  UO120XOA: '12,1',
  UO140XO: '14,1',
  UO140XOA: '14,1',
  UO160XO: '15,3',
  UO160XOA: '15,3',
});

const ROTENSO_CATALOG_CODE_PATTERN = new RegExp(
  `(?:^|[^A-Z0-9])(${Object.keys(ROTENSO_OUTDOOR_CATALOG)
    .sort((left, right) => right.length - left.length)
    .map((code) => code.split('').join('\\s*'))
    .join('|')})(?:\\s*[-/]?\\s*(R\\s*[0-9]{1,2}))?(?=$|[^A-Z0-9])`,
  'gi',
);

const ROTENSO_EAN_MODELS = Object.freeze({
  606366: Object.freeze({ prefix: 'U', capacityCode: '50', unitMarker: 'I', revision: 'R15' }),
  615023: Object.freeze({ prefix: 'TA', capacityCode: '26', unitMarker: 'I', revision: 'R17' }),
  615108: Object.freeze({ prefix: 'TO', capacityCode: '26', unitMarker: 'O', revision: 'R17' }),
  615030: Object.freeze({ prefix: 'TA', capacityCode: '35', unitMarker: 'I', revision: 'R17' }),
  615115: Object.freeze({ prefix: 'TO', capacityCode: '35', unitMarker: 'O', revision: 'R17' }),
  615047: Object.freeze({ prefix: 'TA', capacityCode: '50', unitMarker: 'I', revision: 'R17' }),
  615122: Object.freeze({ prefix: 'TO', capacityCode: '50', unitMarker: 'O', revision: 'R17' }),
  615054: Object.freeze({ prefix: 'TA', capacityCode: '70', unitMarker: 'I', revision: 'R17' }),
  615139: Object.freeze({ prefix: 'TO', capacityCode: '70', unitMarker: 'O', revision: 'R17' }),
  600807: Object.freeze({ prefix: 'I', capacityCode: '35', unitMarker: 'O', revision: 'R14' }),
  600814: Object.freeze({ prefix: 'I', capacityCode: '50', unitMarker: 'I', revision: 'R14' }),
  600821: Object.freeze({ prefix: 'I', capacityCode: '50', unitMarker: 'O', revision: 'R14' }),
  600791: Object.freeze({ prefix: 'I', capacityCode: '35', unitMarker: 'I', revision: 'R14' }),
  601132: Object.freeze({ prefix: 'RO', capacityCode: '35', unitMarker: 'I', revision: 'R14' }),
  601170: Object.freeze({ prefix: 'RO', capacityCode: '35', unitMarker: 'O', revision: 'R14' }),
  606229: Object.freeze({ prefix: 'RO', capacityCode: '50', unitMarker: 'I', revision: 'R14' }),
  601224: Object.freeze({ prefix: 'TO', capacityCode: '35', unitMarker: 'O', revision: 'R16' }),
  601637: Object.freeze({ prefix: 'H', capacityCode: '50', connectionCount: '2', revision: 'R15' }),
  606557: Object.freeze({ prefix: 'HN', capacityCode: '50', connectionCount: '2', revision: 'R15' }),
});
const ROTENSO_EXACT_EAN_MODELS = Object.freeze({
  '5905567600814': Object.freeze({ prefix: 'I', capacityCode: '50', unitMarker: 'I', revision: 'R14' }),
  '5905567600821': Object.freeze({ prefix: 'I', capacityCode: '50', unitMarker: 'O', revision: 'R14' }),
  '5905567601132': Object.freeze({ prefix: 'RO', capacityCode: '35', unitMarker: 'I', revision: 'R14' }),
  '5905567601170': Object.freeze({ prefix: 'RO', capacityCode: '35', unitMarker: 'O', revision: 'R14' }),
  '5905567606366': Object.freeze({ prefix: 'U', capacityCode: '50', unitMarker: 'I', revision: 'R15' }),
});

const ROTENSO_PRODUCT_CODE_MODELS = Object.freeze({
  M0251112574670: Object.freeze({ prefix: 'TA', capacityCode: '50', unitMarker: 'I', revision: 'R17' }),
});

const ROTENSO_PREFIX_PATTERN = Object.keys(ROTENSO_MODEL_FAMILIES)
  .sort((left, right) => right.length - left.length)
  .join('|');
const ROTENSO_MULTI_CODE_PATTERN = new RegExp(
  '(?:^|[^A-Z0-9])(H\\s*N|H)\\s*([0-9OSE]{2,3})\\s*X\\s*[MN]?\\s*([2-5Z])(?:\\s*[-/]?\\s*(R\\s*[0-9]{1,2}))?(?=$|[^A-Z0-9])',
  'gi',
);
const ROTENSO_FULL_CODE_PATTERN = new RegExp(
  `(?:^|[^A-Z0-9])((?:${ROTENSO_PREFIX_PATTERN}|1|L))\\s*([0-9OSE]{2,3})\\s*X\\s*([I1LY]|[O0])(?:\\s*[-/]?\\s*(R\\s*[0-9]{1,2}))?(?=$|[^A-Z0-9])`,
  'gi',
);
const ROTENSO_SHORT_CODE_PATTERN = new RegExp(
  `^(${ROTENSO_PREFIX_PATTERN}|1|L)\\s*([0-9OSE]{2,3})$`,
  'i',
);

function normalizeRotensoPrefix(prefix = '') {
  const normalized = String(prefix || '').toUpperCase().replace(/\s+/g, '');
  return normalized === '1' || normalized === 'L' ? 'I' : normalized;
}

function normalizeRotensoCapacityCode(value = '') {
  return String(value || '').toUpperCase().replace(/[OE]/g, '0').replace(/S/g, '5');
}

function getRotensoCapacityCode(code = '') {
  return String(code || '').toUpperCase().match(/[0-9]{2,3}/)?.[0] || '';
}

function getRotensoCatalogCapacity(code = '') {
  const normalizedCode = String(code || '').toUpperCase();
  const exactCapacity = ROTENSO_EXACT_CAPACITY_KW[normalizedCode];
  if (exactCapacity) return exactCapacity;
  const capacityCode = getRotensoCapacityCode(normalizedCode);
  const prefix = normalizedCode.startsWith('HHP')
    ? 'HHP'
    : normalizedCode.startsWith('HN')
      ? 'HN'
      : normalizedCode.startsWith('H')
        ? 'H'
        : '';
  return ROTENSO_MULTI_CAPACITY_KW[prefix]?.[capacityCode]
    || ROTENSO_CAPACITY_KW[capacityCode]
    || '';
}

function formatRotensoCode(prefix, capacityCode, unitMarker = '', revision = '') {
  const unitSuffix = unitMarker
    ? `X${/[O0]/i.test(unitMarker) ? 'o' : 'i'}`
    : '';
  const cleanRevision = String(revision || '').toUpperCase().replace(/\s+/g, '');
  return `${prefix}${capacityCode}${unitSuffix}${cleanRevision ? ` ${cleanRevision}` : ''}`;
}

function buildRotensoCatalogResolution(catalogEntry, revision = '') {
  if (!catalogEntry) return null;
  const capacityKw = getRotensoCatalogCapacity(catalogEntry.code);
  if (!capacityKw) return null;
  const cleanRevision = String(revision || '').toUpperCase().replace(/\s+/g, '');
  const code = `${catalogEntry.code}${cleanRevision ? ` ${cleanRevision}` : ''}`;
  const connectionCount = catalogEntry.multi
    ? Number(catalogEntry.code.match(/[2-5]$/)?.[0] || 0)
    : 0;
  return {
    manufacturer: 'Rotenso',
    family: catalogEntry.family,
    capacityKw,
    unitType: 'outdoor',
    systemType: catalogEntry.multi ? 'multi-split' : 'single-split',
    unitLabel: catalogEntry.multi
      ? 'jednostka zewnętrzna multi-split'
      : 'jednostka zewnętrzna',
    revision: cleanRevision,
    ...(connectionCount ? { connectionCount } : {}),
    code,
    model: `${catalogEntry.family} ${capacityKw} kW (${code})`,
  };
}

function buildRotensoResolution(prefix, capacityCode, unitMarker = '', revision = '') {
  const family = ROTENSO_MODEL_FAMILIES[prefix] || '';
  if (!family) return null;
  const capacityKw = ROTENSO_FAMILY_CAPACITY_KW[prefix]?.[capacityCode]
    || ROTENSO_CAPACITY_KW[capacityCode]
    || '';
  if (!capacityKw) return null;
  const unitType = /[O0]/i.test(unitMarker)
    ? 'outdoor'
    : unitMarker
      ? 'indoor'
      : '';
  const unitLabel = unitType === 'outdoor'
    ? 'jednostka zewnętrzna'
    : unitType === 'indoor'
      ? 'jednostka wewnętrzna'
      : '';
  const code = formatRotensoCode(prefix, capacityCode, unitMarker, revision);
  return {
    manufacturer: 'Rotenso',
    prefix,
    capacityCode,
    family,
    capacityKw,
    unitType,
    systemType: unitType === 'outdoor' ? 'single-split' : '',
    unitLabel,
    revision: String(revision || '').toUpperCase().replace(/\s+/g, ''),
    code,
    model: `${family} ${capacityKw} kW (${code})`,
  };
}

function chooseMostSpecificRotensoResolution(candidates = []) {
  if (!candidates.length) return null;
  const shapeCounts = candidates.reduce((counts, candidate) => {
    const resolution = candidate.resolution;
    const shape = [
      resolution.capacityCode,
      resolution.unitType,
      resolution.revision,
    ].join('|');
    counts.set(shape, (counts.get(shape) || 0) + 1);
    return counts;
  }, new Map());
  const dominantShape = [...shapeCounts.entries()]
    .sort((left, right) => right[1] - left[1])[0]?.[0];
  const matchingShape = candidates.filter((candidate) => {
    const resolution = candidate.resolution;
    return [
      resolution.capacityCode,
      resolution.unitType,
      resolution.revision,
    ].join('|') === dominantShape;
  });
  const codeCounts = matchingShape.reduce((counts, candidate) => {
    const code = candidate.resolution.code;
    counts.set(code, (counts.get(code) || 0) + 1);
    return counts;
  }, new Map());

  return [...matchingShape]
    .sort((left, right) => (
      right.resolution.prefix.length - left.resolution.prefix.length
      || (codeCounts.get(right.resolution.code) || 0) - (codeCounts.get(left.resolution.code) || 0)
      || Number(Boolean(right.resolution.revision)) - Number(Boolean(left.resolution.revision))
      || left.index - right.index
    ))[0]?.resolution || null;
}

function buildRotensoMultiResolution(prefix, capacityCode, connectionCount = '', revision = '') {
  if (!['H', 'HN', 'HHP'].includes(prefix)) return null;
  const family = prefix === 'HN'
    ? 'Hiro N'
    : prefix === 'HHP'
      ? 'Hiro HP'
      : 'Hiro S';
  const capacityKw = ROTENSO_MULTI_CAPACITY_KW[prefix]?.[capacityCode]
    || ROTENSO_CAPACITY_KW[capacityCode]
    || '';
  const normalizedConnections = String(connectionCount || '').toUpperCase().replace(/Z/g, '2');
  if (!capacityKw || !/^[2-5]$/.test(normalizedConnections)) return null;
  const cleanRevision = String(revision || '').toUpperCase().replace(/\s+/g, '');
  const code = `${prefix}${capacityCode}Xm${normalizedConnections}${cleanRevision ? ` ${cleanRevision}` : ''}`;
  return {
    manufacturer: 'Rotenso',
    family,
    capacityKw,
    unitType: 'outdoor',
    systemType: 'multi-split',
    unitLabel: 'jednostka zewnętrzna multi-split',
    revision: cleanRevision,
    connectionCount: Number(normalizedConnections),
    code,
    model: `${family} ${capacityKw} kW (${code})`,
  };
}


export function resolveRotensoBarcodeModel(ean = '') {
  const digits = String(ean || '').replace(/\D/g, '');
  if (digits.length !== 13) return null;
  const resolution = ROTENSO_EAN_MODELS[digits.slice(-6)];
  if (!resolution) return null;
  return resolution.connectionCount
    ? buildRotensoMultiResolution(
      resolution.prefix,
      resolution.capacityCode,
      resolution.connectionCount,
      resolution.revision,
    )
    : buildRotensoResolution(
      resolution.prefix,
      resolution.capacityCode,
      resolution.unitMarker,
      resolution.revision,
    );
}

export function resolveExactRotensoNameplateModel(rawText = '') {
  const source = String(rawText || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  const eanCandidates = source.match(/\b\d{13}\b/g) || [];
  for (const ean of eanCandidates) {
    const resolution = resolveRotensoBarcodeModel(ean);
    if (resolution) return { ...resolution, source: 'ean', ean };
  }

  const compactSource = source.replace(/[^A-Z0-9]/g, '');
  const productEntry = Object.entries(ROTENSO_PRODUCT_CODE_MODELS)
    .find(([productCode]) => compactSource.includes(productCode));
  if (productEntry) {
    const resolution = productEntry[1];
    return {
      ...buildRotensoResolution(
        resolution.prefix,
        resolution.capacityCode,
        resolution.unitMarker,
        resolution.revision,
      ),
      source: 'product_code',
      productCode: productEntry[0],
    };
  }

  const catalogCodes = Object.keys(ROTENSO_OUTDOOR_CATALOG)
    .sort((left, right) => right.length - left.length);
  for (const catalogCode of catalogCodes) {
    const pattern = new RegExp(`(?:^|[^A-Z0-9])${catalogCode}(?:\\s*[-/]?\\s*(R[0-9]{1,2}))?(?=$|[^A-Z0-9])`, 'i');
    const match = source.match(pattern);
    if (match) {
      const resolution = buildRotensoCatalogResolution(ROTENSO_OUTDOOR_CATALOG[catalogCode], match[1]);
      if (resolution) return { ...resolution, source: 'exact_model_code' };
    }
  }

  const exactMulti = source.match(/(?:^|[^A-Z0-9])(HHP|HN|H)([0-9]{2,3})XM([2-5])(?:\s*[-/]?\s*(R[0-9]{1,2}))?(?=$|[^A-Z0-9])/i);
  if (exactMulti) {
    const resolution = buildRotensoMultiResolution(exactMulti[1].toUpperCase(), exactMulti[2], exactMulti[3], exactMulti[4]);
    if (resolution) return { ...resolution, source: 'exact_model_code' };
  }

  const exactFull = source.match(new RegExp(`(?:^|[^A-Z0-9])(${ROTENSO_PREFIX_PATTERN})([0-9]{2,3})X([IO])(?:\\s*[-/]?\\s*(R[0-9]{1,2}))?(?=$|[^A-Z0-9])`, 'i'));
  if (exactFull) {
    const resolution = buildRotensoResolution(
      exactFull[1].toUpperCase(),
      exactFull[2],
      exactFull[3],
      exactFull[4],
    );
    if (resolution) return { ...resolution, source: 'exact_model_code' };
  }

  return null;
}

export function resolveRotensoModelFromEan(rawValue = '') {
  const digits = String(rawValue || '').replace(/\D/g, '');
  const entry = ROTENSO_EXACT_EAN_MODELS[digits]
    || Object.entries(ROTENSO_EAN_MODELS).find(([suffix]) => digits.endsWith(suffix))?.[1];
  if (!entry) return null;
  const resolution = buildRotensoResolution(
    entry.prefix,
    entry.capacityCode,
    entry.unitMarker,
    entry.revision,
  );
  return resolution ? { ...resolution, ean: digits, evidence: 'ean' } : null;
}

export function resolveRotensoNameplateModelExact(rawText = '') {
  const source = String(rawText || '').toUpperCase();
  const eanMatches = source.match(/\b\d{13}\b/g) || [];
  for (const ean of eanMatches) {
    const resolution = resolveRotensoModelFromEan(ean);
    if (resolution) return resolution;
  }

  const compact = source.replace(/[^A-Z0-9]/g, '');
  for (const [productCode, entry] of Object.entries(ROTENSO_PRODUCT_CODE_MODELS)) {
    if (!compact.includes(productCode)) continue;
    const resolution = buildRotensoResolution(entry.prefix, entry.capacityCode, entry.unitMarker, entry.revision);
    if (resolution) return { ...resolution, productCode, evidence: 'product_code' };
  }

  const exactCodePattern = /(?:^|[^A-Z0-9])([A-Z]{1,3})(\d{2,3})X([IO])(?:\s*[-/]?\s*(R\d{1,2}))?(?=$|[^A-Z0-9])/g;
  let match = exactCodePattern.exec(source);
  while (match) {
    const prefix = match[1];
    const capacityCode = match[2];
    const revision = match[4] || '';
    const resolution = buildRotensoResolution(prefix, capacityCode, match[3], revision);
    if (resolution) return { ...resolution, evidence: 'exact_model_code' };
    match = exactCodePattern.exec(source);
  }
  return null;
}

export function resolveRotensoNameplateModel(rawText = '') {
  const source = String(rawText || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  const eanLine = source.split(/\r?\n/).find((line) => /EAN/.test(line)) || '';
  const eanDigits = eanLine.replace(/\D/g, '');
  const eanResolution = Object.entries(ROTENSO_EAN_MODELS)
    .find(([suffix]) => eanDigits.includes(suffix))?.[1];
  if (eanResolution) {
    return eanResolution.connectionCount
      ? buildRotensoMultiResolution(
        eanResolution.prefix,
        eanResolution.capacityCode,
        eanResolution.connectionCount,
        eanResolution.revision,
      )
      : buildRotensoResolution(
        eanResolution.prefix,
        eanResolution.capacityCode,
        eanResolution.unitMarker,
        eanResolution.revision,
      );
  }

  const compactSource = source.replace(/[^A-Z0-9]/g, '');
  const productResolution = Object.entries(ROTENSO_PRODUCT_CODE_MODELS)
    .find(([productCode]) => compactSource.includes(productCode))?.[1];
  if (productResolution) {
    return buildRotensoResolution(
      productResolution.prefix,
      productResolution.capacityCode,
      productResolution.unitMarker,
      productResolution.revision,
    );
  }

  ROTENSO_CATALOG_CODE_PATTERN.lastIndex = 0;
  let catalogMatch = ROTENSO_CATALOG_CODE_PATTERN.exec(source);
  while (catalogMatch) {
    const normalizedCode = catalogMatch[1].replace(/\s+/g, '').toUpperCase();
    const resolution = buildRotensoCatalogResolution(
      ROTENSO_OUTDOOR_CATALOG[normalizedCode],
      catalogMatch[2],
    );
    if (resolution) return resolution;
    catalogMatch = ROTENSO_CATALOG_CODE_PATTERN.exec(source);
  }

  ROTENSO_MULTI_CODE_PATTERN.lastIndex = 0;
  let multiMatch = ROTENSO_MULTI_CODE_PATTERN.exec(source);
  while (multiMatch) {
    const prefix = normalizeRotensoPrefix(multiMatch[1]);
    const capacityCode = normalizeRotensoCapacityCode(multiMatch[2]);
    const resolution = buildRotensoMultiResolution(prefix, capacityCode, multiMatch[3], multiMatch[4]);
    if (resolution) return resolution;
    multiMatch = ROTENSO_MULTI_CODE_PATTERN.exec(source);
  }

  ROTENSO_FULL_CODE_PATTERN.lastIndex = 0;
  let fullMatch = ROTENSO_FULL_CODE_PATTERN.exec(source);
  const fullCandidates = [];
  while (fullMatch) {
    const prefix = normalizeRotensoPrefix(fullMatch[1]);
    const capacityCode = normalizeRotensoCapacityCode(fullMatch[2]);
    const resolution = buildRotensoResolution(prefix, capacityCode, fullMatch[3], fullMatch[4]);
    if (resolution) {
      fullCandidates.push({ resolution, index: fullMatch.index });
    }

    // Na zdjęciach kod I35 bywa odczytany jako H135: przypadkowy znak H
    // trafia przed cyfrę 1, która zastąpiła literę I. Nie interpretujemy wtedy
    // nieistniejącej mocy 13,5 kW, tylko sprawdzamy potwierdzony kod Imoto.
    if (prefix === 'H' && capacityCode.length === 3 && capacityCode.startsWith('1')) {
      const recoveredCapacity = capacityCode.slice(1);
      const recovered = buildRotensoResolution('I', recoveredCapacity, fullMatch[3], fullMatch[4]);
      if (recovered) fullCandidates.push({ resolution: recovered, index: fullMatch.index });
    }
    fullMatch = ROTENSO_FULL_CODE_PATTERN.exec(source);
  }
  const mostSpecificFullResolution = chooseMostSpecificRotensoResolution(fullCandidates);
  if (mostSpecificFullResolution) return mostSpecificFullResolution;

  // Tesseract potrafi zgubić końcowe „i” z Xi oraz odczytać I35 jako I135.
  // Sam prefiks I jednoznacznie wskazuje jednostkę wewnętrzną Imoto, dlatego
  // odzyskujemy model, ale nie dopisujemy rewizji, której odczyt obrazu nie potwierdził.
  const incompleteImotoMatch = source.match(/(?:^|[^A-Z0-9])I(1?[0-9OSE]{2,3})X(?=$|[^A-Z0-9])/i);
  if (incompleteImotoMatch) {
    let recoveredCapacity = normalizeRotensoCapacityCode(incompleteImotoMatch[1]);
    if (recoveredCapacity.length === 3 && recoveredCapacity.startsWith('1')) {
      recoveredCapacity = recoveredCapacity.slice(1);
    }
    const recovered = buildRotensoResolution('I', recoveredCapacity, 'I');
    if (recovered) return recovered;
  }

  const shortMatch = source.trim().match(ROTENSO_SHORT_CODE_PATTERN);
  if (!shortMatch) return null;
  const prefix = normalizeRotensoPrefix(shortMatch[1]);
  const capacityCode = normalizeRotensoCapacityCode(shortMatch[2]);
  return buildRotensoResolution(prefix, capacityCode);
}

export function isRotensoNameplateModelCode(value = '') {
  return Boolean(resolveRotensoNameplateModel(String(value || '').trim()));
}

function normalizeForComparison(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/5/g, 'S')
    .replace(/8/g, 'B')
    .replace(/[^A-Z0-9]+/g, '');
}

function levenshteinDistance(left = '', right = '') {
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        substitution,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function getSimilarity(left = '', right = '') {
  const normalizedLeft = normalizeForComparison(left);
  const normalizedRight = normalizeForComparison(right);
  const longest = Math.max(normalizedLeft.length, normalizedRight.length);
  if (!longest) return 1;
  return 1 - (levenshteinDistance(normalizedLeft, normalizedRight) / longest);
}

function resolveDictionaryManufacturer(manufacturer = '') {
  const normalized = normalizeForComparison(manufacturer);
  return Object.keys(AIR_CONDITIONER_MODEL_DICTIONARY)
    .find((name) => normalizeForComparison(name) === normalized) || '';
}

export function correctOcrModelFromDictionary(manufacturer = '', rawModel = '') {
  const originalModel = String(rawModel || '').replace(/\s+/g, ' ').trim();
  const dictionaryManufacturer = resolveDictionaryManufacturer(manufacturer);
  const dictionaryModels = AIR_CONDITIONER_MODEL_DICTIONARY[dictionaryManufacturer] || [];
  if (!originalModel || !dictionaryModels.length) {
    return {
      model: originalModel,
      originalModel,
      corrected: false,
      dictionaryManufacturer,
      dictionaryMatch: '',
      similarity: 0,
    };
  }

  if (dictionaryManufacturer === 'Rotenso') {
    const exactFamily = dictionaryModels.find((candidate) => normalizeForComparison(candidate) === normalizeForComparison(originalModel));
    return {
      model: originalModel,
      originalModel,
      corrected: false,
      dictionaryManufacturer,
      dictionaryMatch: exactFamily || '',
      similarity: exactFamily ? 1 : 0,
    };
  }

  const rawTokens = originalModel.split(' ').filter(Boolean);
  let best = null;
  for (const dictionaryModel of dictionaryModels) {
    const expectedTokenCount = dictionaryModel.split(' ').filter(Boolean).length;
    const minimumTokenCount = Math.max(1, expectedTokenCount - 1);
    const maximumTokenCount = Math.min(rawTokens.length, expectedTokenCount + 1);
    for (let tokenCount = minimumTokenCount; tokenCount <= maximumTokenCount; tokenCount += 1) {
      const prefix = rawTokens.slice(0, tokenCount).join(' ');
      const similarity = getSimilarity(prefix, dictionaryModel);
      if (!best || similarity > best.similarity) {
        best = { dictionaryModel, similarity, tokenCount };
      }
    }
  }

  if (!best || best.similarity < 0.78) {
    return {
      model: originalModel,
      originalModel,
      corrected: false,
      dictionaryManufacturer,
      dictionaryMatch: '',
      similarity: best?.similarity || 0,
    };
  }

  const suffix = rawTokens.slice(best.tokenCount).join(' ');
  const correctedModel = [best.dictionaryModel, suffix].filter(Boolean).join(' ');
  return {
    model: correctedModel,
    originalModel,
    corrected: correctedModel !== originalModel,
    dictionaryManufacturer,
    dictionaryMatch: best.dictionaryModel,
    similarity: best.similarity,
  };
}
