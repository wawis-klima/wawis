(function attachWawisPushContextGuard(root) {
  function normalizeRevision(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  }

  function shouldApplyContextCommand(current = {}, incoming = {}) {
    const currentRevision = normalizeRevision(current.revision);
    const incomingRevision = normalizeRevision(incoming.revision);
    if (incomingRevision === 0) return currentRevision === 0;
    return incomingRevision > currentRevision;
  }

  root.WawisPushContextGuard = Object.freeze({
    normalizeRevision,
    shouldApplyContextCommand,
  });
})(typeof self !== 'undefined' ? self : globalThis);
