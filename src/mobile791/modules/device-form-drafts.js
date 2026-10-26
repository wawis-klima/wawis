// Niezapisane urządzenia i tabliczki wpisane bez internetu (od WAWIS 13.68).
//
// 13.71 (test iPhone 26.10.2026):
//  - szkic NIE znika przy otwarciu formularza — tylko po udanym zapisie albo świadomym „Odrzuć”;
//    wcześniej wejście i wyjście bez zapisu kasowało wpisane numery;
//  - sam TEKST szkicu (modele, numery seryjne) jest dodatkowo zapisywany w localStorage, żeby przetrwał
//    zamknięcie aplikacji przez iPhone'a. Zdjęć tabliczek NIE zapisujemy w telefonie (decyzja z 13.66) —
//    po zamknięciu aplikacji trzeba je dodać ponownie, gdy jest internet.
// Pełna wersja (ze zdjęciami) żyje w pamięci otwartej aplikacji.

const STORAGE_PREFIX = 'wawis-device-drafts-v1';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const memoryDrafts = new Map();
let owner = '';

function storageKey() {
  return `${STORAGE_PREFIX}:${owner || 'anon'}`;
}

function readStored() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const parsed = JSON.parse(window.localStorage.getItem(storageKey()) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStored(map) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const keys = Object.keys(map);
    if (!keys.length) window.localStorage.removeItem(storageKey());
    else window.localStorage.setItem(storageKey(), JSON.stringify(map));
    return true;
  } catch {
    return false; // Brak miejsca / tryb prywatny: zostaje szkic w pamięci.
  }
}

function isBinary(value) {
  return (typeof Blob !== 'undefined' && value instanceof Blob)
    || (typeof File !== 'undefined' && value instanceof File)
    || (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer);
}

// Pola urządzeń — jedyne, które trafiają do pamięci telefonu (bez danych klienta i bez plików).
export const DEVICE_DRAFT_FIELDS = Object.freeze(['devices', 'device_model', 'device_serial_number']);

// Tekstowa kopia szkicu: tylko pola urządzeń, bez plików i adresów blob:.
export function toStorableDeviceDraftForm(form = {}) {
  const picked = {};
  for (const field of DEVICE_DRAFT_FIELDS) {
    if (form[field] !== undefined) picked[field] = form[field];
  }
  const json = JSON.stringify(picked, (key, value) => {
    if (isBinary(value)) return undefined;
    if (typeof value === 'string' && value.startsWith('blob:')) return '';
    return value;
  });
  return JSON.parse(json || '{}');
}

export function setDeviceDraftOwner(userId) {
  const next = String(userId || '').trim();
  if (next === owner) return;
  owner = next;
  memoryDrafts.clear(); // szkice innego konta nie mogą trafić do formularza kolejnej osoby
}

export function saveDeviceFormDraft(jobId, form) {
  const key = String(jobId || '').trim();
  if (!key || !form) return false;
  const savedAt = new Date().toISOString();
  memoryDrafts.set(key, { form, savedAt });
  const stored = readStored();
  stored[key] = { form: toStorableDeviceDraftForm(form), savedAt };
  writeStored(stored);
  return true;
}

// Odczyt szkicu BEZ usuwania. fromStorage=true oznacza, że aplikacja była zamknięta
// i zostały tylko dane tekstowe (zdjęcia tabliczek trzeba dodać ponownie).
export function getDeviceFormDraft(jobId) {
  const key = String(jobId || '').trim();
  if (!key) return null;
  const memory = memoryDrafts.get(key);
  if (memory) return { ...memory, fromStorage: false };
  const stored = readStored()[key];
  if (!stored?.form) return null;
  if (Date.now() - Date.parse(stored.savedAt || 0) > MAX_AGE_MS) {
    clearDeviceFormDraft(key);
    return null;
  }
  return { form: stored.form, savedAt: stored.savedAt, fromStorage: true };
}

// Zgodność wsteczna (13.68): nazwa zachowana, ale szkic już nie jest usuwany przy odczycie.
export function takeDeviceFormDraft(jobId) {
  return getDeviceFormDraft(jobId);
}

export function clearDeviceFormDraft(jobId) {
  const key = String(jobId || '').trim();
  memoryDrafts.delete(key);
  const stored = readStored();
  if (key in stored) {
    delete stored[key];
    writeStored(stored);
  }
}

export function hasDeviceFormDraft(jobId) {
  return Boolean(getDeviceFormDraft(jobId));
}
