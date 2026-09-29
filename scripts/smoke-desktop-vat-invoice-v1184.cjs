const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const columns = read('src/components/desktop-jobs-table.columns.jsx');
const panel = read('src/components/JobDetailsPanel.jsx');
const desktopFetch = read('src/modules/jobs-fetch.js');
const mobileFetch = read('src/mobile791/modules/jobs-fetch.js');
const crud = read('src/modules/jobs-crud.js');
const tableCss = read('src/styles/desktop-jobs-table.css');
const detailsCss = read('src/styles.css');
const migration = read('supabase/migrations/current/20260929171500_vat_invoice_status_v1184.sql');

assert.match(columns, /key:\s*["']vat_invoice["']/);
assert.match(columns, /label:\s*["']FV["']/);
assert.match(columns, /desktopVatInvoiceDot/);
assert.match(columns, /vat_invoice_issued/);

assert.match(panel, /Faktura VAT/);
assert.match(panel, /desktopVatInvoiceToggle/);
assert.match(panel, /handleVatInvoiceToggle/);
assert.match(panel, /saveVatInvoiceStatus/);
assert.match(panel, /setJobs\?\.\(\(previous\) => previous\.map\(patchJob\)\)/);

assert.match(desktopFetch, /payment_updated_at, vat_invoice_issued/);
assert.doesNotMatch(mobileFetch, /vat_invoice_issued/, 'Pole FV ma pozostać poza mobilnym payloadem.');

assert.match(crud, /admin_set_job_vat_invoice_issued/);
assert.match(tableCss, /data-column=["']vat_invoice["']/);
assert.match(tableCss, /desktopVatInvoiceDot\.issued/);
assert.match(tableCss, /desktopVatInvoiceDot\.missing/);
assert.match(detailsCss, /desktopVatInvoiceToggle\.issued/);
assert.match(detailsCss, /desktopVatInvoiceToggle\.missing/);

assert.match(migration, /add column if not exists vat_invoice_issued boolean not null default false/i);
assert.match(migration, /where status = 'Zakończone'/);
assert.match(migration, /row_number\(\) over[\s\S]*installation_date desc nulls last[\s\S]*created_at desc nulls last/i);
assert.match(migration, /r\.row_no > 10/);
assert.match(migration, /set vat_invoice_issued = true/);
assert.match(migration, /current_user_is_admin\(\)/);
assert.match(migration, /grant execute on function public\.admin_set_job_vat_invoice_issued\(uuid, boolean\) to authenticated/i);

console.log('Desktop VAT invoice 11.84 smoke OK');
