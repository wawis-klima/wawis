const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { resolveSqlPath } = require('./sql-paths.cjs');

// Smoke guard: every create table in public SQL must have GRANT and enable row level security.
// Normal SQL files are fail-closed per file. The deterministic supabase/rebuild bundle may
// split CREATE TABLE, RLS and ACL into ordered stages, so its coverage is validated across
// the whole rebuild bundle instead of weakening the requirement.

const root = path.resolve(__dirname, '..');

const excludedDirs = new Set([
  '.git',
  '.vercel',
  'dist',
  'node_modules',
  'releases',
  'logs',
  'logs735',
  'logs738',
  'logs742',
  'playwright-report',
  'test-results',
]);

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    const relative = toPosix(path.relative(root, absolute));
    if (entry.isDirectory()) {
      if (excludedDirs.has(entry.name) || relative === 'supabase/.temp' || relative.startsWith('supabase/.temp/')) continue;
      if (/^logs/i.test(entry.name)) continue;
      walk(absolute, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.sql')) out.push(absolute);
  }
  return out;
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*--.*$/gm, ' ');
}

function parseTableName(rawName) {
  const clean = rawName.replace(/"/g, '').trim();
  const parts = clean.split('.').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 1) return { schema: 'public', name: parts[0] };
  return { schema: parts[0], name: parts[1] };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasGrant(sql, schema, table) {
  const schemaTable = `${escapeRegExp(schema)}\\s*\\.\\s*${escapeRegExp(table)}`;
  const bareTable = escapeRegExp(table);
  const tablePattern = schema === 'public' ? `(?:${schemaTable}|${bareTable})` : schemaTable;
  const grantPattern = new RegExp(
    `\\bgrant\\b[\\s\\S]*?\\bon\\s+(?:table\\s+)?(?:[^;]*?,\\s*)?${tablePattern}(?:\\s*,[^;]*)?\\s+to\\s+[^;]*(?:authenticated|service_role|anon)`,
    'i'
  );
  return grantPattern.test(sql);
}

function hasRls(sql, schema, table) {
  const schemaTable = `${escapeRegExp(schema)}\\s*\\.\\s*${escapeRegExp(table)}`;
  const bareTable = escapeRegExp(table);
  const tablePattern = schema === 'public' ? `(?:${schemaTable}|${bareTable})` : schemaTable;
  const rlsPattern = new RegExp(
    `\\balter\\s+table\\s+${tablePattern}\\s+enable\\s+row\\s+level\\s+security\\b`,
    'i'
  );
  return rlsPattern.test(sql);
}

function isRebuildFile(file) {
  const relative = toPosix(path.relative(root, file));
  return relative === 'supabase/rebuild' || relative.startsWith('supabase/rebuild/');
}

function hasRebuildGlobalPublicRls(sql) {
  // The N7 rebuild baseline iterates every ordinary/partitioned public table and executes
  // ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY. Require all key clauses so an
  // unrelated dynamic ALTER cannot satisfy this guard accidentally.
  return /for\s+\w+\s+in\s+select[\s\S]*?pg_class[\s\S]*?pg_namespace[\s\S]*?nspname\s*=\s*'public'[\s\S]*?relkind\s+in\s*\([^)]*'r'[^)]*'p'[^)]*\)[\s\S]*?execute\s+format\s*\(\s*'alter\s+table\s+public\.%I\s+enable\s+row\s+level\s+security'/i.test(sql);
}

function hasRebuildGlobalServiceRoleGrant(sql) {
  // A rebuild bundle may intentionally reset all table ACLs and then grant service_role
  // globally before adding narrower authenticated grants. service_role is an API role and
  // this is explicit ACL coverage for every public table created earlier in the bundle.
  return /\bgrant\s+all\s+privileges\s+on\s+all\s+tables\s+in\s+schema\s+public\s+to\s+service_role\b/i.test(sql);
}

const sqlFiles = walk(root).sort();
const rebuildFiles = sqlFiles.filter(isRebuildFile);
const rebuildSql = stripSqlComments(rebuildFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n\n'));
const rebuildHasGlobalRls = hasRebuildGlobalPublicRls(rebuildSql);
const rebuildHasGlobalServiceRoleGrant = hasRebuildGlobalServiceRoleGrant(rebuildSql);

const failures = [];
let checkedTables = 0;
let checkedRebuildTables = 0;

for (const file of sqlFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const sql = stripSqlComments(source);
  const validationSql = isRebuildFile(file) ? rebuildSql : sql;
  const createTableRegex = /\bcreate\s+(?:temporary\s+|temp\s+|unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?((?:"?[a-zA-Z_][\w$]*"?\s*\.\s*)?"?[a-zA-Z_][\w$]*"?)\s*\(/gi;
  let match;
  while ((match = createTableRegex.exec(sql)) !== null) {
    const { schema, name } = parseTableName(match[1]);
    if (schema !== 'public') continue;
    checkedTables += 1;
    if (isRebuildFile(file)) checkedRebuildTables += 1;

    const grantCovered = hasGrant(validationSql, schema, name)
      || (isRebuildFile(file) && rebuildHasGlobalServiceRoleGrant);
    const rlsCovered = hasRls(validationSql, schema, name)
      || (isRebuildFile(file) && rebuildHasGlobalRls);

    if (!grantCovered) {
      const scope = isRebuildFile(file) ? ' w całym pakiecie supabase/rebuild' : '';
      failures.push(`${toPosix(path.relative(root, file))}: public.${name} nie ma jawnego GRANT dla roli API${scope}`);
    }
    if (!rlsCovered) {
      const scope = isRebuildFile(file) ? ' w całym pakiecie supabase/rebuild' : '';
      failures.push(`${toPosix(path.relative(root, file))}: public.${name} nie ma alter table ... enable row level security${scope}`);
    }
  }
}

assert(checkedTables > 0, 'Nie znaleziono żadnych CREATE TABLE w plikach SQL — smoke GRANT nie ma czego sprawdzać.');
if (checkedRebuildTables > 0) {
  assert(rebuildHasGlobalRls || rebuildFiles.some((file) => /enable\s+row\s+level\s+security/i.test(stripSqlComments(fs.readFileSync(file, 'utf8')))), 'Rebuild tworzy public tables, ale pakiet nie zawiera mechanizmu RLS.');
  assert(rebuildHasGlobalServiceRoleGrant || rebuildFiles.some((file) => /\bgrant\b/i.test(stripSqlComments(fs.readFileSync(file, 'utf8')))), 'Rebuild tworzy public tables, ale pakiet nie zawiera jawnych GRANT-ów.');
}
assert.strictEqual(failures.length, 0, `Braki w jawnych GRANT/RLS dla tabel Supabase:\n- ${failures.join('\n- ')}`);

const auditPath = resolveSqlPath(root, 'supabase-grants-audit-wawis.sql');
assert(fs.existsSync(auditPath), 'Brak pliku supabase-grants-audit-wawis.sql z audytem GRANT dla produkcyjnej bazy.');
const audit = fs.readFileSync(auditPath, 'utf8');
assert(audit.includes('information_schema.role_table_grants'), 'Audyt GRANT nie sprawdza information_schema.role_table_grants.');
assert(audit.includes('WZORZEC DLA KAŻDEJ NOWEJ TABELI'), 'Audyt GRANT nie zawiera wzorca dla nowych tabel.');

console.log(`Smoke OK: jawne GRANT i RLS sprawdzone dla ${checkedTables} public table creation(s) w plikach SQL (${checkedRebuildTables} w rebuild bundle)`);
