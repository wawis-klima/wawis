const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const edgePath = path.join(root, 'supabase/functions/send-assignment-push/index.ts');
const smokePath = path.join(root, 'scripts/smoke-worker-shared-job-edit-v1060.cjs');

let edge = fs.readFileSync(edgePath, 'utf8');
const oldBlock = `  const isMainTechnician = String(job.main_technician_id || "") === String(authUserId);\n  const { data: accessRow, error: accessError } = await adminClient\n    .from("job_access")\n    .select("id")\n    .eq("job_id", job.id)\n    .eq("user_id", authUserId)\n    .maybeSingle();\n\n  if (accessError) return json({ error: accessError.message }, 500);\n  if (!isMainTechnician && !accessRow) {\n    return json({ error: "Brak dostępu do tego zlecenia." }, 403);\n  }\n\n`;
if (!edge.includes(oldBlock)) throw new Error('Nie znaleziono starej blokady przypisania w job_comment.');
edge = edge.replace(oldBlock, `  const normalizedCommentCallerRole = String(callerProfile?.role || '').trim().toLowerCase();\n  if (!['employee', 'pracownik'].includes(normalizedCommentCallerRole)) {\n    return json({ error: "Tylko pracownik może wysłać powiadomienie o komentarzu." }, 403);\n  }\n\n`);
fs.writeFileSync(edgePath, edge);

let smoke = fs.readFileSync(smokePath, 'utf8');
const marker = `assert.ok(edge.includes('Tylko pracownik lub administrator może wysyłać przypisania push.'), 'Push przypisania nadal jest tylko dla administratora.');`;
const addition = `${marker}\nassert.ok(edge.includes('normalizedCommentCallerRole'), 'Push komentarza nie rozpoznaje pracownika niezależnie od przypisania.');\nassert.ok(!edge.includes('.from("job_access")'), 'Push komentarza nadal wymaga przypisania do montażu.');`;
if (!smoke.includes(marker)) throw new Error('Nie znaleziono miejsca na regresję push komentarza.');
smoke = smoke.replace(marker, addition);
fs.writeFileSync(smokePath, smoke);

console.log('WAWIS 10.60 unassigned comment push patch applied.');
