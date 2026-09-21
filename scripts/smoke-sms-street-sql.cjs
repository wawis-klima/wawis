const fs = require('fs');
const path = require('path');
const { readSql } = require('./sql-paths.cjs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, '..');
const files = [
  'devices-module-stage-1.sql',
  'devices-module-stage-2-status.sql',
  'devices-module-stage-3-sync.sql',
  'devices-module-stage-4-service-reminders.sql',
];

for (const file of files) {
  const source = readSql(root, file);
  assert(/returns table \([\s\S]*contractor_street text/i.test(source), `${file} nie zwraca contractor_street w definicji funkcji urządzeń.`);
  assert(/coalesce\(c\.street, ''\) as contractor_street/i.test(source), `${file} nie mapuje contractor_street z tabeli contractors.`);
}

console.log('SMS street SQL smoke OK');
process.exit(0);
