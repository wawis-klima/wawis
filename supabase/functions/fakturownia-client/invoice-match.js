export function normalizeInvoiceText(value) {
  return String(value ?? "").trim();
}

export function buildJobInvoiceOid(jobId) {
  const normalizedJobId = normalizeInvoiceText(jobId);
  if (!normalizedJobId) return "";
  return `WAWIS-JOB-${normalizedJobId}`;
}

export function isIssuedVatInvoiceRecord(invoice) {
  const kind = normalizeInvoiceText(invoice?.kind).toLowerCase();
  const status = normalizeInvoiceText(invoice?.status).toLowerCase();
  const vatKinds = new Set(["vat", "vat_mp", "vat_margin", "final"]);
  const issuedStatuses = new Set(["issued", "sent", "paid", "partial"]);
  return vatKinds.has(kind) && issuedStatuses.has(status);
}

export function findIssuedVatInvoiceForJob(invoices, { jobId, clientId }) {
  const expectedOid = buildJobInvoiceOid(jobId);
  const expectedClientId = normalizeInvoiceText(clientId);
  if (!expectedOid || !expectedClientId || !Array.isArray(invoices)) return null;

  return invoices.find((invoice) => (
    normalizeInvoiceText(invoice?.id)
    && normalizeInvoiceText(invoice?.oid) === expectedOid
    && normalizeInvoiceText(invoice?.client_id) === expectedClientId
    && isIssuedVatInvoiceRecord(invoice)
  )) || null;
}
