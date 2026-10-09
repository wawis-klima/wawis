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

/**
 * Returns a refusal reason instead of guessing that an invoice belongs to a job.
 * An empty OID is allowed ONLY in the explicit administrator number-link flow.
 */
export function inspectManualInvoiceMatch(invoice, { jobId, clientId, invoiceNumber }) {
  if (!invoice || !normalizeInvoiceText(invoice.id)) {
    return { ok: false, code: "NOT_FOUND", reason: "Nie znaleziono faktury o podanym numerze." };
  }
  if (normalizeInvoiceText(invoice.number) !== normalizeInvoiceText(invoiceNumber)) {
    return { ok: false, code: "NUMBER_MISMATCH", reason: "Numer zwróconej faktury nie zgadza się z wpisanym numerem." };
  }
  if (normalizeInvoiceText(invoice.client_id) !== normalizeInvoiceText(clientId)) {
    return { ok: false, code: "WRONG_CLIENT", reason: "Faktura należy do innego klienta Fakturowni. Nie można jej przypisać do tego montażu." };
  }
  if (!isIssuedVatInvoiceRecord(invoice)) {
    return { ok: false, code: "NOT_ISSUED_VAT", reason: "Dokument nie jest wystawioną fakturą VAT. Powiązanie zostało zablokowane." };
  }
  const oid = normalizeInvoiceText(invoice.oid);
  if (oid && oid !== buildJobInvoiceOid(jobId)) {
    return { ok: false, code: "OTHER_JOB", reason: "Faktura jest przypisana identyfikatorem OID do innego montażu." };
  }
  return { ok: true, code: "VERIFIED", reason: "" };
}

/** Candidates are advisory only: never call the confirmation RPC from a suggestion. */
export function findInvoiceCandidatesForManualConfirmation(invoices, { jobId, clientId, limit = 5 }) {
  if (!Array.isArray(invoices) || !clientId || !jobId) return [];
  const expectedOid = buildJobInvoiceOid(jobId);
  const seen = new Set();
  const results = [];
  for (const invoice of invoices) {
    const id = normalizeInvoiceText(invoice?.id);
    const number = normalizeInvoiceText(invoice?.number);
    const oid = normalizeInvoiceText(invoice?.oid);
    if (!id || !number || seen.has(id) || normalizeInvoiceText(invoice?.client_id) !== normalizeInvoiceText(clientId)) continue;
    if (!isIssuedVatInvoiceRecord(invoice) || (oid && oid !== expectedOid)) continue;
    seen.add(id);
    results.push({ invoiceId: id, invoiceNumber: number, issueDate: normalizeInvoiceText(invoice?.issue_date) });
    if (results.length >= limit) break;
  }
  return results;
}
