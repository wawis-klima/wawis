const ROTENSO_INDOOR_GROUPS = [
  {
    label: 'Ścienne',
    models: [
      { name: 'Luve Pro Black', powers: ['2,7 kW', '3,6 kW'] },
      { name: 'Luve Pro', powers: ['2,7 kW', '3,6 kW'] },
      { name: 'Mirai', powers: ['2,6 kW', '3,5 kW'] },
      { name: 'Fresh', powers: ['2,6 kW', '3,5 kW'] },
      { name: 'Roni', powers: ['2,6 kW', '3,4 kW', '5,1 kW', '7,0 kW'] },
      { name: 'Versu Mirror', powers: ['2,6 kW', '3,5 kW', '5,3 kW'] },
      { name: 'Versu Pure', powers: ['2,6 kW', '3,5 kW', '5,3 kW'] },
      { name: 'Versu Cloth Stone', powers: ['2,6 kW', '3,5 kW', '5,3 kW'] },
      { name: 'Versu Cloth Caramel', powers: ['2,6 kW', '3,5 kW', '5,3 kW'] },
      { name: 'Luve Black', powers: ['2,7 kW', '3,6 kW', '5,3 kW'] },
      { name: 'Luve', powers: ['2,7 kW', '3,6 kW', '5,3 kW'] },
      { name: 'Revio', powers: ['2,7 kW', '3,5 kW', '5,3 kW', '7,0 kW'] },
      { name: 'Imoto', powers: ['2,6 kW', '3,5 kW', '5,3 kW', '7,0 kW'] },
      { name: 'Teta Mirror', powers: ['2,6 kW', '3,5 kW', '5,1 kW', '6,9 kW'] },
      { name: 'Teta', powers: ['2,6 kW', '3,5 kW', '5,2 kW', '7,0 kW'] },
      { name: 'Ukura H', powers: ['2,6 kW', '3,5 kW', '5,3 kW', '7,0 kW'] },
      { name: 'Ukura', powers: ['2,6 kW', '3,5 kW', '5,3 kW', '7,0 kW'] },
      { name: 'Elis', powers: ['2,6 kW', '3,5 kW', '5,1 kW', '7,0 kW'] },
      { name: 'Elis Silver', powers: ['2,6 kW', '3,5 kW', '5,1 kW', '7,0 kW'] },
    ],
  },
  {
    label: 'Konsolowe',
    models: [
      { name: 'Aneru HP', powers: ['2,6 kW', '3,5 kW'] },
      { name: 'Aneru', powers: ['2,6 kW', '3,5 kW', '5,0 kW'] },
      { name: 'Aneru AN', powers: ['2,6 kW', '3,5 kW', '5,0 kW'] },
    ],
  },
  {
    label: 'Kasetonowe',
    models: [
      { name: 'Tenji CC', powers: ['2,1 kW', '2,6 kW', '3,5 kW', '5,3 kW'] },
      { name: 'Tenji CS', powers: ['7,0 kW', '8,8 kW', '10,6 kW', '12,0 kW', '14,1 kW', '15,2 kW'] },
    ],
  },
  {
    label: 'Kanałowe',
    models: [
      { name: 'Nevo', powers: ['2,1 kW', '2,6 kW', '3,5 kW', '5,3 kW', '7,0 kW', '7,1 kW', '8,8 kW', '10,6 kW', '12,1 kW', '14,1 kW', '15,2 kW'] },
    ],
  },
  {
    label: 'Przypodłogowo-podsufitowe',
    models: [
      { name: 'Jato', powers: ['5,3 kW', '7,0 kW', '10,6 kW', '14,1 kW', '15,2 kW'] },
    ],
  },
];

const ROTENSO_MULTI_OUTDOOR_GROUPS = [
  {
    label: 'Agregaty Multi',
    models: [
      { name: 'Hiro N', powers: ['4,1 kW', '5,1 kW', '7,5 kW', '9,4 kW', '11,8 kW'] },
      { name: 'Hiro S', powers: ['4,1 kW', '5,3 kW', '6,2 kW', '7,9 kW', '8,2 kW', '10,5 kW', '12,3 kW'] },
      { name: 'Hiro HP', powers: ['5,3 kW', '7,9 kW'] },
    ],
  },
];

