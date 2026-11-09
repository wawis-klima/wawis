// WAWIS 14.40: „Szukaj w GUS” przy edycji montażu nie może nadpisać adresu montażu ani danych z karty klienta.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const NIP = '5730208483';
const gus = { name: 'PEŁNA NAZWA Z GUS', street: 'Siedzibowa 1', city: 'Warszawa', postalCode: '00-001' };

for (const tree of ['src', 'src/mobile791']) {
  const { applyGusResultToEditedJob: apply } = await import(new URL(`../${tree}/modules/gus-bir.js`, import.meta.url));

  const linked = { nip: NIP, contractor_id: 'c1', client: 'Auto Art', street: 'Równoległa 63c', city: 'Częstochowa' };
  const linkedResult = apply(linked, gus, NIP);
  assert.equal(linkedResult.form, linked, `${tree}: montaż powiązany z kartą musi zostać bez zmian`);
  assert.match(linkedResult.message, /PEŁNA NAZWA Z GUS.*dane nie zostały zmienione/);

  const filled = { nip: NIP, contractor_id: '', client: 'Jan', street: 'Montażowa 2', city: 'Kraków' };
  assert.equal(apply(filled, gus, NIP).form, filled, `${tree}: adres montażu inny niż siedziba nie może zostać nadpisany`);

  const empty = { nip: NIP, contractor_id: '', client: '', street: '', city: '' };
  const emptyResult = apply(empty, gus, NIP);
  assert.deepEqual(
    [emptyResult.form.client, emptyResult.form.street, emptyResult.form.city],
    ['PEŁNA NAZWA Z GUS', 'Siedzibowa 1', '00-001 Warszawa'],
  );

  const cityOnly = { nip: NIP, contractor_id: '', client: 'Jan', street: '', city: 'Kraków' };
  assert.equal(apply(cityOnly, gus, NIP).form, cityOnly, `${tree}: częściowy adres nie może zostać zmieszany z siedzibą`);

  const stale = { nip: '1234563218', contractor_id: '', client: '', street: '', city: '' };
  assert.deepEqual(apply(stale, gus, NIP), { form: stale, message: '' }, `${tree}: spóźniona odpowiedź dla innego NIP-u`);
}

for (const path of ['src/components/modals/JobFormModal.jsx', 'src/mobile791/components/modals/JobFormModal.jsx']) {
  const form = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.match(form, /refreshGusByNip\(nip, \{ editMode: true \}\)/, `${path}: brak wyszukiwania przy edycji`);
  assert.match(form, /!showModal \|\| editingJobId \|\| !supabase \|\| jobForm\.contractor_id/, `${path}: automat GUS ma zostać wyłączony przy edycji`);
  assert.doesNotMatch(form, /editingJobId \? \(\s*<input[^>]*(?:\n[^>]*)*NIP \(opcjonalnie\)/, `${path}: edycja bez przycisku GUS`);
}

console.log('PASS WAWIS 14.40 — „Szukaj w GUS” przy edycji montażu bez nadpisywania danych.');
