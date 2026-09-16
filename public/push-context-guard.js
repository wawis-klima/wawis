(function attachWawisPushContextGuard(root) {
  const PROTOCOL_VERSION = 2;

  function normalizeRevision(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  }

  function normalizeGeneration(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  }

  function normalizeProtocolVersion(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 1 ? number : 1;
  }

  // Kept only for mixed 10.86/10.87 SW-page compatibility. New protocol commands
  // never use a page-local revision as their source of truth.
  function shouldApplyContextCommand(current = {}, incoming = {}) {
    const currentRevision = normalizeRevision(current.revision);
    const incomingRevision = normalizeRevision(incoming.revision);
    if (incomingRevision === 0) return currentRevision === 0;
    return incomingRevision > currentRevision;
  }

  function shouldApplySet(current = {}, incoming = {}) {
    const incomingUserId = String(incoming.userId || '').trim();
    const incomingGeneration = normalizeGeneration(incoming.generation);
    if (!incomingUserId || incomingGeneration <= 0) return false;

    const currentProtocol = normalizeProtocolVersion(current.protocolVersion);
    const incomingProtocol = normalizeProtocolVersion(incoming.protocolVersion);
    if (incomingProtocol < PROTOCOL_VERSION) {
      if (currentProtocol >= PROTOCOL_VERSION) return false;
      return shouldApplyContextCommand(current, incoming);
    }
    if (currentProtocol < PROTOCOL_VERSION) return true;

    const currentUserId = String(current.userId || '').trim();
    const currentGeneration = normalizeGeneration(current.generation);
    if (incomingGeneration > currentGeneration) return true;
    if (incomingGeneration < currentGeneration) return false;
    if (currentUserId) return currentUserId === incomingUserId;

    // A terminal CLEAR keeps a generation floor so a late SET from the old
    // session cannot resurrect it before the next owner claims generation+1.
    return current.terminalClear === false
      && String(current.clearedUserId || '').trim() === incomingUserId;
  }

  function shouldApplyClear(current = {}, incoming = {}) {
    const currentProtocol = normalizeProtocolVersion(current.protocolVersion);
    const incomingProtocol = normalizeProtocolVersion(incoming.protocolVersion);
    if (incomingProtocol < PROTOCOL_VERSION) {
      if (currentProtocol >= PROTOCOL_VERSION) return false;
      return shouldApplyContextCommand(current, incoming);
    }

    const currentUserId = String(current.userId || '').trim();
    const currentGeneration = normalizeGeneration(current.generation);
    const expectedUserId = String(incoming.expectedUserId || '').trim();
    const expectedGeneration = normalizeGeneration(incoming.expectedGeneration);
    if (!currentUserId) return false;
    if (!expectedUserId || currentUserId !== expectedUserId) return false;
    if (expectedGeneration > 0 && currentGeneration !== expectedGeneration) return false;
    return true;
  }

  root.WawisPushContextGuard = Object.freeze({
    PROTOCOL_VERSION,
    normalizeRevision,
    normalizeGeneration,
    normalizeProtocolVersion,
    shouldApplyContextCommand,
    shouldApplySet,
    shouldApplyClear,
  });
})(typeof self !== 'undefined' ? self : globalThis);
