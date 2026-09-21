const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const layout = fs.readFileSync(path.join(root, 'src/mobile791/components/jobs/MobileJobsLayout.jsx'), 'utf8');

assert.match(layout, /const jobCardRefs = useRef\(new Map\(\)\);/, 'Brak referencji do kart montaży');
assert.match(layout, /const pendingScrollJobIdRef = useRef\(""\);/, 'Brak identyfikatora karty oczekującej na przewinięcie');
assert.match(layout, /pendingScrollJobIdRef\.current = clickedJobId;\s+setSelectedJob\(job\);/, 'Zmiana klienta nie uruchamia przewinięcia');
assert.match(layout, /selectedCard\.scrollIntoView\(\{ behavior: prefersReducedMotion \? "auto" : "smooth", block: "start" \}\);/, 'Nowa karta nie jest przewijana do początku');
assert.match(layout, /if \(renderedSelectedJobId === clickedJobId\)[\s\S]*pendingScrollJobIdRef\.current = "";[\s\S]*setSelectedJob\(null\);/, 'Ponowne kliknięcie tej samej karty powinno wyłącznie zamknąć szczegóły');
assert.match(layout, /window\.requestAnimationFrame[\s\S]*window\.requestAnimationFrame/, 'Przewinięcie musi poczekać na zakończenie zmiany układu');

console.log('OK: przełączenie montażu przewija nową kartę do początku po zmianie układu');
