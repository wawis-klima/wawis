import { serializeJobDevicesToFields } from './job-devices.js';

// WAWIS 13.71: baza (indeks devices_serial_number_key) nie pozwala zapisać dwóch urządzeń z identycznym
// wierszem numerów seryjnych. Sprawdzamy to przed zapisem, żeby pracownik dostał jasną informację,
// zamiast błędu bazy (test iPhone 26.10.2026: to samo urządzenie dodane dwa razy).
export function normalizeDeviceSerialLine(line = '') {
  return String(line || '').trim().toLowerCase();
}

function lineHasSerial(line = '') {
  // Wiersz bez żadnego numeru (np. „JW:  | JZ: ”) nie jest numerem seryjnym.
  return /[a-z0-9]{3,}/i.test(String(line || '').replace(/\b(?:JW\d*|JZ)\s*:/gi, ''));
}

export function findDuplicateDeviceSerials(form = {}) {
  const { device_serial_number: serials = '' } = serializeJobDevicesToFields(form);
  const lines = String(serials || '').replace(/\r\n?/g, '\n').split('\n');
  const seen = new Map();
  const duplicates = [];
  lines.forEach((line, index) => {
    const key = normalizeDeviceSerialLine(line);
    if (!key || !lineHasSerial(line)) return;
    if (seen.has(key)) duplicates.push({ firstDevice: seen.get(key) + 1, secondDevice: index + 1, serial: String(line).trim() });
    else seen.set(key, index);
  });
  return duplicates;
}

export function describeDuplicateDeviceSerials(duplicates = []) {
  if (!duplicates.length) return '';
  const first = duplicates[0];
  return `Urządzenie ${first.firstDevice} i urządzenie ${first.secondDevice} mają te same numery seryjne (${first.serial}). `
    + 'Najpewniej to samo urządzenie zostało dodane dwa razy — usuń jedno z nich albo popraw numer i zapisz ponownie.';
}
