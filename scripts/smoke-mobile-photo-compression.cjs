const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mobilePhotosPath = path.join(root, 'src', 'mobile791', 'modules', 'photos.js');
const mobileJobDetailsPath = path.join(root, 'src', 'mobile791', 'components', 'JobDetailsPanel.jsx');
const desktopPhotosPath = path.join(root, 'src', 'modules', 'photos.js');

const mobilePhotosSource = fs.readFileSync(mobilePhotosPath, 'utf8');
const mobileJobDetailsSource = fs.readFileSync(mobileJobDetailsPath, 'utf8');
const desktopPhotosSource = fs.readFileSync(desktopPhotosPath, 'utf8');

assert.match(mobilePhotosSource, /export const MOBILE_PHOTO_MAX_DIMENSION_PX = 1800;/, 'Mobile photo max dimension should be 1800px');
assert.match(mobilePhotosSource, /export const MOBILE_PHOTO_JPEG_QUALITY = 0\.78;/, 'Mobile JPEG quality should be 0.78');
assert.match(mobilePhotosSource, /export async function preparePhotoForUpload\(file\)/, 'Mobile upload should have a preparation/compression step');
assert.match(mobilePhotosSource, /URL\.createObjectURL\(file\)/, 'Compression should use object URLs instead of base64 FileReader for lower memory pressure');
assert.match(mobilePhotosSource, /canvas\.toBlob\([\s\S]*'image\/jpeg',[\s\S]*MOBILE_PHOTO_JPEG_QUALITY/s, 'Compression should export JPEG using configured quality');
assert.match(mobilePhotosSource, /blob\.size >= file\.size && scale >= 1/, 'Compression should avoid uploading a bigger recompressed file');
assert.match(mobilePhotosSource, /compressImageFn = preparePhotoForUpload/, 'Upload queue should default to compressed mobile photo preparation');
assert.match(mobilePhotosSource, /\.upload\(storagePath, uploadBody, \{ cacheControl: '3600', upsert: false, contentType: uploadFile\.type \|\| 'image\/jpeg' \}\)/, 'Supabase upload should pass the verified transport body with content type');
assert.match(mobilePhotosSource, /upload_saved_percent/, 'UI metadata should include compression savings');
assert.doesNotMatch(mobilePhotosSource, /getPhotoCompressionSummary|upload_note|zmniejszone o/, 'Mobile compression must stay hidden from the photo card UI');

assert.match(mobileJobDetailsSource, /photo\.upload_status_label/, 'Photo status label should support the compression phase');
assert.doesNotMatch(mobileJobDetailsSource, /photoCompressionNote|photo\.upload_note/, 'Photo card should not show technical compression savings after upload');
assert.doesNotMatch(desktopPhotosSource, /MOBILE_PHOTO_MAX_DIMENSION_PX|preparePhotoForUpload|photoCompressionNote/, 'Desktop photo module should remain untouched by mobile compression work');

(async () => {
  const { pathToFileURL } = require('node:url');
  const photos = await import(pathToFileURL(mobilePhotosPath).href);
  const original = new Blob([Buffer.from('WAWIS-JPEG-BYTES-1346')], { type: 'image/jpeg' });
  const iosBody = await photos.getMobileStorageUploadBody(original, { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X)' });
  assert.equal(iosBody instanceof ArrayBuffer, true, 'iOS must send raw binary, not multipart FormData');
  assert.equal(Buffer.from(iosBody).toString('utf8'), 'WAWIS-JPEG-BYTES-1346');
  const ipadBody = await photos.getMobileStorageUploadBody(original, { userAgent: 'Macintosh', maxTouchPoints: 5 });
  assert.equal(ipadBody instanceof ArrayBuffer, true, 'iPad desktop UA must use the binary path');
  const otherBody = await photos.getMobileStorageUploadBody(original, { userAgent: 'Mozilla/5.0 (Android)' });
  assert.equal(otherBody instanceof ArrayBuffer, true, 'every client uses validated binary transport');
  assert.deepEqual(Buffer.from(otherBody), Buffer.from(iosBody), 'transport preserves exactly the same bytes on every platform');
  await assert.rejects(() => photos.getMobileStorageUploadBody({ size: 9, arrayBuffer: async () => new ArrayBuffer(0) }, { userAgent: 'iPhone' }), /pełnej zawartości bajtowej/);
  await assert.rejects(() => photos.getMobileStorageUploadBody({ size: 9, arrayBuffer: async () => new ArrayBuffer(4) }, { userAgent: 'iPhone' }), /pełnej zawartości bajtowej/);
  console.log('Mobile photo compression and iOS empty-multipart protection smoke OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
