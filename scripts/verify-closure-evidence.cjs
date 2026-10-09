const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { classifyRelease } = require('./release-impact.cjs');
const { uniqueCommands } = require('./test-groups.cjs');

function readJson(path) {
  if (!fs.existsSync(path)) throw new Error(`Brak wymaganego dowodu: ${path}`);
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function sameOrdered(a = [], b = []) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function requireCiProvenance(evidence, label) {
  const requiredHead = String(process.env.WAWIS_PR_HEAD_SHA || '').trim();
  if (requiredHead) {
    const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (currentHead !== requiredHead || evidence.git_head_sha !== requiredHead) {
      throw new Error(`${label}: dowód nie jest przypisany do aktualnego HEAD PR (${requiredHead})`);
    }
  }
  const sha = String(process.env.GITHUB_SHA || '').trim();
  const runId = String(process.env.GITHUB_RUN_ID || '').trim();
  const runAttempt = String(process.env.GITHUB_RUN_ATTEMPT || '').trim();
  if (sha && evidence.git_sha !== sha) {
    throw new Error(`${label}: SHA dowodu ${evidence.git_sha || 'brak'} != GITHUB_SHA ${sha}`);
  }
  if (runId && evidence.git_run_id !== runId) {
    throw new Error(`${label}: run_id dowodu ${evidence.git_run_id || 'brak'} != GITHUB_RUN_ID ${runId}`);
  }
  if (runAttempt && evidence.git_run_attempt !== runAttempt) {
    throw new Error(`${label}: run_attempt dowodu ${evidence.git_run_attempt || 'brak'} != GITHUB_RUN_ATTEMPT ${runAttempt}`);
  }
}

const impactPath = process.argv[2] || 'release-impact.json';
const groupedPath = process.argv[3] || 'closure-evidence.json';
const e2ePath = process.argv[4] || 'closure-e2e-evidence.json';
const resultPath = process.argv[5] || 'closure-gate-result.json';

try {
  const impact = readJson(impactPath);
  if (process.env.WAWIS_PR_HEAD_SHA && impact.base_ref !== 'origin/' + (process.env.GITHUB_BASE_REF || 'main')) {
    throw new Error('Nieautoryzowany base_ref w release impact');
  }
  // Verify the gate was not fed a reduced or stale "impact.json".
  // Only CI has the trusted PR HEAD; fixture tests can test evidence in isolation.
  if (process.env.WAWIS_PR_HEAD_SHA) {
    const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (currentHead !== String(process.env.WAWIS_PR_HEAD_SHA).trim()) {
      throw new Error('Git checkout HEAD nie odpowiada aktualnemu commitowi PR');
    }
    const changed = execFileSync('git', ['diff', '--name-only', `${impact.base_ref || 'origin/main'}...HEAD`], {
      encoding: 'utf8',
    }).trim().split(/\r?\n/).filter(Boolean);
    const expectedImpact = classifyRelease({ baseRef: impact.base_ref || 'origin/main', changedFiles: changed });
    const orderedEqual = (a,b) => Array.isArray(a) && Array.isArray(b) && sameOrdered(a,b);
    for (const field of ['changed_files', 'effective_files', 'generated_only_files', 'groups', 'pr_groups', 'platforms', 'e2e']) {
      if (!orderedEqual(impact[field], expectedImpact[field])) throw new Error(`Zmieniony/nieaktualny release impact: ${field}`);
    }
    for (const field of ['profile', 'scope', 'needs_playwright']) {
      if (impact[field] !== expectedImpact[field]) throw new Error(`Zmieniony/nieaktualny release impact: ${field}`);
    }
  }
  const effectiveFiles = Array.isArray(impact.effective_files) ? impact.effective_files : [];
  const expectedGroups = Array.isArray(impact.pr_groups) ? impact.pr_groups : [];
  if (!sameOrdered(impact.groups || [], expectedGroups)) throw new Error('groups i pr_groups muszą być identyczne');
  if (!expectedGroups.length) throw new Error('Brak pr_groups w klasyfikacji release impact.');

  const expectedCommands = uniqueCommands(expectedGroups);
  const grouped = readJson(groupedPath);
  requireCiProvenance(grouped, 'Grouped evidence');

  if (grouped.all_passed !== true) throw new Error('Regresje grupowe nie mają statusu all_passed=true.');
  if (!sameOrdered(grouped.groups || [], expectedGroups)) {
    throw new Error(`Dowód grup nie odpowiada klasyfikacji. expected=${expectedGroups.join(',')} actual=${(grouped.groups || []).join(',')}`);
  }
  if (!Array.isArray(grouped.commands)) throw new Error('Brak listy wykonanych komend testowych.');

  const actualCommands = grouped.commands.map((item) => item?.command);
  if (!sameOrdered(actualCommands, expectedCommands)) {
    const expectedSet = new Set(expectedCommands);
    const actualSet = new Set(actualCommands);
    const missing = expectedCommands.filter((cmd) => !actualSet.has(cmd));
    const unexpected = actualCommands.filter((cmd) => !expectedSet.has(cmd));
    const duplicates = actualCommands.filter((cmd, index) => actualCommands.indexOf(cmd) !== index);
    throw new Error(`Niekompletny dowód komend. expected=${expectedCommands.length} actual=${actualCommands.length} missing=${missing.join(' | ') || '-'} unexpected=${unexpected.join(' | ') || '-'} duplicates=${duplicates.join(' | ') || '-'}`);
  }
  if (Array.isArray(grouped.expected_commands) && !sameOrdered(grouped.expected_commands, expectedCommands)) {
    throw new Error('Runner zapisał inny expected_commands niż wynika z test-groups.cjs.');
  }
  const notPassed = grouped.commands.filter((item) => item?.status !== 'passed');
  if (notPassed.length) throw new Error(`Nie wszystkie komendy testowe przeszły: ${notPassed.map((item) => item.command).join(' | ')}`);

  let e2e = null;
  if (impact.needs_playwright === true) {
    e2e = readJson(e2ePath);
    requireCiProvenance(e2e, 'E2E evidence');
    const expectedPlatforms = Array.isArray(impact.e2e) ? impact.e2e : [];
    if (e2e.all_passed !== true || e2e.skipped === true) throw new Error('Wymagane E2E nie ma statusu all_passed=true.');
    if (!sameOrdered(e2e.platforms || [], expectedPlatforms)) {
      throw new Error('Dowód E2E nie obejmuje dokładnie platform wymaganych przez release impact.');
    }
    if (!Array.isArray(e2e.runs) || e2e.runs.length !== expectedPlatforms.length) {
      throw new Error(`E2E runs ma złą liczbę przebiegów: expected=${expectedPlatforms.length} actual=${Array.isArray(e2e.runs) ? e2e.runs.length : 0}`);
    }
    const actualPlatforms = e2e.runs.map((item) => item?.platform);
    if (!sameOrdered(actualPlatforms, expectedPlatforms)) {
      throw new Error(`E2E runs nie odpowiada wymaganym platformom. expected=${expectedPlatforms.join(',')} actual=${actualPlatforms.join(',')}`);
    }
    const expectedScript = {
      mobile: 'scripts/run-playwright-mobile.cjs',
      desktop: 'scripts/run-playwright-desktop.cjs',
    };
    for (const run of e2e.runs) {
      if (run?.status !== 'passed') throw new Error(`E2E ${run?.platform || 'unknown'} nie przeszedł.`);
      if (expectedScript[run.platform] !== run.script) {
        throw new Error(`E2E ${run.platform} uruchomił nieoczekiwany skrypt: ${run.script || 'brak'}`);
      }
    }
  }

  const result = {
    schema_version: 2,
    status: 'GO',
    git_sha: String(process.env.GITHUB_SHA || '').trim() || grouped.git_sha || null,
    git_run_id: String(process.env.GITHUB_RUN_ID || '').trim() || grouped.git_run_id || null,
    git_run_attempt: String(process.env.GITHUB_RUN_ATTEMPT || '').trim() || grouped.git_run_attempt || null,
    profile: impact.profile,
    scope: impact.scope,
    effective_files: effectiveFiles,
    groups: expectedGroups,
    grouped_commands: expectedCommands.length,
    e2e_required: impact.needs_playwright === true,
    e2e_platforms: e2e?.platforms || [],
  };
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`WAWIS CLOSURE GATE: GO — ${impact.profile} / ${impact.scope}`);
} catch (error) {
  const result = {
    schema_version: 2,
    status: 'NO-GO',
    git_sha: String(process.env.GITHUB_SHA || '').trim() || null,
    git_run_id: String(process.env.GITHUB_RUN_ID || '').trim() || null,
    error: String(error?.message || error),
  };
  try { fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`); } catch {}
  console.error(`WAWIS CLOSURE GATE: NO-GO — ${result.error}`);
  process.exit(1);
}
