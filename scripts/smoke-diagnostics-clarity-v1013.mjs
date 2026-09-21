import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDiagnosticSeverity,
  groupDiagnosticEntries,
  inferDiagnosticModule,
  partitionDiagnosticEntries,
} from '../src/modules/diagnostics-core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

assert.equal(
  getDiagnosticSeverity({ type: 'console.warn', payload: { args: ['TypeError: Failed to fetch'] } }),
  'warning',
  'console.warn nie może być jednocześnie błędem i ostrzeżeniem'
);
assert.equal(
  getDiagnosticSeverity({ type: 'nameplate.save.upload.completed', severity: 'error', payload: { failedCount: 0 } }),
  '',
  'udany zapis z failedCount: 0 nie może tworzyć fałszywego alarmu'
);
assert.equal(getDiagnosticSeverity({ type: 'photo.thumbnail.load.failed' }), 'error');
assert.equal(getDiagnosticSeverity({ type: 'protocol.save.timeout' }), 'warning');
assert.equal(getDiagnosticSeverity({ event_type: 'console.warn', severity: 'error' }), 'warning');

assert.equal(inferDiagnosticModule('photo.thumbnail.load.failed'), 'photos');
assert.equal(inferDiagnosticModule('protocol.save.timeout'), 'protocol');
assert.equal(inferDiagnosticModule('console.error', { args: ['refreshAll failed', new Error('Failed to fetch')] }), 'data.refresh');
assert.equal(inferDiagnosticModule('console.warn', { args: ['Nie udało się zsynchronizować subskrypcji push'] }), 'push');

const now = Date.parse('2026-09-08T12:00:00.000Z');
const repeated = Array.from({ length: 4 }, (_, index) => ({
  id: `event-${index}`,
  type: 'console.warn',
  payload: { args: ['TypeError: Failed to fetch'] },
  time: `2026-09-08T11:00:0${index}.000Z`,
  module: 'network',
  platform: 'desktop',
  app_version: '10.13',
}));
const grouped = groupDiagnosticEntries(repeated, { onlyProblems: true });
assert.equal(grouped.length, 1, 'identyczne zdarzenia powinny utworzyć jedną grupę');
assert.equal(grouped[0].count, 4, 'grupa powinna pokazywać cztery powtórzenia');
assert.equal(grouped[0].moduleLabel, 'Połączenie z serwerem');

const partitioned = partitionDiagnosticEntries([
  ...repeated,
  { type: 'app.boot', time: '2026-09-06T10:00:00.000Z' },
], { hours: 24, now });
assert.equal(partitioned.recent.length, 4);
assert.equal(partitioned.history.length, 1);

const panel = read('src', 'components', 'diagnostics', 'DiagnosticsPanel.jsx');
assert.match(panel, /Zdarzenia — ostatnie 24 h/);
assert.match(panel, /Historia starsza niż 24 godziny/);
assert.match(panel, /groupDiagnosticEntries/);
assert.match(panel, /entry\.count > 1/);
assert.match(panel, /entry\.moduleLabel/);

for (const sourcePath of [
  ['src', 'modules', 'diagnostics.js'],
  ['src', 'mobile791', 'modules', 'diagnostics.js'],
]) {
  const source = read(...sourcePath);
  assert.match(source, /diagnostic_module/);
  assert.match(source, /entry\.app_version \|\| appVersion/);
  assert.match(source, /getDiagnosticSeverity/);
}

const migration = read('supabase', 'migrations', '20260908150000_diagnostics_clarity_v1013.sql');
assert.match(migration, /add column if not exists diagnostic_module/);

console.log('OK: v10.13 grupuje identyczne zdarzenia, pokazuje 24 h i historię, przypisuje moduły oraz usuwa podwójne i fałszywe alarmy.');
