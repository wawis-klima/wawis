const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const sql = read('job-completion-tracking-v9.14.sql');
assert(sql.includes('completed_at timestamptz'), 'SQL 9.14 musi dodawać completed_at');
assert(sql.includes('completed_by uuid'), 'SQL 9.14 musi dodawać completed_by');
assert(sql.includes('trg_jobs_completion_metadata'), 'SQL 9.14 musi tworzyć trigger zakończenia');
assert(sql.includes("new.status = 'Zakończone'"), 'Trigger musi reagować na status Zakończone');
assert(sql.includes('new.completed_at := now()'), 'Trigger musi zapisywać rzeczywistą chwilę zakończenia');
assert(sql.includes('new.completed_by := auth.uid()'), 'Trigger musi zapisywać użytkownika kończącego zlecenie');
assert(sql.includes('new.completed_at := null'), 'Ponowne otwarcie zlecenia musi czyścić completed_at');

for (const rel of ['src/modules/jobs-fetch.js', 'src/mobile791/modules/jobs-fetch.js']) {
  const source = read(rel);
  assert(source.includes('completed_at, completed_by'), `${rel}: pobieranie jobs musi zawierać completed_at/completed_by`);
  assert(source.includes('isMissingJobCompletionColumnsError'), `${rel}: musi istnieć fallback przed wdrożeniem SQL`);
}

for (const rel of ['src/components/JobDetailsPanel.jsx', 'src/mobile791/components/JobDetailsPanel.jsx']) {
  const source = read(rel);
  assert(source.includes('<span>Zakończono</span>'), `${rel}: administrator musi widzieć pole Zakończono`);
  assert(source.includes("timeZone: 'Europe/Warsaw'"), `${rel}: czas zakończenia ma być formatowany w Europe/Warsaw`);
  assert(source.includes('isAdmin && isCompletedJob'), `${rel}: metadane zakończenia mają być widoczne tylko administratorowi`);
  assert(source.includes('{completedByLabel}'), `${rel}: widok powinien wskazywać kto zakończył`);
}

assert(read('src/components/JobDetailsPanel.jsx').includes('Przez: {completedByLabel}'), 'Desktop powinien zachować pełną etykietę wykonawcy.');
assert(!read('src/mobile791/components/JobDetailsPanel.jsx').includes('Przez: {completedByLabel}'), 'Mobile powinien pokazywać samo nazwisko wykonawcy w jednym wierszu.');

for (const rel of ['src/modules/jobs-assignment.js', 'src/mobile791/modules/jobs-assignment.js']) {
  const source = read(rel);
  assert(source.includes('export async function sendJobCompletionPush'), `${rel}: brak klienta push o zakończeniu`);
  assert(source.includes("eventType: 'job_completed'"), `${rel}: push zakończenia musi wysyłać eventType job_completed`);
}

for (const rel of ['src/hooks/useSelectedJobActions.js', 'src/mobile791/hooks/useSelectedJobActions.js']) {
  const source = read(rel);
  assert(source.includes('const completingNow = status === "Zakończone" && currentStatus !== "Zakończone"'), `${rel}: push ma iść tylko przy przejściu do Zakończone`);
  assert(source.includes('await sendCompletionPush?.({ jobId })'), `${rel}: po zakończeniu musi być wywołany push do administratora`);
  assert(source.indexOf('await updateJobStatus({ supabase, jobId, status })') < source.indexOf('await sendCompletionPush?.({ jobId })'), `${rel}: push ma zostać wysłany dopiero po zapisaniu statusu`);
}

const edge = read('supabase/functions/send-assignment-push/index.ts');
assert(edge.includes('eventType === "job_completed"'), 'Edge Function musi obsługiwać job_completed');
assert(edge.includes('.eq("role", "Administrator")'), 'Push zakończenia musi wybierać administratorów');
assert(edge.includes('String(job.status || "") !== "Zakończone"'), 'Edge Function musi weryfikować stan zlecenia po stronie serwera');
assert(edge.includes('.from("job_access")'), 'Pracownik może wysłać completion push tylko dla dostępnego zlecenia');
assert(edge.includes('deliveryType: "job_completed"'), 'Log push musi rozróżniać job_completed');
assert(edge.includes('Zlecenie zakończone'), 'Push musi mieć czytelny tytuł');
assert(edge.includes('completed_at'), 'Push musi korzystać z zapisanego czasu zakończenia');

console.log('Job completion tracking + admin push smoke OK');
