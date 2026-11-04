// End-to-end test on the local emulators: writes readings the way a board does and checks what
// the deployed-style function (onReadingCreated) did. Emulator-only project (demo-tubigtala), log
// providers only - nothing is sent. Run: npm run test:e2e (builds, starts the emulators, runs this).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run through "npm run test:e2e" so it only ever touches the emulators');
initializeApp({ projectId: 'demo-tubigtala' });
const db = getFirestore();
let uid = '';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(what: string, check: () => Promise<T | undefined>, timeoutMs = 30_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await check();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(500);
  }
}

async function addDevice(id: string, simulated: boolean) {
  await db.doc(`devices/${id}`).set({
    name: id, ownerUid: uid, deviceUid: `board-${id}`, simulated, readingIntervalSec: 60, createdAt: FieldValue.serverTimestamp(),
  });
}

let seq = 0;
/** Writes readings one by one, like a board at a fast interval, so serverTime order = write order. */
async function upload(deviceId: string, values: { ph?: number | null; temperatureC?: number | null; phCalibrated?: boolean }[], simulated = false) {
  for (const v of values) {
    await db.doc(`devices/${deviceId}/readings/e2e-${seq++}`).create({
      bootId: 'e2e', seq, serverTime: FieldValue.serverTimestamp(), deviceTime: null,
      ph: v.ph ?? 7.0, phCalibrated: v.phCalibrated ?? true, phMv: 2500, temperatureC: v.temperatureC ?? 27, nh3GasMv: 300,
      simulated, firmware: 'e2e',
    });
    await sleep(1500);
  }
}

const deliveries = async (deviceId: string, channel: string) =>
  (await db.collection('alertDeliveries').where('deviceId', '==', deviceId).where('channel', '==', channel).get()).docs.map((d) => d.data());
const alertsFor = async (deviceId: string, metric: string) =>
  (await db.collection(`users/${uid}/notifications`).where('deviceId', '==', deviceId).where('metric', '==', metric).get()).docs.map((d) => d.data());

before(async () => {
  uid = (await getAuth().createUser({ email: 'owner@tubigtala.test', password: 'e2e-pass-123' })).uid;
  await db.doc(`users/${uid}`).set({
    displayName: 'E2E Owner', phoneE164: '+639000000001', smsAlertsEnabled: true, pushEnabled: false,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
});

test('critical temperature: one alert, one email, one SMS after 3 readings, none repeated', async () => {
  await addDevice('e2e-real', false);
  await upload('e2e-real', [{ temperatureC: 40 }, { temperatureC: 40 }]);
  await sleep(2000);
  assert.equal((await deliveries('e2e-real', 'sms')).length, 0, 'no SMS before the third critical reading');

  await upload('e2e-real', [{ temperatureC: 40 }, { temperatureC: 41 }]);
  const sms = await until('SMS delivery', async () => {
    const d = await deliveries('e2e-real', 'sms');
    return d.length && d.every((x) => x.status !== 'sending') ? d : undefined;
  });
  await sleep(3000); // let the fourth reading finish too

  assert.equal(sms.length, 1, 'one SMS for the whole episode');
  assert.equal(sms[0].status, 'sent');
  assert.equal(sms[0].metric, 'temperatureC');
  const alerts = await alertsFor('e2e-real', 'temperatureC');
  assert.equal(alerts.length, 1, 'one alert for one ongoing condition');
  assert.equal(alerts[0].title, 'e2e-real: water too hot');
  const emails = await deliveries('e2e-real', 'email');
  assert.equal(emails.length, 1, 'one email, for the reading that raised the alert');
  assert.equal(emails[0].status, 'sent');
  const budget = (await db.doc('smsBudget/global').get()).data();
  assert.equal(budget?.dayCount, 1);
});

test('simulated device: alert and email, never an SMS', async () => {
  await addDevice('e2e-sim', true);
  await upload('e2e-sim', [{ temperatureC: 40 }, { temperatureC: 40 }, { temperatureC: 40 }], true);
  await until('email delivery', async () => ((await deliveries('e2e-sim', 'email')).length ? true : undefined));
  await sleep(3000);
  assert.equal((await alertsFor('e2e-sim', 'temperatureC')).length, 1);
  assert.match((await alertsFor('e2e-sim', 'temperatureC'))[0].body, /Test data, not a real sensor\./);
  assert.equal((await deliveries('e2e-sim', 'sms')).length, 0);
});

test('uncalibrated critical pH: alert and email, no SMS', async () => {
  await addDevice('e2e-ph', false);
  await upload('e2e-ph', [{ ph: 9.6, phCalibrated: false }, { ph: 9.6, phCalibrated: false }, { ph: 9.7, phCalibrated: false }]);
  await until('email delivery', async () => ((await deliveries('e2e-ph', 'email')).length ? true : undefined));
  await sleep(3000);
  const alerts = await alertsFor('e2e-ph', 'ph');
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].body, /not calibrated yet/);
  assert.equal((await deliveries('e2e-ph', 'sms')).length, 0);
});
