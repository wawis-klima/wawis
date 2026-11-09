// WAWIS 14.21 — uwagi właściciela po pierwszym zgłoszeniu z naklejki QR (04.11.2026):
// liczniki KOMUNIKACJA, zakładki Awarie/Przeglądy, zgłoszenie → przegląd serwisowy, napis QR w kreatorze,
// bez znaczka QR w nagłówku urządzenia. RED na 14.20.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { countPendingSmsGroups, formatNavBadge, loadPendingSmsCount } from '../src/modules/communication-counters.js';
import { buildServiceVisitNotes, canPlanServiceVisit } from '../src/modules/service-requests.js';

// 1. SMS do zatwierdzenia liczone jak poranne zadanie: ukryte wpisy dodatkowe grup i grupy już wysłane pomijane.
const pending = [
  { id: 1, status: 'pending_approval', reminder_group_id: null, reminder_group_primary: null },
  { id: 2, status: 'pending_approval', reminder_group_id: 'g1', reminder_group_primary: true },
  { id: 3, status: 'pending_approval', reminder_group_id: 'g1', reminder_group_primary: false },
  { id: 4, status: 'pending_approval', reminder_group_id: 'g2', reminder_group_primary: true },
  { id: 5, status: ' Pending_Approval ', reminder_group_id: 'g3', reminder_group_primary: true },
];
assert.equal(countPendingSmsGroups({ pending, sentGroupIds: ['g2'] }), 3, 'bez wpisu dodatkowego i bez grupy wysłanej');
assert.equal(countPendingSmsGroups({ pending: [], sentGroupIds: [] }), 0);
// Przypadek z audytu 03.11: 3 ukryte wpisy dodatkowe w grupach doręczonych = 0, nie „3 SMS-y czekają”.
assert.equal(countPendingSmsGroups({ pending: [
  { status: 'pending_approval', reminder_group_id: 'a', reminder_group_primary: false },
  { status: 'pending_approval', reminder_group_id: 'b', reminder_group_primary: false },
  { status: 'pending_approval', reminder_group_id: 'c', reminder_group_primary: false },
], sentGroupIds: ['a', 'b', 'c'] }), 0);

// 14.41: produkcja nie daje zalogowanym SELECT na sms_log — licznik musi działać przez RPC ekranu SMS.
const rpcCalls = [];
const fake = {
  from(table) { throw new Error(`permission denied for table ${table}`); },
  async rpc(name) {
    rpcCalls.push(name);
    return { data: { settings: {}, queue_logs: [
      { sms_type: 'service_reminder', status: 'pending_approval', reminder_group_id: 'dudek', reminder_group_primary: true },
      { sms_type: 'service_reminder', status: 'pending_approval', reminder_group_id: 'old', reminder_group_primary: false },
      { sms_type: 'service_reminder', status: 'pending_approval', reminder_group_id: 'done', reminder_group_primary: true },
      { sms_type: 'service_reminder', status: 'delivered', reminder_group_id: 'done', reminder_group_primary: false },
      { sms_type: 'other', status: 'pending_approval', reminder_group_id: null },
    ] }, error: null };
  },
};
assert.equal(await loadPendingSmsCount({ supabase: fake }), 1);
assert.deepEqual(rpcCalls, ['admin_get_sms_module_snapshot']);
await assert.rejects(() => loadPendingSmsCount({ supabase: { rpc: async () => ({ data: null, error: new Error('x') }) } }));

assert.equal(formatNavBadge(0), '');
assert.equal(formatNavBadge(null), '');
assert.equal(formatNavBadge(3), '3');
assert.equal(formatNavBadge(150), '99+');

// 2. Zgłoszenie → przegląd serwisowy.
assert.equal(canPlanServiceVisit({ contractor_id: 'c', device_id: 'd' }), true);
assert.equal(canPlanServiceVisit({ contractor_id: 'c', device_id: null }), false, 'naklejka bez urządzenia');
const notes = buildServiceVisitNotes({ kind: 'przeglad', created_at: '2026-11-04T06:36:55Z', description: 'Pasuje wtorek środa', phone: '48666222222' });
assert.match(notes, /^Zgłoszenie klienta z naklejki QR \(04\.11\.2026, 0[6-8]:36\): Przegląd\. Pasuje wtorek środa Tel\. klienta: 666 222 222\.$/);
assert.ok(buildServiceVisitNotes({ kind: 'awaria', description: 'x'.repeat(5000), phone: '' }).length <= 4000);

// 3. Podłączenie w aplikacji.
const read = (p) => fs.readFileSync(p, 'utf8');
const panel = read('src/components/service-requests/ServiceRequestsPanel.jsx');
assert.match(panel, /\['awaria', 'Awarie'\], \['przeglad', 'Przeglądy'\]/, 'zakładki rodzaju');
assert.match(panel, /Zaplanuj przegląd/);
const shell = read('src/components/layout/AdminDesktopShell.jsx');
assert.match(shell, /navBadges\?\.\[item\.key\]/);
assert.match(shell, /aria-hidden="true">\{badge\}/, 'licznik nie zmienia nazwy przycisku menu');
const app = read('src/App.jsx');
assert.match(app, /navBadges=\{communicationNavBadges\}/);
assert.match(app, /window\.setInterval\(tick, 60000\)/, 'odświeżanie liczników co minutę');
assert.match(app, /setServiceRequestStatus\(\{ supabase, id: requestId, status: "zalatwione" \}\)/, 'zapisany przegląd zamyka zgłoszenie');
const service = read('src/mobile791/components/devices/ServiceAdminPanel.jsx');
assert.match(service, /planRequestIdRef\.current = fromRequest\?\.requestId \|\| ''/);
assert.match(service, /onClick=\{startPlan\}/, 'zwykłe „Zaplanuj przegląd” bez zmian');
assert.match(read('src/components/devices/DevicesAndServicesPanel.jsx'), /openCustomerRequest=\{openServiceRequest\} onRequestPlanned=\{onRequestPlanned\}/);

// 4. Kreator: po zapisie naklejki wczytywane ponownie (koniec „Bez naklejki QR”).
const form = read('src/mobile791/components/modals/JobFormModal.jsx');
assert.match(form, /window\.addEventListener\(QR_STICKERS_CHANGED_EVENT, onChanged\)/);
assert.match(form, /\}, \[showModal, serialOnlyMode, editingJobId, supabase, qrReloadKey\]\);/);
assert.match(read('src/modules/qr-stickers.js'), /if \(outcome\.assigned\.length\) notifyQrStickersChanged\(jobId\);/, 'zdarzenie wysyłane po przypisaniu');

// 5. Bez znaczka QR w nagłówku urządzenia (decyzja właściciela).
assert.doesNotMatch(read('src/mobile791/components/JobDetailsPanel.jsx'), /className="qrStickerBadge"/);

// 6. 14.22: kalendarz daty/godziny przeglądu otwierany kliknięciem myszką (Chrome/Edge), telefon klienta przy nazwie.
assert.match(service, /window\.matchMedia\?\.\('\(pointer: fine\)'\)\.matches/, 'tylko myszka — iPhone bez zmian');
assert.match(service, /event\.currentTarget\.showPicker\?\.\(\)/);
assert.equal((service.match(/onClick=\{openNativePickerOnDesktop\}/g) || []).length, 2, 'data i godzina');
assert.match(service, /href=\{`tel:\$\{digits\}`\}/);

console.log('PASS WAWIS 14.21 — liczniki KOMUNIKACJA, Awarie/Przeglądy, zgłoszenie → przegląd, napis QR w kreatorze, bez znaczka QR w nagłówku.');
