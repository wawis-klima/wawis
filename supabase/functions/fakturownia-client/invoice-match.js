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
export function inspectManualInvoiceMatch(invoice, { jobId, clientId, invoiceNumber, buyer }) {
  if (!invoice || !normalizeInvoiceText(invoice.id)) {
    return { ok: false, code: "NOT_FOUND", reason: "Nie znaleziono faktury o podanym numerze." };
  }
  if (normalizeInvoiceText(invoice.number) !== normalizeInvoiceText(invoiceNumber)) {
    return { ok: false, code: "NUMBER_MISMATCH", reason: "Numer zwróconej faktury nie zgadza się z wpisanym numerem." };
  }
  if (normalizeInvoiceText(clientId) && normalizeInvoiceText(invoice.client_id) !== normalizeInvoiceText(clientId)) {
    return { ok: false, code: "WRONG_CLIENT", reason: "Faktura należy do innego klienta Fakturowni. Nie można jej przypisać do tego montażu." };
  }
  if (!isIssuedVatInvoiceRecord(invoice)) {
    return { ok: false, code: "NOT_ISSUED_VAT", reason: "Dokument nie jest wystawioną fakturą VAT. Powiązanie zostało zablokowane." };
  }
  const oid = normalizeInvoiceText(invoice.oid);
  if (oid && oid !== buildJobInvoiceOid(jobId)) {
    return { ok: false, code: "OTHER_JOB", reason: "Faktura jest przypisana identyfikatorem OID do innego montażu." };
  }
  if (buyer) {
    const identity = inspectInvoiceBuyer(invoice, buyer);
    if (!identity.ok) return identity;
  } else if (!normalizeInvoiceText(clientId)) {
    return { ok: false, code: "BUYER_DETAILS_MISSING", reason: "Brak danych nabywcy i powiazanej kartoteki w Fakturowni." };
  }
  return { ok: true, code: "VERIFIED", reason: "" };
}

/** Candidates are advisory only: never call the confirmation RPC from a suggestion. */
export function findInvoiceCandidatesForManualConfirmation(invoices, { jobId, clientId, buyer, limit = 5 }) {
  if (!Array.isArray(invoices) || !jobId || (!clientId && !buyer)) return [];
  const expectedOid = buildJobInvoiceOid(jobId);
  const seen = new Set();
  const results = [];
  for (const invoice of invoices) {
    const id = normalizeInvoiceText(invoice?.id);
    const number = normalizeInvoiceText(invoice?.number);
    const oid = normalizeInvoiceText(invoice?.oid);
    if (!id || !number || seen.has(id)) continue;
    if (normalizeInvoiceText(clientId) && normalizeInvoiceText(invoice?.client_id) !== normalizeInvoiceText(clientId)) continue;
    if (buyer && !inspectInvoiceBuyer(invoice, buyer).ok) continue;
    if (!isIssuedVatInvoiceRecord(invoice) || (oid && oid !== expectedOid)) continue;
    seen.add(id);
    results.push({ invoiceId: id, invoiceNumber: number, issueDate: normalizeInvoiceText(invoice?.issue_date) });
    if (results.length >= limit) break;
  }
  return results;
}

/** Strict invoice buyer identity, independent of the Fakturownia external_id index. */
function key(value) {
  return normalizeInvoiceText(value).toLowerCase().replace(/ł/g, "l")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,]+/g, " ").replace(/\s+/g, " ").trim();
}
function townKey(value) {
  return key(value).replace(/\b\d{2}[- ]?\d{3}\b/g, "").trim();
}
function streetKey(value, town) {
  let text = key(value).replace(/^(ulica|ul)\s+/, "");
  const locality = townKey(town);
  if (locality && text.endsWith(" " + locality)) text = text.slice(0, -(locality.length + 1));
  return text.replace(/[^a-z0-9]/g, "");
}
function postalKey(value) {
  return normalizeInvoiceText(value).replace(/\D/g, "");
}
function nipKey(value) {
  return normalizeInvoiceText(value).replace(/\D/g, "");
}

/**
 * A buyer needs exact name, street incl. house number, and matching city/postal code.
 * Name or phone alone can NEVER assign an invoice. Empty buyer fields fail closed.
 */
export function inspectInvoiceBuyer(invoice, buyer) {
  if (!buyer?.name || !buyer?.street || !buyer?.city) {
    return { ok: false, code: "BUYER_DETAILS_MISSING", reason: "Montaz nie ma pelnych danych nabywcy do bezpiecznej weryfikacji." };
  }
  if (!key(invoice?.buyer_name) || key(invoice?.buyer_name) !== key(buyer.name)) {
    return { ok: false, code: "BUYER_NAME_MISMATCH", reason: "Faktura ma inna nazwe nabywcy niz montaz WAWIS." };
  }
  const expectedTown = townKey(buyer.city);
  if (!streetKey(invoice?.buyer_street, expectedTown)
      || streetKey(invoice?.buyer_street, expectedTown) !== streetKey(buyer.street, expectedTown)) {
    return { ok: false, code: "BUYER_ADDRESS_MISMATCH", reason: "Faktura ma inny adres nabywcy niz montaz WAWIS." };
  }
  const invoiceTown = townKey(invoice?.buyer_city);
  if (expectedTown && invoiceTown && expectedTown !== invoiceTown) {
    return { ok: false, code: "BUYER_CITY_MISMATCH", reason: "Faktura ma inna miejscowosc nabywcy." };
  }
  const expectedPost = postalKey(buyer.postCode || buyer.city);
  const invoicePost = postalKey(invoice?.buyer_post_code);
  if (expectedPost && invoicePost && expectedPost !== invoicePost) {
    return { ok: false, code: "BUYER_POSTAL_MISMATCH", reason: "Faktura ma inny kod pocztowy nabywcy." };
  }
  if (!invoiceTown && !invoicePost) {
    return { ok: false, code: "BUYER_LOCATION_MISSING", reason: "Brak miejscowosci i kodu pocztowego nabywcy w danych faktury." };
  }
  const expectedNip = nipKey(buyer.taxNo);
  const invoiceNip = nipKey(invoice?.buyer_tax_no);
  if ((expectedNip && expectedNip !== invoiceNip) || (!expectedNip && invoiceNip)) {
    return { ok: false, code: "BUYER_TAX_MISMATCH", reason: "Dane NIP nabywcy na fakturze i montazu sa rozne." };
  }
  return { ok: true, code: "VERIFIED", reason: "" };
}
