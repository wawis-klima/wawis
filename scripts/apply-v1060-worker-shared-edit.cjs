const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);

function replaceExact(file, before, after, label) {
  const source = read(file);
  if (!source.includes(before)) throw new Error(`Nie znaleziono fragmentu: ${label}`);
  write(file, source.replace(before, after));
}

function replaceRegex(file, regex, replacement, label) {
  const source = read(file);
  if (!regex.test(source)) throw new Error(`Nie znaleziono wzorca: ${label}`);
  write(file, source.replace(regex, replacement));
}

const version = JSON.parse(read('app-version.json')).version;
if (version === '10.59') {
  const { bumpVersion } = require(path.join(root, 'version-bump.cjs'));
  const result = bumpVersion();
  if (result.nextVersion !== '10.60') throw new Error(`Oczekiwano 10.60, otrzymano ${result.nextVersion}`);
} else if (version !== '10.60') {
  throw new Error(`Patch 10.60 wymaga wersji 10.59/10.60, jest ${version}`);
}

replaceExact(
  'src/mobile791/utils/jobPermissions.js',
  `export function isWorkerReadOnlyJob(job, isAdmin) {\n  return !isAdmin && job?._workerAssignedToCurrentUser === false;\n}`,
  `export function isWorkerReadOnlyJob(_job, _isAdmin) {\n  // 10.60: przypisanie montera jest informacją organizacyjną, nie blokadą dostępu.\n  return false;\n}`,
  'mobilna blokada cudzego montażu',
);

replaceExact(
  'src/mobile791/utils/jobPermissions.js',
  `export function canManageJobViewers(job, isAdmin) {\n  if (!isAdmin) return false;\n  return Boolean(job?.id);\n}`,
  `export function canManageJobViewers(job, isAdmin) {\n  if (!job?.id) return false;\n  if (isAdmin) return true;\n  return !isCompletedJob(job);\n}`,
  'uprawnienia do instalatorów',
);

replaceExact(
  'src/mobile791/modules/jobs-selectors.js',
  `        // 10.60: pracownik widzi wszystkie montaże, ale montaż innej osoby\n        // jest oznaczony jako tylko do odczytu dla warstwy uprawnień UI.\n        _workerAssignedToCurrentUser: isAdmin ? true : isAssignedToCurrentUser,`,
  `        // 10.60: przypisanie pozostaje informacją organizacyjną.\n        // Każdy pracownik może edytować aktywny montaż niezależnie od przypisania.\n        _workerAssignedToCurrentUser: isAdmin ? true : isAssignedToCurrentUser,`,
  'opis przypisania w selektorze',
);

replaceExact(
  'src/mobile791/modules/jobs-form.js',
  `  const workerForm = { ...form, contractor_id: '', main_technician_id: '', viewers: [], admin_note: '', status: normalizeWorkerCreateStatus(form.status) };`,
  `  const workerForm = {\n    ...form,\n    contractor_id: '',\n    admin_note: '',\n    main_technician_id: form.main_technician_id || '',\n    viewers: [...new Set((form.viewers || []).filter(Boolean))],\n    status: normalizeWorkerCreateStatus(form.status),\n  };`,
  'zachowanie instalatorów przy tworzeniu przez pracownika',
);

replaceExact(
  'src/mobile791/modules/jobs-form.js',
  `    main_technician_id: isAdmin ? (resolvedForm.main_technician_id || null) : null,`,
  `    main_technician_id: resolvedForm.main_technician_id || null,`,
  'zapis głównego technika przez pracownika',
);

replaceExact(
  'src/mobile791/modules/jobs-form.js',
  `  const selectedUsers = [...new Set(isAdmin ? (resolvedForm.viewers || []) : [profile.id])];`,
  `  const selectedUsers = [...new Set([profile.id, ...getAssignedUserIdsFromForm(resolvedForm)])];`,
  'job_access dla twórcy i wybranych instalatorów',
);

replaceExact(
  'src/mobile791/modules/jobs-form.js',
  `  const assignedUserIds = getAssignedUserIdsFromForm(resolvedForm);\n  if (isAdmin && shouldSendAssignmentPushForInstallationDate(resolvedForm.installation_date)) {\n    await sendAssignmentPushFn?.({ newUserIds: assignedUserIds, jobId: createdJob.id });\n  }`,
  `  const assignedUserIds = getAssignedUserIdsFromForm(resolvedForm).filter((userId) => userId !== profile.id);\n  if (assignedUserIds.length && shouldSendAssignmentPushForInstallationDate(resolvedForm.installation_date)) {\n    await sendAssignmentPushFn?.({ newUserIds: assignedUserIds, jobId: createdJob.id });\n  }`,
  'push przypisania z montażu utworzonego przez pracownika',
);