export const ROTENSO_MODEL_GROUPS = ROTENSO_INDOOR_GROUPS;
export const ROTENSO_MULTI_OUTDOOR_MODELS = ROTENSO_MULTI_OUTDOOR_GROUPS;

const ROTENSO_SINGLE_FAMILIES = Object.freeze(
  [...new Set(ROTENSO_INDOOR_GROUPS.flatMap((group) => group.models.map((model) => model.name)))]
    .sort((left, right) => right.length - left.length),
);

function normalizeModelFamilyText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Kod bazowy i rewizja to dwie różne informacje. Poniższa mapa dotyczy wyłącznie
// jednoznacznie zapisanych liter prefiksu; nie zamieniamy tutaj O/0, I/1 ani S/5.
const ROTENSO_CODE_FAMILY_CANDIDATES = Object.freeze({
  AHP: Object.freeze(['Aneru HP']),
  AN: Object.freeze(['Aneru AN']),
  A: Object.freeze(['Aneru']),
  ES: Object.freeze(['Elis Silver']),
  EO: Object.freeze(['Elis', 'Elis Silver']),
  E: Object.freeze(['Elis']),
  FH: Object.freeze(['Fresh']),
  HHP: Object.freeze(['Hiro HP']),
  HN: Object.freeze(['Hiro N']),
  H: Object.freeze(['Hiro S']),
  I: Object.freeze(['Imoto']),
  LBP: Object.freeze(['Luve Pro Black']),
  LEP: Object.freeze(['Luve Pro']),
  LOP: Object.freeze(['Luve Pro', 'Luve Pro Black']),
  LB: Object.freeze(['Luve Black']),
  LE: Object.freeze(['Luve']),
  LO: Object.freeze(['Luve', 'Luve Black']),
  M: Object.freeze(['Mirai']),
  R: Object.freeze(['Roni']),
  RO: Object.freeze(['Revio']),
  TA: Object.freeze(['Teta']),
  TM: Object.freeze(['Teta Mirror']),
  TO: Object.freeze(['Teta', 'Teta Mirror']),
  U: Object.freeze(['Ukura', 'Ukura H']),
  UH: Object.freeze(['Ukura H']),
  VCC: Object.freeze(['Versu Cloth Caramel']),
  VCS: Object.freeze(['Versu Cloth Stone']),
  VM: Object.freeze(['Versu Mirror']),
  VP: Object.freeze(['Versu Pure']),
  VO: Object.freeze(['Versu', 'Versu Cloth Stone', 'Versu Cloth Caramel']),
});

const ROTENSO_CODE_PREFIX_PATTERN = Object.keys(ROTENSO_CODE_FAMILY_CANDIDATES)
  .sort((left, right) => right.length - left.length)
  .join('|');

function getNamedRotensoFamily(value = '') {
  const normalizedValue = normalizeModelFamilyText(value);
  if (!normalizedValue) return '';
  for (const family of ROTENSO_SINGLE_FAMILIES) {
    const normalizedFamily = normalizeModelFamilyText(family);
    if (
      normalizedValue === normalizedFamily
      || normalizedValue.startsWith(`${normalizedFamily} `)
      || normalizedValue.includes(` ${normalizedFamily} `)
      || normalizedValue.endsWith(` ${normalizedFamily}`)
    ) {
      return family;
    }
  }
  return '';
}

export function getRotensoModelFamilyCandidatesFromValue(value = '') {
  const namedFamily = getNamedRotensoFamily(value);
  if (namedFamily) return [namedFamily];

  const source = String(value || '').toUpperCase();
  const match = source.match(new RegExp(
    `(?:^|[^A-Z0-9])(${ROTENSO_CODE_PREFIX_PATTERN})[0-9]{2,3}X(?:I|O|M[2-5])(?:\\s*R[0-9]{1,2})?(?=$|[^A-Z0-9])`,
    'i',
  ));
  const prefix = String(match?.[1] || '').toUpperCase();
  return prefix ? [...(ROTENSO_CODE_FAMILY_CANDIDATES[prefix] || [])] : [];
}

