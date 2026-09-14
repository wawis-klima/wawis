const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const changedFileListPath = process.argv[2] || 'changed-files.txt';
const changedFiles = fs.existsSync(changedFileListPath)
  ? fs.readFileSync(changedFileListPath, 'utf8').split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
  : [];

const selected = new Set(['core']);

function add(...groups) {
  groups.forEach((group) => selected.add(group));
}

for (const file of changedFiles) {
  const lower = file.toLowerCase();

  if (/^(scripts\/|\.github\/|package(?:-lock)?\.json$|vercel\.json$|version-bump\.cjs$|release-)/.test(lower)) {
    add('infra');
  }
  if (/(job|monta|contractor|kontrah|device|urzad|urząd)/.test(lower)) add('jobs');
  if (/(photo|zdjec|zdjęc|thumbnail|gallery|storage)/.test(lower)) add('photos');
  if (/(protocol|protokol|protokół|payment|pdf|email)/.test(lower)) add('protocol');
  if (/(role|auth|rls|grant|permission|user)/.test(lower) || lower.startsWith('supabase/')) add('roles');
  if (/(push|notification|assignment)/.test(lower)) add('push');
  if (/(fuel|paliw|tankow)/.test(lower)) add('fuel');
  if (/(nameplate|tabliczk|ocr|barcode|ean|rotenso)/.test(lower)) add('nameplates');
  if (/^(src\/(components|modules)|tests\/e2e\/desktop|.*desktop)/.test(lower)) add('desktop');
  if (lower.startsWith('src/mobile791/') || lower.includes('mobile') || lower.includes('iphone')) add('mobile');
}

if (changedFiles.length === 0) add('infra');

const groups = [...selected];
console.log(`Changed files (${changedFiles.length}):`);
changedFiles.forEach((file) => console.log(`- ${file}`));
console.log(`Selected WAWIS PR groups: ${groups.join(', ')}`);

execFileSync(process.execPath, ['scripts/run-test-group.cjs', ...groups], {
  stdio: 'inherit',
  env: process.env,
});
