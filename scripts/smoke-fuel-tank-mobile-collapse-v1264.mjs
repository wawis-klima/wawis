import assert from 'node:assert/strict';
import fs from 'node:fs';

const panel = fs.readFileSync(new URL('../src/components/fuel/FuelPanelBase.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/components/fuel/FuelPanelV1034.css', import.meta.url), 'utf8');

assert.match(panel, /const compactMobileAdmin = Boolean\(isAdmin && !displayVehicleOverview\)/);

assert.match(
  panel,
  /\{!compactMobileAdmin \? \(\s*<small>[\s\S]*?Liczenie od \$\{formatFuelDate\(tankStatus\.tracking_started_at\)\} · start 5000,00 l[\s\S]*?<\/small>\s*\) : null\}/,
  'Tekst startowy ma być renderowany wyłącznie poza kompaktowym widokiem mobile.',
);

assert.match(
  panel,
  /\{compactMobileAdmin \? \(\s*<details[\s\S]*?className="fuelTankMovements fuelTankMobileControls"[\s\S]*?<summary>Szczegóły zbiornika<\/summary>[\s\S]*?Wydano do aut[\s\S]*?Dostawy \+ start[\s\S]*?Dodaj dostawę[\s\S]*?<\/details>\s*\) : null\}/,
  'Statystyki i dodawanie dostawy mają być zwinięte na mobile.',
);

assert.match(
  panel,
  /\{!compactMobileAdmin \? \([\s\S]*?<div className="fuelTankStockStats">[\s\S]*?Wydano do aut[\s\S]*?Dostawy \+ start[\s\S]*?fuelTankDeliveryToggle[\s\S]*?Dodaj dostawę[\s\S]*?\) : null\}/,
  'Desktop ma zachować bezpośrednio widoczne statystyki i przycisk dostawy.',
);

assert.match(css, /\.fuelTankMobileControlsBody\s*\{/);
assert.match(css, /\.fuelTankMobileControlsBody \.fuelTankStockStats\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);

console.log('PASS fuel tank mobile collapse v12.64');
