const STORAGE_KEY = 'wawis-rotenso-model-history-v1';
const MAX_HISTORY_ITEMS = 80;

function normalizeName(value = '') {
  return String(value || '').trim();
}

function getContextKey(context = {}) {
  const deviceType = String(context.deviceType || 'single-split');
  const unitType = String(context.unitRef || 'jz') === 'jz' ? 'jz' : 'jw';
  return `${deviceType}:${unitType}`;
}

function readHistory() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(items) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
  } catch {
    // Brak miejsca w localStorage nie może blokować wyboru modelu.
  }
}

export function recordRotensoModelUsage(modelName, context = {}) {
  const name = normalizeName(modelName);
  if (!name || name === 'Inny model') return;
  const contextKey = getContextKey(context);
  const now = new Date().toISOString();
  const history = readHistory();
  const existingIndex = history.findIndex((item) => normalizeName(item.name).toLowerCase() === name.toLowerCase());
  const existing = existingIndex >= 0 ? history[existingIndex] : null;
  const contexts = { ...(existing?.contexts || {}) };
  contexts[contextKey] = Number(contexts[contextKey] || 0) + 1;
  const nextItem = {
    name,
    count: Number(existing?.count || 0) + 1,
    lastUsedAt: now,
    contexts,
  };
  const nextHistory = history.filter((_, index) => index !== existingIndex);
  nextHistory.unshift(nextItem);
  writeHistory(nextHistory);
}

export function getRotensoModelHistorySections(validModelNames = [], context = {}) {
  const validByLower = new Map(validModelNames.map((name) => [normalizeName(name).toLowerCase(), normalizeName(name)]));
  const contextKey = getContextKey(context);
  const history = readHistory()
    .map((item) => {
      const canonicalName = validByLower.get(normalizeName(item.name).toLowerCase());
      if (!canonicalName) return null;
      return {
        ...item,
        name: canonicalName,
        contextCount: Number(item.contexts?.[contextKey] || 0),
      };
    })
    .filter(Boolean);

  const recent = [...history]
    .sort((left, right) => String(right.lastUsedAt || '').localeCompare(String(left.lastUsedAt || '')))
    .slice(0, 5)
    .map((item) => item.name);

  const frequentCandidates = [...history]
    .filter((item) => Number(item.contextCount || 0) >= 2 || Number(item.count || 0) >= 2)
    .sort((left, right) => {
      const contextDifference = Number(right.contextCount || 0) - Number(left.contextCount || 0);
      if (contextDifference) return contextDifference;
      const countDifference = Number(right.count || 0) - Number(left.count || 0);
      if (countDifference) return countDifference;
      return String(right.lastUsedAt || '').localeCompare(String(left.lastUsedAt || ''));
    });

  const frequent = frequentCandidates.slice(0, 5).map((item) => item.name);

  return { recent, frequent };
}
