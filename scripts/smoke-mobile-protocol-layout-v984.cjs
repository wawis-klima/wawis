const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const modal = fs.readFileSync(path.join(root, 'src', 'mobile791', 'components', 'modals', 'ProtocolTestModal.jsx'), 'utf8');
const jobForm = fs.readFileSync(path.join(root, 'src', 'mobile791', 'components', 'modals', 'JobFormModal.jsx'), 'utf8');
const wizardCss = fs.readFileSync(path.join(root, 'src', 'mobile791', 'components', 'devices', 'mobile-device-wizard.css'), 'utf8');

assert.match(jobForm, /contentClassName="card modal mobileDeviceWizardModal"/, 'Nie znaleziono sprawdzonej obudowy dodawania urządzenia.');
assert.match(modal, /overlayClassName="formOverlay mobileDeviceWizardOverlay"/);
assert.match(modal, /contentClassName="card modal mobileDeviceWizardModal protocolWizardModal"/);
assert.match(modal, />\s*<div className="mobileDeviceWizard mobileProtocolWizard">/, 'Główny protokół musi zachować obudowę kreatora urządzenia.');
assert.match(modal, /const \[signatureOpen, setSignatureOpen\] = useState\(false\)/);
assert.match(modal, /overlayClassName="protocolSignatureOverlay"/);
assert.match(modal, /contentClassName="protocolSignatureModal"/);
assert.match(modal, /className="protocolSignatureScreen"/);
assert.doesNotMatch(modal, /Podpis zostanie złożony na osobnym, nieruchomym ekranie\./);
assert.match(modal, />\{hasSignature \? "Zmień podpis" : "Podpis klienta"\}<\/button>/);
assert.match(modal, /Zatwierdź podpis/);
assert.match(modal, /signatureDataUrl,/);
assert.doesNotMatch(modal, /className="protocolTestSignatureCanvas"/, 'Pole podpisu nie może pozostać w przewijanej treści protokołu.');

assert.match(wizardCss, /\.mobileProtocolWizard \.protocolTestDetails\s*\{[\s\S]*?grid-template-columns:\s*1fr\s*!important;/);
assert.match(wizardCss, /\.mobileProtocolWizard \.protocolTestDeviceHeader\s*\{\s*display:\s*none\s*!important;/);
assert.match(wizardCss, /\.protocolSignatureOverlay\s*\{[\s\S]*?overflow:\s*hidden\s*!important;[\s\S]*?overscroll-behavior:\s*none\s*!important;/);
assert.match(wizardCss, /\.protocolSignatureModal\s*\{[\s\S]*?height:\s*100dvh\s*!important;[\s\S]*?overflow:\s*hidden\s*!important;/);
assert.match(wizardCss, /\.protocolSignatureCanvas\s*\{[\s\S]*?touch-action:\s*none\s*!important;/);
assert.match(wizardCss, /\.protocolPaymentForm \.input\s*\{[^}]*font-size:\s*16px\s*!important;/, 'Pola płatności muszą mieć co najmniej 16 px, aby iPhone nie powiększał formularza po aktywacji.');
assert.match(wizardCss, /\.protocolPaymentForm > label\s*\{[^}]*min-width:\s*0;/, 'Pola płatności muszą pozwalać zawartości zwęzić się do szerokości karty.');
assert.match(wizardCss, /\.protocolPaymentForm \.input\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*box-sizing:\s*border-box;/, 'Input płatności nie może przekraczać szerokości swojej kolumny.');
assert.match(wizardCss, /\.protocolPaymentForm input\[type="date"\]\s*\{[^}]*inline-size:\s*100%;[^}]*min-inline-size:\s*0;[^}]*max-inline-size:\s*100%;/, 'Natywne pole daty iPhone musi mieścić się wewnątrz karty płatności.');

console.log('OK: protokół ma uporządkowane dane oraz osobny, nieruchomy ekran podpisu klienta.');
