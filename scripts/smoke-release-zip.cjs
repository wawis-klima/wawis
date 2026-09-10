const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { collectReleaseFiles, createReleaseZip } = require('./release-zip.cjs');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'klima-release-zip-smoke-'));

function writeFile(relativePath, content = 'smoke') {
  const filePath = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

try {
  writeFile('app-version.json', JSON.stringify({ version: '9.99' }, null, 2));
  writeFile('package.json', JSON.stringify({ name: 'zip-smoke', version: '0.00' }, null, 2));
  writeFile('src/App.jsx', 'export default function App() { return null; }\n');
  writeFile('README.md', '# Smoke release zip\n');

  writeFile('node_modules/fake-package/index.js', 'throw new Error("must not be zipped");\n');
  writeFile('dist/assets/partial-build.js', 'console.log("partial dist");\n');
  writeFile('releases/old-release.zip', 'old');
  writeFile('.env', 'SECRET=must-not-ship\n');
  writeFile('.env.local', 'SECRET=must-not-ship\n');
  writeFile('README-START.txt', 'must not ship\n');
  writeFile('README-SMS-STAGE-1.txt', 'must not ship\n');
  writeFile('supabase/.temp/cache.json', '{}\n');
  writeFile('docs/preview/example.html', '<p>must not ship</p>\n');
  writeFile('npx', '');

  const releaseFiles = collectReleaseFiles(tempRoot, tempRoot);
  assert(releaseFiles.includes('src/App.jsx'), 'Release list should include normal source files');
  assert(releaseFiles.includes('README.md'), 'Release list should include normal documentation files');

  const forbiddenListFragments = [
    'node_modules/',
    'dist/',
    'releases/',
    '.env',
    '.env.local',
    'README-START.txt',
    'README-SMS-STAGE-1.txt',
    'supabase/.temp/',
    'docs/',
    'npx',
  ];

  for (const fragment of forbiddenListFragments) {
    assert(
      !releaseFiles.some((file) => file === fragment || file.startsWith(fragment)),
      `Release file list must exclude ${fragment}`,
    );
  }

  const { zipPath, fileListPath } = createReleaseZip({ rootDir: tempRoot, silent: true });
  const zipListing = execFileSync('unzip', ['-Z', '-1', zipPath], { encoding: 'utf8' });
  const zipFiles = zipListing.split(/\r?\n/).filter(Boolean);

  assert(zipFiles.includes('src/App.jsx'), 'ZIP should include normal source files');
  assert(zipFiles.includes('README.md'), 'ZIP should include normal documentation files');
  assert(fs.existsSync(fileListPath), 'release-zip should write a file list next to ZIP');

  const forbiddenZipFragments = [
    'node_modules/',
    'dist/',
    'releases/',
    '.env',
    '.env.local',
    'README-START.txt',
    'README-SMS-STAGE-1.txt',
    'supabase/.temp/',
    'docs/',
    'npx',
  ];

  for (const fragment of forbiddenZipFragments) {
    assert(
      !zipFiles.some((file) => file === fragment || file.startsWith(fragment)),
      `Release ZIP must exclude ${fragment}`,
    );
  }

  console.log('Smoke OK: release-zip excludes fake node_modules, partial dist and working files');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

process.exit(0);
