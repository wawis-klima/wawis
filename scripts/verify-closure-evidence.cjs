const fs = require('node:fs');

function readJson(path) {
  if (!fs.existsSync(path)) throw new Error(`Brak wymaganego dowodu: ${path}`);
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function sameMembers(a = [], b = []) {
  const x = [...new Set(a)].sort();
  const y = [...new Set(b)].sort();
  return x.length === y.length && x.every((value, index) => value === y[index]);
}

const impactPath = process.argv[2] || 'release-impact.json';
const groupedPath = process.argv[3] || 'closure-evidence.json';
const e2ePath = process.argv[4] || 'closure-e2e-evidence.json';
const resultPath = process.argv[5] || 'closure-gate-result.json';

try {
  const impact = readJson(impactPath);
  const effectiveFiles = Array.isArray(impact.effective_files) ? impact.effective_files : [];
  const expectedGroups = Array.isArray(impact.pr_groups) ? impact.pr_groups : [];

  if (!expectedGroups.length) throw new Error('Brak pr_groups w klasyfikacji release impact.');

  const grouped = readJson(groupedPath);
  if (grouped.all_passed !== true) throw new Error('Regresje grupowe nie mają statusu all_passed=true.');
  if (!sameMembers(grouped.groups, expectedGroups)) {
    throw new Error(`Dowód grup nie odpowiada klasyfikacji. expected=${expectedGroups.join(',')} actual=${(grouped.groups || []).join(',')}`);
  }
  if (!Array.isArray(grouped.commands) || grouped.commands.length === 0) {
    throw new Error('Brak listy wykonanych komend testowych.');
  }
  const notPassed = grouped.commands.filter((item) => item?.status !== 'passed');
  if (notPassed.length) throw new Error(`Nie wszystkie komendy testowe przeszły: ${notPassed.map((item) => item.command).join(' | ')}`);

  let e2e = null;
  if (impact.needs_playwright === true) {
    e2e = readJson(e2ePath);
    if (e2e.all_passed !== true) throw new Error('Wymagane E2E nie ma statusu all_passed=true.');
    if (!sameMembers(e2e.platforms, impact.e2e || [])) {
      throw new Error('Dowód E2E nie obejmuje dokładnie platform wymaganych przez release impact.');
    }
    if (!Array.isArray(e2e.runs) || e2e.runs.some((item) => item?.status !== 'passed')) {
      throw new Error('Co najmniej jeden wymagany przebieg E2E nie przeszedł.');
    }
  }

  const result = {
    schema_version: 1,
    status: 'GO',
    profile: impact.profile,
    scope: impact.scope,
    effective_files: effectiveFiles,
    groups: expectedGroups,
    grouped_commands: grouped.commands.length,
    e2e_required: impact.needs_playwright === true,
    e2e_platforms: e2e?.platforms || [],
  };
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`WAWIS CLOSURE GATE: GO — ${impact.profile} / ${impact.scope}`);
} catch (error) {
  const result = {
    schema_version: 1,
    status: 'NO-GO',
    error: String(error?.message || error),
  };
  try { fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`); } catch {}
  console.error(`WAWIS CLOSURE GATE: NO-GO — ${result.error}`);
  process.exit(1);
}
