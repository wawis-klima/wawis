const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const targets = [
  path.join(root, 'node_modules', '.bin', 'vite'),
  path.join(root, 'node_modules', '.bin', 'esbuild'),
  path.join(root, 'node_modules', '@esbuild', 'linux-x64', 'bin', 'esbuild'),
];

for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  try {
    fs.chmodSync(target, 0o755);
    console.log(`chmod 755 ${path.relative(root, target)}`);
  } catch (error) {
    console.warn(`Nie udało się ustawić praw dla ${path.relative(root, target)}: ${error.message}`);
  }
}

process.exit(0);
