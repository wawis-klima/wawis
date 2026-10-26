import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canRestoreProtocolSignatureDraft, clearProtocolSignatureDraft, getProtocolSignatureDraft,
  saveProtocolSignatureDraft, setProtocolSignatureDraftOwner,
} from '../src/mobile791/modules/protocol-signature-drafts.js';

// WAWIS 13.77 — ochrona podpisu klienta, poziom 1.
setProtocolSignatureDraftOwner('worker-1');
const draft = { signatureDataUrl: 'data:image/png;base64,AAA', signatureRotation: 'auto', paymentDraft: { enabled: true, amount: '1000' }, protocolNote: '', snapshotKey: '{"client":"B"}' };
assert.equal(saveProtocolSignatureDraft('job-1', draft), true);
assert.equal(getProtocolSignatureDraft('job-1').signatureDataUrl, draft.signatureDataUrl);
// Tylko identyczne podpisane dane.
assert.equal(canRestoreProtocolSignatureDraft(getProtocolSignatureDraft('job-1'), '{"client":"B"}'), true);
assert.equal(canRestoreProtocolSignatureDraft(getProtocolSignatureDraft('job-1'), '{"client":"B2"}'), false);
// Bez podpisu lub klucza danych — nic nie zapisujemy.
assert.equal(saveProtocolSignatureDraft('job-2', { ...draft, signatureDataUrl: '' }), false);
assert.equal(saveProtocolSignatureDraft('job-2', { ...draft, snapshotKey: '' }), false);
// Inne konto na tym telefonie nie dostaje cudzego podpisu.
setProtocolSignatureDraftOwner('worker-2');
assert.equal(getProtocolSignatureDraft('job-1'), null);
setProtocolSignatureDraftOwner('worker-1');
saveProtocolSignatureDraft('job-1', draft);
clearProtocolSignatureDraft('job-1');
assert.equal(getProtocolSignatureDraft('job-1'), null);

// Statycznie: podpis tylko w pamięci aplikacji (bez IndexedDB/localStorage) i przepływ w oknie protokołu.
const module = fs.readFileSync(new URL('../src/mobile791/modules/protocol-signature-drafts.js', import.meta.url), 'utf8')
  .split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
assert.doesNotMatch(module, /indexedDB|localStorage|sessionStorage/, 'podpis klienta nie może trafić do pamięci telefonu (poziom 2 wymaga decyzji)');
const modal = fs.readFileSync(new URL('../src/mobile791/components/modals/ProtocolTestModal.jsx', import.meta.url), 'utf8');
assert.match(modal, /if \(isProtocolOffline\(\)\) \{\s*\/\/ 13\.77/, 'bez internetu zapis czeka na zasięg');
assert.match(modal, /clearProtocolSignatureDraft\(job\?\.id\);\s*setSavedRecord\(record\);/, 'udany zapis usuwa szkic podpisu');
assert.match(modal, /data-testid="protocol-offline-notice"/);
assert.match(modal, /onClose=\{isGenerating \|\| signatureOpen \? undefined : handleClose\}/, 'każde zamknięcie przez potwierdzenie');
assert.match(read('src/mobile791/App.jsx'), /setProtocolSignatureDraftOwner\(sessionUser\?\.id \|\| ""\)/);

function read(path) { return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'); }
console.log('smoke-protocol-signature-v1377: OK');
