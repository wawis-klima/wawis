const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const variant = String(process.argv[2] || 'all').toLowerCase();
const expected = variant === 'mobile'
  ? ['mobile-release-visual.png']
  : variant === 'desktop'
    ? ['desktop-release-visual.png']
    : ['desktop-release-visual.png', 'mobile-release-visual.png'];

function readPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 24 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
    throw new Error(`${path.basename(filePath)} nie jest poprawnym plikiem PNG.`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
}

for (const filename of expected) {
  const filePath = path.join(root, 'visual-artifacts', filename);
  if (!fs.existsSync(filePath)) throw new Error(`Brak obowiązkowego screenshota wyglądu: visual-artifacts/${filename}`);
  const size = readPngSize(filePath);
  if (size.width < 320 || size.height < 500 || size.bytes < 10_000) {
    throw new Error(`Screenshot ${filename} jest podejrzanie mały: ${size.width}x${size.height}, ${size.bytes} B.`);
  }
  console.log(`OK ${filename}: ${size.width}x${size.height}, ${size.bytes} B`);
}
