import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const migrationPath = path.join(root, 'supabase', 'migrations', '20260917190500_security_hardening_v1090.sql');
const source = fs.readFileSync(migrationPath, 'utf8');

function normalized(sql) {
  return String(sql)
    .replace(/--.*$/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const searchPathFunctions = [
  'public.touch_devices_updated_at()',
  'public.touch_push_subscriptions_updated_at()',
  'public.guard_job_sms_runtime_columns()',
  'public.touch_services_updated_at()',
  'public.set_contractors_updated_at()',
  'public.enforce_contractors_no_duplicates()',
  'public.normalize_contractors_email(text)',
  'public.normalize_contractors_phone(text)',
  'public.normalize_contractors_nip(text)',
  'public.enforce_contractors_contact_duplicates()',
  'public.enforce_jobs_use_existing_contractor()',
  'public.touch_contractors_updated_at()',
  'public.calculate_service_due_date(date)',
  'public.set_job_service_due_date()',
  'public.normalize_contractors_text(text)',
];

function validate(sql) {
  const text = normalized(sql);
  const required = [
    'revoke execute on function public.admin_list_deleted_jobs() from public, anon;',
    'revoke execute on function public.job_file_can_be_deleted(text, text) from public, anon;',
    'grant execute on function public.admin_list_deleted_jobs() to authenticated, service_role;',
    'grant execute on function public.job_file_can_be_deleted(text, text) to authenticated, service_role;',
    "alter function public.admin_list_deleted_jobs() set search_path = '';",
    "alter function public.job_file_can_be_deleted(text, text) set search_path = '';",
    'alter function public.storage_object_job_id(text) security invoker;',
    "alter function public.storage_object_job_id(text) set search_path = '';",
  ];

  for (const statement of required) {
    assert.ok(text.includes(statement), `Brak wymaganego hardeningu: ${statement}`);
  }

  for (const signature of searchPathFunctions) {
    const statement = `alter function ${signature} set search_path = '';`;
    assert.ok(text.includes(statement), `Brak przypiętego search_path: ${signature}`);
  }

  assert.doesNotMatch(text, /grant execute on function\s+public\.(?:admin_list_deleted_jobs|job_file_can_be_deleted)[^;]*\bto\s+[^;]*\banon\b/,
    'Anon nie może odzyskać EXECUTE na uprzywilejowanych RPC.');
}

validate(source);

// Mutation controls: each deliberately reintroduces one audited weakness and must be rejected.
const mutations = [
  source.replace('revoke execute on function public.admin_list_deleted_jobs() from public, anon;', '-- removed by mutation'),
  source.replace('revoke execute on function public.job_file_can_be_deleted(text, text) from public, anon;', '-- removed by mutation'),
  source.replace('alter function public.storage_object_job_id(text) security invoker;', 'alter function public.storage_object_job_id(text) security definer;'),
  source.replace("alter function public.touch_devices_updated_at() set search_path = '';", '-- removed by mutation'),
];

for (const [index, mutation] of mutations.entries()) {
  assert.throws(() => validate(mutation), undefined, `Mutation ${index + 1} nie została wykryta`);
}

console.log(`PASS v10.90 Supabase security hardening: ACL, invoker, ${searchPathFunctions.length} search_path pins, mutation controls ${mutations.length}/${mutations.length}`);
