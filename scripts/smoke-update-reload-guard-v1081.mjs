import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const scheduled = [];
const listeners = new Map();
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
    scheduled.push({ callback, delay });
    return scheduled.length;
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
  blockUpdateReload,
  requestUpdateReload,
  getUpdateReloadGuardState,
  __resetUpdateReloadGuardForTests,
} = guard;

function flushScheduled() {
  while (scheduled.length) scheduled.shift().callback();
}

__resetUpdateReloadGuardForTests();
reloadCount = 0;
scheduled.length = 0;

const releaseProtocol = blockUpdateReload('protocol');
const releaseNested = blockUpdateReload('signature');
assert.equal(getUpdateReloadGuardState().blockers, 2, 'Dwa otwarte workflow muszą tworzyć dwa niezależne blokery.');
assert.ok(listeners.has('beforeunload'), 'Przy otwartej pracy musi być aktywna ochrona beforeunload.');

const immediate = requestUpdateReload('service-worker-controllerchange', { delayMs: 150 });
assert.equal(immediate, false, 'Aktualizacja nie może przeładować strony przy otwartym formularzu/podpisie.');
assert.equal(getUpdateReloadGuardState().pending, true, 'Odroczona aktualizacja musi zostać zapamiętana.');
assert.equal(scheduled.length, 0, 'Przy aktywnym blokerze reload nie może być nawet zaplanowany.');

releaseProtocol();
assert.equal(getUpdateReloadGuardState().blockers, 1);
assert.equal(scheduled.length, 0, 'Zamknięcie jednego z kilku modalów nie może uruchomić reloadu.');

releaseNested();
assert.equal(getUpdateReloadGuardState().blockers, 0);
assert.equal(scheduled.length, 1, 'Po zamknięciu ostatniego modala odroczony reload ma uruchomić się raz.');
assert.equal(listeners.has('beforeunload'), false, 'Po zapisaniu/zamknięciu pracy beforeunload ma zostać zdjęty.');
flushScheduled();
assert.equal(reloadCount, 1, 'Odroczona aktualizacja ma przeładować aplikację dokładnie raz.');

__resetUpdateReloadGuardForTests();
reloadCount = 0;
scheduled.length = 0;
assert.equal(requestUpdateReload('live-version:10.81', { delayMs: 150 }), true);
assert.equal(scheduled.length, 1, 'Bez niezapisanej pracy reload ma zostać zaplanowany normalnie.');
assert.equal(scheduled[0].delay, 150, 'Normalna kontrola wersji zachowuje krótki delay.');
flushScheduled();
assert.equal(reloadCount, 1);

const mainSource = fs.readFileSync(path.join(root, 'src/main.jsx'), 'utf8');
const mobileModalSource = fs.readFileSync(path.join(root, 'src/mobile791/components/modals/AppModal.jsx'), 'utf8');
const desktopModalSource = fs.readFileSync(path.join(root, 'src/components/modals/AppModal.jsx'), 'utf8');
const protocolSource = fs.readFileSync(path.join(root, 'src/mobile791/components/modals/ProtocolTestModal.jsx'), 'utf8');
const mobileJobFormSource = fs.readFileSync(path.join(root, 'src/mobile791/components/modals/JobFormModal.jsx'), 'utf8');
const desktopJobFormSource = fs.readFileSync(path.join(root, 'src/components/modals/JobFormModal.jsx'), 'utf8');

assert.match(mainSource, /requestUpdateReload\(`live-version:\$\{liveVersion\}`/);
assert.match(mainSource, /requestUpdateReload\('service-worker-controllerchange'\)/);
assert.doesNotMatch(mainSource, /window\.location\.reload\(\)/, 'main.jsx nie może omijać wspólnego guardu bezpośrednim reloadem.');
assert.match(mobileModalSource, /blockUpdateReload\("mobile-app-modal"\)/);
assert.match(desktopModalSource, /blockUpdateReload\("desktop-app-modal"\)/);
assert.match(protocolSource, /<AppModal/);
assert.match(mobileJobFormSource, /<AppModal/);
assert.match(desktopJobFormSource, /<AppModal/);

console.log('PASS v10.81 update reload guard: modal/protocol work defers SW/version reload until safe close.');
