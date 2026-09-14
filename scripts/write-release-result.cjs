const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportPath = path.join(root, 'RELEASE-RESULT.md');

function readVersion(rootDir = root) {
  return String(JSON.parse(fs.readFileSync(path.join(rootDir, 'app-version.json'), 'utf8')).version || '0.0').trim();
}

function formatStepTable(steps) {
  if (!steps.length) return '_Brak zapisanych kroków._';
  const lines = ['| Obszar | Komenda | Wynik |', '|---|---|---|'];
  for (const step of steps) {
    const command = String(step.command || '').replace(/\|/g, '\\|');
    const status = step.status === 'ok' ? 'OK' : step.status === 'skipped' ? 'POMINIĘTO' : 'BŁĄD';
    const reason = step.status === 'skipped' && step.reason ? ` — ${String(step.reason).replace(/\|/g, '\\|')}` : '';
    lines.push(`| ${step.label || '-'} | \`${command}\` | ${status}${reason} |`);
  }
  return lines.join('\n');
}

function buildSummary({ status, steps, variant }) {
  const testsOk = steps.filter((step) => String(step.label || '').startsWith('Tests:') && step.status === 'ok').length;
  const e2eOk = steps.filter((step) => String(step.label || '').startsWith('E2E:') && step.status === 'ok').length;
  const buildOk = steps.some((step) => step.command === 'npm run build' && step.status === 'ok');
  const buildSkipped = steps.some((step) => step.command === 'npm run build' && step.status === 'skipped');
  const bundleOk = steps.some((step) => step.command === 'npm run verify:bundle' && step.status === 'ok');
  const verifyOk = steps.some((step) => step.command === 'npm run verify:release' && step.status === 'ok');
  const zipOk = steps.some((step) => step.command === 'npm run zip:release' && step.status === 'ok');
  const zipVerifyOk = steps.some((step) => step.command === 'node scripts/verify-release.cjs --require-zip' && step.status === 'ok');

  return [
    `- status release: ${status === 'ok' ? 'OK' : status === 'pending' ? 'W TOKU' : 'BŁĄD'}`,
    `- tryb: ${variant}`,
    `- grupy regresji: ${testsOk} zakończonych grup`,
    `- Playwright E2E: ${e2eOk} zakończonych przebiegów`,
    `- build: ${buildSkipped ? 'POMINIĘTO (sandbox)' : buildOk ? 'OK' : 'oczekuje / błąd'}`,
    `- verify:bundle: ${buildSkipped ? 'POMINIĘTO (sandbox)' : bundleOk ? 'OK' : 'oczekuje / błąd'}`,
    `- verify:release: ${verifyOk ? 'OK' : 'oczekuje / błąd'}`,
    `- ZIP: ${zipOk && zipVerifyOk ? 'OK' : 'oczekuje / błąd'}`,
  ].join('\n');
}

function writeReleaseResult({ rootDir = root, variant = 'full', status = 'ok', steps = [], error = null } = {}) {
  const version = readVersion(rootDir);
  const generatedAt = new Date().toISOString();
  const report = `# RELEASE RESULT\n\n## Wersja\n- ${version}\n\n## Tryb\n- ${variant}\n\n## Wygenerowano\n- ${generatedAt}\n\n## Podsumowanie\n${buildSummary({ status, steps, variant })}\n\n## Kroki\n${formatStepTable(steps)}\n${error ? `\n\n## Błąd\n\`${String(error.message || error).replace(/`/g, '\\`')}\`\n` : ''}`;
  fs.writeFileSync(path.join(rootDir, 'RELEASE-RESULT.md'), report.endsWith('\n') ? report : `${report}\n`);
  return reportPath;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const variantIndex = args.indexOf('--variant');
  const variant = variantIndex >= 0 ? String(args[variantIndex + 1] || 'full') : 'full';
  const status = args.includes('--pending') ? 'pending' : 'ok';
  writeReleaseResult({ variant, status, steps: [] });
  console.log(`${status === 'pending' ? 'Pending' : 'Release'} result written for version ${readVersion(root)} (${variant})`);
}

module.exports = { writeReleaseResult };
