(function attachWawisPushSafety(root) {
  function normalizeUserId(value) {
    return String(value || '').trim();
  }

  function normalizeGeneration(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : 0;
  }

  function shouldDisplayPush(payload = {}, context = {}) {
    const recipientUserId = normalizeUserId(payload.recipientUserId);
    const contextUserId = normalizeUserId(context.userId);
    const payloadGeneration = normalizeGeneration(payload.subscriptionGeneration);
    const contextGeneration = normalizeGeneration(context.generation);

    // 10.78: stare/legacy wiadomości bez odbiorcy nie są wyświetlane. Dzięki temu
    // wiadomość wysłana przed zmianą konta nie może ujawnić danych po handoffie A→B.
    if (!recipientUserId || !contextUserId) return false;
    if (recipientUserId !== contextUserId) return false;

    // Generacja własności endpointu chroni także przed starymi wiadomościami tego
    // samego użytkownika po wylogowaniu, ponownym loginie albo zmianie lifecycle.
    if (!payloadGeneration || !contextGeneration) return false;
    return payloadGeneration === contextGeneration;
  }

  root.WawisPushSafety = Object.freeze({ shouldDisplayPush });
})(typeof self !== 'undefined' ? self : globalThis);
