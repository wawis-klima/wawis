const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { collectReleaseFiles } = require('./release-zip.cjs');

const root = path.resolve(__dirname, '..');
const npmrcPath = path.join(root, '.npmrc');
const ensureBuildDepsPath = path.join(root, 'scripts', 'ensure-build-deps.cjs');

assert(fs.existsSync(npmrcPath), 'Brak projektowego pliku .npmrc');

const lines = fs.readFileSync(npmrcPath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

for (const expected of [
  'registry=https://registry.npmjs.org/',
  'include=optional',
  'audit=false',
  'fund=false',
]) {
  assert(lines.includes(expected), `.npmrc nie zawiera: ${expected}`);
}

const ensureBuildDepsSource = fs.readFileSync(ensureBuildDepsPath, 'utf8');
assert(
  ensureBuildDepsSource.includes("npm_config_registry: 'https://registry.npmjs.org/'"),
  'Skrypt przygotowania builda nie wymusza publicznego rejestru npm'
);

const releaseFiles = collectReleaseFiles(root, root);
assert(releaseFiles.includes('.npmrc'), 'Plik .npmrc nie trafi do paczki release ZIP');

console.log('Smoke OK: publiczny rejestr npm jest zapisany, wymuszany przy buildzie i pakowany do ZIP');
