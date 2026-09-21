const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let k = 0; k < 8; k += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[n] = value >>> 0;
  }
  return table;
})();

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

  if (isExplicitlyExcluded) return true;
  return excludedDirectoryNamePatterns.some((pattern) => matchesPattern(directoryName, pattern));
}

function shouldSkipFile(relativePath) {
  const fileName = path.basename(relativePath);
  const normalized = toPosix(relativePath);

  if (excludedFileNames.has(fileName) || excludedFileNames.has(normalized)) return true;
  return excludedFilePatterns.some((pattern) => matchesPattern(fileName, pattern) || matchesPattern(normalized, pattern));
}

function collectReleaseFiles(directory, base = directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(base, absolutePath);

    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(relativePath)) files.push(...collectReleaseFiles(absolutePath, base));
      continue;
    }

    if (entry.isFile() && !shouldSkipFile(relativePath)) files.push(toPosix(relativePath));
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

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  return {
    time: ((hours << 11) | (minutes << 5) | seconds) & 0xffff,
    date: (((year - 1980) << 9) | (month << 5) | day) & 0xffff,
  };
}

function assertClassicZipLimit(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`Release ZIP exceeds classic ZIP limit for ${label}: ${value}`);
  }
}

function buildZipArchive(rootDir, relativeFiles) {
  if (relativeFiles.length > 0xffff) throw new Error(`Release ZIP has too many files: ${relativeFiles.length}`);

  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const relativeFile of relativeFiles) {
    const normalizedName = toPosix(relativeFile);
    const nameBytes = Buffer.from(normalizedName, 'utf8');
    if (nameBytes.length > 0xffff) throw new Error(`Release ZIP path is too long: ${normalizedName}`);

    const absolutePath = path.join(rootDir, ...normalizedName.split('/'));
    const source = fs.readFileSync(absolutePath);
    const compressed = zlib.deflateRawSync(source, { level: 9 });
    const checksum = crc32(source);
    const stat = fs.statSync(absolutePath);
    const stamp = dosDateTime(stat.mtime);

    assertClassicZipLimit(source.length, `${normalizedName} uncompressed size`);
    assertClassicZipLimit(compressed.length, `${normalizedName} compressed size`);
    assertClassicZipLimit(localOffset, `${normalizedName} local header offset`);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(stamp.time, 10);
    localHeader.writeUInt16LE(stamp.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(source.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBytes, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(stamp.time, 12);
    centralHeader.writeUInt16LE(stamp.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(source.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, nameBytes);

    localOffset += localHeader.length + nameBytes.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  assertClassicZipLimit(localOffset, 'central directory offset');
  assertClassicZipLimit(centralDirectory.length, 'central directory size');

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(relativeFiles.length, 8);
  end.writeUInt16LE(relativeFiles.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('Release ZIP is missing the end-of-central-directory record.');
}

function listReleaseZipEntries(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  const endOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  const entries = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Release ZIP has an invalid central-directory entry at index ${index}.`);
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) throw new Error(`Release ZIP entry ${index} has an invalid name length.`);
    entries.push(buffer.subarray(nameStart, nameEnd).toString('utf8'));
    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
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
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  const releaseFiles = collectReleaseFiles(rootDir, rootDir);
  if (releaseFiles.length === 0) throw new Error('Release ZIP cannot be empty');

  const fileListPath = path.join(releasesDir, `klima-app-v${version}-files.txt`);
  fs.writeFileSync(fileListPath, `${releaseFiles.join('\n')}\n`);
  fs.writeFileSync(zipPath, buildZipArchive(rootDir, releaseFiles));

  const archivedEntries = listReleaseZipEntries(zipPath);
  if (archivedEntries.length !== releaseFiles.length) {
    throw new Error(`Release ZIP verification failed: expected ${releaseFiles.length} entries, found ${archivedEntries.length}.`);
  }

  if (!silent) {
    console.log(`Release ZIP created: ${zipPath}`);
    console.log(`Files added to ZIP: ${releaseFiles.length}`);
    console.log(`File list created: ${fileListPath}`);
    console.log(`Excluded directories: ${Array.from(excludedDirectories).map(toPosix).join(', ')}`);
    console.log(`Excluded directory patterns: ${excludedDirectoryNamePatterns.join(', ')}`);
    console.log(`Excluded files/patterns: ${Array.from(excludedFileNames).join(', ')}, ${excludedFilePatterns.join(', ')}`);
  }

  return { version, zipName, zipPath, fileListPath, releaseFiles };
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
  buildZipArchive,
  collectReleaseFiles,
  createReleaseZip,
  crc32,
  excludedDirectories,
  excludedDirectoryNamePatterns,
  excludedFileNames,
  excludedFilePatterns,
  listReleaseZipEntries,
  shouldSkipDirectory,
  shouldSkipFile,
};
