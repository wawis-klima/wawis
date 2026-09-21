const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

async function main() {
  const moduleUrl = pathToFileURL(path.join(root, 'src', 'modules', 'nameplate-verification.js')).href;
  const { getJobNameplateVerificationSummary } = await import(moduleUrl);

  const singleJob = {
    id: 'job-single',
    devices: [{
      device_type: 'single-split',
      outdoor_model: 'TO35Xo R17',
      indoor_models: ['T35Xi R17'],
      outdoor_serial_number: 'OUT-1',
      indoor_serial_numbers: ['IN-1'],
    }],
    nameplatePhotosMeta: [{
      id: 'photo-jz',
      job_id: 'job-single',
      storage_path: 'job-single/nameplates/device-1_jz_abc.jpg',
      ocr_status: 'approved',
    }],
    nameplateVerifications: [],
  };

  const pending = getJobNameplateVerificationSummary(singleJob);
  assert.equal(pending.state, 'pending');
  assert.equal(pending.total, 2);
  assert.equal(pending.approved, 1);
  assert.equal(pending.pending, 1);
  assert.equal(pending.missingPhotos, 1);

  const manuallyApproved = getJobNameplateVerificationSummary({
    ...singleJob,
    nameplateVerifications: [{
      id: 'manual-jw1',
      job_id: 'job-single',
      device_index: 1,
      unit_ref: 'jw-1',
      verified_at: '2026-08-08T06:00:00.000Z',
    }],
  });
  assert.equal(manuallyApproved.state, 'approved');
  assert.equal(manuallyApproved.approved, 2);
  assert.equal(manuallyApproved.manualApproved, 1);
  assert.equal(manuallyApproved.missingPhotos, 1, 'Ręczne potwierdzenie nie może udawać, że istnieje zdjęcie.');

  const multiJob = {
    id: 'job-multi',
    devices: [{
      device_type: 'multi-split',
      outdoor_model: 'H50Xm2 R15',
      indoor_models: ['I26Xi R15', 'I26Xi R15'],
      outdoor_serial_number: 'MULTI-OUT',
      indoor_serial_numbers: ['MULTI-IN-1', 'MULTI-IN-2'],
    }],
    nameplatePhotosMeta: [
      { id: 'm-jz', job_id: 'job-multi', storage_path: 'job-multi/nameplates/device-1_jz_a.jpg', ocr_status: 'approved' },
      { id: 'm-jw1', job_id: 'job-multi', storage_path: 'job-multi/nameplates/device-1_jw-1_a.jpg', ocr_status: 'approved' },
      { id: 'm-jw2', job_id: 'job-multi', storage_path: 'job-multi/nameplates/device-1_jw-2_a.jpg', ocr_status: 'pending' },
    ],
    nameplateVerifications: [],
  };
  const multiPending = getJobNameplateVerificationSummary(multiJob);
  assert.equal(multiPending.total, 3);
  assert.equal(multiPending.approved, 2);
  assert.equal(multiPending.pending, 1);

  const noDevice = getJobNameplateVerificationSummary({ id: 'empty', device_model: '', device_serial_number: '' });
  assert.equal(noDevice.state, 'none');
  assert.equal(noDevice.total, 0);

  const columnsSource = fs.readFileSync(path.join(root, 'src', 'components', 'desktop-jobs-table.columns.jsx'), 'utf8');
  assert.match(columnsSource, /key:\s*["']nameplates["']/);
  assert.match(columnsSource, /label:\s*["']Tabliczki["']/);
  assert.match(columnsSource, /Potwierdzone/);
  assert.match(columnsSource, /Niepotwierdzone/);

  const cardsSource = fs.readFileSync(path.join(root, 'src', 'components', 'desktop', 'DesktopJobDeviceCards.jsx'), 'utf8');
  assert.match(cardsSource, /Potwierdź ręcznie/);
  assert.match(cardsSource, /Cofnij ręczne/);
  assert.match(cardsSource, /potwierdzony ręcznie/);

  const sql = fs.readFileSync(path.join(root, 'nameplate-manual-verifications-v9.13.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.nameplate_manual_verifications/i);
  assert.match(sql, /unique \(job_id, device_index, unit_ref\)/i);
  assert.match(sql, /current_user_is_admin\(\)/i);
  assert.match(sql, /for insert[\s\S]*with check \(public\.current_user_is_admin\(\)\)/i);
  assert.match(sql, /for delete[\s\S]*using \(public\.current_user_is_admin\(\)\)/i);

  const mobileRequirementsSource = fs.readFileSync(
    path.join(root, 'src', 'mobile791', 'modules', 'nameplate-requirements.js'),
    'utf8',
  );
  const mobilePanelSource = fs.readFileSync(
    path.join(root, 'src', 'mobile791', 'components', 'JobDetailsPanel.jsx'),
    'utf8',
  );
  const v1092Sql = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '20260917235600_admin_finish_without_nameplates_v1092.sql'),
    'utf8',
  );

  // 10.90: administrator może przejść do serwerowego guardu bez kompletu zdjęć,
  // ale pracownik nadal ma allowLocal=true i nie dostaje tego bypassu.
  assert.match(mobilePanelSource, /getJobNameplateCompletion\(selectedJob,\s*\{\s*allowLocal:\s*!isAdmin\s*\}\)/);
  assert.match(mobileRequirementsSource, /adminServerGuard\s*=\s*Object\.prototype\.hasOwnProperty\.call\(options,\s*['"]allowLocal['"]\)[\s\S]*options\.allowLocal\s*===\s*false/);
  assert.match(mobileRequirementsSource, /serverGuardRequired:\s*adminServerGuard\s*&&\s*!photosComplete/);
  assert.match(mobileRequirementsSource, /isComplete:\s*photosComplete\s*\|\|\s*adminServerGuard/);

  // 10.92: ręczne potwierdzenia mogą pozostać dostępne administracyjnie,
  // ale zakończenie przez administratora nie zależy już od nich.
  assert.match(mobilePanelSource, /Potwierdź ręcznie/);
  assert.match(mobilePanelSource, /const effectiveNameplateComplete = isAdmin \? true : nameplateCompletion\.isComplete;/);
  assert.match(v1092Sql, /v_admin_bypass\s+boolean\s*:=\s*\([\s\S]*auth\.role\(\)[\s\S]*service_role[\s\S]*public\.current_user_is_admin\(\)/i);
  assert.match(v1092Sql, /if\s+v_admin_bypass\s+then[\s\S]*return;/i);
  assert.doesNotMatch(v1092Sql, /from public\.nameplate_manual_verifications\s+mv/i);
  assert.match(v1092Sql, /raise exception 'job_nameplates_incomplete:/i);

  console.log('desktop nameplate verification status smoke: OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});