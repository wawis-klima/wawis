const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getReleaseGroups } = require('./test-groups.cjs');

const root = path.resolve(__dirname, '..');

const DOC_ONLY = new Set([
  'README.md',
  'CHANGELOG.md',
  'release-notes.json',
  'RELEASE-GATE.json',
  'RELEASE-RESULT.md',
]);

const GENERATED_VERSION_FILES = new Set([
  'app-version.json',
  'public/app-version.json',
  'package.json',
  'package-lock.json',
  'src/version.js',
  'src/mobile791/version.js',
  'public/push-sw.js',
]);

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function normalizeJsonVersionOnly(file, source) {
  const json = JSON.parse(source);
  if (file === 'app-version.json' || file === 'public/app-version.json') {
    delete json.version;
  }
  if (file === 'package.json') {
    delete json.version;
  }
  if (file === 'package-lock.json') {
    delete json.version;
    if (json.packages?.['']) delete json.packages[''].version;
  }
  return JSON.stringify(json);
}

function normalizeGeneratedFile(file, source) {
  if (file === 'app-version.json' || file === 'public/app-version.json' || file === 'package.json' || file === 'package-lock.json') {
    return normalizeJsonVersionOnly(file, source);
  }
  if (file === 'src/version.js' || file === 'src/mobile791/version.js') {
    return source.replace(/APP_VERSION\s*=\s*['"][0-9]+\.[0-9]{2}['"]/g, 'APP_VERSION="<VERSION>"');
  }
  if (file === 'public/push-sw.js') {
    return source.replace(/wawis-app-shell-v[0-9]+\.[0-9]{2}/g, 'wawis-app-shell-v<VERSION>');
  }
  return source;
}

function readBaseFile(baseRef, file) {
  try {
    return git(['show', `${baseRef}:${file}`]);
  } catch {
    return null;
  }
}

function readCurrentFile(file) {
  try {
    return fs.readFileSync(path.join(root, file), 'utf8').trimEnd();
  } catch {
    return null;
  }
}

function isGeneratedOnlyChange(baseRef, file) {
  if (DOC_ONLY.has(file)) return true;
  if (!GENERATED_VERSION_FILES.has(file)) return false;
  const before = readBaseFile(baseRef, file);
  const after = readCurrentFile(file);
  if (before == null || after == null) return false;
  try {
    return normalizeGeneratedFile(file, before) === normalizeGeneratedFile(file, after);
  } catch {
    return false;
  }
}

function isPresentationOnly(file) {
  const lower = file.toLowerCase();
  return /\.(css|scss|less)$/.test(lower)
    || (/\.(png|jpe?g|webp|gif|svg)$/.test(lower) && /^(src\/assets\/|public\/)/.test(lower));
}

function isCriticalPath(file) {
  const lower = file.toLowerCase();
  if (/^(\.github\/|scripts\/|supabase\/|api\/)/.test(lower)) return true;
  if (/^(package(?:-lock)?\.json|vercel\.json|vite\.config\.|version-bump\.cjs|public\/push-sw\.js)/.test(lower)) return true;
  if (/(auth|session|permission|security|rls|grant|service_role|storage|backup|realtime|push|notification)/.test(lower)) return true;
  if (/^src\/(lib|hooks)\//.test(lower) && /(supabase|session|auth|realtime|push)/.test(lower)) return true;
  return false;
}

function detectPlatforms(files) {
  const platforms = new Set();
  for (const file of files) {
    const lower = file.toLowerCase();
    if (lower.startsWith('src/mobile791/') || lower.includes('mobile') || lower.includes('iphone')) platforms.add('mobile');
    if (lower === 'src/styles.css' || lower === 'src/app.css' || lower === 'src/app.jsx') {
      platforms.add('mobile');
      platforms.add('desktop');
      continue;
    }
    if (lower.startsWith('src/components/') || lower.startsWith('src/modules/') || lower.includes('desktop')) {
      if (!lower.startsWith('src/mobile791/')) platforms.add('desktop');
    }
  }
  if (!platforms.size) {
    platforms.add('mobile');
    platforms.add('desktop');
  }
  return [...platforms];
}

function selectDomainGroups(files) {
  const selected = new Set(['core']);
  const add = (...groups) => groups.forEach((group) => selected.add(group));

  for (const file of files) {
    const lower = file.toLowerCase();
    if (/^(scripts\/|\.github\/|package(?:-lock)?\.json$|vercel\.json$|version-bump\.cjs$|release-)/.test(lower)) add('infra');
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

  return [...selected];
}

function scopeFromPlatforms(platforms) {
  const mobile = platforms.includes('mobile');
  const desktop = platforms.includes('desktop');
  if (mobile && desktop) return 'full';
  return mobile ? 'mobile' : 'desktop';
}

function classifyEffectiveFiles(effectiveFiles) {
  const platforms = detectPlatforms(effectiveFiles);
  const scope = scopeFromPlatforms(platforms);

  if (effectiveFiles.length === 0) {
    return {
      profile: 'fast-ui',
      reason: 'W diffie są wyłącznie automatyczne pliki wersji lub dokumentacja wydania.',
      groups: ['ui-fast-core'],
      platforms,
      scope,
      e2e: [],
      needs_playwright: false,
    };
  }

  if (effectiveFiles.some(isCriticalPath)) {
    return {
      profile: 'critical',
      reason: 'Zmiana dotyka infrastruktury, backendu, bezpieczeństwa, synchronizacji albo konfiguracji wydania.',
      groups: getReleaseGroups('full'),
      platforms: ['mobile', 'desktop'],
      scope: 'full',
      e2e: ['mobile', 'desktop'],
      needs_playwright: true,
    };
  }

  if (effectiveFiles.every(isPresentationOnly)) {
    const groups = ['ui-fast-core'];
    if (platforms.includes('mobile')) groups.push('ui-fast-mobile');
    if (platforms.includes('desktop')) groups.push('ui-fast-desktop');
    return {
      profile: 'fast-ui',
      reason: 'Zmiana obejmuje wyłącznie warstwę prezentacji (CSS lub statyczne assety).',
      groups,
      platforms,
      scope,
      e2e: [],
      needs_playwright: false,
    };
  }

  const groups = selectDomainGroups(effectiveFiles);
  for (const platform of platforms) {
    if (!groups.includes(platform)) groups.push(platform);
  }
  return {
    profile: 'targeted',
    reason: 'Zmiana funkcjonalna frontendu bez plików krytycznych — uruchamiane są tylko powiązane regresje i właściwe E2E.',
    groups,
    platforms,
    scope,
    e2e: [...platforms],
    needs_playwright: platforms.length > 0,
  };
}

function getChangedFiles(baseRef) {
  const output = git(['diff', '--name-only', `${baseRef}...HEAD`]);
  return output ? output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean) : [];
}

function classifyRelease({ baseRef = 'origin/main', changedFiles = null } = {}) {
  const files = changedFiles || getChangedFiles(baseRef);
  const generatedOnlyFiles = [];
  const effectiveFiles = [];

  for (const file of files) {
    if (isGeneratedOnlyChange(baseRef, file)) generatedOnlyFiles.push(file);
    else effectiveFiles.push(file);
  }

  return {
    schema_version: 1,
    base_ref: baseRef,
    changed_files: files,
    generated_only_files: generatedOnlyFiles,
    effective_files: effectiveFiles,
    ...classifyEffectiveFiles(effectiveFiles),
  };
}

function parseArgs(args = process.argv.slice(2)) {
  const value = (name, fallback = '') => {
    const index = args.indexOf(name);
    return index >= 0 ? String(args[index + 1] || fallback) : fallback;
  };
  return {
    baseRef: value('--base-ref', process.env.WAWIS_RELEASE_BASE_REF || 'origin/main'),
    jsonPath: value('--json', ''),
    githubOutput: value('--github-output', process.env.GITHUB_OUTPUT || ''),
  };
}

function writeGithubOutput(file, impact) {
  if (!file) return;
  const lines = [
    `profile=${impact.profile}`,
    `scope=${impact.scope}`,
    `needs_playwright=${impact.needs_playwright ? 'true' : 'false'}`,
    `platforms=${impact.platforms.join(',')}`,
    `groups=${impact.groups.join(',')}`,
  ];
  fs.appendFileSync(file, `${lines.join('\n')}\n`);
}

if (require.main === module) {
  const options = parseArgs();
  const impact = classifyRelease(options);
  if (options.jsonPath) fs.writeFileSync(options.jsonPath, `${JSON.stringify(impact, null, 2)}\n`);
  writeGithubOutput(options.githubOutput, impact);
  console.log(`WAWIS release impact: ${impact.profile} / ${impact.scope}`);
  console.log(`Powód: ${impact.reason}`);
  console.log(`Zmiany istotne: ${impact.effective_files.length}; pliki wersji/dokumentacji: ${impact.generated_only_files.length}`);
  console.log(`Grupy: ${impact.groups.join(', ')}`);
  console.log(`E2E: ${impact.e2e.length ? impact.e2e.join(', ') : 'pominięte'}`);
}

module.exports = {
  classifyRelease,
  classifyEffectiveFiles,
  detectPlatforms,
  isCriticalPath,
  isPresentationOnly,
  selectDomainGroups,
};
