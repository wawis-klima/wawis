const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const component = fs.readFileSync(path.join(root, 'src/mobile791/components/JobDetailsPanel.jsx'), 'utf8');
const entryCss = fs.readFileSync(path.join(root, 'src/mobile791/v1092-inline-width.css'), 'utf8');
const polishCss = fs.readFileSync(path.join(root, 'src/mobile791/v1108-mobile-detail-polish.css'), 'utf8');

assert(entryCss.includes("@import './v1108-mobile-detail-polish.css';"), 'Brak importu stylów 11.08');
assert(component.includes('className="commentAuthor"'), 'Brak osobnej klasy autora komentarza');
assert(component.includes('className="commentText"'), 'Brak osobnej klasy treści komentarza');
assert(!component.includes('<strong>{comment.author_name}</strong> — {comment.type}'), 'Typ komentarza nadal jest pokazywany przy autorze');
assert(polishCss.includes('.mobileInlineJobDetails .detailTitle'), 'Brak mobilnego rozmiaru nazwy klienta');
assert(polishCss.includes('font-size: 15px !important;'), 'Nazwa klienta nie ma skali zgodnej z kartą listy');
assert(polishCss.includes('.contactAddressInfoItem .infoValue'), 'Brak centrowania adresu');
assert(polishCss.includes('justify-content: center !important;'), 'Adres nie jest wyśrodkowany');
assert(polishCss.includes('flex-wrap: nowrap !important;'), 'Autor i przycisk usuwania mogą złamać się na dwa wiersze');

console.log('OK: mobilny nagłówek, adres i komentarze mają układ 11.08');
