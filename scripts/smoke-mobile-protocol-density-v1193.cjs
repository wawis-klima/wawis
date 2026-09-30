const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pdf = fs.readFileSync(path.join(root, 'src', 'mobile791', 'modules', 'job-protocol-pdf.js'), 'utf8');

assert.match(pdf, /const LEGAL_NOTICE_PROFILES = Object\.freeze\(\[/, 'Brakuje profili adaptacyjnej czcionki informacji prawnych.');
assert.match(pdf, /bodyFontSize:\s*9\.4[\s\S]*bodyFontSize:\s*8\.9[\s\S]*bodyFontSize:\s*8\.5/, 'Informacje prawne muszą zmniejszać czcionkę stopniowo, tylko gdy brakuje miejsca.');
assert.match(pdf, /function getLegalNoticeLayout\(doc, maxCardHeight = Number\.POSITIVE_INFINITY\)/, 'Układ informacji prawnych musi uwzględniać dostępne miejsce.');
assert.match(pdf, /layouts\.find\(\(layout\) => layout\.cardHeight <= maxCardHeight\)/, 'Powinien być wybierany pierwszy czytelny układ mieszczący się na stronie.');

assert.match(pdf, /drawSectionTitle\(doc, "Realizacja zlecenia", y\);[\s\S]*drawCard\(doc, y \+ 8, 34\);[\s\S]*y \+= 54;/, 'Sekcja realizacji powinna mieć mniejsze pionowe marginesy.');
assert.match(pdf, /y \+= tableHeight \+ 16;/, 'Odstęp pod tabelą urządzeń powinien być zmniejszony.');
assert.match(pdf, /const paymentCardHeight = hasPaymentAmount \? 38 : 32;/, 'Potwierdzenie zapłaty powinno mieć wysokość dopasowaną do liczby wierszy.');
assert.match(pdf, /y \+= paymentCardHeight \+ 16;/, 'Sekcja płatności nie powinna zostawiać dużego pustego dołu.');

assert.match(pdf, /const confirmationSectionHeight = 150;/, 'Wysokość potwierdzenia klienta musi być uwzględniona przed doborem czcionki informacji prawnych.');
assert.match(pdf, /const availableLegalCardHeight = Math\.max\([\s\S]*PAGE_HEIGHT - 25[\s\S]*confirmationSectionHeight/, 'Dostępne miejsce na informacje prawne musi rezerwować miejsce na podpis klienta.');
assert.match(pdf, /getLegalNoticeLayout\(doc, availableLegalCardHeight\)/, 'Kompaktowy wariant informacji prawnych powinien włączać się automatycznie przy ryzyku drugiej strony.');

console.log('OK: protokół zagęszcza realizację i płatność oraz adaptacyjnie zmniejsza informacje prawne przed przejściem na drugą stronę.');
