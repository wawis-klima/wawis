// WAWIS 14.44: podpis złożony na obróconym telefonie trafia do PDF prosto (kierunek pisania z ruchu palca).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectSignatureWritingAngle as detect } from "../src/mobile791/modules/protocol-signature-orientation.js";

// Podpis w układzie piszącego (x w prawo, y w dół): litery z pętelkami, zawijas na końcu.
function letter(x0, w) {
  const pts = [];
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    pts.push({ x: x0 + w * t, y: 40 + 18 * Math.sin(t * Math.PI * 3) });
  }
  return pts;
}
const writer = [letter(0, 40), letter(48, 30), letter(84, 36), letter(126, 44)];
const withHat = [...writer, [{ x: 0, y: 10 }, { x: 60, y: -8 }, { x: 175, y: 12 }]];
const withBackFlourish = [...writer, [{ x: 175, y: 70 }, { x: 0, y: 72 }]];

// Telefon obrócony o 90° w prawo (zgodnie z ruchem wskazówek): prawa piszącego = dół płótna.
const cw = (s) => s.map((st) => st.map(({ x, y }) => ({ x: 300 - y, y: x })));
const ccw = (s) => s.map((st) => st.map(({ x, y }) => ({ x: y, y: 300 - x })));
const flip = (s) => s.map((st) => st.map(({ x, y }) => ({ x: 300 - x, y: 300 - y })));

// Ten sam obrót co orientSignatureForPdf: czy po nim pismo idzie w prawo, a litery stoją prosto.
function applyPdfRotation(s, angle) {
  const W = 300, H = 300;
  const f = { 0: (p) => p, 90: ({ x, y }) => ({ x: H - y, y: x }), 180: ({ x, y }) => ({ x: W - x, y: H - y }), 270: ({ x, y }) => ({ x: y, y: W - x }) }[angle];
  return s.map((st) => st.map(f));
}
function assertUpright(original, angle, label) {
  const out = applyPdfRotation(original, angle);
  // Litery 1 i 4 (bez zawijasu): po obrocie ostatnia litera ma być na prawo od pierwszej,
  // a „góra” liter (pętelki) nad linią — oś y bez zamiany na x.
  assert.ok(out[3][0].x > out[0][0].x, `${label}: po obrocie pismo ma iść w prawo`);
  assert.ok(Math.abs(out[3][0].y - out[0][0].y) < 1, `${label}: litery w jednej linii`);
}

for (const [label, base] of [["podpis", writer], ["podpis z zawijasem nad", withHat]]) {
  assert.equal(detect(base), 0, `${label}: zwykły telefon — bez obrotu`);
  assert.equal(detect(cw(base)), 270, `${label}: telefon w prawo`);
  assertUpright(cw(base), 270, `${label} cw`);
  assert.equal(detect(ccw(base)), 90, `${label}: telefon w lewo`);
  assertUpright(ccw(base), 90, `${label} ccw`);
  assert.equal(detect(flip(base)), 180, `${label}: telefon do góry nogami`);
  assertUpright(flip(base), 180, `${label} flip`);
}
// Zawijas cofający się w lewo nie może dać błędnego obrotu o 180°.
assert.notEqual(detect(withBackFlourish), 180);
// Brak pewności = dotychczasowy tryb „auto”.
assert.equal(detect([]), null);
assert.equal(detect([[{ x: 5, y: 5 }]]), null, "sama kropka");
assert.equal(detect([[{ x: 0, y: 0 }, { x: 30, y: 30 }]]), null, "ukośna kreska");
assert.equal(detect([[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }]]), null, "tam i z powrotem");
assert.equal(detect(null), null);

const modal = readFileSync(new URL("../src/mobile791/components/modals/ProtocolTestModal.jsx", import.meta.url), "utf8");
assert.match(modal, /detectSignatureWritingAngle\(signatureStrokesRef\.current\)/);
assert.match(modal, /setSignatureRotation\(detectedAngle === null \? "auto" : String\(detectedAngle\)\)/);
assert.equal((modal.match(/signatureStrokesRef\.current = \[\]/g) || []).length, 2, "czyszczenie punktów przy otwarciu i „Wyczyść”");
console.log("PASS WAWIS 14.44 — podpis z obróconego telefonu układany według kierunku pisania.");
