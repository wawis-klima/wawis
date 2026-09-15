const fs = require('node:fs');
const { classifyRelease } = require('./release-impact.cjs');

function isMicroUiFile(file) {
  const normalized = String(file || '').replace(/\\/g, '/');
  return /^(src|public)\/.*\.css$/i.test(normalized);
}

function groupsForScope(scope) {
  const groups = ['ui-fast-core'];
  if (scope === 'mobile' || scope === 'full') groups.push('ui-fast-mobile');
  if (scope === 'desktop' || scope === 'full') groups.push('ui-fast-desktop');
  return groups;
}

function classifyMicroUi({ baseRef = 'origin/main', impact = null } = {}) {
  const releaseImpact = impact || classifyRelease({ baseRef });
  const effectiveFiles = Array.isArray(releaseImpact.effective_files) ? releaseImpact.effective_files : [];
  const eligible = releaseImpact.profile === 'fast-ui'
    && effectiveFiles.length > 0
    && effectiveFiles.every(isMicroUiFile);

  return {
    schema_version: 1,
    micro_ui: eligible,
    base_ref: releaseImpact.base_ref || baseRef,
    scope: releaseImpact.scope,
    effective_files: effectiveFiles,
    groups: eligible ? groupsForScope(releaseImpact.scope) : [],
    reason: eligible
      ? 'Wyłącznie pliki CSS aplikacji — dozwolona ścieżka MICRO UI.'
      : 'Zmiana nie jest czystą zmianą CSS aplikacji; użyj standardowej ścieżki release.',
  };
}

function parseArgs(args = process.argv.slice(2)) {
  const value = (name, fallback = '') => {
    const index = args.indexOf(name);
    return index >= 0 ? String(args[index + 1] || fallback) : fallback;
  };
  return {
    baseRef: value('--base-ref', process.env.WAWIS_RELEASE_BASE_REF || 'origin/main'),
    impactPath: value('--impact', ''),
    jsonPath: value('--json', ''),
    githubOutput: value('--github-output', process.env.GITHUB_OUTPUT || ''),
  };
}

function writeGithubOutput(file, result) {
  if (!file) return;
  fs.appendFileSync(file, [
    `micro_ui=${result.micro_ui ? 'true' : 'false'}`,
    `scope=${result.scope}`,
    `groups=${result.groups.join(',')}`,
  ].join('\n') + '\n');
}

if (require.main === module) {
  const options = parseArgs();
  const impact = options.impactPath && fs.existsSync(options.impactPath)
    ? JSON.parse(fs.readFileSync(options.impactPath, 'utf8'))
    : null;
  const result = classifyMicroUi({ baseRef: options.baseRef, impact });
  if (options.jsonPath) fs.writeFileSync(options.jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  writeGithubOutput(options.githubOutput, result);
  console.log(`WAWIS MICRO UI: ${result.micro_ui ? 'YES' : 'NO'} — ${result.scope}`);
  console.log(result.reason);
  result.effective_files.forEach((file) => console.log(`- ${file}`));
  if (!result.micro_ui) process.exitCode = 2;
}

module.exports = {
  classifyMicroUi,
  groupsForScope,
  isMicroUiFile,
};
