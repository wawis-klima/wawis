import assert from 'node:assert/strict';
import fs from 'node:fs';

import { addFuelTankDelivery, normalizeFuelTankDeliveryLiters } from '../src/modules/fuel.js';

assert.equal(normalizeFuelTankDeliveryLiters('5000'), 5000);
assert.equal(normalizeFuelTankDeliveryLiters('1250,50'), 1250.5);
assert.throws(() => normalizeFuelTankDeliveryLiters('0'), /większa od 0/i);
assert.throws(() => normalizeFuelTankDeliveryLiters('-1'), /większa od 0/i);

const calls = [];
const supabase = {
  rpc(name, args) {
    calls.push({ name, args });
    return Promise.resolve({
      data: {
        id: 'movement-1',
        movement_type: 'delivery',
        delta_liters: 1200.5,
      },
      error: null,
    });
  },
};
const result = await addFuelTankDelivery({
  supabase,
  isAdmin: true,
  liters: '1200,50',
  note: 'Dostawa testowa',
  operationId: '99999999-9999-4999-8999-999999999999',
});
assert.equal(result.delta_liters, 1200.5);
assert.deepEqual(calls, [{
  name: 'admin_add_fuel_tank_movement_v1266',
  args: {
    p_movement_type: 'delivery',
    p_liters: 1200.5,
    p_note: 'Dostawa testowa',
    p_operation_id: '99999999-9999-4999-8999-999999999999',
  },
}]);

await assert.rejects(
  () => addFuelTankDelivery({ supabase, isAdmin: false, liters: 100, note: '' }),
  /administrator/i,
);

const panel = fs.readFileSync(new URL('../src/components/fuel/FuelPanelBase.jsx', import.meta.url), 'utf8');
assert.match(panel, /\{isAdmin \? \(\s*<section className="fuelCard fuelTankStockCard"/);
assert.match(panel, /Stan zbiornika paliwa/);
assert.match(panel, /Dodaj dostawę/);
assert.match(panel, /tankStatus\.balance_liters/);
assert.match(panel, /tankMovements/);

const migrationFiles = fs.readdirSync(new URL('../supabase/migrations/current/', import.meta.url))
  .filter((name) => /fuel_tank_stock_v1263\.sql$/i.test(name));
assert.equal(migrationFiles.length, 1, 'Brak dokładnie jednej migracji licznika zbiornika 12.63.');
const sql = fs.readFileSync(new URL(`../supabase/migrations/current/${migrationFiles[0]}`, import.meta.url), 'utf8');
assert.match(sql, /fuel_tank_movements/i);
assert.match(sql, /5000(?:\.0+)?/);
assert.match(sql, /2026-10-07 09:57:00\+02/);
assert.match(sql, /sync_fuel_tank_movement/i);
assert.match(sql, /admin_add_fuel_tank_movement/i);
assert.match(sql, /get_fuel_tank_status/i);
assert.match(sql, /fuel_entry_id/i);
assert.match(sql, /on delete cascade/i);

const adminOnlyMigrationFiles = fs.readdirSync(new URL('../supabase/migrations/current/', import.meta.url))
  .filter((name) => /fuel_tank_admin_only_v1263\.sql$/i.test(name));
assert.equal(adminOnlyMigrationFiles.length, 1, 'Brak dokładnie jednej migracji admin-only licznika 12.63.');
const adminOnlySql = fs.readFileSync(new URL(`../supabase/migrations/current/${adminOnlyMigrationFiles[0]}`, import.meta.url), 'utf8');
assert.match(adminOnlySql, /fuel_tank_movements_admin_select/i);
assert.match(adminOnlySql, /current_user_is_admin/i);
assert.match(adminOnlySql, /Tylko administrator może odczytać stan zbiornika paliwa/i);

const fuelModule = fs.readFileSync(new URL('../src/modules/fuel.js', import.meta.url), 'utf8');
assert.match(fuelModule, /if \(!isAdmin\) \{[\s\S]*?tankStatus: null[\s\S]*?tankMovements: \[\]/);

console.log('PASS fuel tank stock v12.63');
