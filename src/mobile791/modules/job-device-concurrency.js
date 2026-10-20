// Rozstrzyganie konfliktów tabliczek bez nadpisywania cudzych zmian.
// Porównujemy trzy stany: formularz otwarty, formularz zapisany i bieżący serwer.
function canonicalDeviceText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

export function reconcileConcurrentDeviceField({ baseValue, requestedValue, currentValue }) {
  const base = canonicalDeviceText(baseValue);
  const requested = canonicalDeviceText(requestedValue);
  const current = canonicalDeviceText(currentValue);

  // Własny wcześniejszy zapis już dotarł na serwer: nie zgłaszamy konfliktu.
  if (requested === current || requested === base) {
    return { value: current, changed: false };
  }
  if (current === base) {
    return { value: requested, changed: true };
  }

  const baseRows = base ? base.split('\n') : [];
  const requestedRows = requested ? requested.split('\n') : [];
  const currentRows = current ? current.split('\n') : [];

  // Nie scalaj automatycznie usuniętych lub przesuniętych urządzeń.
  if (requestedRows.length < baseRows.length || currentRows.length < baseRows.length) return null;

  const mergedRows = [];
  for (let index = 0; index < Math.max(baseRows.length, requestedRows.length, currentRows.length); index += 1) {
    const before = (baseRows[index] || '').trim();
    const local = (requestedRows[index] || '').trim();
    const remote = (currentRows[index] || '').trim();

    if (local === remote) mergedRows.push(remote);
    else if (local === before) mergedRows.push(remote);
    else if (remote === before) mergedRows.push(local);
    else return null; // Ten sam wiersz został zmieniony po obu stronach.
  }

  const merged = mergedRows.join('\n').trim();
  return { value: merged, changed: merged !== current };
}

export function reconcileConcurrentDevicePatch({ fields = {}, expected = {}, current = {} }) {
  const nextFields = {};
  const nextExpected = {};
  for (const field of Object.keys(fields)) {
    if (field !== 'device_model' && field !== 'device_serial_number') return null;
    if (!Object.prototype.hasOwnProperty.call(current, field)) return null;

    const result = reconcileConcurrentDeviceField({
      baseValue: expected[field],
      requestedValue: fields[field],
      currentValue: current[field],
    });
    if (!result) return null;
    if (result.changed) {
      nextFields[field] = result.value || null;
      // Aktualna wartość w bazie jest obowiązkową nową wartością oczekiwaną CAS.
      nextExpected[field] = current[field] ?? null;
    }
  }
  return { fields: nextFields, expected: nextExpected };
}
