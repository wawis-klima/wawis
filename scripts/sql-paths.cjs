const fs = require('node:fs');
const path = require('node:path');

const SQL_SEARCH_DIRS = [
  '',
  path.join('supabase', 'migrations', 'current'),
  path.join('supabase', 'migrations', 'archive'),
];

function resolveSqlPath(root, fileName) {
  for (const directory of SQL_SEARCH_DIRS) {
    const candidate = path.join(root, directory, fileName);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Brak pliku SQL: ${fileName}`);
}

function readSql(root, fileName) {
  return fs.readFileSync(resolveSqlPath(root, fileName), 'utf8');
}

module.exports = { SQL_SEARCH_DIRS, resolveSqlPath, readSql };
