import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const mobileStyles = [
  'src/mobile791/styles.css',
  'src/mobile791/v1090-details-width.css',
  'src/mobile791/v1091-mobile-details-hardening.css',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const mobileDetailsSource = fs.readFileSync(path.join(root, 'src/mobile791/components/JobDetailsPanel.jsx'), 'utf8');
const productionEntrySource = fs.readFileSync(path.join(root, 'src/main.jsx'), 'utf8');

test.describe('@mobile 10.92 regressions', () => {
  test('produkcyjny mobilny entrypoint ładuje hardening szerokości 10.90/10.91', async () => {
    expect(productionEntrySource).toContain("import('./mobile791/v1090-details-width.css')");
    expect(productionEntrySource).toContain("import('./mobile791/v1091-mobile-details-hardening.css')");
    expect(productionEntrySource).toContain("import('./mobile791/v1092-inline-width.css')");
  });

  test('administrator może zakończyć bez tabliczek tylko po dodaniu urządzenia', async () => {
    expect(mobileDetailsSource).toContain('const effectiveNameplateComplete = nameplateCompletion.isComplete;');
    expect(mobileDetailsSource).toContain('Najpierw dodaj urządzenie (JW/JZ), aby zakończyć zlecenie.');

    const migrationFiles = fs.readdirSync(path.join(root, 'supabase/migrations'))
      .filter((name) => name.includes('require_device_before_completion_v1192') && name.endsWith('.sql'));
    expect(migrationFiles.length).toBeGreaterThan(0);

    const migrationSource = fs.readFileSync(path.join(root, 'supabase/migrations', migrationFiles.at(-1)), 'utf8');
    expect(migrationSource).toContain('public.current_user_is_admin()');
    expect(migrationSource).toContain("raise exception 'job_devices_missing'");
    expect(migrationSource).toMatch(/if\s+not\s+v_has_device_data\s+then[\s\S]*job_devices_missing[\s\S]*if\s+v_admin_bypass\s+then/i);
    expect(migrationSource).toMatch(/if\s+v_admin_bypass\s+then[\s\S]*return;/i);
    expect(migrationSource).toContain("raise exception 'job_nameplates_incomplete:");
    expect(migrationSource).toContain('from public.photos p');
    expect(migrationSource).not.toContain('from public.nameplate_manual_verifications mv');
  });
});
