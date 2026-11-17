// WAWIS 14.43: druga faktura z rzędu potwierdza się sama, gdy poprzednie wystawienie jest już zakończone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { unresolvedConcurrentJobIds as f } from '../supabase/functions/fakturownia-client/concurrent-attempts.ts';

// Przypadek z 17.11.2026: sklep (06:38, potwierdzony) i Iwona Hąc (06:41).
assert.deepEqual(f(['sklep'], [{ id: 'sklep', vat_invoice_fakturownia_confirmed: true, vat_invoice_fakturownia_invoice_id: '123' }]), []);
// Naprawdę równoległe wystawienie nadal blokuje.
assert.deepEqual(f(['inny'], [{ id: 'inny', vat_invoice_fakturownia_confirmed: false, vat_invoice_fakturownia_invoice_id: null }]), ['inny']);
assert.deepEqual(f(['bez-id'], [{ id: 'bez-id', vat_invoice_fakturownia_confirmed: true, vat_invoice_fakturownia_invoice_id: '' }]), ['bez-id']);
assert.deepEqual(f(['tekst'], [{ id: 'tekst', vat_invoice_fakturownia_confirmed: 'true', vat_invoice_fakturownia_invoice_id: '1' }]), ['tekst']);
assert.deepEqual(f(['usuniety'], []), ['usuniety'], 'brak montażu w bazie = blokuje');
assert.deepEqual(f(['a', 'b'], [{ id: 'a', vat_invoice_fakturownia_confirmed: true, vat_invoice_fakturownia_invoice_id: '1' }]), ['b']);

const src = fs.readFileSync(new URL('../supabase/functions/fakturownia-client/index.ts', import.meta.url), 'utf8');
assert.match(src, /unresolvedConcurrentJobIds\(otherJobIds, otherJobs \|\| \[\]\)/);
assert.match(src, /otherJobIds\.length !== otherAttempts\.length/, 'wpis bez montażu blokuje');
assert.doesNotMatch(src, /Inne zlecenie tego klienta/);
console.log('PASS WAWIS 14.43 — zakończone wystawienie nie blokuje automatycznego potwierdzenia kolejnej faktury.');
