// WAWIS 14.36 — Diagnostyka na komputerze: wzory podpisów pracowników (tylko administrator, tylko podgląd).
// Funkcja bazy: staff_signatures_admin_list_v1434 (14.34, test SQL leak-test-auto-sql-v1434). E2E: staff-signatures-desktop-v1436.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const panel = read('src/components/diagnostics/DiagnosticsPanel.jsx');
assert.match(panel, /\{profile\?\.role === 'Administrator' \? <StaffSignaturesCard supabase=\{supabase\} \/> : null\}/);
const card = read('src/components/diagnostics/StaffSignaturesCard.jsx');
assert.match(card, /loadStaffSignaturesAdmin\(\{ supabase \}\)/);
assert.doesNotMatch(card, /\.rpc\(|insert|update|delete/i, 'tylko podgląd');
console.log('PASS WAWIS 14.36 — wzory podpisów pracowników w Diagnostyce na komputerze (administrator, podgląd).');
