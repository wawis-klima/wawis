const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/fakturownia-client/index.ts'), 'utf8');

assert.match(edge, /const taxNo = digitsOnly\(contractor\?\.nip\)/, 'Integracja musi wyznaczać typ klienta na podstawie NIP.');
assert.match(edge, /const isCompany = Boolean\(taxNo\)/, 'Brak NIP ma oznaczać osobę prywatną.');
assert.match(edge, /company:\s*isCompany/, 'Pole company musi być wysyłane do Fakturowni.');
assert.match(edge, /first_name:\s*isCompany \? "" : personName\.firstName/, 'Osoba prywatna musi dostać first_name.');
assert.match(edge, /last_name:\s*isCompany \? "" : personName\.lastName/, 'Osoba prywatna musi dostać last_name.');
assert.match(edge, /function splitPrivatePersonName/, 'Brak helpera rozdzielającego imię i nazwisko.');
assert.match(edge, /company\?: boolean \| number \| string/, 'Typ klienta Fakturowni musi uwzględniać company.');

console.log('OK: v12.04 brak NIP => osoba prywatna w Fakturowni, NIP => firma.');
