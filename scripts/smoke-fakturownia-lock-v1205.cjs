const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const panel = read('src/components/JobDetailsPanel.jsx');
const crud = read('src/modules/jobs-crud.js');
const fetchSource = read('src/modules/jobs-fetch.js');
const columns = read('src/components/desktop-jobs-table.columns.jsx');
const migration = read('supabase/migrations/current/20261001071500_vat_invoice_fakturownia_lock_v1205.sql');

assert.match(migration, /vat_invoice_fakturownia_confirmed boolean not null default false/i, 'Brak trwałej flagi potwierdzenia Fakturowni.');
assert.match(migration, /vat_invoice_fakturownia_invoice_id text/i, 'Brak identyfikatora potwierdzonej faktury.');
assert.match(migration, /if v_confirmed and not coalesce\(p_issued, false\) then/i, 'RPC musi blokować cofnięcie potwierdzonej faktury.');
assert.match(migration, /nie można oznaczyć jej jako niewystawionej/i, 'Brak jawnego błędu przy próbie cofnięcia.');
assert.match(migration, /admin_confirm_job_vat_invoice_fakturownia/i, 'Brak osobnego RPC potwierdzającego Fakturownię.');
assert.match(migration, /vat_invoice_issued = true[\s\S]*vat_invoice_fakturownia_confirmed = true/i, 'Potwierdzenie Fakturowni musi atomowo ustawiać status i blokadę.');

assert.match(crud, /confirmVatInvoiceFromFakturownia/, 'Frontend CRUD musi używać osobnego RPC potwierdzenia.');
assert.match(crud, /admin_confirm_job_vat_invoice_fakturownia/, 'Frontend CRUD nie wywołuje RPC blokady.');

assert.match(fetchSource, /vat_invoice_fakturownia_confirmed/, 'Desktop musi pobierać flagę blokady.');
assert.match(fetchSource, /vat_invoice_fakturownia_invoice_id/, 'Desktop musi pobierać dowód potwierdzenia.');

assert.match(panel, /selectedJob\?\.vat_invoice_fakturownia_confirmed\) return/, 'Manualny toggle musi ignorować klik po potwierdzeniu.');
assert.match(panel, /disabled=\{vatInvoiceSaving \|\| fakturowniaVerifying \|\| Boolean\(selectedJob\.vat_invoice_fakturownia_confirmed\)\}/, 'Przycisk ma być zablokowany po potwierdzeniu.');
assert.match(panel, /Faktura została potwierdzona w Fakturowni — statusu nie można już cofnąć/, 'UI musi wyjaśniać blokadę.');
assert.match(panel, /confirmVatInvoiceFromFakturownia[\s\S]*invoiceId:\s*result\.invoiceId/, 'Automatyczna weryfikacja ma zapisywać trwałe potwierdzenie.');

assert.match(columns, /potwierdzona w Fakturowni/, 'Tabela ma rozróżniać potwierdzenie dostawcy w podpowiedzi.');

console.log('OK: v12.05 potwierdzona faktura Fakturowni jest nieodwracalna, status manualny działa tylko przed potwierdzeniem.');
