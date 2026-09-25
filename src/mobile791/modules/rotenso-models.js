const ROTENSO_INDOOR_GROUPS = [
  {
    label: 'Ścienne',
    models: [
      { name: 'Luve Pro Black', powers: ['2,7 kW', '3,6 kW'] },
      { name: 'Luve Pro', powers: ['2,7 kW', '3,6 kW'] },
      { name: 'Mirai', powers: ['2,6 kW', '3,5 kW'] },
      { name: 'Fresh', powers: ['2,6 kW', '3,5 kW'] },
      { name: 'Roni', powers: ['2,6 kW', '3,5 kW', '5,1 kW', '7,0 kW'] },
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
      { name: 'Ukura', powers: ['2,6 kW', '3,5 kW', '5,3 kW', '7,0 kW'] },
      { name: 'Elis', powers: ['2,6 kW', '3,5 kW', '5,1 kW', '7,0 kW'] },
      { name: 'Elis Silver', powers: ['2,6 kW', '3,5 kW', '5,1 kW', '7,0 kW'] },
    ],
  },
  {
    label: 'Konsolowe',
    models: [
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

export function getRotensoModelFamilyFromValue(value = '') {
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

export function getSingleSplitModelFamilyMismatch({
  outdoorModel = '',
  indoorModel = '',
  outdoorFamily = '',
  indoorFamily = '',
} = {}) {
  const resolvedOutdoorFamily = getRotensoModelFamilyFromValue(outdoorFamily) || getRotensoModelFamilyFromValue(outdoorModel);
  const resolvedIndoorFamily = getRotensoModelFamilyFromValue(indoorFamily) || getRotensoModelFamilyFromValue(indoorModel);
  if (!resolvedOutdoorFamily || !resolvedIndoorFamily || resolvedOutdoorFamily === resolvedIndoorFamily) return null;
  return {
    outdoorFamily: resolvedOutdoorFamily,
    indoorFamily: resolvedIndoorFamily,
    message: `Niezgodny zestaw Single: JZ to ${resolvedOutdoorFamily}, a JW to ${resolvedIndoorFamily}. Jednostka zewnętrzna i wewnętrzna muszą być z tego samego modelu/serii.`,
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
