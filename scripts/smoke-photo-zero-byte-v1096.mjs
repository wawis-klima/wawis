import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  assertNonEmptyPhotoFile as assertMobilePhoto,
  PHOTO_ZERO_BYTES_ERROR_CODE as MOBILE_CODE,
} from '../src/mobile791/modules/photos.js';
import {
  assertNonEmptyPhotoFile as assertDesktopPhoto,
  PHOTO_ZERO_BYTES_ERROR_CODE as DESKTOP_CODE,
} from '../src/modules/photos.js';

for (const [label, guard, code] of [
  ['mobile', assertMobilePhoto, MOBILE_CODE],
  ['desktop', assertDesktopPhoto, DESKTOP_CODE],
]) {
  assert.equal(code, 'PHOTO_ZERO_BYTES');
  assert.throws(
    () => guard({ size: 0, name: 'empty.jpg' }),
    (error) => error?.code === 'PHOTO_ZERO_BYTES' && /0 B/.test(error.message),
    label + ': zero-byte file must be rejected',
  );
  const valid = { size: 4, name: 'ok.jpg' };
  assert.equal(guard(valid), valid, label + ': non-empty file must pass');
}

const mobile = fs.readFileSync(new URL('../src/mobile791/modules/photos.js', import.meta.url), 'utf8');
assert.match(mobile, /assertNonEmptyPhotoFile\(uploadFile\)/);
assert.match(mobile, /isZeroBytePhotoError\(insertResult\.error\)[\s\S]*remove\(\[storagePath\]\)/);

const desktop = fs.readFileSync(new URL('../src/modules/photos.js', import.meta.url), 'utf8');
assert.match(desktop, /assertNonEmptyPhotoFile\(compressedFile\)/);
assert.match(desktop, /isZeroBytePhotoError\(photoError\)[\s\S]*remove\(\[path\]\)/);

const migration = fs.readFileSync(new URL('../supabase/migrations/20260919080000_photo_zero_byte_guard_v1096.sql', import.meta.url), 'utf8');
assert.match(migration, /PHOTO_ZERO_BYTES/);
assert.match(migration, /before insert or update of storage_path on public\.photos/i);
assert.match(migration, /photo_zero_byte_needs_reupload/);
assert.match(migration, /\(o\.metadata->>'size'\)::bigint=0/);

console.log('PASS v10.96 zero-byte photo guard.');
