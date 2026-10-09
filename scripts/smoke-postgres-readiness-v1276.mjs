import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = readFileSync(new URL('./codex-postgres-two-sessions-v1269.sh', import.meta.url), 'utf8');
const start = source.indexOf('ready=false\n');
const end = source.indexOf('pg() {', start);
assert(start > 0 && end > start, 'Must exercise the real CI database readiness block');
const readiness = source.slice(start, end);
assert.doesNotMatch(readiness, /docker exec[^\n]*pg_isready/, 'pg_isready must not be treated as proof that target DB exists');
assert.match(readiness, /psql -X -qAt .* -d wawis_codex_ci -c 'select 1'/);
const directory = mkdtempSync(join(tmpdir(), 'wawis-pg-ready-'));
try {
  const docker = join(directory, 'docker');
  const sleep = join(directory, 'sleep');
  writeFileSync(docker, `#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "exec" ]] || exit 50
[[ " $* " == *" psql "* ]] || exit 51
attempt=0
if [[ -f "$MOCK_STATE" ]]; then attempt=$(cat "$MOCK_STATE"); fi
attempt=$((attempt+1))
echo "$attempt" > "$MOCK_STATE"
if [[ "$MOCK_ALWAYS_FAIL" == "1" || "$attempt" -lt 3 ]]; then
  echo 'FATAL: database "wawis_codex_ci" does not exist' >&2
  exit 2
fi
echo 1
`);
  writeFileSync(sleep, '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(docker, 0o755);
  chmodSync(sleep, 0o755);
  const script = 'set -euo pipefail\ncontainer=fixture\n' + readiness + '\nprintf "DB_READY=%s\\n" "$ready"\n';
  function execute({ alwaysFail = false } = {}) {
    const state = join(directory, alwaysFail ? 'failure.count' : 'success.count');
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, PATH: directory + ':' + process.env.PATH,
        MOCK_STATE: state, MOCK_ALWAYS_FAIL: alwaysFail ? '1' : '0' },
    });
    return { result, attempts: Number(readFileSync(state,'utf8').trim()) };
  }
  const success = execute();
  assert.equal(success.result.status, 0, success.result.stderr);
  assert.equal(success.attempts, 3, 'must retry until target database query actually succeeds');
  assert.match(success.result.stdout, /DB_READY=true/);
  const failure = execute({ alwaysFail: true });
  assert.equal(failure.result.status, 14, 'unready database must fail closed');
  assert.equal(failure.attempts, 40);
  assert.match(failure.result.stderr, /NO-GO: disposable PostgreSQL fixture failed to start/);
  console.log('PASS: PostgreSQL readiness checks actual target database, retries before init and fails closed');
} finally {
  rmSync(directory, {recursive:true,force:true});
}
