import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const appVersion = String(JSON.parse(fs.readFileSync(path.join(root, 'app-version.json'), 'utf8')).version || '').trim();

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function normalizeBaseUrl(value) {
  return required(value, 'Brak produkcyjnego URL (--url lub WAWIS_PRODUCTION_URL)').replace(/\/+$/, '');
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

async function fetchText(url, init = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'follow',
    ...init,
    headers: {
      'cache-control': 'no-cache',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

async function loadDiagnostics({ deploymentStart }) {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  required(supabaseUrl, 'Brak sekretu SUPABASE_URL do automatycznej diagnostyki post-deploy');
  required(serviceKey, 'Brak sekretu SUPABASE_SERVICE_ROLE_KEY do automatycznej diagnostyki post-deploy');

  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const query = new URLSearchParams({
    select: 'severity,received_at,event_type,diagnostic_module,app_version,platform',
    received_at: `gte.${since24}`,
    order: 'received_at.desc',
    limit: '1000',
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/app_diagnostic_events?${query.toString()}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Supabase diagnostics HTTP ${response.status}: ${await response.text()}`);

  const rows = await response.json();
  const problematic = (row) => ['warning', 'warn', 'error', 'fatal'].includes(String(row?.severity || '').toLowerCase());
  const deploymentMs = Date.parse(deploymentStart);
  const sinceDeploy = rows.filter((row) => Date.parse(row.received_at) >= deploymentMs);
  const last24Problematic = rows.filter(problematic);
  const sinceDeployProblematic = sinceDeploy.filter(problematic);

  return {
    checked: true,
    checked_at: new Date().toISOString(),
    last_24h: true,
    result: sinceDeployProblematic.length === 0 ? 'GO' : 'NO-GO',
    problematic_count: sinceDeployProblematic.length,
    last_24h_total_count: rows.length,
    last_24h_problematic_count: last24Problematic.length,
    since_deploy_total_count: sinceDeploy.length,
    since_deploy_problematic_count: sinceDeployProblematic.length,
    deployment_started_at: deploymentStart,
  };
}

async function main() {
  const productionUrl = normalizeBaseUrl(argValue('--url') || process.env.WAWIS_PRODUCTION_URL);
  const deploymentStart = required(
    argValue('--deployment-start') || process.env.WAWIS_DEPLOYMENT_STARTED_AT,
    'Brak czasu wdrożenia (--deployment-start lub WAWIS_DEPLOYMENT_STARTED_AT)'
  );
  if (Number.isNaN(Date.parse(deploymentStart))) throw new Error(`Nieprawidłowy czas wdrożenia: ${deploymentStart}`);

  const [versionText, serviceWorkerText] = await Promise.all([
    fetchText(`${productionUrl}/app-version.json?release_check=${Date.now()}`),
    fetchText(`${productionUrl}/push-sw.js?release_check=${Date.now()}`),
  ]);

  const productionVersion = String(JSON.parse(versionText).version || '').trim();
  const expectedCache = `wawis-app-shell-v${appVersion}`;
  const versionVerified = productionVersion === appVersion;
  const serviceWorkerVerified = serviceWorkerText.includes(expectedCache);

  if (!versionVerified) throw new Error(`Produkcja ma wersję ${productionVersion || 'brak'}, oczekiwano ${appVersion}`);
  if (!serviceWorkerVerified) throw new Error(`Produkcja nie zawiera cache ${expectedCache}`);

  const diagnostics = await loadDiagnostics({ deploymentStart });
  if (diagnostics.result !== 'GO') {
    throw new Error(`Diagnostyka po wdrożeniu: ${diagnostics.since_deploy_problematic_count} nowych problemów`);
  }

  const evidence = {
    schema_version: 1,
    version: appVersion,
    checked_at: new Date().toISOString(),
    production_url: productionUrl,
    production: {
      version_verified: versionVerified,
      service_worker_verified: serviceWorkerVerified,
      app_version: productionVersion,
      service_worker_cache: expectedCache,
      app_version_sha256: hash(versionText),
      service_worker_sha256: hash(serviceWorkerText),
    },
    diagnostics,
  };

  const output = path.join(root, 'post-deploy-evidence.json');
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`WAWIS POST-DEPLOY GO — ${appVersion}`);
  console.log(`Evidence: ${output}`);
}

main().catch((error) => {
  console.error(`WAWIS POST-DEPLOY NO-GO — ${error.message}`);
  process.exit(1);
});
