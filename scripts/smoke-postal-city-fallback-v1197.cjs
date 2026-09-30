const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/postal-code-lookup/index.ts'), 'utf8');

assert.match(edge, /queryUug\(fullQuery\)/, 'Najpierw ma być sprawdzany pełny adres w GUGiK.');
assert.match(edge, /lookupHistoricalPostalCode\(city\)/, 'Brak kodu ma uruchamiać fallback po samej miejscowości.');
assert.match(edge, /from\("contractors"\)/, 'Fallback ma korzystać z istniejących adresów kontrahentów.');
assert.match(edge, /splitPostalCity/, 'Fallback ma czytać kod ze starego zgodnego formatu city.');
assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/, 'Dostęp do historycznych adresów ma pozostać po stronie serwera.');
assert.doesNotMatch(edge, /FAKTUROWNIA_API_TOKEN/, 'Lookup kodów nie może mieć dostępu do tokenu Fakturowni.');

console.log('OK: v11.97 kod pocztowy może zostać dobrany po samej znanej miejscowości.');
