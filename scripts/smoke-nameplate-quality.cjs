const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const quality = fs.readFileSync(path.join(root, 'src/mobile791/modules/nameplate-quality.js'), 'utf8');
const capture = fs.readFileSync(path.join(root, 'src/mobile791/components/nameplate/NameplatePhotoCapture.jsx'), 'utf8');

assert(quality.includes('calculateLaplacianVariance'), 'Brak kontroli ostrości/poruszenia.');
assert(quality.includes("code: 'dark'"), 'Brak kontroli zbyt ciemnego zdjęcia.');
assert(quality.includes("code: 'glare'"), 'Brak kontroli mocnego odblasku.');
assert(quality.includes("code: 'small'"), 'Brak kontroli zbyt małej tabliczki.');
assert(capture.includes('analyzeNameplatePhotoQuality'), 'Kontrola jakości nie jest podłączona do kadrowania.');
assert(capture.includes('Sprawdź jakość tabliczki'), 'Brak czytelnego ostrzeżenia jakości.');
assert(capture.includes('Zapisz mimo to'), 'Pracownik nie może zatwierdzić zdjęcia mimo ostrzeżenia.');
assert(!/tesseract|zxing|ocr/i.test(quality), 'Kontrola jakości nie może przywracać OCR.');

console.log('OK smoke-nameplate-quality');
