const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { readSql } = require('./sql-paths.cjs');

const root = path.resolve(__dirname, '..');
const migrationSource = readSql(root, 'dashboard-metrics-v8.07.sql');
const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'src/components/dashboard/Centrum360Panel.jsx'), 'utf8');
const metricsSource = fs.readFileSync(path.join(root, 'src/modules/dashboard-metrics.js'), 'utf8');
const smsQueueMetricMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20261005123000_sms_dashboard_queue_count_v1245.sql'), 'utf8');

assert(migrationSource.includes('create or replace function public.admin_get_dashboard_metrics()'), 'Brak RPC admin_get_dashboard_metrics');
assert(migrationSource.includes('grant execute on function public.admin_get_dashboard_metrics()'), 'Brak jawnego GRANT dla admin_get_dashboard_metrics');
for (const key of ['jobs_today', 'jobs_current_week', 'sms_due_today', 'devices_without_date', 'contractors_count', 'clients_without_phone', 'jobs_without_installer', 'sms_errors']) {
  assert(migrationSource.includes(key), `RPC nie zwraca ${key}`);
}
assert(appSource.includes('loadDashboardMetrics'), 'App.jsx nie pobiera centralnych liczników');
assert(appSource.includes('dashboardMetrics?.smsDueToday ?? fallbackSmsDueTodayCount'), 'App.jsx nie ma lekkiego fallbacku licznika SMS');
assert(dashboardSource.includes('metrics = null'), 'Centrum360Panel nie przyjmuje metrics');
assert(dashboardSource.includes('dashboardCounts'), 'Centrum360Panel nie używa dashboardCounts');
assert(metricsSource.includes("supabase.rpc('admin_get_dashboard_metrics')"), 'dashboard-metrics.js nie wywołuje RPC');
assert(smsQueueMetricMigration.includes('private.sms_actionable_queue_count'), 'Brak wspólnego lekkiego licznika aktywnej kolejki SMS.');
assert(smsQueueMetricMigration.includes('private.service_sms_due_date'), 'Licznik Centrum 360 musi używać tej samej kalendarzowej funkcji terminów co wysyłka.');
assert(smsQueueMetricMigration.includes('private.normalize_sms_phone'), 'Licznik Centrum 360 musi używać serwerowej walidacji telefonu.');
assert(smsQueueMetricMigration.includes("l.reminder_group_primary is true"), 'Miękkie statusy końcowe muszą blokować trwałą grupę tylko jako primary.');
assert(smsQueueMetricMigration.includes("v_sms_due_today := private.sms_actionable_queue_count()"), 'Dashboard musi korzystać z jednego lekkiego licznika kolejki SMS.');

console.log('Smoke OK: centralne liczniki Centrum 360 przez RPC');

assert(migrationSource.includes("date_trunc('week'"), 'RPC musi liczyć bieżący tydzień od poniedziałku');
assert(migrationSource.includes('jobs_current_week'), 'RPC musi zwracać jobs_current_week');