export function getRotensoModelFamilyFromValue(value = '') {
  const candidates = getRotensoModelFamilyCandidatesFromValue(value);
  return candidates.length === 1 ? candidates[0] : '';
}

const ROTENSO_SHARED_SINGLE_FAMILY_GROUPS = Object.freeze([
  Object.freeze(['Teta', 'Teta Mirror']),
  Object.freeze(['Elis', 'Elis Silver']),
  Object.freeze(['Luve', 'Luve Black']),
  Object.freeze(['Luve Pro', 'Luve Pro Black']),
  Object.freeze(['Versu', 'Versu Cloth Stone', 'Versu Cloth Caramel']),
]);

function areCompatibleSingleFamilies(outdoorFamily = '', indoorFamily = '') {
  if (!outdoorFamily || !indoorFamily) return false;
  if (outdoorFamily === indoorFamily) return true;
  return ROTENSO_SHARED_SINGLE_FAMILY_GROUPS.some(
    (families) => families.includes(outdoorFamily) && families.includes(indoorFamily),
  );
}

function resolveFamilyCandidates(explicitFamily = '', modelValue = '') {
  const explicit = getRotensoModelFamilyCandidatesFromValue(explicitFamily);
  if (explicit.length) return explicit;
  return getRotensoModelFamilyCandidatesFromValue(modelValue);
}

export function getSingleSplitModelFamilyMismatch({
  outdoorModel = '',
  indoorModel = '',
  outdoorFamily = '',
  indoorFamily = '',
} = {}) {
  const outdoorCandidates = resolveFamilyCandidates(outdoorFamily, outdoorModel);
  const indoorCandidates = resolveFamilyCandidates(indoorFamily, indoorModel);
  if (!outdoorCandidates.length || !indoorCandidates.length) return null;

  const compatible = outdoorCandidates.some((outdoorCandidate) => (
    indoorCandidates.some((indoorCandidate) => areCompatibleSingleFamilies(outdoorCandidate, indoorCandidate))
  ));
  if (compatible) return null;

  const outdoorLabel = outdoorCandidates.join(' / ');
  const indoorLabel = indoorCandidates.join(' / ');
  return {
    outdoorFamily: outdoorCandidates.length === 1 ? outdoorCandidates[0] : '',
    indoorFamily: indoorCandidates.length === 1 ? indoorCandidates[0] : '',
    outdoorFamilies: outdoorCandidates,
    indoorFamilies: indoorCandidates,
    message: `Niezgodny zestaw Single: JZ to ${outdoorLabel}, a JW to ${indoorLabel}. Jednostka zewnętrzna i wewnętrzna muszą być z kompatybilnej serii.`,
  };
}

function copyGroups(groups) {
  return groups.map((group) => ({
    ...group,
    models: group.models.map((model) => ({ ...model, powers: [...model.powers] })),
  }));
}

export function getRotensoModelGroups({ deviceType = 'single-split', unitRef = 'jz' } = {}) {
  if (deviceType === 'multi-split' && unitRef === 'jz') return copyGroups(ROTENSO_MULTI_OUTDOOR_GROUPS);
  return copyGroups(ROTENSO_INDOOR_GROUPS);
}

export function getRotensoModelNames(context = {}) {
  return getRotensoModelGroups(context).flatMap((group) => group.models.map((model) => model.name));
}

export function getRotensoPowerOptions(modelName, context = {}) {
  const normalized = String(modelName || '').trim().toLowerCase();
  if (!normalized) return [];
  const model = getRotensoModelGroups(context)
    .flatMap((group) => group.models)
    .find((item) => item.name.toLowerCase() === normalized);
  return model ? [...model.powers] : [];
}

export function getAllRotensoPowerOptions(context = {}) {
  const unique = new Set();
  getRotensoModelGroups(context).forEach((group) => {
    group.models.forEach((model) => model.powers.forEach((power) => unique.add(power)));
  });
  return [...unique].sort((left, right) => Number.parseFloat(left.replace(',', '.')) - Number.parseFloat(right.replace(',', '.')));
}
