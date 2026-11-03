// WAWIS 14.16 — nagłówki bezpieczeństwa strony (audyt 03.11.2026, decyzja właściciela).
// RED na 14.15: vercel.json bez sekcji headers (produkcja ustawiała tylko HSTS).
// Celowo BEZ Permissions-Policy i bez CSP dla skryptów: aparat (QR, tabliczki), mikrofon (dyktowanie),
// worker OCR i blob: (podgląd PDF) muszą działać jak dotąd. frame-ancestors chroni tylko przed osadzaniem.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
assert.ok(Array.isArray(vercel.headers) && vercel.headers.length === 1, 'jedna reguła nagłówków');
const [rule] = vercel.headers;
assert.equal(rule.source, '/(.*)', 'nagłówki dla wszystkich adresów');
const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
assert.deepEqual(headers, {
  'x-frame-options': 'SAMEORIGIN',
  'content-security-policy': "frame-ancestors 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
}, 'dokładnie te cztery nagłówki');
assert.doesNotMatch(headers['content-security-policy'], /script-src|default-src|connect-src|img-src|worker-src/,
  'CSP nie ogranicza skryptów, połączeń, obrazów ani workerów');
assert.equal(headers['permissions-policy'], undefined, 'brak Permissions-Policy — aparat i mikrofon bez zmian');
assert.doesNotMatch(JSON.stringify(rule.headers), /cache-control/i, 'pamięć podręczna i service worker bez zmian');

// Podgląd PDF protokołu w <iframe> korzysta z blob: z tej samej aplikacji — SAMEORIGIN go nie blokuje.
const protocolCard = fs.readFileSync('src/components/desktop/DesktopJobProtocolCard.jsx', 'utf8');
assert.ok(protocolCard.includes('URL.createObjectURL(blob)'), 'podgląd PDF z blob:, nie z obcej strony');

// Wdrożenie i bramki bez zmian.
assert.equal(vercel.git?.deploymentEnabled?.['*'], false);
assert.match(vercel.buildCommand, /vercel-deploy-guard\.cjs/);
assert.match(vercel.buildCommand, /release-policy-gate\.cjs --deploy/);
assert.deepEqual(vercel.regions, ['fra1']);

console.log('PASS WAWIS 14.16 — nagłówki: SAMEORIGIN, frame-ancestors self, nosniff, referrer; aparat, mikrofon, OCR i PDF bez zmian.');
