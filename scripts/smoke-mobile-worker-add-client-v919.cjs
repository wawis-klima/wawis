const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const layout = read('src','mobile791','components','jobs','MobileJobsLayout.jsx');
const modal = read('src','mobile791','components','modals','JobFormModal.jsx');
const app = read('src','mobile791','App.jsx');
const jobsForm = read('src','mobile791','modules','jobs-form.js');
const css = read('src','mobile791','styles.css');
const jobsPanel = read('src','mobile791','components','JobsPanel.jsx');
const sql = read('worker-create-contractor-v9.19.sql');

assert.match(layout, /title=\{isAdmin \? "Dodaj zlecenie" : "Dodaj nowego klienta"\}/, 'Pracownik nie ma plusa do dodania nowego klienta.');
assert.doesNotMatch(layout, /MobileDiagnosticButton/, 'Przycisk D nie powinien wracać do jednoliniowego nagłówka mobile.');
assert.doesNotMatch(layout, /IconLogout/, 'Pracownik nie powinien mieć osobnego przycisku wylogowania w kompaktowym pasku.');
assert.ok(jobsPanel.includes('.wawisOneLineToolbar{display:flex !important;'), 'Nagłówek mobile nie jest jednym elastycznym wierszem.');
assert.ok(jobsPanel.includes('flex-wrap:nowrap !important;'), 'Nagłówek mobile może zawijać elementy do drugiego wiersza.');
assert.ok(layout.includes('className="wawisUserInitialsBadge"'), 'Worker nie ma kompaktowego badge z inicjałami.');
assert.ok(layout.includes('onClick={logout}'), 'Badge pracownika nie wylogowuje użytkownika.');

assert.match(app, /isAdmin=\{isAdmin\}/, 'JobFormModal nie dostaje informacji o roli.');
assert.ok(modal.includes('label="Komentarz administratora"'), 'Brak głosowego przycisku komentarza administratora.');
assert.ok(modal.includes('voiceFieldRow adminNoteVoiceFieldRow'), 'Brak układu textarea + mikrofon dla komentarza administratora.');
assert.ok(modal.includes('{isAdmin ? (\n          <div className="jobFormAdminFields"'), 'Pola administracyjne nie są ukryte przed pracownikiem.');
assert.ok(modal.includes('isAdmin ? "Zapisz zlecenie" : "Dodaj klienta"'), 'Formularz pracownika nie ma właściwej akcji Dodaj klienta.');

assert.ok(jobsForm.includes("supabase.rpc('worker_create_or_get_contractor_for_job'"), 'Nowy klient pracownika nie trafia bezpiecznie do contractors.');
assert.ok(jobsForm.includes('normalizeWorkerCreateStatus(form.status)'), 'Status nowego wpisu pracownika nie jest kontrolowany przez dozwoloną logikę Nowe/W trakcie.');
assert.ok(jobsForm.includes("main_technician_id: isAdmin ? (resolvedForm.main_technician_id || null) : null"), 'Pracownik nie może być automatycznie ustawiony jako główny monter.');
assert.ok(!jobsForm.includes('main_technician_id: profile.id'), 'Kod nadal ustawia pracownika-twórcę jako głównego montera.');
assert.ok(jobsForm.includes("isAdmin ? (resolvedForm.viewers || []) : [profile.id]"), 'Twórca-pracownik powinien dostać wyłącznie dostęp przez job_access.');
assert.ok(jobsForm.includes('if (isAdmin && shouldSendAssignmentPushForInstallationDate'), 'Worker nadal może próbować wysłać push przypisania do samego siebie.');
assert.ok(sql.includes('security definer'), 'Funkcja worker create contractor nie ma kontrolowanego SECURITY DEFINER.');
assert.ok(sql.includes('returns jsonb'), 'Funkcja pracownika zwraca zbyt szeroki rekord contractors.');
assert.ok(sql.includes("jsonb_build_object("), 'Funkcja nie ogranicza odpowiedzi do bezpiecznego snapshotu danych wpisanych przez pracownika.');
assert.ok(sql.includes("v_role not in ('Pracownik', 'Administrator')"), 'Funkcja nie sprawdza roli zalogowanego użytkownika.');
assert.ok(sql.includes('revoke all on function'), 'Funkcja nie ma jawnie ograniczonych uprawnień.');

console.log('PASS smoke-mobile-worker-add-client-v919');
