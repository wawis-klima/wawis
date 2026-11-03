// WAWIS 14.14 — wykonywalny test modułu worker-same-name-client (bez sieci, atrapa Supabase).
// RED na 14.13: dodanie montażu pracownika nie sprawdzało klienta o tej samej nazwie —
// worker_create_or_get_contractor_for_job przypisywał montaż po samej nazwie bez pytania.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SAME_NAME_CLIENT_ERROR_CODE,
  buildNameLookupPattern,
  checkWorkerSameNameClient,
  normalizeClientName,
} from '../src/mobile791/modules/worker-same-name-client.js';

const KOWALSKI = { id: 'c-1', company_name: 'Jan Kowalski', phone: '+48 600 111 222', email: 'Jan.K@example.test', city: 'Zawiercie', street: 'Widna 19', addresses: [] };
const KOWALSKIEWICZ = { id: 'c-2', company_name: 'Jan Kowalskiewicz', phone: '600333444', email: '', city: 'Myszków', street: 'Polna 1', addresses: [] };

function fakeSupabase(rows, { fail = false } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const state = { table, pattern: null, limit: null };
      const query = {
        select() { return query; },
        ilike(column, pattern) { state.column = column; state.pattern = pattern; return query; },
        limit(value) { state.limit = value; calls.push({ ...state }); return query; },
        then(resolve) {
          if (fail) return resolve({ data: null, error: { message: 'network' } });
          const re = new RegExp(`^${String(state.pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i');
          return resolve({ data: rows.filter((row) => re.test(row.company_name)), error: null });
        },
      };
      return query;
    },
  };
}

const asked = [];
const answer = (value) => (message) => { asked.push(message); return value; };

// 1. Brak klienta o tej nazwie: bez pytania.
asked.length = 0;
let result = await checkWorkerSameNameClient({ supabase: fakeSupabase([KOWALSKIEWICZ]), form: { client: 'Jan Kowalski', phone: '500000000' }, confirmFn: answer(false) });
assert.equal(result.status, 'none', 'podobna, ale inna nazwa (Kowalskiewicz) to nie ten sam klient');
assert.equal(asked.length, 0);

// 2. Ten sam telefon (inny zapis) lub e-mail potwierdza klienta bez pytania.
for (const form of [
  { client: 'jan  KOWALSKI ', phone: '600-111-222' },
  { client: 'Jan Kowalski', phone: '', email: ' jan.k@EXAMPLE.test ' },
]) {
  asked.length = 0;
  result = await checkWorkerSameNameClient({ supabase: fakeSupabase([KOWALSKI]), form, confirmFn: answer(false) });
  assert.equal(result.status, 'same_contact', `kontakt potwierdza klienta: ${JSON.stringify(form)}`);
  assert.equal(result.contractorId, 'c-1');
  assert.equal(asked.length, 0, 'bez pytania, gdy telefon lub e-mail się zgadza');
}

// 3. Ta sama nazwa, inny telefon: pytanie z adresem i końcówką telefonu istniejącego klienta.
asked.length = 0;
result = await checkWorkerSameNameClient({ supabase: fakeSupabase([KOWALSKI]), form: { client: 'Jan Kowalski', phone: '501999888' }, confirmFn: answer(true) });
assert.equal(result.status, 'confirmed');
assert.equal(asked.length, 1);
assert.match(asked[0], /W bazie jest już klient „Jan Kowalski” \(adres: Zawiercie, Widna 19, tel\. kończący się na 222\)/);
assert.doesNotMatch(asked[0], /600 ?111/, 'pełny telefon istniejącego klienta nie jest pokazywany');

// 4. „Inna osoba”: błąd przed zapisem, z prośbą o dopisanie miejscowości.
await assert.rejects(
  checkWorkerSameNameClient({ supabase: fakeSupabase([KOWALSKI]), form: { client: 'Jan Kowalski' }, confirmFn: answer(false) }),
  (error) => error.code === SAME_NAME_CLIENT_ERROR_CODE
    && /Montaż nie został zapisany/.test(error.message)
    && /„Jan Kowalski Myszków”/.test(error.message)
    && /Wpisane dane zostały w formularzu/.test(error.message),
);

// 5. Błąd sprawdzenia nie blokuje zapisu (dotychczasowe działanie).
const logs = [];
result = await checkWorkerSameNameClient({ supabase: fakeSupabase([KOWALSKI], { fail: true }), form: { client: 'Jan Kowalski' }, confirmFn: answer(false), logFn: (event) => logs.push(event) });
assert.equal(result.status, 'lookup_failed');
assert.deepEqual(logs, ['worker-same-name-client.lookup-failed']);

// 6. Wzorzec zapytania: bez znaków specjalnych użytkownika, normalizacja zgodna z bazą.
assert.equal(normalizeClientName('  Jan   KOWALSKI '), 'jan kowalski');
assert.equal(buildNameLookupPattern('Jan 100% *Kowalski_\\'), 'jan%100_%_kowalski__');
const supabase = fakeSupabase([KOWALSKI]);
await checkWorkerSameNameClient({ supabase, form: { client: 'Jan Kowalski', phone: '600111222' }, confirmFn: answer(false) });
assert.deepEqual(supabase.calls[0], { table: 'contractors', column: 'company_name', pattern: 'jan%kowalski', limit: 20 });

// 7. Podłączenie: sprawdzenie przed RPC pracownika w nowym montażu i w edycji bez klienta.
const jobsForm = fs.readFileSync('src/mobile791/modules/jobs-form.js', 'utf8');
const newPath = jobsForm.slice(jobsForm.indexOf('async function resolveNewJobFormForSave'), jobsForm.indexOf('export async function addJobRecord'));
assert.ok(newPath.indexOf('checkWorkerSameNameClient') > 0 && newPath.indexOf('checkWorkerSameNameClient') < newPath.indexOf('createContractorFromWorkerJobForm'),
  'nowy montaż pracownika: pytanie przed utworzeniem/dopasowaniem klienta');
const editPath = jobsForm.slice(jobsForm.indexOf('async function resolveEditedJobFormForSave'), jobsForm.indexOf('async function resolveNewJobFormForSave'));
assert.ok(editPath.indexOf('checkWorkerSameNameClient') > 0 && editPath.indexOf('checkWorkerSameNameClient') < editPath.indexOf('applyAutoLinkedContractorToJobForm'),
  'edycja bez klienta: pytanie przed automatycznym dopasowaniem');

console.log('PASS WAWIS 14.14 — klient o tej samej nazwie: pytanie zamiast cichego przypisania, kontakt potwierdza bez pytania, „inna osoba” zatrzymuje zapis.');
