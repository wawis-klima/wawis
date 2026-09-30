const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('src/mobile791/App.jsx');
const modal = read('src/mobile791/components/modals/JobFormModal.jsx');

assert.match(
  app,
  /<JobFormModal[\s\S]*?contractors=\{contractorsCatalog\}[\s\S]*?supabase=\{supabase\}[\s\S]*?isAdmin=\{isAdmin\}/,
  'Mobilny JobFormModal musi dostać klienta Supabase, inaczej lookup kodu pocztowego nie wykona żadnego zapytania.',
);
assert.match(modal, /if \(!showModal \|\| !supabase \|\| postalLookupBusy\) return undefined;/, 'Lookup ma być chroniony obecnością klienta Supabase.');
assert.match(modal, /lookupPostalCode\(\{ supabase, city, street \}\)/, 'Lookup kodu musi korzystać z przekazanego klienta Supabase.');

console.log('OK: v11.99 mobile przekazuje Supabase do automatycznego lookupu kodu pocztowego.');
