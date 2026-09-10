const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { resolveNpmInvocation } = require('./ensure-build-deps.cjs');

const root = path.resolve(__dirname, '..');
const runnerPath = path.join(root, 'scripts', 'ensure-build-deps.cjs');
const runnerSource = fs.readFileSync(runnerPath, 'utf8');

const npmCliPath = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
const nodePath = 'C:\\Program Files\\nodejs\\node.exe';
const viaNpmExecPath = resolveNpmInvocation({
  platform: 'win32',
  nodeExecutable: nodePath,
  npmExecPath: npmCliPath,
  pathExists: (candidate) => candidate === npmCliPath,
});

assert.deepStrictEqual(viaNpmExecPath, {
  command: nodePath,
  argsPrefix: [npmCliPath],
  shell: false,
  source: 'npm_execpath',
}, 'Windows powinien uruchamiać npm-cli.js przez bieżący Node, gdy npm_execpath jest dostępny');

const windowsFallback = resolveNpmInvocation({
  platform: 'win32',
  nodeExecutable: nodePath,
  npmExecPath: '',
  pathExists: () => false,
});

assert.deepStrictEqual(windowsFallback, {
  command: 'npm.cmd',
  argsPrefix: [],
  shell: true,
  source: 'npm.cmd',
}, 'Windows bez npm_execpath powinien użyć npm.cmd przez shell');

const unixFallback = resolveNpmInvocation({
  platform: 'linux',
  npmExecPath: '',
  pathExists: () => false,
});

assert.strictEqual(unixFallback.command, 'npm', 'Linux bez npm_execpath powinien użyć npm');
assert.strictEqual(unixFallback.shell, false, 'Linux nie powinien wymuszać shella');
assert(runnerSource.includes('process.env.npm_execpath'), 'Runner nie korzysta z npm_execpath bieżącego procesu npm');
assert(runnerSource.includes("isWindows ? 'npm.cmd' : 'npm'"), 'Runner nie ma awaryjnego npm.cmd dla Windows');
assert(runnerSource.includes('shell: invocation.shell'), 'Runner nie przekazuje bezpiecznie ustawienia shell dla npm.cmd');

console.log('Smoke OK: Windows npm runner uses npm_execpath and npm.cmd fallback without spawnSync npm ENOENT');

process.exit(0);
