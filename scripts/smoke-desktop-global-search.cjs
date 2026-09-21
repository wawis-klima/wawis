const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const modulePath = path.join(root, 'src/modules/global-search.js');
  const componentPath = path.join(root, 'src/components/desktop/GlobalDesktopSearch.jsx');
  const shellPath = path.join(root, 'src/components/layout/AdminDesktopShell.jsx');
  const appPath = path.join(root, 'src/App.jsx');
  const devicesPath = path.join(root, 'src/components/devices/DevicesPanel.jsx');
  const dashboardPath = path.join(root, 'src/components/dashboard/Centrum360Panel.jsx');
  const contractorsPath = path.join(root, 'src/components/contractors/ContractorsPanel.jsx');
  const mobileAppPath = path.join(root, 'src/mobile791/App.jsx');

  const searchModule = await import(`${pathToFileURL(modulePath).href}?smoke=${Date.now()}`);
  const { buildGlobalSearchResults, normalizeGlobalSearchValue } = searchModule;

  assert(normalizeGlobalSearchValue('Łódź, ul. Piotrkowska 12') === 'lodz ul piotrkowska 12', 'Normalizacja polskich znaków lub adresu jest nieprawidłowa.');
  assert(normalizeGlobalSearchValue('+48 500-600-700') === '48 500 600 700', 'Normalizacja telefonu jest nieprawidłowa.');

  const profiles = [
    { id: 'tech-1', full_name: 'Kacper Wydmański' },
    { id: 'tech-2', full_name: 'Michał Siutak' },
  ];
  const jobs = [{
    id: 'JOB-ABC-12345678',
    client: 'Klimatyzacja Kowalski',
    phone: '500 600 700',
    city: 'Łódź',
    street: 'Piotrkowska 12',
    device_model: 'Rotenso Teta 5,2 kW',
    device_serial_number: 'SN-JZ-001',
    installation_date: '2026-07-15',
    status: 'Zakończone',
    main_technician_id: 'tech-1',
    viewers: [{ user_id: 'tech-2' }],
  }];
  const contractors = [{
    id: 'contractor-1',
    company_name: 'Firma Nowak',
    phone: '601 222 333',
    city: 'Zawiercie',
    street: 'Sienkiewicza 10',
    nip: '1234567890',
    addresses: [
      { id: 'address-main', label: 'Dom', city: 'Zawiercie', street: 'Sienkiewicza 10', notes: '', is_primary: true },
      { id: 'address-warehouse', label: 'Magazyn', city: 'Poręba', street: 'Przemysłowa 4', notes: 'Wjazd od tyłu', is_primary: false },
    ],
  }];
  const devices = [{
    id: 'device-1',
    model: 'Rotenso Ukura 3,5 kW',
    serial_number: 'SERIAL-XYZ-99',
    contractor_name: 'Firma Nowak',
    contractor_city: 'Zawiercie',
    source_job_id: 'JOB-ABC-12345678',
  }];

  const byClient = buildGlobalSearchResults({ jobs, contractors, devices, profiles, query: 'kowalski' });
  assert(byClient.some((item) => item.type === 'job' && item.source.id === jobs[0].id), 'Brak wyszukiwania po nazwie klienta.');

  const byPhone = buildGlobalSearchResults({ jobs, contractors, devices, profiles, query: '500600700' });
  assert(byPhone.some((item) => item.type === 'job'), 'Brak wyszukiwania po telefonie bez separatorów.');

  const byAddress = buildGlobalSearchResults({ jobs, contractors, devices, profiles, query: 'lodz piotrkowska' });
  assert(byAddress.some((item) => item.type === 'job'), 'Brak wyszukiwania po adresie i polskich znakach.');

  const bySecondaryAddress = buildGlobalSearchResults({ jobs, contractors, devices, profiles, query: 'poreba przemyslowa' });
  assert(bySecondaryAddress.some((item) => item.type === 'contractor' && item.source.id === contractors[0].id), 'Brak wyszukiwania klienta po dodatkowym adresie.');
  const byAddressNote = buildGlobalSearchResults({ jobs, contractors, devices, profiles, query: 'wjazd od tylu' });
  assert(byAddressNote.some((item) => item.type === 'contractor'), 'Brak wyszukiwania klienta po notatce dodatkowej lokalizacji.');

  const byModel = buildGlobalSearchResults({ jobs, contractors, devices, profiles, query: 'ukura 3 5' });
  assert(byModel.some((item) => item.type === 'device'), 'Brak wyszukiwania po modelu urządzenia.');

  const bySerial = buildGlobalSearchResults({ jobs, contractors, devices, profiles, query: 'serial xyz 99' });
  assert(bySerial.some((item) => item.type === 'device'), 'Brak wyszukiwania po numerze seryjnym.');
  const byPastedSerial = buildGlobalSearchResults({ jobs, contractors, devices, profiles, query: 'SERIALXYZ99' });
  assert(byPastedSerial.some((item) => item.type === 'device'), 'Brak wyszukiwania po wklejonym numerze seryjnym bez separatorów.');

  const byJobNumber = buildGlobalSearchResults({ jobs, contractors, devices, profiles, query: '12345678' });
  assert(byJobNumber.some((item) => item.type === 'job'), 'Brak wyszukiwania po numerze zlecenia.');

  const byInstaller = buildGlobalSearchResults({ jobs, contractors, devices, profiles, query: 'michal siutak' });
  assert(byInstaller.some((item) => item.type === 'job'), 'Brak wyszukiwania po monterze.');

  const componentSource = fs.readFileSync(componentPath, 'utf8');
  const shellSource = fs.readFileSync(shellPath, 'utf8');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const devicesSource = fs.readFileSync(devicesPath, 'utf8');
  const dashboardSource = fs.readFileSync(dashboardPath, 'utf8');
  const contractorsSource = fs.readFileSync(contractorsPath, 'utf8');
  const mobileSource = fs.readFileSync(mobileAppPath, 'utf8');

  assert(componentSource.includes('Ctrl K'), 'Globalne wyszukiwanie nie ma skrótu Ctrl+K.');
  assert(componentSource.includes('Szukaj klienta, telefonu, adresu, modelu'), 'Brakuje pełnego opisu zakresu wyszukiwania.');
  assert(shellSource.includes('GlobalDesktopSearch'), 'Globalne wyszukiwanie nie jest podłączone do desktopowego shella.');
  assert(appSource.includes('handleGlobalSearchResult'), 'Brakuje nawigacji z wyników globalnego wyszukiwania.');
  assert(appSource.includes('globalSearchContractors') && appSource.includes('globalSearchDevices'), 'Brakuje danych kontrahentów lub urządzeń w indeksie globalnego wyszukiwania.');
  assert(devicesSource.includes('requestedDeviceId'), 'Wynik urządzenia nie otwiera właściwego rekordu w module Urządzenia.');
  assert(!dashboardSource.includes('centrum360SearchButton'), 'Centrum 360 nadal pokazuje zbędne małe pole Szukaj.');
  assert(!dashboardSource.includes('centrum360DateButton'), 'Centrum 360 nadal pokazuje zbędny przycisk Dzisiaj.');
  assert(
    /if \(!requestedContractorId \|\| !isAdmin\) return;[\s\S]*?setSelectedId\(String\(requestedContractorId\)\);[\s\S]*?setDetailsOpen\(true\);[\s\S]*?setActiveView\('list'\);/.test(contractorsSource),
    'Kliknięcie kontrahenta w globalnym wyszukiwaniu musi otworzyć listę i szczegóły wskazanego klienta.',
  );
  assert(!mobileSource.includes('GlobalDesktopSearch'), 'Globalne wyszukiwanie zostało przypadkowo dodane do aplikacji mobilnej.');

  console.log('OK: desktopowe globalne wyszukiwanie obejmuje klienta, telefon, adres, model, numer seryjny, zlecenie i montera.');
})().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
