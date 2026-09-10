import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getJobProtocolRecipientEmail,
  isValidProtocolEmail,
  JOB_PROTOCOL_EMAIL_FUNCTION,
  JOB_PROTOCOL_EMAIL_SENDER,
  normalizeProtocolEmail,
  sendJobProtocolEmail,
} from '../src/mobile791/modules/job-protocol-email.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const edgeFunction = read('supabase', 'functions', 'send-job-protocol-email', 'index.ts');
const setupSql = read('supabase', 'setup-job-protocol-email-v9.87.sql');
const modal = read('src', 'mobile791', 'components', 'modals', 'ProtocolTestModal.jsx');
const storageModule = read('src', 'mobile791', 'modules', 'job-protocol-storage.js');

assert.equal(JOB_PROTOCOL_EMAIL_FUNCTION, 'send-job-protocol-email');
assert.equal(JOB_PROTOCOL_EMAIL_SENDER, 'biuro@wawis.pl');
assert.equal(normalizeProtocolEmail('  KLIENT@EXAMPLE.PL '), 'klient@example.pl');
assert.equal(getJobProtocolRecipientEmail({ email: ' KLIENT@EXAMPLE.PL ' }), 'klient@example.pl');
assert.equal(isValidProtocolEmail('klient@example.pl'), true);
assert.equal(isValidProtocolEmail('brak-adresu'), false);

const completedJob = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'Zakończone',
  email: ' Klient@Example.pl ',
};
const protocolRecord = { id: '22222222-2222-4222-8222-222222222222' };
let invocation = null;
const supabase = {
  functions: {
    async invoke(name, options) {
      invocation = { name, options };
      return {
        data: {
          ok: true,
          recipientEmail: 'klient@example.pl',
          senderEmail: 'biuro@wawis.pl',
          sentAt: '2026-09-01T19:00:00.000Z',
        },
        error: null,
      };
    },
  },
};

const result = await sendJobProtocolEmail({ supabase, job: completedJob, record: protocolRecord });
assert.equal(result.senderEmail, 'biuro@wawis.pl');
assert.equal(result.recipientEmail, 'klient@example.pl');
assert.equal(invocation.name, 'send-job-protocol-email');
assert.equal(invocation.options.body.jobId, completedJob.id);
assert.equal(invocation.options.body.protocolId, protocolRecord.id);
assert.equal(invocation.options.body.recipientEmail, 'klient@example.pl');
assert.match(invocation.options.body.requestKey, /^[0-9a-f-]{36}$/i);

await assert.rejects(
  sendJobProtocolEmail({ supabase, job: { ...completedJob, email: '' }, record: protocolRecord }),
  /nie ma adresu e-mail klienta/i,
);
await assert.rejects(
  sendJobProtocolEmail({ supabase, job: { ...completedJob, status: 'W trakcie' }, record: protocolRecord }),
  /dopiero po zakończeniu/i,
);

assert.match(edgeFunction, /@supabase\/supabase-js@2\.105\.4/);
assert.match(edgeFunction, /userClient\.auth\.getUser\(\)/);
assert.match(edgeFunction, /\.from\("jobs"\)[\s\S]*?\.eq\("id", jobId\)/);
assert.match(edgeFunction, /requestedRecipient !== jobRecipient/);
assert.match(edgeFunction, /wyłącznie na adres klienta zapisany w zleceniu/);
assert.match(edgeFunction, /\.from\("job_protocols"\)/);
assert.match(edgeFunction, /\.from\("job-protocols"\)[\s\S]*?\.download/);
assert.match(edgeFunction, /Deno\.env\.get\("RESEND_API_KEY"\)/);
assert.match(edgeFunction, /WAWIS Klimatyzacja <\$\{FROM_EMAIL\}>/);
assert.match(edgeFunction, /"Idempotency-Key"/);
assert.match(edgeFunction, /attachments:/);
assert.match(edgeFunction, /job_protocol_email_log/);
assert.match(edgeFunction, /RATE_LIMIT_SECONDS = 30/);

assert.match(setupSql, /create table if not exists public\.job_protocol_email_log/);
assert.match(setupSql, /alter table public\.job_protocol_email_log enable row level security/);
assert.match(setupSql, /revoke all on table public\.job_protocol_email_log from anon, authenticated/);
assert.match(setupSql, /grant select on table public\.job_protocol_email_log to authenticated/);
assert.match(setupSql, /grant select, insert, update, delete on table public\.job_protocol_email_log to service_role/);
assert.match(setupSql, /public\.current_user_can_access_job\(job_id\)/);
assert.match(setupSql, /sender_email = 'biuro@wawis\.pl'/);

assert.match(modal, /sendJobProtocolEmail/);
assert.match(modal, /Wyślij z \$\{JOB_PROTOCOL_EMAIL_SENDER\}/);
assert.match(modal, /Do: \$\{recipientEmail\}/);
assert.doesNotMatch(modal, /Wybierz aplikację Mail|Wiadomość z linkiem/);
assert.doesNotMatch(storageModule, /mailto:|createSignedUrl/);

console.log('PASS test-job-protocol-email-v987');
