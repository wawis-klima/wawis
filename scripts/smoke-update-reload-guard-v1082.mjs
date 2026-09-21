import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scheduled = new Map();
const listeners = new Map();
let nextTimerId = 1;
let reloadCount = 0;

globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};

globalThis.window = {
  location: {
    reload() {
      reloadCount += 1;
    },
  },
  setTimeout(callback, delay) {
    const id = nextTimerId++;
    scheduled.set(id, { callback, delay });
    return id;
  },
  clearTimeout(id) {
    scheduled.delete(id);
  },
  addEventListener(type, handler) {
    listeners.set(type, handler);
  },
  removeEventListener(type, handler) {
    if (listeners.get(type) === handler) listeners.delete(type);
  },
  dispatchEvent() {
    return true;
  },
};

const guard = await import('../src/modules/update-reload-guard.js');
const {
  blockBeforeUnload,
  blockUnsavedWork,
  blockUpdateReload,
  requestUpdateReload,
  getUpdateReloadGuardState,
  __resetUpdateReloadGuardForTests,
} = guard;

function flushOneScheduled() {
  const first = [...scheduled.entries()][0];
  assert.ok(first, 'Oczekiwano zaplanowanego timera reloadu.');
  scheduled.delete(first[0]);
  first[1].callback();
}

function reset() {
  __resetUpdateReloadGuardForTests();
  scheduled.clear();
  listeners.clear();
  reloadCount = 0;
}

reset();
const releaseModal = blockUpdateReload('clean-modal');
assert.equal(getUpdateReloadGuardState().blockers, 1);
assert.equal(getUpdateReloadGuardState().beforeUnloadWarnings, 0, 'Czysty modal nie może powodować beforeunload.');
assert.equal(listeners.has('beforeunload'), false, 'Czysty modal nie może ostrzegać o niezapisanej pracy.');
releaseModal();

const releaseWarning = blockBeforeUnload('dirty-only');
assert.equal(getUpdateReloadGuardState().blockers, 0, 'Samo ostrzeżenie beforeunload nie może blokować update reloadu.');
assert.equal(getUpdateReloadGuardState().beforeUnloadWarnings, 1);
assert.ok(listeners.has('beforeunload'));
releaseWarning();
assert.equal(listeners.has('beforeunload'), false);

const releaseDirty = blockUnsavedWork('dirty-form');
assert.equal(getUpdateReloadGuardState().blockers, 1);
assert.equal(getUpdateReloadGuardState().beforeUnloadWarnings, 1);
releaseDirty();
assert.equal(getUpdateReloadGuardState().blockers, 0);
assert.equal(getUpdateReloadGuardState().beforeUnloadWarnings, 0);

reset();
assert.equal(requestUpdateReload('timer-recheck', { delayMs: 150 }), true);
assert.equal(scheduled.size, 1);
const releaseLate = blockUpdateReload('late-blocker');
flushOneScheduled();
assert.equal(reloadCount, 0, 'Timer musi ponownie sprawdzić blokery przed reloadem.');
assert.equal(getUpdateReloadGuardState().pending, true, 'Reload ma pozostać oczekujący po pojawieniu się nowego blokera.');
releaseLate();
assert.equal(scheduled.size, 1, 'Po zwolnieniu późnego blokera reload ma zostać ponownie zaplanowany.');
flushOneScheduled();
assert.equal(reloadCount, 1);

reset();
const releaseFirst = blockUpdateReload('react-effect-first');
assert.equal(requestUpdateReload('controllerchange'), false);
releaseFirst();
assert.equal(scheduled.size, 1, 'Cleanup starego efektu może zaplanować reload, ale nie może go wymusić.');
const releaseReregistered = blockUpdateReload('react-effect-reregistered');
flushOneScheduled();
assert.equal(reloadCount, 0, 'Ponowna rejestracja blokera przed callbackiem musi zatrzymać reload.');
assert.equal(getUpdateReloadGuardState().pending, true);
releaseReregistered();
flushOneScheduled();
assert.equal(reloadCount, 1, 'Po prawdziwym zamknięciu pracy oczekujący reload ma wykonać się dokładnie raz.');

const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const desktopModal = source('src/components/modals/AppModal.jsx');
const mobileModal = source('src/mobile791/components/modals/AppModal.jsx');
const fuel = source('src/components/fuel/FuelPanelBase.jsx');
const desktopDetails = source('src/components/JobDetailsPanel.jsx');
const mobileDetails = source('src/mobile791/components/JobDetailsPanel.jsx');
const protocol = source('src/mobile791/components/modals/ProtocolTestModal.jsx');
const desktopHook = source('src/hooks/useJobFormModal.js');
const mobileHook = source('src/mobile791/hooks/useJobFormModal.js');
const desktopForm = source('src/components/modals/JobFormModal.jsx');
const mobileForm = source('src/mobile791/components/modals/JobFormModal.jsx');
const desktopApp = source('src/App.jsx');
const mobileApp = source('src/mobile791/App.jsx');

for (const modal of [desktopModal, mobileModal]) {
  assert.match(modal, /warnBeforeUnload = false/);
  assert.match(modal, /return blockUpdateReload\(/);
  assert.match(modal, /\}, \[open\]\);/);
  assert.match(modal, /return blockBeforeUnload\(/);
}
assert.match(fuel, /blockUnsavedWork\('fuel-entry-draft'\)/);
assert.match(fuel, /entrySaveInProgress/);
assert.match(desktopDetails, /blockUnsavedWork\(`desktop-job-comment:/);
assert.match(mobileDetails, /blockUnsavedWork\(`mobile-job-comment:/);
assert.match(protocol, /warnBeforeUnload=\{protocolHasUnsavedWork\}/);
assert.match(protocol, /setHasSignature\(false\);[\s\S]*setSignatureDataUrl\(""\);[\s\S]*setDraftHasSignature\(false\);/);
for (const hook of [desktopHook, mobileHook]) assert.match(hook, /const jobFormDirty = getComparableJobForm/);
for (const form of [desktopForm, mobileForm]) assert.match(form, /warnBeforeUnload=\{Boolean\(jobFormDirty \|\| busy\)\}/);
for (const app of [desktopApp, mobileApp]) assert.match(app, /jobFormDirty=\{jobFormDirty\}/);

console.log('PASS v10.82 F1/F2/F13: stable reload blockers, real dirty beforeunload, fuel/comment protection, timer recheck.');
