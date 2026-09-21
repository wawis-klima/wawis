const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const notes = JSON.parse(fs.readFileSync(path.join(root, 'release-notes.json'), 'utf8'));
const appVersion = String(JSON.parse(fs.readFileSync(path.join(root, 'app-version.json'), 'utf8')).version || '').trim();

if (!notes.version || notes.version !== appVersion) {
  throw new Error(`release-notes.json=${notes.version || 'brak'}, app-version.json=${appVersion}`);
}
if (!notes.summary || !Array.isArray(notes.changes) || notes.changes.length === 0) {
  throw new Error('release-notes.json wymaga summary i changes[]');
}

const version = notes.version;
const summary = String(notes.summary).trim();
const bullets = notes.changes.map((item) => `- ${String(item).trim()}`).join('\n');

const readmePath = path.join(root, 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');
readme = readme.replace(/## Aktualna wersja\s*\r?\n-\s*[0-9]+\.[0-9]{2}/m, `## Aktualna wersja\n- ${version}`);
readme = readme.replace(/^# Wawis Klimatyzacja — wersja\s+[0-9]+\.[0-9]{2}/m, `# Wawis Klimatyzacja — wersja ${version}`);
const lastFixLine = `## Ostatnia poprawka\n- wersja \`${version}\` — ${summary}`;
if (/## Ostatnia poprawka\s*\r?\n- wersja\s*`?[0-9]+\.[0-9]{2}`?.*/m.test(readme)) {
  readme = readme.replace(/## Ostatnia poprawka\s*\r?\n- wersja\s*`?[0-9]+\.[0-9]{2}`?.*/m, lastFixLine);
} else {
  readme = readme.replace(/(## Aktualna wersja\s*\r?\n-\s*[0-9]+\.[0-9]{2}\s*)/m, `$1\n\n${lastFixLine}\n`);
}
fs.writeFileSync(readmePath, readme.endsWith('\n') ? readme : `${readme}\n`);

const changelogPath = path.join(root, 'CHANGELOG.md');
let changelog = fs.readFileSync(changelogPath, 'utf8');
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const section = `## ${version}\n${bullets}\n`;
const sectionRegex = new RegExp(`^## ${escaped}\\r?\\n[\\s\\S]*?(?=^##\\s|$(?![\\s\\S]))`, 'm');
if (sectionRegex.test(changelog)) {
  changelog = changelog.replace(sectionRegex, `${section}\n`);
} else {
  changelog = `${section}\n${changelog.replace(/^\s+/, '')}`;
}
fs.writeFileSync(changelogPath, changelog.endsWith('\n') ? changelog : `${changelog}\n`);

console.log(`WAWIS release docs updated for ${version}`);
