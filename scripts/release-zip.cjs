const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const defaultRoot = path.resolve(__dirname, '..');

const excludedDirectories = new Set([
  '.git',
  '.vercel',
  'dist',
  'docs',
  'node_modules',
  'output',
  'playwright-report',
  'releases',
  'test-results',
  'visual-artifacts',
  path.join('docs', 'preview'),
  path.join('supabase', '.temp'),
]);

const excludedDirectoryNamePatterns = [
  'logs*',
  '.cache',
  'coverage',
  'tmp',
  'temp',
];

const excludedFileNames = new Set([
  '.DS_Store',
  '.env',
  'README-START.txt',
  'npx',
]);

const excludedFilePatterns = [
  '.env.*',
  '*.bak',
  '*.log',
  '*.tmp',
  '*.temp',
  '*.new.md',
  '*.swp',
  'npm-debug.log*',
  'README-SMS-STAGE-*',
  'README-SMS-STAGE-*.txt',
];

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function matchesPattern(fileName, pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`).test(fileName);
}

function shouldSkipDirectory(relativePath) {
  const normalized = toPosix(relativePath);
  const directoryName = path.basename(relativePath);

  const isExplicitlyExcluded = Array.from(excludedDirectories).some((directory) => {
    const excluded = toPosix(directory);
    return normalized === excluded || normalized.startsWith(`${excluded}/`);
  });

  if (isExplicitlyExcluded) {
    return true;
  }

  return excludedDirectoryNamePatterns.some((pattern) => matchesPattern(directoryName, pattern));
}

function shouldSkipFile(relativePath) {
  const fileName = path.basename(relativePath);
  const normalized = toPosix(relativePath);

  if (excludedFileNames.has(fileName) || excludedFileNames.has(normalized)) {
    return true;
  }

  return excludedFilePatterns.some((pattern) => matchesPattern(fileName, pattern) || matchesPattern(normalized, pattern));
}

function collectReleaseFiles(directory, base = directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(base, absolutePath);

    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(relativePath)) {
        files.push(...collectReleaseFiles(absolutePath, base));
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!shouldSkipFile(relativePath)) {
      files.push(toPosix(relativePath));
    }
  }

  return files;
}

function readVersion(rootDir) {
  const versionFilePath = path.join(rootDir, 'app-version.json');
  return String(JSON.parse(fs.readFileSync(versionFilePath, 'utf8')).version || '0.0').trim();
}

function syncPackageVersion(rootDir, version) {
  const pkgPath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (String(pkg.version).trim() !== version) {
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }
}

function createReleaseZip(options = {}) {
  const rootDir = path.resolve(options.rootDir || defaultRoot);
  const version = options.version || readVersion(rootDir);
  const releasesDir = path.resolve(options.releasesDir || path.join(rootDir, 'releases'));
  const zipName = options.zipName || `klima-app-v${version}.zip`;
  const zipPath = path.join(releasesDir, zipName);
  const silent = Boolean(options.silent);

  syncPackageVersion(rootDir, version);
  fs.mkdirSync(releasesDir, { recursive: true });

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const releaseFiles = collectReleaseFiles(rootDir, rootDir);
  if (releaseFiles.length === 0) {
    throw new Error('Release ZIP cannot be empty');
  }

  const fileListPath = path.join(releasesDir, `klima-app-v${version}-files.txt`);
  fs.writeFileSync(fileListPath, `${releaseFiles.join('\n')}\n`);

  const zipResult = spawnSync('zip', ['-D', '-q', '-@', zipPath], {
    cwd: rootDir,
    input: `${releaseFiles.join('\n')}\n`,
    encoding: 'utf8',
  });

  if (zipResult.error) {
    throw zipResult.error;
  }

  if (zipResult.status !== 0) {
    if (zipResult.stdout) process.stdout.write(zipResult.stdout);
    if (zipResult.stderr) process.stderr.write(zipResult.stderr);
    throw new Error(`zip failed with exit code ${zipResult.status}`);
  }

  if (!silent) {
    console.log(`Release ZIP created: ${zipPath}`);
    console.log(`Files added to ZIP: ${releaseFiles.length}`);
    console.log(`File list created: ${fileListPath}`);
    console.log(`Excluded directories: ${Array.from(excludedDirectories).map(toPosix).join(', ')}`);
    console.log(`Excluded directory patterns: ${excludedDirectoryNamePatterns.join(', ')}`);
    console.log(`Excluded files/patterns: ${Array.from(excludedFileNames).join(', ')}, ${excludedFilePatterns.join(', ')}`);
  }

  return {
    version,
    zipName,
    zipPath,
    fileListPath,
    releaseFiles,
  };
}

if (require.main === module) {
  try {
    createReleaseZip();
    process.exit(0);
  } catch (error) {
    console.error(`Release ZIP failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  collectReleaseFiles,
  createReleaseZip,
  excludedDirectories,
  excludedDirectoryNamePatterns,
  excludedFileNames,
  excludedFilePatterns,
  shouldSkipDirectory,
  shouldSkipFile,
};
