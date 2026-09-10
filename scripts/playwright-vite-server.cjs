const { spawn } = require('node:child_process');

const port = process.argv[2] || process.env.PLAYWRIGHT_PORT || '4173';
const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    VITE_SUPABASE_MODE: 'mock',
  },
});

function shutdown(signal) {
  if (!child.killed) child.kill(signal);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
