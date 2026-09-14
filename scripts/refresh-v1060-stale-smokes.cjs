const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);

function updateWorkerSmoke() {
  const file = 'scripts/smoke-mobile-worker-add-client-v919.cjs';
  let source = read(file);
  if (!source.includes("const runtimeCss = read('src','mobile791','v1048-runtime-fix.css');")) {
    source = source.replace(
      "const jobsPanel = read('src','mobile791','components','JobsPanel.jsx');",
      "const jobsPanel = read('src','mobile791','components','JobsPanel.jsx');\nconst runtimeCss = read('src','mobile791','v1048-runtime-fix.css');",
    );
  }
  source = source.replace(
    "assert.ok(jobsPanel.includes('.wawisOneLineToolbar{display:flex !important;'), 'Nagłówek mobile nie jest jednym elastycznym wierszem.');\nassert.ok(jobsPanel.includes('flex-wrap:nowrap !important;'), 'Nagłówek mobile może zawijać elementy do drugiego wiersza.');",
    "assert.match(runtimeCss, /wawisOneLineToolbar\\{[\\s\\S]*?display:flex!important;[\\s\\S]*?flex-wrap:nowrap!important;/, 'Nagłówek mobile nie jest jednym elastycznym wierszem.');",
  );
  source = source.replace(
    "assert.ok(modal.includes('{isAdmin ? (\\n          <div className=\"jobFormAdminFields\"'), 'Pola administracyjne nie są ukryte przed pracownikiem.');",
    "assert.ok(modal.includes('{isAdmin && editingJobId ? (') && modal.includes('jobFormAdminFields'), 'Pola administracyjne nie są ukryte przed pracownikiem.');",
  );
  write(file, source);
}

function updateAdminHeaderSmoke() {
  const file = 'scripts/smoke-mobile-admin-header-v915.cjs';
  let source = read(file);
  if (!source.includes("const runtimeCss = read('src', 'mobile791', 'v1048-runtime-fix.css');")) {
    source = source.replace(
      "const jobsPanel = read('src', 'mobile791', 'components', 'JobsPanel.jsx');",
      "const jobsPanel = read('src', 'mobile791', 'components', 'JobsPanel.jsx');\nconst runtimeCss = read('src', 'mobile791', 'v1048-runtime-fix.css');",
    );
  }
  source = source.replace(
    "assert.match(jobsPanel, /wawisOneLineToolbar\\{display:flex !important;[^}]*flex-wrap:nowrap !important;/, 'Mobile toolbar must stay in one flex row.');\nassert.match(jobsPanel, /wawisOneLinePushSlot,[\\s\\S]*?width:54px !important;/, 'Compact PUSH width is missing.');\nassert.match(jobsPanel, /wawisUserInitialsBadge/, 'Initials badge styling is missing.');",
    "assert.match(runtimeCss, /wawisOneLineToolbar\\{[\\s\\S]*?display:flex!important;[\\s\\S]*?flex-wrap:nowrap!important;/, 'Mobile toolbar must stay in one flex row.');\nassert.match(runtimeCss, /wawisOneLinePushSlot,[\\s\\S]*?width:54px!important;/, 'Compact PUSH width is missing.');\nassert.match(runtimeCss, /wawisUserInitialsBadge/, 'Initials badge styling is missing.');",
  );
  write(file, source);
}

function updateAuthRefreshSmoke() {
  const file = 'scripts/smoke-auth-refresh.cjs';
  let source = read(file);
  source = source.replace(
    'assert.match(moduleSwitcherSource, /!\\["sms", "contractors"\\]\\.includes\\(module\\.id\\) \\|\\| isAdmin/);',
    'assert.match(moduleSwitcherSource, /isAdmin \\? true : \\["jobs", "fuel"\\]\\.includes\\(module\\.id\\)/);',
  );
  write(file, source);
}

updateWorkerSmoke();
updateAdminHeaderSmoke();
updateAuthRefreshSmoke();
console.log('Refreshed stale mobile toolbar, admin-field and module-switcher smoke checks.');
