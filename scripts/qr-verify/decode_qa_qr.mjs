// Decode the QR from a screenshot using the SAME jsQR decoder as the
// web test-suite (camera-equivalent pipeline; Apache-2.0 jsQR dist in
// scripts/qr-verify/). Usage: node decode_qa_qr.mjs <screenshot.png>
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PNG } = require("/home/z/my-project/node_modules/pngjs");
const jsQR = require("/home/z/my-project/scripts/qr-verify/jsQR.js");

const path = process.argv[2];
const png = PNG.sync.read(readFileSync(path));
const { width, height, data } = png;
const result = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width, height);
if (result && result.data) {
  console.log("DECODED:", result.data);
  process.exit(0);
}
console.log("NOT-DECODED by jsQR (full-frame)");
process.exit(2);
