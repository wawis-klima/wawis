const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const panel = read('src/components/JobDetailsPanel.jsx');
const moduleSource = read('src/modules/fakturownia.js');
const edge = read('supabase/functions/fakturownia-client/index.ts');
const styles = read('src/styles.css');

assert.match(panel, /prepareFakturowniaInvoice/, 'Desktop ma korzystać z modułu Fakturowni.');
assert.match(panel, /desktopFakturowniaButton/, 'Desktop ma mieć przycisk Fakturowni.');
assert.match(panel, /Wystaw fakturę/, 'Przycisk ma mieć etykietę Wystaw fakturę.');
assert.match(panel, /isAdmin[\s\S]*desktopFakturowniaButton/, 'Przycisk ma być dostępny tylko administratorowi.');
assert.match(moduleSource, /functions\.invoke\('fakturownia-client'/, 'Frontend ma wywoływać zabezpieczoną Edge Function.');
assert.match(edge, /FAKTUROWNIA_API_TOKEN/, 'Edge Function ma czytać token wyłącznie z sekretu.');
assert.match(edge, /external_id/, 'Synchronizacja klienta ma używać external_id, żeby ograniczyć duplikaty.');
assert.match(edge, /clients\.json/, 'Integracja ma synchronizować kartę klienta w Fakturowni.');
assert.match(edge, /\/invoices\/new\?client_id=/, 'Integracja ma otwierać formularz faktury z klientem.');
assert.match(edge, /fakturowniaGetInvoices/, 'Integracja ma móc odczytać listę faktur klienta do weryfikacji.');
assert.doesNotMatch(edge, /\/invoices\.json[\s\S]{0,240}method:\s*["']POST["']/, 'Kliknięcie nie może automatycznie tworzyć faktury przez API.');
assert.match(styles, /\.desktopFakturowniaButton\{/, 'Przycisk Fakturowni musi mieć styl desktopowy.');

console.log('OK: v11.95 bezpiecznie synchronizuje klienta i otwiera formularz Fakturowni.');