replaceExact(
  'src/mobile791/components/modals/JobFormModal.jsx',
  `            {editingJobId ? (\n              <>\n                <h4>Instalatorzy (opcjonalnie)</h4>`,
  `            {(editingJobId || !isAdmin) ? (\n              <>\n                <h4>Instalatorzy (opcjonalnie)</h4>`,
  'sekcja instalatorów przy tworzeniu przez pracownika',
);

replaceExact(
  'scripts/smoke-mobile-new-job-comment-v920.cjs',
  `assert.match(\n  modal,\n  /\\{editingJobId \\? \\(\\s*<>\\s*<h4>Instalatorzy \\(opcjonalnie\\)<\\/h4>[\\s\\S]*?<\\/div>\\s*<\\/>\\s*\\) : null\\}/,\n  'Instalatorzy mają być widoczni wyłącznie przy edycji istniejącego zlecenia.',\n);`,
  `assert.match(\n  modal,\n  /\\{\\(editingJobId \\|\\| !isAdmin\\) \\? \\(\\s*<>\\s*<h4>Instalatorzy \\(opcjonalnie\\)<\\/h4>/,\n  'Pracownik ma widzieć instalatorów również podczas tworzenia nowego montażu.',\n);`,
  'stary test ukrywania instalatorów',
);

replaceExact(
  'scripts/smoke-mobile-worker-add-client-v919.cjs',
  `assert.ok(jobsForm.includes("main_technician_id: isAdmin ? (resolvedForm.main_technician_id || null) : null"), 'Pracownik nie może być automatycznie ustawiony jako główny monter.');\nassert.ok(!jobsForm.includes('main_technician_id: profile.id'), 'Kod nadal ustawia pracownika-twórcę jako głównego montera.');\nassert.ok(jobsForm.includes("isAdmin ? (resolvedForm.viewers || []) : [profile.id]"), 'Twórca-pracownik powinien dostać wyłącznie dostęp przez job_access.');\nassert.ok(jobsForm.includes('if (isAdmin && shouldSendAssignmentPushForInstallationDate'), 'Worker nadal może próbować wysłać push przypisania do samego siebie.');`,
  `assert.ok(jobsForm.includes("main_technician_id: resolvedForm.main_technician_id || null"), 'Pracownik nie może zapisać wybranego głównego montera.');\nassert.ok(!jobsForm.includes('main_technician_id: profile.id'), 'Kod nie powinien automatycznie wymuszać twórcy jako głównego montera.');\nassert.ok(jobsForm.includes('profile.id, ...getAssignedUserIdsFromForm(resolvedForm)'), 'Twórca i wybrani instalatorzy nie trafiają wspólnie do job_access.');\nassert.ok(jobsForm.includes('assignedUserIds.length && shouldSendAssignmentPushForInstallationDate'), 'Brak push do instalatorów wybranych przez pracownika.');\nassert.ok(modal.includes('(editingJobId || !isAdmin) ? ('), 'Pracownik nie widzi wyboru instalatorów przy tworzeniu montażu.');`,
  'test tworzenia montażu przez pracownika',
);

const edgeFile = 'supabase/functions/send-assignment-push/index.ts';
replaceExact(
  edgeFile,
  `    const body = (await request.json()) as PushRequest;`,
  `    const normalizedCallerRole = String(callerProfile.role || '').trim().toLowerCase();\n    const callerIsAdmin = ['administrator', 'admin'].includes(normalizedCallerRole);\n    const callerIsStaff = callerIsAdmin || ['employee', 'pracownik'].includes(normalizedCallerRole);\n\n    const body = (await request.json()) as PushRequest;`,
  'normalizacja roli w push',
);

replaceExact(
  edgeFile,
  `      if (callerProfile.role !== "Administrator") {\n        return json({ error: "Tylko administrator może uruchomić test push." }, 403);\n      }`,
  `      if (!callerIsAdmin) {\n        return json({ error: "Tylko administrator może uruchomić test push." }, 403);\n      }`,
  'test push tylko admin',
);

replaceExact(
  edgeFile,
  `    if (callerProfile.role !== "Administrator") {\n      return json({ error: "Tylko administrator może wysyłać przypisania push." }, 403);\n    }`,
  `    if (!callerIsStaff) {\n      return json({ error: "Tylko pracownik lub administrator może wysyłać przypisania push." }, 403);\n    }`,
  'push przypisania dla pracownika',
);

