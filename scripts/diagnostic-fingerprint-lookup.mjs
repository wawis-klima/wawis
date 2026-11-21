// WAWIS 14.71 — tłumaczenie „śladu” z Diagnostyki na komunikat z kodu aplikacji.
// Użycie: node scripts/diagnostic-fingerprint-lookup.mjs [ślad …]   (bez argumentów: lista wszystkich)
// Ślad to skrót stałego komunikatu (pierwszy tekst zdarzenia), więc dopasowuje komunikaty console.warn/error z src.
import fs from 'node:fs';
import path from 'node:path';
import { diagnosticFingerprint } from '../src/modules/diagnostic-error-codes.js';

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full); else if (/\.(jsx?|mjs)$/.test(e.name)) files.push(full);
  }
};
walk('src');
// Znane komunikaty bibliotek (supabase-js / auth-js).
const library = [
  'Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.',
];
const rows = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/console\.(warn|error)\(\s*(['"`])((?:(?!\2).){3,300})\2/g)) rows.push([diagnosticFingerprint(m[3]), file, m[3]]);
  // 14.73: także komunikaty błędów (new Error('…')) — ślad nieobsłużonych odrzuceń (unhandledrejection).
  for (const m of src.matchAll(/new Error\(\s*(['"`])((?:(?!\1).){3,300})\1/g)) {
    rows.push([diagnosticFingerprint(m[2]), file, m[2]]);
    if (m[2].includes('${')) rows.push([diagnosticFingerprint(m[2].replace(/\$\{[^}]*\}/g, '')), file, `${m[2]} (bez wstawek)`]);
  }
}
for (const text of library) rows.push([diagnosticFingerprint(text), '(biblioteka)', text]);
export const FINGERPRINTS = rows;
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/diagnostic-fingerprint-lookup.mjs')) {
  const wanted = process.argv.slice(2).map((v) => v.toLowerCase());
  for (const [fp, file, text] of rows) if (!wanted.length || wanted.includes(fp)) console.log(`${fp}  ${file}  ${text.slice(0, 120)}`);
}
