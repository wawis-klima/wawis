// Signature reuse is allowed only for unchanged signed content or an address correction.
// Legacy PDFs have no saved signature/snapshot: they must be signed again.
export function createProtocolSigningSnapshot(data = {}) {
  return {
    client: String(data.client || ''),
    phone: String(data.phone || ''),
    email: String(data.email || ''),
    address: String(data.address || ''),
    installationDate: String(data.installationDate || ''),
    technicians: [...(data.technicians || [])],
    deviceRows: (data.deviceRows || []).map((row) => ({ ...row })),
    payment: {
      enabled: Boolean(data.payment?.enabled),
      amount: data.payment?.amount ?? null,
      method: String(data.payment?.method || ''),
      paidDate: String(data.payment?.paidDate || ''),
    },
    note: String(data.note || ''),
  };
}

export function canReuseProtocolSignature(record, nextSnapshot) {
  const previous = record?.signed_snapshot;
  if (!record?.signature_path || !previous || !nextSnapshot) return false;
  const keys = Object.keys(createProtocolSigningSnapshot());
  return keys.every((key) =>
    key === 'address'
      || (Object.prototype.hasOwnProperty.call(previous, key)
        && JSON.stringify(previous[key]) === JSON.stringify(nextSnapshot[key])));
}

export function hasProtocolAddressCorrection(record, nextSnapshot) {
  return canReuseProtocolSignature(record, nextSnapshot)
    && String(record.signed_snapshot.address || '') !== String(nextSnapshot.address || '');
}
