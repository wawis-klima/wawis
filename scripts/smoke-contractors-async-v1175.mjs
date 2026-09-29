import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAsyncScope } from '../src/modules/async-scope.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const desktop = read('src', 'components', 'contractors', 'ContractorsPanel.jsx');
const mobile = read('src', 'mobile791', 'components', 'contractors', 'ContractorsPanel.jsx');

// K8: aktywny draft desktopowy nie może być ponownie seedowany przez zmianę jobs/katalogu.
assert.match(desktop, /if \(activeView === 'edit' \|\| activeView === 'new'\) return;/);
assert.match(desktop, /function handleStartEdit\(contractor\)[\s\S]*setForm\(normalizeContractorRecord\(contractor\)\)[\s\S]*setActiveView\('edit'\)/);
const draftEffect = desktop.match(/useEffect\(\(\) => \{[\s\S]*?K8 \/ 11\.75[\s\S]*?\}, \[selectedId, contractorsWithJobFallback, activeView\]\);/)?.[0] || '';
assert.ok(draftEffect, 'Brak guardu K8 dla desktopowego draftu kontrahenta.');
assert.match(draftEffect, /if \(activeView === 'edit' \|\| activeView === 'new'\) return;/);

// K9: oba interfejsy unieważniają load rozpoczęty przed mutacją i dopiero po niej robią kontrolowany read.
for (const [label, source] of [['desktop', desktop], ['mobile', mobile]]) {
  assert.match(source, /function invalidatePendingContractorLoad\(\)[\s\S]*loadGuard\.invalidate\(\)[\s\S]*setLoading\(false\)/, `${label}: brak invalidate + domknięcia loading`);
  assert.match(source, /async function handleSave\(\)[\s\S]*invalidatePendingContractorLoad\(\)[\s\S]*saveContractor\([\s\S]*reloadContractors\(\{ reportError: false \}\)/, `${label}: zapis nie chroni przed starym odczytem`);
  assert.match(source, /async function handleDelete[\s\S]*invalidatePendingContractorLoad\(\)[\s\S]*(removeContractor|removeJobFallbackContractor)[\s\S]*reloadContractors\(\{ reportError: false \}\)/, `${label}: usuwanie nie chroni przed starym odczytem`);
  assert.match(source, /async function reloadContractors\(\{ reportError = true \} = \{\}\)[\s\S]*if \(!isCurrent\(\)\) return false;/, `${label}: spóźniony odczyt może nadal commitować`);
}

// Behawioralnie: mutacja unieważnia load A, a późniejszy kontrolowany load B wygrywa.
{
  const scope = createAsyncScope();
  const canCommitA = scope.begin();
  let resolveA;
  const loadA = new Promise((resolve) => { resolveA = resolve; }).then(() => canCommitA());

  scope.invalidate();
  assert.equal(canCommitA(), false, 'Load rozpoczęty przed mutacją nie może commitować.');

  const canCommitB = scope.begin();
  let resolveB;
  const loadB = new Promise((resolve) => { resolveB = resolve; }).then(() => canCommitB());

  resolveA();
  resolveB();
  assert.equal(await loadA, false, 'Spóźniony load A musi zostać odrzucony.');
  assert.equal(await loadB, true, 'Kontrolowany load B po mutacji musi być bieżący.');
}

// K15: zdalne urządzenia są przypięte do contractorId, poprzedni wynik nie jest fallbackiem dla nowego klienta.
assert.match(desktop, /contractorDevicesRemote, setContractorDevicesRemote\] = useState\(\{[\s\S]*contractorId: ''[\s\S]*rows: \[\][\s\S]*status: 'idle'/);
assert.match(desktop, /setContractorDevicesRemote\(\{ contractorId, rows: \[\], status: 'loading' \}\)/);
assert.match(desktop, /remoteDevicesMatchSelection = contractorDevicesRemote\.contractorId === selectedContractorDeviceId/);
assert.match(desktop, /contractorDevicesRemote\.status === 'ready'[\s\S]*\? contractorDevicesRemote\.rows/);
assert.doesNotMatch(desktop, /contractorDevicesRemote\.length \? contractorDevicesRemote : selectedContractorDevicesFromJobs/);
assert.match(desktop, /contractorDevicesRemote\.contractorId !== String\(selectedContractorIdForDevice\)[\s\S]*return;/);
assert.match(desktop, /Ładowanie urządzeń…/);

console.log('11.75 contractor async/draft/device isolation smoke OK');
