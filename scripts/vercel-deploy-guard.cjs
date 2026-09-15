const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
}

function validateVercelDeploy(env = process.env, config = loadConfig()) {
  const rules = config?.git?.deploymentEnabled || {};

  assert(rules['*'] === false, 'NO-GO: Vercel nie blokuje zwykłych gałęzi roboczych');
  assert(rules['**/*'] === false, 'NO-GO: Vercel nie blokuje gałęzi z ukośnikiem');
  assert(rules.main === true, 'NO-GO: Vercel nie zezwala jawnie na main');

  if (String(env.VERCEL || '') !== '1') {
    return { skipped: true, reason: 'Poza środowiskiem Vercel' };
  }

  assert(String(env.VERCEL_ENV || '') === 'production', `NO-GO: Vercel build nie jest production (${env.VERCEL_ENV || 'brak'})`);
  assert(String(env.VERCEL_GIT_COMMIT_REF || '') === 'main', `NO-GO: Vercel build nie pochodzi z main (${env.VERCEL_GIT_COMMIT_REF || 'brak'})`);

  return { skipped: false, branch: 'main', environment: 'production' };
}

if (require.main === module) {
  try {
    const result = validateVercelDeploy();
    if (result.skipped) console.log(`WAWIS VERCEL DEPLOY GUARD: SKIP — ${result.reason}`);
    else console.log('WAWIS VERCEL DEPLOY GUARD: GO — production/main');
  } catch (error) {
    console.error(`WAWIS VERCEL DEPLOY GUARD: NO-GO — ${error.message}`);
    process.exit(1);
  }
}

module.exports = { validateVercelDeploy };