replaceRegex(
  edgeFile,
  /  if \(callerProfile\.role !== "Administrator"\) \{\n    const isMainTechnician =[\s\S]*?\n  \}\n\n  const \{ data: adminProfiles/,
  `  const normalizedCallerRole = String(callerProfile?.role || '').trim().toLowerCase();\n  if (!['employee', 'pracownik', 'admin', 'administrator'].includes(normalizedCallerRole)) {\n    return json({ error: "Brak uprawnień pracownika do tego zlecenia." }, 403);\n  }\n\n  const { data: adminProfiles`,
  'zakończenie przez nieprzypisanego pracownika',
);

const sql = `begin;\n\ncreate or replace function public.current_user_is_staff()\nreturns boolean\nlanguage sql\nstable\nsecurity definer\nset search_path = public\nas $$\n  select coalesce(\n    auth.uid() is not null\n    and exists (\n      select 1\n      from public.profiles p\n      where p.id = auth.uid()\n        and lower(trim(coalesce(p.role, ''))) in ('employee', 'pracownik', 'admin', 'administrator')\n    ),\n    false\n  );\n$$;\n\nrevoke all on function public.current_user_is_staff() from public, anon;\ngrant execute on function public.current_user_is_staff() to authenticated;\n\ncreate or replace function public.current_user_can_view_job(p_job_id uuid)\nreturns boolean\nlanguage sql\nstable\nsecurity definer\nset search_path = public\nas $$\n  select coalesce(\n    public.current_user_is_staff()\n    and p_job_id is not null\n    and exists (select 1 from public.jobs j where j.id = p_job_id),\n    false\n  );\n$$;\n\nrevoke all on function public.current_user_can_view_job(uuid) from public, anon;\ngrant execute on function public.current_user_can_view_job(uuid) to authenticated;\n\ncreate or replace function public.current_user_can_access_job(p_job_id uuid)\nreturns boolean\nlanguage sql\nstable\nsecurity definer\nset search_path = public\nas $$\n  select coalesce(\n    public.current_user_is_staff()\n    and p_job_id is not null\n    and exists (select 1 from public.jobs j where j.id = p_job_id),\n    false\n  );\n$$;\n\nrevoke all on function public.current_user_can_access_job(uuid) from public, anon;\ngrant execute on function public.current_user_can_access_job(uuid) to authenticated;\n\ndrop policy if exists jobs_read_access on public.jobs;\ncreate policy jobs_read_access on public.jobs for select to authenticated\nusing (public.current_user_is_staff());\n\ndrop policy if exists jobs_update_access on public.jobs;\ncreate policy jobs_update_access on public.jobs for update to authenticated\nusing (public.current_user_can_access_job(id))\nwith check (public.current_user_can_access_job(id));\n\ndrop policy if exists jobs_create_own on public.jobs;\ncreate policy jobs_create_own on public.jobs for insert to authenticated\nwith check (public.current_user_is_staff() and created_by = auth.uid());\n\ndrop policy if exists access_insert_admin_or_creator_self on public.job_access;\ndrop policy if exists access_insert_staff on public.job_access;\ncreate policy access_insert_staff on public.job_access for insert to authenticated\nwith check (\n  public.current_user_can_access_job(job_id)\n  and exists (\n    select 1 from public.profiles target\n    where target.id = user_id\n      and lower(trim(coalesce(target.role, ''))) in ('employee', 'pracownik', 'admin', 'administrator')\n  )\n);\n\ndrop policy if exists access_delete_admin on public.job_access;\ndrop policy if exists access_delete_staff on public.job_access;\ncreate policy access_delete_staff on public.job_access for delete to authenticated\nusing (public.current_user_can_access_job(job_id));\n\ncommit;\n`;
write('worker-shared-job-edit-v10.60.sql', sql);

const smoke = `const assert = require('node:assert/strict');\nconst fs = require('node:fs');\nconst path = require('node:path');\nconst root = path.resolve(__dirname, '..');\nconst read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');\n\nconst permissions = read('src','mobile791','utils','jobPermissions.js');\nconst form = read('src','mobile791','modules','jobs-form.js');\nconst modal = read('src','mobile791','components','modals','JobFormModal.jsx');\nconst edge = read('supabase','functions','send-assignment-push','index.ts');\nconst sql = read('worker-shared-job-edit-v10.60.sql');\n\nassert.ok(permissions.includes('return false;'), 'Przypisanie nadal blokuje edycję cudzego montażu.');\nassert.ok(permissions.includes('return !isCompletedJob(job);'), 'Pracownik nie może zarządzać instalatorami aktywnego montażu.');\nassert.ok(form.includes("main_technician_id: form.main_technician_id || ''"), 'Nowy montaż pracownika kasuje głównego technika.');\nassert.ok(form.includes('viewers: [...new Set((form.viewers || []).filter(Boolean))]'), 'Nowy montaż pracownika kasuje dodatkowych instalatorów.');\nassert.ok(form.includes('profile.id, ...getAssignedUserIdsFromForm(resolvedForm)'), 'Brak dostępu twórcy i wybranych instalatorów.');\nassert.ok(modal.includes('(editingJobId || !isAdmin) ? ('), 'Pracownik nie widzi wyboru instalatorów przy dodawaniu montażu.');\nassert.ok(edge.includes('callerIsStaff'), 'Push nie rozpoznaje pracownika jako członka zespołu.');\nassert.ok(edge.includes('Tylko pracownik lub administrator może wysyłać przypisania push.'), 'Push przypisania nadal jest tylko dla administratora.');\nassert.ok(sql.includes('current_user_is_staff'), 'Brak funkcji RLS dla całego zespołu.');\nassert.ok(sql.includes('access_insert_staff'), 'Pracownik nie może dopisywać instalatorów.');\nassert.ok(sql.includes('access_delete_staff'), 'Pracownik nie może odpiąć instalatora.');\nconsole.log('PASS smoke-worker-shared-job-edit-v1060');\n`;
write('scripts/smoke-worker-shared-job-edit-v1060.cjs', smoke);

const pkg = JSON.parse(read('package.json'));
pkg.scripts['test:smoke:worker-shared-job-edit'] = 'node scripts/smoke-worker-shared-job-edit-v1060.cjs';
write('package.json', JSON.stringify(pkg, null, 2) + '\n');

let runner = read('scripts/run-release.cjs');
const marker = "  'npm run test:smoke:mobile-worker-add-client',";
if (!runner.includes("'npm run test:smoke:worker-shared-job-edit'")) {
  runner = runner.replaceAll(marker, `${marker}\n  'npm run test:smoke:worker-shared-job-edit',`);
  write('scripts/run-release.cjs', runner);
}

let readme = read('README.md');
readme = readme.replace(
  '- wersja `10.60` — uzupełnij opis ostatniej poprawki po zakończeniu zmian.',
  '- wersja `10.60` — wszyscy pracownicy mogą edytować aktywne montaże niezależnie od przypisania; przy dodawaniu montażu pracownik może od razu wskazać pozostałych instalatorów.',
);
write('README.md', readme);

let changelog = read('CHANGELOG.md');
changelog = changelog.replace(
  '## 10.60\n- uzupełnij opis zmian dla wersji 10.60',
  `## 10.60\n- pracownik mobilny może edytować każdy aktywny montaż, także gdy nie jest do niego przypisany; przypisanie instalatora jest informacją organizacyjną, a nie blokadą dostępu,\n- pracownik tworzący nowy montaż może od razu wybrać głównego technika i dodatkowych instalatorów,\n- wszyscy pracownicy mogą w aktywnym montażu zmieniać dane robocze, dodawać komentarze i zdjęcia oraz zarządzać listą instalatorów,\n- zakończone montaże pozostają zablokowane dla zwykłych pracowników, aby chronić podpisaną dokumentację i protokoły,\n- RLS Supabase dla jobs/job_access oraz zdjęć i komentarzy korzystających z helperów dostępu został rozszerzony na cały zespół pracowników,\n- push o przypisaniu i zakończeniu montażu nie wymaga już wcześniejszego przypisania wykonującego pracownika,\n- dodano regresję testową test:smoke:worker-shared-job-edit.`,
);
write('CHANGELOG.md', changelog);

const gate = JSON.parse(read('RELEASE-GATE.json'));
gate.version = '10.60';
gate.scope = 'full';
gate.baseline_diagnostics = {
  checked: true,
  last_24h: true,
  checked_at: '2026-09-14T11:27:03.445547Z',
  result: 'GO',
  notes: 'Przed zmianą sprawdzono app_diagnostic_events z ostatnich 24 h: brak błędów i ostrzeżeń.',
};
gate.predeploy_diagnostics = {
  checked: false,
  last_24h: true,
  checked_at: null,
  result: 'PENDING',
  notes: 'Do sprawdzenia po zmianach i testach, przed wdrożeniem produkcyjnym.',
};
gate.drive_backup = {
  required: true,
  folder_path: 'Aplikacja/Wersje',
  folder_id: '1eufcE1gnbfw7t2IMmJwbcicrkaiaqu0S',
  file_name: 'klima-app-v10.60.zip',
  file_id: null,
  size_bytes: 0,
  uploaded: false,
  uploaded_at: null,
  verified: false,
  notes: 'Finalna paczka 10.60 musi zostać wysłana i zweryfikowana przed zamknięciem wydania.',
};
gate.postdeploy_diagnostics = {
  checked: false,
  last_24h: true,
  checked_at: null,
  result: 'PENDING',
  production_version_verified: false,
  service_worker_verified: false,
  notes: 'Do sprawdzenia po wdrożeniu 10.60.',
};
write('RELEASE-GATE.json', JSON.stringify(gate, null, 2) + '\n');

console.log('WAWIS 10.60 worker shared job edit patch applied.');
