const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const jobsFetchSource = fs.readFileSync(path.join(root, 'src/modules/jobs-fetch.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const panelSource = fs.readFileSync(path.join(root, 'src/components/JobDetailsPanel.jsx'), 'utf8');
const actionsSource = fs.readFileSync(path.join(root, 'src/hooks/useSelectedJobActions.js'), 'utf8');

const refreshBody = jobsFetchSource.match(/export async function refreshAppData\([\s\S]*?\n}\n/m)?.[0] || '';
assert(refreshBody && !refreshBody.includes(".from('comments')"), 'refreshAppData nie powinien pobierać komentarzy na starcie');
assert(refreshBody && !refreshBody.includes(".from('photos')"), 'refreshAppData nie powinien pobierać zdjęć na starcie');
assert(jobsFetchSource.includes('export async function loadJobDetailsData'), 'Brak loadJobDetailsData do ładowania po kliknięciu');
assert(appSource.includes('detailsLoadingJobId'), 'App.jsx nie śledzi ładowania szczegółów');
assert(appSource.includes('void reloadJobDetails(selectedJob.id)'), 'App.jsx nie ładuje szczegółów po kliknięciu zlecenia');
assert(panelSource.includes('Ładowanie zdjęć'), 'Panel nie pokazuje ładowania zdjęć');
assert(panelSource.includes('Ładowanie komentarzy'), 'Panel nie pokazuje ładowania komentarzy');
assert(actionsSource.includes('reloadJobDetails'), 'Akcje zdjęć/komentarzy nie odświeżają leniwie szczegółów');

console.log('Smoke OK: lazy loading zdjęć i komentarzy montażu');
