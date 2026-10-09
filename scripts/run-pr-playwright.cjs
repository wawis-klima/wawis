const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const impactPath = process.argv[2] || 'release-impact.json';
const evidencePath = process.env.WAWIS_E2E_EVIDENCE_PATH || 'closure-e2e-evidence.json';

function writeEvidence(value) {
  fs.writeFileSync(evidencePath, `${JSON.stringify(value, null, 2)}\n`);
}

if (!fs.existsSync(impactPath)) throw new Error(`Brak ${impactPath}`);
const impact = JSON.parse(fs.readFileSync(impactPath, 'utf8'));

if (!impact?.needs_playwright) {
  writeEvidence({
    schema_version: 2,
    type: 'e2e',
    git_sha: String(process.env.GITHUB_SHA || '').trim() || null,
  git_head_sha: String(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })).trim(),
    git_head_sha: String(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })).trim(),
    git_run_id: String(process.env.GITHUB_RUN_ID || '').trim() || null,
    git_run_attempt: String(process.env.GITHUB_RUN_ATTEMPT || '').trim() || null,
    platforms: [],
    runs: [],
    all_passed: true,
    skipped: true,
  });
  console.log('Playwright pominięty zgodnie z klasyfikacją ryzyka.');
  process.exit(0);
}

const e2e = Array.isArray(impact.e2e) ? impact.e2e : [];
if (!e2e.length) throw new Error('needs_playwright=true bez wskazanego zakresu E2E.');

const evidence = {
  schema_version: 2,
  type: 'e2e',
  git_sha: String(process.env.GITHUB_SHA || '').trim() || null,
  git_run_id: String(process.env.GITHUB_RUN_ID || '').trim() || null,
  git_run_attempt: String(process.env.GITHUB_RUN_ATTEMPT || '').trim() || null,
  platforms: e2e,
  runs: [],
  all_passed: false,
};
writeEvidence(evidence);

try {
  for (const platform of e2e) {
    const script = platform === 'mobile'
      ? 'scripts/run-playwright-mobile.cjs'
      : platform === 'desktop'
        ? 'scripts/run-playwright-desktop.cjs'
        : null;
    if (!script) throw new Error(`Nieobsługiwany zakres E2E: ${platform}`);
    console.log(`Uruchamiam wymagane E2E: ${platform}`);
    const entry = { platform, script, status: 'running' };
    evidence.runs.push(entry);
    writeEvidence(evidence);
    try {
      execFileSync(process.execPath, [script, '--reporter=line'], { stdio: 'inherit', env: process.env });
      entry.status = 'passed';
      writeEvidence(evidence);
    } catch (error) {
      entry.status = 'failed';
      entry.exit_code = Number.isInteger(error?.status) ? error.status : 1;
      writeEvidence(evidence);
      throw error;
    }
  }
  evidence.all_passed = true;
  writeEvidence(evidence);
} catch (error) {
  evidence.all_passed = false;
  writeEvidence(evidence);
  throw error;
}
