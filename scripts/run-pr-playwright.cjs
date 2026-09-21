const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const impactPath = process.argv[2] || 'release-impact.json';
if (!fs.existsSync(impactPath)) throw new Error(`Brak ${impactPath}`);
const impact = JSON.parse(fs.readFileSync(impactPath, 'utf8'));
if (!impact?.needs_playwright) { console.log('Playwright pominięty zgodnie z klasyfikacją ryzyka.'); process.exit(0); }
const e2e = Array.isArray(impact.e2e) ? impact.e2e : [];
if (!e2e.length) throw new Error('needs_playwright=true bez wskazanego zakresu E2E.');
for (const platform of e2e) {
  const script = platform === 'mobile' ? 'scripts/run-playwright-mobile.cjs' : platform === 'desktop' ? 'scripts/run-playwright-desktop.cjs' : null;
  if (!script) throw new Error(`Nieobsługiwany zakres E2E: ${platform}`);
  console.log(`Uruchamiam wymagane E2E: ${platform}`);
  execFileSync(process.execPath, [script, '--reporter=line'], { stdio: 'inherit', env: process.env });
}
