const fs = require("fs");
const path = require("path");

const root = __dirname;
const versionFilePath = path.join(root, "app-version.json");
const pkgPath = path.join(root, "package.json");

function readVersion() {
  const versionData = JSON.parse(fs.readFileSync(versionFilePath, "utf8"));
  return String(versionData.version || "0.0").trim();
}

function writeVersion(nextVersion) {
  fs.writeFileSync(versionFilePath, JSON.stringify({ version: nextVersion }, null, 2) + "\n");

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.version = nextVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

function getNextVersion(currentVersion) {
  const match = currentVersion.match(/^(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(
      `Nieprawidłowy format wersji "${currentVersion}". Oczekiwany format: 5.15`
    );
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);

  if (!Number.isInteger(major) || !Number.isInteger(minor) || major < 0 || minor < 0) {
    throw new Error(
      `Nieprawidłowy format wersji "${currentVersion}". Oczekiwany format: 5.15`
    );
  }

  return `${major}.${minor + 1}`;
}

const currentVersion = readVersion();
const nextVersion = getNextVersion(currentVersion);
writeVersion(nextVersion);

console.log(`Version bumped from ${currentVersion} to ${nextVersion}`);
