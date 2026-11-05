// Makes the pairing code for a TubigTala Station and a printable QR sticker
// (docs/device-setup.md, "Pairing code and QR sticker"). The format comes from the app's own
// mobile/src/domain/pairing.ts, so the sticker and the scanner cannot disagree.
//
// Usage:  npm run pair-code -- tank-01             new code + out/station-tank-01.html (sticker)
//         npm run pair-code -- sim-01 --emulator   also saves it in the local emulator
//
// The code is a secret until it is on the sticker: out/ is git-ignored - never commit it. For the
// real project, the script only prints; you enter the code in the Firebase console yourself.
import { randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CODE_ALPHABET, CODE_LENGTH, formatCode, pairingPayload, STATION_NAME, stationIdError } from '../mobile/src/domain/pairing.ts';

const args = process.argv.slice(2);
const deviceId = args.find((a) => !a.startsWith('--')) ?? '';
const toEmulator = args.includes('--emulator');
const idProblem = stationIdError(deviceId);
if (idProblem) {
  console.error(`Usage: npm run pair-code -- <station-id> [--emulator]\n${idProblem}`);
  process.exit(1);
}

// crypto.randomInt is uniform, so every code is equally likely.
const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const payload = pairingPayload({ deviceId, code });

const outDir = join(import.meta.dirname, 'out');
mkdirSync(outDir, { recursive: true });
const sticker = join(outDir, `station-${deviceId}.html`);
// Opened locally in a browser and printed. The QR is drawn by qrcodejs from cdnjs; the code stays
// in this file on the PC and is not sent anywhere.
writeFileSync(sticker, `<!doctype html>
<html><head><meta charset="utf-8"><title>${STATION_NAME} ${deviceId} - pairing sticker</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #0B2540; }
  .sticker { width: 62mm; border: 1px dashed #9aa; padding: 4mm; text-align: center; }
  #qr { display: flex; justify-content: center; margin: 2mm 0; }
  h1 { font-size: 13px; margin: 0; } p { margin: 1mm 0; font-size: 11px; } .code { font: 600 13px ui-monospace, monospace; letter-spacing: 1px; }
  @media print { .hint { display: none; } }
</style></head><body>
<p class="hint">Print this page and stick the label on the station's case. Keep the file private: anyone with the code can pair an unpaired station.</p>
<div class="sticker">
  <h1>${STATION_NAME}</h1>
  <div id="qr"></div>
  <p>ID: <span class="code">${deviceId}</span></p>
  <p>Code: <span class="code">${formatCode(code)}</span></p>
  <p>TubigTala app &rsaquo; Settings &rsaquo; Add ${STATION_NAME}</p>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script>new QRCode(document.getElementById('qr'), { text: ${JSON.stringify(payload)}, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });</script>
</body></html>
`);

console.log(`${STATION_NAME} ${deviceId}
  pairing code:  ${formatCode(code)}
  QR contains:   ${payload}
  sticker:       ${sticker}`);

if (toEmulator) {
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { PROJECT_ID, FIRESTORE_HOST, FIRESTORE_PORT } = await import('./emulator.mjs');
  process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;
  initializeApp({ projectId: PROJECT_ID });
  await getFirestore().doc(`devicePairing/${deviceId}`).set({ code });
  console.log(`  saved to the emulator (${PROJECT_ID}): devicePairing/${deviceId}`);
} else {
  console.log(`
For the real project, in the Firebase console (Firestore Database > Data):
  1. Collection "devicePairing" > document ID "${deviceId}" > field  code (string) = ${code}
  2. In devices/${deviceId}: ownerUid (null), name (string) = ${STATION_NAME}
Then print the sticker and pair from the app (Settings > Add ${STATION_NAME}).`);
}
