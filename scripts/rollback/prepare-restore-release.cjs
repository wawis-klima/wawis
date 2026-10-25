#!/usr/bin/env node
// WAWIS — przygotowanie wydania przywracającego kod starszej wersji („roll-forward restore”).
//
// Zamiast cofać produkcję do starego wdrożenia (Vercel Hobby pozwala tylko na poprzednie), tworzymy NOWĄ wersję
// (numer zawsze rośnie) z kodem aplikacji wybranej starszej wersji. Dzięki temu:
//   - telefony wykryją inną wersję i przeładują się normalnie (nowy cache service workera),
//   - lokalne bazy IndexedDB nie zostaną otwarte z niższym numerem (sprawdzane poniżej),
//   - wydanie przechodzi zwykłe CI, Closure Gate i bramki wdrożenia,
//   - baza Supabase NIE jest cofana (kod musi być z nią zgodny — sprawdzane poniżej).
//
// Użycie:
//   node scripts/rollback/prepare-restore-release.cjs --target 13.67            # tylko analiza (bez zmian)
//   node scripts/rollback/prepare-restore-release.cjs --target 13.67 --apply    # lokalna gałąź release/v<nowa>
// Skrypt niczego nie wypycha i nie łączy się z produkcją.
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const target = arg('--target');
const apply = args.includes('--apply');
const base = arg('--base') || 'origin/main';
if (!target || !/^\d+\.\d{2}$/.test(target)) {
  console.error('Podaj --target <wersja>, np. --target 13.67');
  process.exit(2);
}

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const show = (sha, file) => { try { return execFileSync('git', ['show', `${sha}:${file}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).trim(); } catch { return null; } };
const cmpVersion = (a, b) => { const [am, an] = a.split('.').map(Number); const [bm, bn] = b.split('.').map(Number); return am - bm || an - bn; };
const nextVersion = (v) => { const [m, n] = v.split('.').map(Number); return n + 1 >= 100 ? `${m + 1}.00` : `${m}.${String(n + 1).padStart(2, '0')}`; };

const problems = [];
const warnings = [];
const notes = [];

// 1. Commit wersji docelowej na main.
let targetSha = null;
for (const sha of git('log', '--format=%H', base, '--', 'app-version.json').split('\n').filter(Boolean)) {
  const raw = show(sha, 'app-version.json');
  if (raw && JSON.parse(raw).version === target) { targetSha = sha; break; }
}
if (!targetSha) { console.error(`Nie znaleziono wersji ${target} w historii ${base}.`); process.exit(2); }
const currentVersion = JSON.parse(show(base, 'app-version.json')).version;
const newVersion = nextVersion(currentVersion);
notes.push(`Wersja docelowa ${target} = commit ${targetSha.slice(0, 7)}; produkcja (${base}) = ${currentVersion}; nowe wydanie = ${newVersion}.`);
if (cmpVersion(target, currentVersion) >= 0) problems.push(`Wersja docelowa ${target} nie jest starsza od bieżącej ${currentVersion}.`);

// 2. Zgodność lokalnych danych PWA.
const compat = JSON.parse(show(base, 'docs/LOCAL-DATA-COMPAT.json') || fs.readFileSync(path.join(root, 'docs/LOCAL-DATA-COMPAT.json'), 'utf8'));
if (cmpVersion(target, compat.minimum_restore_version) < 0) {
  problems.push(`Wersja ${target} jest starsza niż minimalna ${compat.minimum_restore_version}: ${compat.minimum_restore_reason}`);
}
for (const db of compat.indexeddb) {
  const source = show(targetSha, db.file);
  if (source === null) { warnings.push(`IndexedDB ${db.name}: brak pliku ${db.file} w wersji docelowej — sprawdź ręcznie.`); continue; }
  if (db.opened_without_version_since) {
    if (cmpVersion(target, db.opened_without_version_since) < 0) problems.push(`IndexedDB ${db.name}: wersja ${target} otwiera bazę z numerem (bezpiecznie dopiero od ${db.opened_without_version_since}).`);
    continue;
  }
  const match = source.match(/const DB_VERSION\s*=\s*(\d+)/);
  const version = match ? Number(match[1]) : null;
  if (version === null) warnings.push(`IndexedDB ${db.name}: nie odczytano DB_VERSION w ${db.file}.`);
  else if (version < db.highest_version_on_devices) problems.push(`IndexedDB ${db.name}: wersja ${target} otwiera v${version}, a telefony mają już v${db.highest_version_on_devices} (VersionError).`);
  else notes.push(`IndexedDB ${db.name}: v${version} ≥ v${db.highest_version_on_devices} — zgodna.`);
}

// 3. Zgodność z bazą Supabase (baza NIE jest cofana).
const dbChanges = git('diff', '--name-only', '--diff-filter=AM', `${targetSha}..${base}`, '--', 'supabase', '*.sql').split('\n').filter(Boolean);
if (dbChanges.length) warnings.push(`Po wersji ${target} zmieniono ${dbChanges.length} plików bazy/SQL — kod ${target} musi działać z obecną bazą:\n      ${dbChanges.join('\n      ')}`);
else notes.push(`Brak zmian plików bazy po wersji ${target}.`);
const targetFiles = git('ls-tree', '-r', '--name-only', targetSha, '--', 'src', 'api').split('\n').filter((f) => /\.(js|jsx|ts)$/.test(f));
const rpcs = new Set();
for (const file of targetFiles) {
  const text = show(targetSha, file) || '';
  for (const m of text.matchAll(/\.rpc\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g)) rpcs.add(m[1]);
}
const rpcList = [...rpcs].sort();
notes.push(`Funkcje RPC używane przez ${target}: ${rpcList.length}. Przed wdrożeniem sprawdź ich istnienie na produkcji zapytaniem (tylko odczyt):`);
notes.push(`  select x from unnest(array['${rpcList.join("','")}']) x where not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=x);`);
notes.push('  Wynik musi być pusty. Dodatkowo: Edge Functions wywoływane przez kod docelowy muszą przyjmować jego format zapytań.');

// 4. Pliki pozostające z bieżącego main (proces wydania, dokumentacja, baza, kopie).
const KEEP = ['.github/', 'RELEASE-GATE.json', 'CLAUDE.md', 'AGENTS.md', 'docs/', 'REGRESSION-LEDGER.md', 'CHANGELOG.md', 'README.md',
  'supabase/', 'scripts/backup/', 'scripts/rollback/', 'vercel.json', 'scripts/vercel-deploy-guard.cjs', 'scripts/release-policy-gate.cjs',
  'scripts/deploy-gate-router.sh', 'scripts/micro-ui-deploy-gate.cjs'];
const keep = (f) => KEEP.some((k) => (k.endsWith('/') ? f.startsWith(k) : f === k));
for (const wf of git('ls-tree', '-r', '--name-only', base, '--', '.github/workflows').split('\n').filter(Boolean)) {
  const text = show(base, wf) || '';
  for (const m of text.matchAll(/scripts\/[A-Za-z0-9_./-]+/g)) {
    if (!keep(m[0]) && show(targetSha, m[0]) === null) warnings.push(`Workflow ${wf} używa ${m[0]}, którego nie ma w wersji ${target} — CI może wymagać poprawki.`);
  }
}

console.log(`\n=== Przywrócenie kodu ${target} jako ${newVersion} ===`);
for (const n of notes) console.log(`• ${n}`);
for (const w of warnings) console.log(`⚠ ${w}`);
for (const p of problems) console.log(`✖ ${p}`);
if (problems.length) { console.log('\nNO-GO — przywrócenie tej wersji jest niebezpieczne.'); process.exit(1); }
if (!apply) { console.log('\nAnaliza OK. Uruchom z --apply, aby przygotować lokalną gałąź wydania.'); process.exit(0); }

// 5. Lokalna gałąź release/v<nowa>: kod aplikacji z wersji docelowej + proces wydania z main.
const status = git('status', '--porcelain');
if (status) { console.error('Katalog roboczy nie jest czysty — przerwano.'); process.exit(2); }
const branch = `release/v${newVersion}`;
git('checkout', '-B', branch, base);
const targetAll = new Set(git('ls-tree', '-r', '--name-only', targetSha).split('\n').filter(Boolean));
const baseAll = git('ls-tree', '-r', '--name-only', base).split('\n').filter(Boolean);
const restore = [...targetAll].filter((f) => !keep(f));
for (let i = 0; i < restore.length; i += 200) git('checkout', targetSha, '--', ...restore.slice(i, i + 200));
const removed = baseAll.filter((f) => !keep(f) && !targetAll.has(f));
for (let i = 0; i < removed.length; i += 200) git('rm', '-q', '--', ...removed.slice(i, i + 200));
execFileSync(process.execPath, ['version-bump.cjs', newVersion], { cwd: root, stdio: 'inherit' });

const reason = arg('--reason') || 'przywrócenie działającej wersji po błędzie w nowszym wydaniu';
const changelogPath = path.join(root, 'CHANGELOG.md');
fs.writeFileSync(changelogPath, fs.readFileSync(changelogPath, 'utf8').replace(`- uzupełnij opis zmian dla wersji ${newVersion}`,
  `- Przywrócenie kodu aplikacji z wersji ${target} (${reason}). Baza danych bez zmian; numer wersji rośnie, telefony przeładują się normalnie.`));
const readmePath = path.join(root, 'README.md');
fs.writeFileSync(readmePath, fs.readFileSync(readmePath, 'utf8').replace('uzupełnij opis ostatniej poprawki po zakończeniu zmian.',
  `przywrócenie kodu aplikacji z wersji ${target} (${reason}).`));
const gatePath = path.join(root, 'RELEASE-GATE.json');
const gate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
gate.version = newVersion; gate.release_branch = branch;
if (gate.main_protection) gate.main_protection.source_branch = branch;
gate.baseline_diagnostics = { ...(gate.baseline_diagnostics || {}), notes: `Przywrócenie kodu ${target} (${targetSha.slice(0, 7)}): ${reason}.` };
fs.writeFileSync(gatePath, `${JSON.stringify(gate, null, 2)}\n`);
git('add', '-A');
console.log(`\nGotowe: lokalna gałąź ${branch} (kod ${target}, wersja ${newVersion}). Dalej: przegląd diffu, push, PR, pełne CI.`);
