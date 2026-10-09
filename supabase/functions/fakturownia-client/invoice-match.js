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
 * Company identity: use a matching, structurally valid NIP as authoritative.
 * GUS can expand the legal company name or correct its address and postal code
 * after opening the Fakturownia form. Do not reject a genuine invoice for these
 * differences when both NIPs match and the existing job/creation safeguards pass.
 *
 * Private customer: still requires exact name, house number and locality.
 * An absent or different company NIP ALWAYS fails closed; never fall back to a
 * loose company-name or address match in that situation.
 */
function validPolishNip(value) {
  const nip = nipKey(value);
  if (!/^\d{10}$/.test(nip)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const checksum = weights.reduce((sum, weight, index) => sum + weight * Number(nip[index]), 0) % 11;
  return checksum === Number(nip[9]);
}

export function inspectInvoiceBuyer(invoice, buyer) {
  const expectedNip = nipKey(buyer?.taxNo);
  const actualNip = nipKey(invoice?.buyer_tax_no);
  if (expectedNip || actualNip) {
    if (!expectedNip || !validPolishNip(expectedNip)) {
      return { ok: false, code: "BUYER_TAX_MISMATCH", reason: "NIP nabywcy w montażu jest brakujący lub nieprawidłowy. Nie można automatycznie potwierdzić faktury." };
    }
    if (actualNip !== expectedNip || !validPolishNip(actualNip)) {
      return { ok: false, code: "BUYER_TAX_MISMATCH", reason: "NIP nabywcy na fakturze różni się od NIP-u w WAWIS albo jest nieprawidłowy." };
    }
    // The provider's client_id, exact invoice number, issued VAT status, OID
    // and server-owned per-job snapshot are checked by caller as before.
    return { ok: true, code: "VERIFIED_BY_NIP", reason: "" };
  }
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
  return { ok: true, code: "VERIFIED", reason: "" };
}
