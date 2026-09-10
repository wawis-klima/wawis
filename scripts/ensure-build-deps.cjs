const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packageLockPath = path.join(root, 'package-lock.json');
const packageJsonPath = path.join(root, 'package.json');

function assert(condition, message) { if (!condition) throw new Error(message); }
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function getReportHeader() { try { return process.report?.getReport?.().header || null; } catch { return null; } }
function isMusl() { if (process.platform !== 'linux') return false; const header = getReportHeader(); return Boolean(header && !header.glibcVersionRuntime); }
function resolvePackage(packageName) { const packagePath = path.join(root, 'node_modules', ...packageName.split('/'), 'package.json'); return fs.existsSync(packagePath) ? packagePath : null; }
function getEsbuildNativePackage() {
  const mapping = { darwin: { arm64: '@esbuild/darwin-arm64', x64: '@esbuild/darwin-x64' }, linux: { arm64: '@esbuild/linux-arm64', x64: '@esbuild/linux-x64' }, win32: { arm64: '@esbuild/win32-arm64', ia32: '@esbuild/win32-ia32', x64: '@esbuild/win32-x64' } };
  return mapping[process.platform]?.[process.arch] || null;
}
function getRollupNativePackage() {
  const mapping = { darwin: { arm64: '@rollup/rollup-darwin-arm64', x64: '@rollup/rollup-darwin-x64' }, linux: { arm64: isMusl() ? '@rollup/rollup-linux-arm64-musl' : '@rollup/rollup-linux-arm64-gnu', x64: isMusl() ? '@rollup/rollup-linux-x64-musl' : '@rollup/rollup-linux-x64-gnu' }, win32: { arm64: '@rollup/rollup-win32-arm64-msvc', ia32: '@rollup/rollup-win32-ia32-msvc', x64: '@rollup/rollup-win32-x64-msvc' } };
  return mapping[process.platform]?.[process.arch] || null;
}
function getMissingPackages() {
  const required = ['vite', '@vitejs/plugin-react', 'rollup', 'esbuild'];
  const esbuildNative = getEsbuildNativePackage();
  const rollupNative = getRollupNativePackage();
  if (esbuildNative) required.push(esbuildNative);
  if (rollupNative) required.push(rollupNative);
  return required.filter((packageName) => !resolvePackage(packageName));
}
function resolveNpmInvocation(options = {}) {
  const platform = options.platform || process.platform;
  const nodeExecutable = options.nodeExecutable || process.execPath;
  const npmExecPath = String(options.npmExecPath ?? process.env.npm_execpath ?? '').trim();
  const pathExists = options.pathExists || fs.existsSync;

  if (npmExecPath && pathExists(npmExecPath)) {
    return {
      command: nodeExecutable,
      argsPrefix: [npmExecPath],
      shell: false,
      source: 'npm_execpath',
    };
  }

  const isWindows = platform === 'win32';
  return {
    command: isWindows ? 'npm.cmd' : 'npm',
    argsPrefix: [],
    shell: isWindows,
    source: isWindows ? 'npm.cmd' : 'npm',
  };
}
function runNpmInstall(args) {
  const invocation = resolveNpmInvocation();
  execFileSync(invocation.command, [...invocation.argsPrefix, ...args], {
    cwd: root,
    stdio: 'inherit',
    shell: invocation.shell,
    env: { ...process.env, npm_config_registry: 'https://registry.npmjs.org/', npm_config_audit: 'false', npm_config_fund: 'false', npm_config_include: 'optional', npm_config_optional: 'true' },
  });
}
function installFromLockfile(missingPackages) {
  const packageLock = readJson(packageLockPath); const packages = packageLock.packages || {};
  const installable = missingPackages.map((packageName) => packages[`node_modules/${packageName}`]?.version ? `${packageName}@${packages[`node_modules/${packageName}`].version}` : null).filter(Boolean);
  if (installable.length === 0) return false;
  console.log(`Instaluję brakujące pakiety z lockfile: ${installable.join(', ')}`);
  runNpmInstall(['install', '--no-save', '--include=optional', ...installable]);
  return true;
}
function ensureBuildDeps() {
  assert(fs.existsSync(packageJsonPath), 'Brak package.json');
  assert(fs.existsSync(packageLockPath), 'Brak package-lock.json — nie można wykonać stabilnej instalacji zależności przed buildem');
  let missingPackages = getMissingPackages();
  if (missingPackages.length === 0) { console.log('Build deps OK'); return; }
  console.warn(`Brakujące zależności builda: ${missingPackages.join(', ')}`);
  console.log('Uruchamiam czyste npm ci z pakietami optional...');
  try { runNpmInstall(['ci', '--include=optional']); } catch (error) { console.warn(`npm ci nie domknęło zależności builda: ${error.message}`); }
  missingPackages = getMissingPackages();
  if (missingPackages.length === 0) { console.log('Build deps OK po npm ci'); return; }
  const installedFromLock = installFromLockfile(missingPackages);
  missingPackages = getMissingPackages();
  if (missingPackages.length === 0) { console.log(installedFromLock ? 'Build deps OK po doinstalowaniu z lockfile' : 'Build deps OK'); return; }
  throw new Error(`Nadal brakuje zależności builda: ${missingPackages.join(', ')}. Uruchom \`npm ci --include=optional\` w środowisku z dostępem do rejestru npm i spróbuj ponownie.`);
}
if (require.main === module) {
  try { ensureBuildDeps(); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1); }
}

module.exports = {
  ensureBuildDeps,
  resolveNpmInvocation,
  runNpmInstall,
};
