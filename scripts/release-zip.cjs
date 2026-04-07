const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const versionFilePath = path.join(root, "app-version.json");
const version = String(JSON.parse(fs.readFileSync(versionFilePath, "utf8")).version || "0.0").trim();
const releasesDir = path.join(root, "releases");
const zipName = `klima-app-v${version}.zip`;
const zipPath = path.join(releasesDir, zipName);

const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (String(pkg.version).trim() !== version) {
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

const zipExcludes = [
  "node_modules/*",
  "dist/*",
  "releases/*",
  ".git/*",
  ".vercel/*",
  ".env",
  ".env.*",
  "*.bak",
  "npm-debug.log*",
  ".DS_Store"
];

fs.mkdirSync(releasesDir, { recursive: true });
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

const zipArgs = ["-r", zipPath, "."];
for (const pattern of zipExcludes) {
  zipArgs.push("-x", pattern);
}

execFileSync("zip", zipArgs, { cwd: root, stdio: "inherit" });

console.log(`Release ZIP created: ${zipPath}`);
console.log(`Excluded from ZIP: ${zipExcludes.join(", ")}`);
