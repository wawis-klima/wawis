// WAWIS 14.15 — regresja niestabilnego testu smoke-diagnostics-ingest-queue-v1274 (CI 03.11.2026).
// Przyczyna: test brał „ostatni” wpis (.at(-1)), a wpisy z tej samej milisekundy są sortowane po losowym id.
// RED na 14.14: przy zamrożonym zegarze test padał w ok. 90% uruchomień. GREEN: 20/20.
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const runs = 20;
let failures = 0;
let lastOutput = '';
for (let i = 0; i < runs; i += 1) {
  const result = spawnSync(process.execPath, [
    '--import', new URL('./fixtures/freeze-clock-v1415.mjs', import.meta.url).pathname,
    new URL('./smoke-diagnostics-ingest-queue-v1274.mjs', import.meta.url).pathname,
  ], { encoding: 'utf8' });
  if (result.status !== 0) { failures += 1; lastOutput = `${result.stdout}\n${result.stderr}`; }
}
assert.equal(failures, 0, `test kolejki diagnostyki niestabilny przy wpisach z tej samej milisekundy: ${failures}/${runs}\n${lastOutput.slice(-800)}`);
console.log(`PASS WAWIS 14.15 — kolejka diagnostyki stabilna przy wpisach z tej samej milisekundy (${runs}/${runs}).`);
