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
assert.match(mobilePhotosSource, /\.upload\(storagePath, uploadFile, \{ cacheControl: '3600', upsert: false, contentType: uploadFile\.type \|\| 'image\/jpeg' \}\)/, 'Supabase upload should send the prepared upload file with content type');
assert.match(mobilePhotosSource, /upload_saved_percent/, 'UI metadata should include compression savings');
assert.doesNotMatch(mobilePhotosSource, /getPhotoCompressionSummary|upload_note|zmniejszone o/, 'Mobile compression must stay hidden from the photo card UI');

assert.match(mobileJobDetailsSource, /photo\.upload_status_label/, 'Photo status label should support the compression phase');
assert.doesNotMatch(mobileJobDetailsSource, /photoCompressionNote|photo\.upload_note/, 'Photo card should not show technical compression savings after upload');
assert.doesNotMatch(desktopPhotosSource, /MOBILE_PHOTO_MAX_DIMENSION_PX|preparePhotoForUpload|photoCompressionNote/, 'Desktop photo module should remain untouched by mobile compression work');

console.log('Mobile photo compression smoke OK');
process.exit(0);
