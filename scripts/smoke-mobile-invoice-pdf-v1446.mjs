// WAWIS 14.46: PDF faktury z Fakturowni na telefonie — tylko administrator, hooki przed wczesnym return.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const panel = read('src/mobile791/components/JobDetailsPanel.jsx');
const mod = read('src/mobile791/modules/invoice-pdf.js');
const mock = read('src/mobile791/lib/mockSupabaseClient.js');

const hooksAt = panel.indexOf('const [invoiceInfo, setInvoiceInfo] = React.useState(null);');
const earlyReturnAt = panel.indexOf('  if (!selectedJob) {\n');
assert.ok(hooksAt > 0 && earlyReturnAt > 0 && hooksAt < earlyReturnAt, 'hooki faktury przed wczesnym return (zasady React)');
assert.match(panel, /if \(!isAdmin \|\| !selectedJobIsCompleted \|\| !selectedJobId \|\| !supabase\) return undefined;/);
assert.match(panel, /\{isAdmin && selectedJobIsCompleted && invoiceInfo \? \(/);
assert.match(mod, /from '\.\.\/\.\.\/modules\/fakturownia\.js'/, 'ta sama funkcja serwera co na komputerze');
assert.match(mod, /vat_invoice_fakturownia_confirmed !== true\) return null/);
assert.match(mod, /window\.open\('', '_blank'\)/, 'karta otwierana od razu po dotknięciu (Safari)');
assert.doesNotMatch(mock, /nip: body\.nip/, 'atrapa GUS bez odwołania przed deklaracją body');

// Pola faktury nie trafiają do listy montaży pobieranej przez pracowników.
assert.doesNotMatch(read('src/mobile791/modules/jobs-fetch.js'), /vat_invoice/);
console.log('PASS WAWIS 14.46 — PDF faktury na telefonie tylko dla administratora.');
