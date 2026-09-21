const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const entryCss = fs.readFileSync(path.join(root, 'src/mobile791/v1092-inline-width.css'), 'utf8');
const polishCss = fs.readFileSync(path.join(root, 'src/mobile791/v1109-mobile-comment-title-polish.css'), 'utf8');

assert(entryCss.includes("@import './v1109-mobile-comment-title-polish.css';"), 'Brak importu stylów 11.09');
assert(polishCss.includes('.mobileInlineJobDetails .detailTitle'), 'Brak reguły dolnej nazwy klienta');
assert(polishCss.includes('text-align: center !important;'), 'Dolna nazwa klienta nie jest wyśrodkowana');
assert(polishCss.includes('.mobileInlineJobDetails .commentAddBtn'), 'Brak reguły przycisku Dodaj komentarz');
assert(polishCss.includes('font-size: 12px !important;'), 'Napis Dodaj komentarz nie został zmniejszony');
assert(!polishCss.includes('jobDevicesTableV888Heading'), 'Nagłówek Urządzenia i tabliczki nie powinien być zmieniany w 11.09');

console.log('OK: dolna nazwa klienta jest wyśrodkowana, a napis Dodaj komentarz zmniejszony');
