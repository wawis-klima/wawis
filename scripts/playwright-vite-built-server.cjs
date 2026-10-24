// WAWIS 13.62 — serwer testowy z BUDOWY PRODUKCYJNEJ (vite build + vite preview) w trybie mock Supabase.
// Służy wyłącznie do E2E kolejki zdjęć na zbudowanej aplikacji. Brak zmiennych produkcyjnych, brak sieci do Supabase.
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = process.argv[2] || process.env.PLAYWRIGHT_PORT || '4174';
const outDir = 'dist-e2e-built';
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const env = { ...process.env, VITE_SUPABASE_MODE: 'mock' };
delete env.VITE_SUPABASE_URL;
delete env.VITE_SUPABASE_ANON_KEY;

const build = spawnSync(process.execPath, [vite, 'build', '--outDir', outDir, '--emptyOutDir'], { cwd: root, stdio: 'inherit', env });
if (build.status !== 0) process.exit(build.status || 1);

const child = spawn(process.execPath, [vite, 'preview', '--outDir', outDir, '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd: root, stdio: 'inherit', env });
const shutdown = (signal) => { if (!child.killed) child.kill(signal); };
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
