const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  collectReleaseFiles,
  createReleaseZip,
  shouldSkipDirectory,
  shouldSkipFile,
} = require('./release-zip.cjs');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'klima-release-zip-clean-smoke-'));

function writeFile(relativePath, content = 'smoke') {
  const filePath = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function assertNoForbiddenFiles(files, label) {
  const forbiddenFragments = [
    'logs/',
    'logs735/',
    'logs999/',
    'nested/logs-stage/',
    '.cache/',
    'coverage/',
    'tmp/',
    'temp/',
    'debug.log',
    'notes.tmp',
    'RELEASE-RESULT.new.md',
    'draft.swp',
  ];

  for (const fragment of forbiddenFragments) {
    assert(
      !files.some((file) => file === fragment || file.startsWith(fragment) || file.endsWith(`/${fragment}`)),
      `${label} must exclude working/log file or directory: ${fragment}`,
    );
  }
}

try {
  writeFile('app-version.json', JSON.stringify({ version: '9.98' }, null, 2));
  writeFile('package.json', JSON.stringify({ name: 'zip-clean-smoke', version: '0.00' }, null, 2));
  writeFile('src/App.jsx', 'export default function App() { return null; }\n');
  writeFile('README.md', '# Smoke release zip clean\n');

  writeFile('logs/pass1_01.log', 'old smoke log');
  writeFile('logs735/build1.log', 'old build log');
  writeFile('logs999/zip.log', 'old zip log');
  writeFile('nested/logs-stage/output.txt', 'nested old log directory');
  writeFile('.cache/cache.json', '{}\n');
  writeFile('coverage/coverage-final.json', '{}\n');
  writeFile('tmp/scratch.txt', 'scratch');
  writeFile('temp/scratch.txt', 'scratch');
  writeFile('debug.log', 'debug');
  writeFile('notes.tmp', 'tmp');
  writeFile('RELEASE-RESULT.new.md', 'working copy');
  writeFile('draft.swp', 'swap');

  assert.equal(shouldSkipDirectory('logs'), true, 'logs directory should be excluded');
  assert.equal(shouldSkipDirectory('logs735'), true, 'logs735 directory should be excluded');
  assert.equal(shouldSkipDirectory(path.join('nested', 'logs-stage')), true, 'nested logs-* directory should be excluded');
  assert.equal(shouldSkipFile('debug.log'), true, '*.log files should be excluded');
  assert.equal(shouldSkipFile('notes.tmp'), true, '*.tmp files should be excluded');
  assert.equal(shouldSkipFile('RELEASE-RESULT.new.md'), true, '*.new.md files should be excluded');
  assert.equal(shouldSkipFile('draft.swp'), true, '*.swp files should be excluded');

  const releaseFiles = collectReleaseFiles(tempRoot, tempRoot);
  assert(releaseFiles.includes('src/App.jsx'), 'Release list should include normal source files');
  assert(releaseFiles.includes('README.md'), 'Release list should include normal documentation files');
  assertNoForbiddenFiles(releaseFiles, 'Release file list');

  const { zipPath } = createReleaseZip({ rootDir: tempRoot, silent: true });
  const zipListing = execFileSync('unzip', ['-Z', '-1', zipPath], { encoding: 'utf8' });
  const zipFiles = zipListing.split(/\r?\n/).filter(Boolean);

  assert(zipFiles.includes('src/App.jsx'), 'ZIP should include normal source files');
  assert(zipFiles.includes('README.md'), 'ZIP should include normal documentation files');
  assertNoForbiddenFiles(zipFiles, 'Release ZIP');

  console.log('Smoke OK: release ZIP excludes logs*, cache, coverage and working files');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

process.exit(0);
