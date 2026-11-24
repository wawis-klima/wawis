// WAWIS 14.97 (decyzja właściciela 24.11.2026): modele i numery seryjne bez internetu; pasek „Brak internetu”.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const actions = read('src/mobile791/hooks/useSelectedJobActions.js');
const sync = read('src/mobile791/modules/job-offline-sync.js');
const form = read('src/mobile791/modules/jobs-form.js');
const store = read('src/mobile791/modules/job-offline-store.js');
const banner = read('src/mobile791/components/OfflineBanner.jsx');
const layout = read('src/mobile791/components/jobs/MobileJobsLayout.jsx');
const main = read('src/main.jsx');

// Tekst urządzeń: tylko bez nowych zdjęć tabliczek i naklejek QR; duplikaty numerów sprawdzane przed kolejką.
// 14.99: naklejki QR też do kolejki — blokują tylko nowe zdjęcia tabliczek.
assert.match(actions, /textOnly: \(change\.changed \|\| pendingQr > 0\) && !pendingPhotos/);
assert.match(actions, /async function queueDeviceTextOffline[\s\S]*?findDuplicateDeviceSerials\(form\)[\s\S]*?type: 'device'/);
assert.match(actions, /listOfflineJobOperations\(profile\.id\)\)\.some\([\s\S]*?clearDeviceFormDraft\(jobId\)/);
assert.match(actions, /modele i numery seryjne' : ''/);
assert.match(actions, /`Brak internetu — \$\{savedWhat\} zapisano na telefonie/);
// Wysyłka tą samą funkcją co online (RPC + scalanie niekolidujących wierszy), konflikt bez nadpisania.
assert.match(form, /export async function saveJobDeviceFieldsPatch/);
assert.match(form, /export async function saveJobDeviceSerialsRecord[\s\S]*?saveJobDeviceFieldsPatch\(/);
assert.match(sync, /async function syncDeviceOperation[\s\S]*?saveJobDeviceFieldsPatch\([\s\S]*?OfflineConflictError/);
assert.doesNotMatch(sync, /\.from\('jobs'\)\s*\.update\(\{\s*device_model/);
assert.match(store, /operation\.type === 'status' \|\| operation\.type === 'contact' \|\| operation\.type === 'device' \|\| operation\.type === 'qr'/);
// Pasek: tylko bez internetu. React w zasięgu (klasyczny JSX w buildzie) — bez tego ekran padał bez internetu.
assert.match(banner, /^import React, \{ useEffect, useState \} from "react";/m);
assert.match(banner, /if \(online\) return null;/);
assert.match(banner, /data-testid="offline-banner"/);
assert.match(layout, /<OfflineBanner userId=\{profile\?\.id\} \/>/);
assert.match(main, /v1497-offline-banner\.css/);
console.log('smoke-offline-devices-banner-v1497: OK');
