function normalizeSessionUserId(value) {
  return String(value || '').trim();
}

export function createSessionGenerationState(initialUserId = '') {
  return { generation: 0, userId: normalizeSessionUserId(initialUserId) };
}

export function transitionSessionGeneration(state, nextUserId = '') {
  if (!state || typeof state !== 'object') throw new Error('Brak stanu generacji sesji.');
  const normalizedUserId = normalizeSessionUserId(nextUserId);
  if (state.userId !== normalizedUserId) {
    state.generation = Math.max(0, Number(state.generation) || 0) + 1;
    state.userId = normalizedUserId;
  }
  return state.generation;
}

export function captureSessionGeneration(state, expectedUserId = state?.userId || '') {
  return {
    generation: Math.max(0, Number(state?.generation) || 0),
    userId: normalizeSessionUserId(expectedUserId),
  };
}

export function isSessionGenerationCurrent(state, token) {
  if (!state || !token) return false;
  return Math.max(0, Number(state.generation) || 0) === Math.max(0, Number(token.generation) || 0)
    && normalizeSessionUserId(state.userId) === normalizeSessionUserId(token.userId);
}
