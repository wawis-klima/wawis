const fs = require('fs');
const path = require('path');

const root = __dirname;
const versionFilePath = process.env.APP_VERSION_FILE || path.join(root, 'app-version.json');
const pkgPath = process.env.PACKAGE_JSON_FILE || path.join(root, 'package.json');
const readmePath = process.env.README_FILE || path.join(root, 'README.md');
const changelogPath = process.env.CHANGELOG_FILE || path.join(root, 'CHANGELOG.md');
const lockPath = process.env.PACKAGE_LOCK_FILE || path.join(root, 'package-lock.json');
const srcVersionPath = process.env.SRC_VERSION_FILE || path.join(root, 'src', 'version.js');
const mobileSrcVersionPath = process.env.MOBILE_SRC_VERSION_FILE || path.join(root, 'src', 'mobile791', 'version.js');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function readVersion() {
  const versionData = readJson(versionFilePath);
  return String(versionData.version || '0.0').trim();
}

function getNextVersion(currentVersion) {
  const match = currentVersion.match(/^(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Nieprawidłowy format wersji "${currentVersion}". Oczekiwany format: 5.15`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);

  if (!Number.isInteger(major) || !Number.isInteger(minor) || major < 0 || minor < 0) {
    throw new Error(`Nieprawidłowy format wersji "${currentVersion}". Oczekiwany format: 5.15`);
  }

  const nextMinor = minor + 1;
  if (nextMinor >= 100) {
    return `${major + 1}.00`;
  }

  return `${major}.${String(nextMinor).padStart(2, '0')}`;
}

function updateReadmeVersionMetadata(readme, nextVersion) {
  let updated = readme;

  updated = updated.replace(
    /## Ostatnia poprawka\s*- wersja\s*`?[0-9]+\.[0-9]{2}`?.*/m,
    `## Ostatnia poprawka\n- wersja \`${nextVersion}\` — uzupełnij opis ostatniej poprawki po zakończeniu zmian.`
  );

  updated = updated.replace(
    /## Aktualna wersja\s*-\s*[0-9]+\.[0-9]{2}/m,
    `## Aktualna wersja\n- ${nextVersion}`
  );

  return updated;
}

function ensureReadmeVersionEntry(readme, nextVersion) {
  if (readme.includes(`wersja \`${nextVersion}\``) && readme.includes(`- ${nextVersion}`)) {
    return readme;
  }
  return updateReadmeVersionMetadata(readme, nextVersion);
}

function ensureChangelogVersionEntry(changelog, nextVersion) {
  const sectionRegex = new RegExp(`^## ${nextVersion}\\n`, 'm');
  if (sectionRegex.test(changelog)) return changelog;
  const prefix = `## ${nextVersion}\n- uzupełnij opis zmian dla wersji ${nextVersion}\n\n`;
  return `${prefix}${changelog.replace(/^\s+/, '')}`;
}

function writeVersion(nextVersion) {
  writeJson(versionFilePath, { version: nextVersion });

  const pkg = readJson(pkgPath);
  pkg.version = nextVersion;
  writeJson(pkgPath, pkg);

  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath);
    lock.version = nextVersion;
    if (lock.packages?.['']) {
      lock.packages[''].version = nextVersion;
    }
    writeJson(lockPath, lock);
  }

  if (fs.existsSync(srcVersionPath)) {
    const srcVersionSource = fs.readFileSync(srcVersionPath, 'utf8');
    const updatedSrcVersion = srcVersionSource.replace(/APP_VERSION\s*=\s*['"]([0-9]+\.[0-9]{2})['"]/, `APP_VERSION = '${nextVersion}'`);
    fs.writeFileSync(srcVersionPath, updatedSrcVersion);
  }

  if (fs.existsSync(mobileSrcVersionPath)) {
    const mobileVersionSource = fs.readFileSync(mobileSrcVersionPath, 'utf8');
    const updatedMobileVersion = mobileVersionSource.replace(/APP_VERSION\s*=\s*['"]([0-9]+\.[0-9]{2})['"]/, `APP_VERSION = '${nextVersion}'`);
    fs.writeFileSync(mobileSrcVersionPath, updatedMobileVersion);
  }

  const readme = fs.readFileSync(readmePath, 'utf8');
  fs.writeFileSync(readmePath, ensureReadmeVersionEntry(readme, nextVersion));

  const changelog = fs.readFileSync(changelogPath, 'utf8');
  fs.writeFileSync(changelogPath, ensureChangelogVersionEntry(changelog, nextVersion));
}

function bumpVersion() {
  const currentVersion = readVersion();
  const nextVersion = getNextVersion(currentVersion);
  writeVersion(nextVersion);
  return { currentVersion, nextVersion };
}

if (require.main === module) {
  const { currentVersion, nextVersion } = bumpVersion();
  console.log(`Version bumped from ${currentVersion} to ${nextVersion}`);
}

module.exports = {
  readVersion,
  getNextVersion,
  updateReadmeVersionMetadata,
  ensureReadmeVersionEntry,
  ensureChangelogVersionEntry,
  writeVersion,
  bumpVersion,
};
