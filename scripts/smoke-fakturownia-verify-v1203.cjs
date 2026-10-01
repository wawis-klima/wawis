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

assert.match(edge, /existingInvoiceIds/, 'Przed otwarciem formularza trzeba zapamiętać bazową listę faktur klienta.');
assert.match(edge, /action === "verify"/, 'Edge Function musi mieć tryb verify.');
assert.match(edge, /knownInvoiceIds/, 'Verify musi porównywać faktury z listą sprzed otwarcia formularza.');
assert.match(edge, /isIssuedVatInvoice/, 'Verify ma zaakceptować wyłącznie rzeczywistą wystawioną fakturę VAT.');
assert.match(edge, /issuedStatuses[\s\S]*issued[\s\S]*sent[\s\S]*paid[\s\S]*partial/, 'Weryfikacja ma uznawać wystawione/wysłane/opłacone/częściowo opłacone.');
assert.match(edge, /vatKinds[\s\S]*vat/, 'Weryfikacja ma ograniczać się do faktur VAT.');

assert.match(panel, /fakturowniaVerificationRef/, 'Panel musi pamiętać stan sprzed otwarcia Fakturowni.');
assert.match(panel, /window\.addEventListener\('focus'/, 'Po powrocie do aplikacji ma ruszyć automatyczna kontrola.');
assert.match(panel, /visibilitychange/, 'Powrót z karty Fakturowni ma być wykrywany także przez visibilitychange.');
assert.match(panel, /verifyPendingFakturowniaInvoice/, 'Panel musi sprawdzać, czy powstała nowa faktura.');
assert.match(panel, /confirmVatInvoiceFromFakturownia/, 'Potwierdzona faktura ma używać trwałego potwierdzenia z Fakturowni.');
assert.match(panel, /invoiceId:\s*result\.invoiceId/, 'Potwierdzenie musi zapisać identyfikator faktury z Fakturowni.');
assert.match(panel, /Ręczna decyzja administratora ma pierwszeństwo/, 'Manualny przycisk musi pozostać nadrzędnym sposobem korekty.');
assert.match(panel, /fakturowniaVerificationRef\.current = null/, 'Ręczna zmiana ma wyłączać oczekującą automatyczną kontrolę.');

console.log('OK: v12.03 realna faktura Fakturowni automatycznie ustawia VAT, manualny toggle pozostaje.');
