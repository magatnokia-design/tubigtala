// Makes the Wi-Fi SETUP password of a TubigTala Station and its printable sticker
// (docs/device-setup.md, "Wi-Fi setup"). The station opens its own setup network
// "TubigTala-Setup-<station-id>" when it has no working Wi-Fi (firmware 0.4.0+); the sticker's QR
// joins that network from a phone camera, and shows the name and password to type instead.
//
//   npm run setup-sticker -- tank-01           sticker for the password already in secrets.h
//   npm run setup-sticker -- tank-01 --write   NEW password, written into firmware/tubigtala/secrets.h
//
// The password is never printed: it lives only in secrets.h and on the sticker (both git-ignored).
// After --write, re-flash the station, and replace the old sticker.
import { randomInt } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CODE_ALPHABET, STATION_NAME, stationIdError } from '../mobile/src/domain/pairing.ts';

const args = process.argv.slice(2);
const deviceId = args.find((a) => !a.startsWith('--')) ?? '';
const write = args.includes('--write');
const idProblem = stationIdError(deviceId);
if (idProblem) {
  console.error(`Usage: npm run setup-sticker -- <station-id> [--write]\n${idProblem}`);
  process.exit(1);
}

const secretsPath = join(import.meta.dirname, '..', 'firmware', 'tubigtala', 'secrets.h');
let secrets;
try {
  secrets = readFileSync(secretsPath, 'utf8');
} catch {
  console.error('firmware/tubigtala/secrets.h not found: copy secrets.example.h to secrets.h and fill it in first.');
  process.exit(1);
}
// One secrets.h per station: refuse to put one station's password into another's build.
const secretsId = secrets.match(/^#define\s+DEVICE_ID\s+"([^"]*)"/m)?.[1];
if (secretsId !== deviceId) {
  console.error(`secrets.h is for station "${secretsId}", not "${deviceId}" - nothing changed.`);
  process.exit(1);
}

const PASSWORD_LINE = /^#define\s+SETUP_AP_PASSWORD\s+"([^"]*)"\s*$/m;
let password = secrets.match(PASSWORD_LINE)?.[1];
if (write) {
  // 10 characters from the pairing code's alphabet (no 0/O, 1/I/L): easy to type, ~49 bits.
  password = Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  const line = `#define SETUP_AP_PASSWORD "${password}"`;
  secrets = PASSWORD_LINE.test(secrets)
    ? secrets.replace(PASSWORD_LINE, line)
    : `${secrets.trimEnd()}\n\n// Password of this station's Wi-Fi setup network (devtools: npm run setup-sticker).\n${line}\n`;
  writeFileSync(secretsPath, secrets);
}
if (!password || password.length < 8) {
  console.error('No SETUP_AP_PASSWORD (8+ characters) in secrets.h - run again with --write.');
  process.exit(1);
}

const ssid = `TubigTala-Setup-${deviceId}`;
// Wi-Fi QR format understood by Android and iOS cameras; \ ; , : " must be escaped.
const esc = (s) => s.replace(/([\\;,:"])/g, '\\$1');
const qr = `WIFI:T:WPA;S:${esc(ssid)};P:${esc(password)};;`;

const outDir = join(import.meta.dirname, 'out');
mkdirSync(outDir, { recursive: true });
const sticker = join(outDir, `setup-wifi-${deviceId}.html`);
// 5 x 1.5 in, like the other TubigTala stickers. The QR is drawn by qrcodejs from cdnjs; the
// password stays in this file on the PC and is not sent anywhere.
writeFileSync(sticker, `<!doctype html>
<html><head><meta charset="utf-8"><title>${STATION_NAME} ${deviceId} - Wi-Fi setup sticker</title>
<style>
  @page { size: 5in 1.5in; margin: 0; }
  body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0B2540; }
  .sticker { box-sizing: border-box; width: 5in; height: 1.5in; padding: 0.1in 0.16in; display: flex; gap: 0.16in; align-items: center; background: #fff; border: 1px dashed #9aa; }
  #qr { flex: none; width: 1.26in; height: 1.26in; }
  #qr img, #qr canvas { width: 1.26in !important; height: 1.26in !important; }
  .text { min-width: 0; }
  h1 { margin: 0 0 3px; font-size: 15px; } h1 span { color: #0079CE; }
  ol { margin: 0 0 5px; padding-left: 16px; font-size: 11px; line-height: 1.35; }
  .creds { font-size: 11px; } .creds b { font: 700 12px ui-monospace, Consolas, monospace; letter-spacing: 0.5px; }
  .hint { font-size: 12px; margin: 10px; } @media print { .hint { display: none; } .sticker { border: 0; } }
</style></head><body>
<div class="sticker">
  <div id="qr"></div>
  <div class="text">
    <h1>${STATION_NAME} <span>&middot; Wi-Fi setup</span></h1>
    <ol>
      <li>Scan this code with your phone camera to join the station's setup Wi-Fi.</li>
      <li>The setup page opens: choose your home Wi-Fi and type its password.</li>
    </ol>
    <div class="creds">Network <b>${ssid}</b> &middot; Password <b>${password}</b></div>
  </div>
</div>
<p class="hint">Private: the password opens this station's setup network. Print at 100% and stick it on the station.</p>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script>new QRCode(document.getElementById('qr'), { text: ${JSON.stringify(qr)}, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M });</script>
</body></html>
`);

console.log(`${STATION_NAME} ${deviceId}
  setup network: ${ssid}
  password:      ${write ? 'NEW, written to firmware/tubigtala/secrets.h' : 'the one in firmware/tubigtala/secrets.h'} (not shown)
  sticker:       ${sticker}${write ? '\n  next:          re-flash the station so it uses the new password, and print the new sticker' : ''}`);
