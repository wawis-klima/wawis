import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../src/components/JobDetailsPanel.jsx',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/fakturownia-client/index.ts',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/components/job-details-invoice-v1210.css',import.meta.url),'utf8');

assert.match(ui,/const \[invoiceEmergencyExpanded, setInvoiceEmergencyExpanded\] = React\.useState\(false\)/);
assert.match(ui,/setInvoiceEmergencyExpanded\(false\)/);
assert.match(ui,/aria-expanded=\{invoiceEmergencyExpanded\}/);
assert.match(ui,/className="desktopInvoiceEmergencyToggleV1281"/);
assert.match(ui,/Opcje awaryjne/);
assert.match(ui,/\{invoiceEmergencyExpanded \? \(\s*<div id="desktopInvoiceEmergencyToolsV1281"/);
assert.match(ui,/onClick=\{\(\) => void verifyPendingFakturowniaInvoice\(true\)\}/);
assert.match(ui,/onClick=\{\(\) => setManualInvoiceExpanded\(\(value\) => !value\)\}/);
assert.match(ui,/onSubmit=\{linkInvoiceByNumber\}/);
assert.match(ui,/invoiceVerificationCandidates\.map/);
assert.match(ui,/invoiceVerificationMessage \? <p role="status"/);
assert.match(ui,/!selectedJob\.vat_invoice_fakturownia_confirmed/);
assert.match(ui,/hasPendingFakturowniaInvoice/);
assert.match(css,/\.desktopInvoiceEmergencyToggleV1281/);

const selectClient=edge.indexOf('const { data: preparedAttempt');
const optionalProviderLookup=edge.indexOf('const trustedClientId = normalizeText(preparedAttempt?.client_id)');
const oid=edge.indexOf('const rawOid = await fakturowniaGetInvoices');
assert(selectClient>=0 && optionalProviderLookup>selectClient && oid>optionalProviderLookup,
  'Use server-owned client snapshot before optional external Fakturownia lookup');
const match=edge.indexOf('if (outcome.invoice) {');
const manualScan=edge.indexOf('const details = await hydrateLikelyBuyerInvoices',match);
const elseBranch=edge.indexOf('} else {',match);
assert(match>=0&&elseBranch>match&&manualScan>elseBranch,'Manual candidates must be in auto failure branch');
assert(!edge.slice(match,elseBranch).includes('hydrateLikelyBuyerInvoices'),
  'Successful automatic match cannot hydrate manual candidates');
assert.match(edge,/if \(existing\?\.length\) return no\(/,'Keep global duplicate invoice-id protection');
assert.match(edge,/if \(competingJobs\?\.length\) return no\(/,'Keep other job safety guard');
assert.match(edge,/if \(newer\.length !== 1\) return no\(/,'Keep unique-new-invoice guard');
console.log('PASS V12.81: hidden emergency controls, user-triggered fallback, fast-path and unchanged guards');
