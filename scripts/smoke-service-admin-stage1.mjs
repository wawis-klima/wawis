import assert from 'node:assert/strict';
import fs from 'node:fs';
import { groupServiceSearchResults } from '../src/mobile791/modules/service-visits.js';

const read = path => fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const admin=read('src/mobile791/components/devices/ServiceAdminPanel.jsx');
const app=read('src/mobile791/App.jsx');
const menu=read('src/mobile791/components/layout/ModuleSwitcher.jsx');
const css=read('src/mobile791/components/devices/ServiceAdminPanel.css');
const sql=read('supabase/migrations/20261028193000_service_visits_admin_stage1.sql');
const api=read('src/mobile791/modules/service-visits.js');

const grouped=groupServiceSearchResults([
  {contractor_id:'A',contractor_name:'Kowalski',device_id:'x',model:'Rotenso Ukura'},
  {contractor_id:'A',contractor_name:'Kowalski',device_id:'y',model:'Rotenso Revio'},
  {contractor_id:'A',contractor_name:'Kowalski',device_id:'x',model:'Rotenso Ukura'},
  {contractor_id:'B',contractor_name:'Nowak',device_id:'z',model:'Rotenso Roni'},
]);
assert.equal(grouped.length,2);
assert.equal(grouped[0].devices.length,2,'Wyszukiwanie grupuje urządzenia jednego klienta.');
assert.equal(grouped[1].name,'Nowak');
assert.match(api,/if \(text\.length < 2\) return \[\]/);
assert.match(admin,/search\.trim\(\)\.length<2/,'Brak listy bez zapytania.');
assert.match(admin,/createAdminServiceVisit/);
assert.match(admin,/updateAdminServiceAssignment/);
assert.match(menu,/id: "devices", label: "Urządzenia"/);
assert.match(menu,/isAdmin \? true : \["jobs", "fuel", "pricelist"\]/,'Pracownik nie widzi Urządzeń.');
assert.match(app,/activeModule === "devices" && isMobile && isAdmin/);
assert.match(app,/if \(!isAdmin && !\["jobs", "fuel", "pricelist"\]\.includes\(activeModule\)\)/);
assert.match(css,/\.moduleSwitcherMobile\.isAdmin/);
assert.match(css,/repeat\(5,minmax\(0,1fr\)\)/);
assert.match(css,/min-height:44px/);
assert.match(sql,/create table if not exists public\.service_visits/);
assert.match(sql,/on delete set null/,'Kasowanie rekordów devices nie usuwa historii wizyt.');
assert.match(sql,/current_user_is_admin\(\)/,'Weryfikacja administratora na bazie.');
assert.match(sql,/service_visit_admin_create/);
assert.match(sql,/Weryfikuje, że wszystkie wybrane urządzenia rzeczywiście należą do klienta/);
assert.doesNotMatch(sql,/alter table public\.services\b/,'Stary moduł services pozostaje nienaruszony.');
assert.doesNotMatch(sql,/alter table public\.jobs\b/,'Brak zmian w produkcyjnych montażach.');
assert.doesNotMatch(sql,/alter table public\.sms_log\b/,'SMS nie tworzy automatycznie serwisu.');
console.log('service-admin-stage1 smoke: OK');
