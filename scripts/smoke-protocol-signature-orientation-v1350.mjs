import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectSignatureRotation, orientSignatureForPdf } from "../src/mobile791/modules/protocol-signature-orientation.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const modal = read("src/mobile791/components/modals/ProtocolTestModal.jsx");
const pdf = read("src/mobile791/modules/job-protocol-pdf.js");
const storage = read("src/mobile791/modules/job-protocol-storage.js");

assert.equal(selectSignatureRotation(400, 100), 0, "Correct horizontal signature must not rotate");
assert.equal(selectSignatureRotation(100, 400), 90, "Portrait signature rotates 90 degrees");
assert.equal(selectSignatureRotation(100, 119), 0, "Avoid rotating signatures just above square");
assert.equal(selectSignatureRotation(100, 121), 90, "Threshold is strict 1.2");
assert.equal(selectSignatureRotation(400, 100, "270"), 270);
assert.equal(selectSignatureRotation(100, 400, "0"), 0);
assert.equal(selectSignatureRotation(100, 400, "180"), 180);
assert.throws(() => selectSignatureRotation(0, 20), /wymiary/);
assert.throws(() => selectSignatureRotation(300, 80, "45"), /kąt/);

const png = "data:image/png;base64,iVBORw0KGgo=";
let dimensions = [90, 320];
const ops = [];
globalThis.Image = class {
  set src(_src) {
    this.naturalWidth = dimensions[0];
    this.naturalHeight = dimensions[1];
    queueMicrotask(() => this.onload?.());
  }
};
globalThis.document = { createElement(tag) {
  assert.equal(tag, "canvas");
  return {
    width: 0, height: 0,
    getContext() {
      return {
        fillRect() {},
        translate(...args) { ops.push(["translate", ...args]); },
        rotate(value) { ops.push(["rotate", value]); },
        drawImage() { ops.push(["drawImage"]); }
      };
    },
    toDataURL() { return "data:image/png;base64,cm90YXRlZA=="; },
  };
}};
await orientSignatureForPdf(png, "auto");
assert(ops.some((o) => o[0] === "rotate" && Math.abs(o[1] - Math.PI / 2) < .01));
ops.length = 0;
assert.equal(await orientSignatureForPdf(png, "0"), png);
assert.equal(ops.length, 0);
ops.length = 0;
await orientSignatureForPdf(png, "270");
assert(ops.some((o) => o[0] === "rotate" && Math.abs(o[1] + Math.PI / 2) < .01));
dimensions = [400, 90]; ops.length = 0;
assert.equal(await orientSignatureForPdf(png, "auto"), png);
assert.equal(ops.length, 0);
await assert.rejects(() => orientSignatureForPdf("not-an-image"), /obraz/);

// Guard the actual chain: original PNG must be uploaded unchanged;
// the rotated copy is used ONLY when constructing the PDF.
assert.match(modal, /const orientedSignatureDataUrl = await orientSignatureForPdf\(signatureDataUrl, signatureRotation\)/);
assert.match(modal, /createJobProtocolPdfFile\(\{ job: updatedJob, profiles, signatureDataUrl: orientedSignatureDataUrl,/);
assert.match(modal, /signatureDataUrl: reuseStoredSignature \? "" : signatureDataUrl,/);
assert.match(modal, /loadStoredProtocolSignature\(\{ supabase, record: savedRecord \}\)/);
assert.match(modal, /value=\{signatureRotation\}/);
assert.match(modal, /signaturePdfPreview/);
assert.match(pdf, /getContainedSignatureSize\(image.width, image.height, clientSignatureMaxWidth, clientSignatureMaxHeight\)/);
assert.match(storage, /signature_path/);
assert.match(storage, /revision_history/);
console.log("PASS SIGNATURE-1350: orientation, manual directions, image copy, reuse, PDF chain and history");
