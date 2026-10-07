const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const panel = read('src/components/JobDetailsPanel.jsx');
const moduleSource = read('src/modules/fakturownia.js');
const edge = read('supabase/functions/fakturownia-client/index.ts');

assert.match(moduleSource, /verifyFakturowniaInvoice/, 'Frontend musi mieć osobną weryfikację faktury.');
assert.match(moduleSource, /action:\s*'verify'/, 'Weryfikacja musi wywoływać tryb verify Edge Function.');
assert.match(moduleSource, /jobId:\s*normalizedJobId/, 'Verify musi zawsze wysłać identyfikator montażu.');

assert.match(edge, /action === "verify"/, 'Edge Function musi mieć tryb verify.');
assert.match(edge, /buildJobInvoiceOid\(jobId\)/, 'Verify musi wyliczyć jednoznaczny OID montażu.');
assert.match(edge, /oid:\s*invoiceOid/, 'Fakturownia ma być odpytywana po OID montażu, nie po liście nowych faktur klienta.');
assert.match(edge, /findIssuedVatInvoiceForJob/, 'Verify musi używać dokładnego dopasowania jobId + clientId + OID.');
assert.doesNotMatch(edge, /!knownInvoiceIds\.has\(invoiceId\)/, 'Nie wolno potwierdzać pierwszej nowej faktury klienta.');

assert.match(panel, /fakturowniaVerificationRef/, 'Panel musi pamiętać oczekującą weryfikację.');
assert.match(panel, /window\.addEventListener\('focus'/, 'Po powrocie do aplikacji ma ruszyć automatyczna kontrola.');
assert.match(panel, /visibilitychange/, 'Powrót z karty Fakturowni ma być wykrywany także przez visibilitychange.');
assert.match(panel, /verifyPendingFakturowniaInvoice/, 'Panel musi sprawdzać, czy powstała faktura dla tego montażu.');
assert.match(panel, /confirmVatInvoiceFromFakturownia/, 'Potwierdzona faktura ma używać trwałego potwierdzenia z Fakturowni.');
assert.match(panel, /invoiceId:\s*result\.invoiceId/, 'Potwierdzenie musi zapisać identyfikator faktury z Fakturowni.');

console.log('OK: Fakturownia verify jest związane z konkretnym montażem przez OID.');
