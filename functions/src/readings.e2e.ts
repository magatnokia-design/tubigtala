// End-to-end test on the local emulators: writes readings the way a board does and checks what
// the deployed-style function (onReadingCreated) did. Emulator-only project (demo-tubigtala), log
// providers only - nothing is sent. Run: npm run test:e2e (builds, starts the emulators, runs this).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

import { logProviders } from './providers.ts';
import { checkStationsOnce } from './stations.ts';

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
type Values = { ph?: number | null; temperatureC?: number | null; nh3GasMv?: number | null; phCalibrated?: boolean; at?: number };
/** Default unless given - null included (a field without a value), unlike `??`. */
const given = <T>(v: T | undefined, fallback: T): T => (v === undefined ? fallback : v);
/**
 * Writes readings one by one, like a board at a fast interval, so serverTime order = write order.
 * `at` back-dates serverTime (the Admin SDK may set it), to test what takes minutes in seconds.
 */
async function upload(deviceId: string, values: Values[], simulated = false) {
  for (const v of values) {
    await db.doc(`devices/${deviceId}/readings/e2e-${seq++}`).create({
      bootId: 'e2e', seq, serverTime: v.at === undefined ? FieldValue.serverTimestamp() : Timestamp.fromMillis(v.at), deviceTime: null,
      ph: given(v.ph, 7.0), phCalibrated: v.phCalibrated ?? true, phMv: 2500, temperatureC: given(v.temperatureC, 27), nh3GasMv: given(v.nh3GasMv, 1400),
      simulated, firmware: 'e2e',
    });
    await sleep(1500);
  }
}

const deliveries = async (deviceId: string, channel: string) =>
  (await db.collection('alertDeliveries').where('deviceId', '==', deviceId).where('channel', '==', channel).get()).docs.map((d) => d.data());
const alertsFor = async (deviceId: string, metric: string) =>
  (await db.collection(`users/${uid}/notifications`).where('deviceId', '==', deviceId).where('metric', '==', metric).get()).docs.map((d) => d.data());
const alertsOfKind = async (deviceId: string, kind: string) =>
  (await db.collection(`users/${uid}/notifications`).where('deviceId', '==', deviceId).where('kind', '==', kind).get()).docs.map((d) => d.data());

before(async () => {
  uid = (await getAuth().createUser({ email: 'owner@tubigtala.test', password: 'e2e-pass-123' })).uid;
  await db.doc(`users/${uid}`).set({
    displayName: 'E2E Owner', phoneE164: '+639000000001', smsAlertsEnabled: true, pushEnabled: true,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  // One registered phone (the emulator logs the push; nothing is sent).
  await db.doc(`users/${uid}/pushTokens/e2ephone1`).set({
    token: 'e2e-fake-fcm-token-0123456789', platform: 'android', appVersion: 'e2e', updatedAt: FieldValue.serverTimestamp(),
  });
});

test('critical temperature: one alert, one SMS after 3 readings, none repeated, no email', async () => {
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
  assert.equal((await deliveries('e2e-real', 'email')).length, 0, 'email alerts were dropped (13 Nov 2026)');
  const push = await deliveries('e2e-real', 'push');
  assert.equal(push.length, 1, 'one phone push, for the reading that raised the alert');
  assert.equal(push[0].status, 'sent');
  assert.equal(push[0].metric, 'temperatureC');
  const budget = (await db.doc('smsBudget/global').get()).data();
  assert.equal(budget?.dayCount, 1);
});

test('phone notifications switched off: alert, but no push', async () => {
  await db.doc(`users/${uid}`).update({ pushEnabled: false });
  await addDevice('e2e-nopush', false);
  await upload('e2e-nopush', [{ temperatureC: 34 }]); // a bit warm: warning, never an SMS
  await until('in-app alert', async () => ((await alertsFor('e2e-nopush', 'temperatureC')).length ? true : undefined));
  await sleep(2000);
  assert.equal((await deliveries('e2e-nopush', 'push')).length, 0);
  await db.doc(`users/${uid}`).update({ pushEnabled: true });
});

test('simulated device: alert, never an SMS', async () => {
  await addDevice('e2e-sim', true);
  await upload('e2e-sim', [{ temperatureC: 40 }, { temperatureC: 40 }, { temperatureC: 40 }], true);
  await until('in-app alert', async () => ((await alertsFor('e2e-sim', 'temperatureC')).length ? true : undefined));
  await sleep(3000);
  assert.equal((await alertsFor('e2e-sim', 'temperatureC')).length, 1);
  assert.match((await alertsFor('e2e-sim', 'temperatureC'))[0].body, /Test data, not a real sensor\./);
  assert.equal((await deliveries('e2e-sim', 'sms')).length, 0);
  assert.equal((await deliveries('e2e-sim', 'push')).length, 1, 'test data still pushes (marked in the text)');
});

test('SMS alerts switched off: critical alert and push, but no SMS', async () => {
  await db.doc(`users/${uid}`).update({ smsAlertsEnabled: false });
  await addDevice('e2e-nosms', false);
  await upload('e2e-nosms', [{ temperatureC: 40 }, { temperatureC: 40 }, { temperatureC: 40 }]);
  await until('in-app alert', async () => ((await alertsFor('e2e-nosms', 'temperatureC')).length ? true : undefined));
  await sleep(3000);
  assert.equal((await deliveries('e2e-nosms', 'sms')).length, 0, 'the SMS switch is respected');
  assert.equal((await deliveries('e2e-nosms', 'push')).length, 1, 'phone notifications are separate');
  await db.doc(`users/${uid}`).update({ smsAlertsEnabled: true });
});

test('sensor not reading: one alert after 10 minutes without values; the gas warm-up never alerts', async () => {
  await addDevice('e2e-missing', false);
  const t0 = Date.now() - 12 * 60_000;
  // 11 readings a minute apart: temperature missing throughout (10 minutes at the 11th);
  // gas missing only for the first 3, like the warm-up after a restart.
  await upload('e2e-missing', Array.from({ length: 11 }, (_, i) => ({ temperatureC: null, nh3GasMv: i < 3 ? null : 1400, at: t0 + i * 60_000 })));
  const sensor = await until('sensor alert', async () => {
    const a = await alertsOfKind('e2e-missing', 'sensor');
    return a.length ? a : undefined;
  });
  await sleep(2000);
  assert.equal(sensor.length, 1, 'one alert for the whole episode');
  assert.equal(sensor[0].sensor, 'temperatureC', 'not the gas sensor: its warm-up was short');
  assert.equal(sensor[0].title, 'e2e-missing: temperature sensor not reading');
  assert.equal(sensor[0].metric, null, 'every app version shows the title and text as written');
  assert.equal((await deliveries('e2e-missing', 'push')).length, 1);
  assert.equal((await deliveries('e2e-missing', 'sms')).length, 0, 'push only');

  // A value again ends the episode: the record is cleared, so a later gap starts a new one.
  await upload('e2e-missing', [{ temperatureC: 27, at: t0 + 11 * 60_000 }]);
  await until('missing record cleared', async () => {
    const s = (await db.doc(`users/${uid}/alertState/e2e-missing_temperatureC`).get()).data();
    return s && s.missingSince === undefined && s.missingAlertedAt === undefined ? true : undefined;
  });
  const gas = (await db.doc(`users/${uid}/alertState/e2e-missing_nh3GasMv`).get()).data();
  assert.equal(gas?.missingSince, undefined, 'warm-up record cleared once gas values came');
});

test('station offline after 15 minutes without readings, then back online - one alert each', async () => {
  await addDevice('e2e-offline', false);
  const now = Date.now();
  await upload('e2e-offline', [{ at: now - 20 * 60_000 }]);
  await sleep(1000);

  await checkStationsOnce({ db, providers: logProviders, nowMs: () => now });
  const off = await alertsOfKind('e2e-offline', 'offline');
  assert.equal(off.length, 1);
  assert.equal(off[0].title, 'e2e-offline: offline');
  assert.match(off[0].body, /^No readings since .+\. Check its power and Wi-Fi\.$/);

  await checkStationsOnce({ db, providers: logProviders, nowMs: () => now + 5 * 60_000 });
  assert.equal((await alertsOfKind('e2e-offline', 'offline')).length, 1, 'no repeat while it stays offline');

  await upload('e2e-offline', [{ at: now }]);
  await sleep(1000);
  await checkStationsOnce({ db, providers: logProviders, nowMs: () => now + 60_000 });
  const on = await alertsOfKind('e2e-offline', 'online');
  assert.equal(on.length, 1);
  assert.equal(on[0].title, 'e2e-offline: back online');
  assert.match(on[0].body, /^Readings resumed at .+\. The last one before that was at .+\.$/);
  const push = await deliveries('e2e-offline', 'push');
  assert.equal(push.length, 2, 'offline and back online each pushed once');
  assert.ok(push.every((p) => p.status === 'sent'));
  assert.equal(push[0].metric, null);
  // The other stations in this run uploaded moments ago: none of them may be reported offline.
  const all = (await db.collection(`users/${uid}/notifications`).where('kind', '==', 'offline').get()).docs;
  assert.equal(all.length, 1, 'only the silent station');
});

test('a phone belongs to the account that registered it last', async () => {
  const other = (await getAuth().createUser({ email: 'second@tubigtala.test', password: 'e2e-pass-456' })).uid;
  const phone = { token: 'e2e-shared-phone-token-0123456789', platform: 'android', appVersion: 'e2e', updatedAt: FieldValue.serverTimestamp() };
  const mine = db.doc(`users/${uid}/pushTokens/e2eshared`);
  const theirs = db.doc(`users/${other}/pushTokens/e2eshared`);
  await mine.set(phone);
  await until('owner recorded', async () => ((await db.doc('pushTokenOwners/e2eshared').get()).get('uid') === uid ? true : undefined));

  // The same phone signs in to another account: it leaves the first one.
  await theirs.set(phone);
  await until('removed from the first account', async () => (!(await mine.get()).exists ? true : undefined));
  assert.ok((await theirs.get()).exists, 'kept on the account that registered it last');
  assert.equal((await db.doc('pushTokenOwners/e2eshared').get()).get('uid'), other);
  assert.ok((await db.doc(`users/${uid}/pushTokens/e2ephone1`).get()).exists, "the first account's other phone is untouched");

  // Re-registering on the same account (app start) changes nothing; signing out forgets the owner.
  await theirs.set(phone);
  await sleep(2000);
  assert.ok((await theirs.get()).exists);
  await theirs.delete();
  await until('owner forgotten', async () => (!(await db.doc('pushTokenOwners/e2eshared').get()).exists ? true : undefined));
});

test('uncalibrated critical pH: alert, no SMS', async () => {
  await addDevice('e2e-ph', false);
  await upload('e2e-ph', [{ ph: 9.6, phCalibrated: false }, { ph: 9.6, phCalibrated: false }, { ph: 9.7, phCalibrated: false }]);
  await until('in-app alert', async () => ((await alertsFor('e2e-ph', 'ph')).length ? true : undefined));
  await sleep(3000);
  const alerts = await alertsFor('e2e-ph', 'ph');
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].body, /not calibrated yet/);
  assert.equal((await deliveries('e2e-ph', 'sms')).length, 0);
});

test("the station's own alert limits: alert text, stored limits and SMS follow them; invalid limits fall back to the defaults", async () => {
  // Normal 20-28 °C, critical above 30: 31 °C is only "a bit warm" with the defaults (never an SMS).
  await addDevice('e2e-limits', false);
  await db.doc('devices/e2e-limits').update({
    limits: {
      ph: { normalMin: 6.5, normalMax: 8.5, criticalBelow: 6, criticalAbove: 9 },
      temperatureC: { normalMin: 20, normalMax: 28, criticalBelow: 15, criticalAbove: 30 },
      nh3GasMv: { normalMin: 0, normalMax: 1700, criticalBelow: 0, criticalAbove: 2200 },
      updatedAt: FieldValue.serverTimestamp(),
    },
  });
  await upload('e2e-limits', [{ temperatureC: 31 }, { temperatureC: 31 }, { temperatureC: 31.2 }]);
  const sms = await until('SMS delivery', async () => {
    const d = await deliveries('e2e-limits', 'sms');
    return d.length && d.every((x) => x.status !== 'sending') ? d : undefined;
  });
  assert.equal(sms.length, 1, 'critical by the station limits: SMS after 3 readings');
  assert.equal(sms[0].status, 'sent');
  const alerts = await alertsFor('e2e-limits', 'temperatureC');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].title, 'e2e-limits: water too hot');
  assert.equal(alerts[0].level, 'critical');
  assert.match(alerts[0].body, /Normal is 20 to 28 °C\./);
  assert.deepEqual(alerts[0].limits, { normalMin: 20, normalMax: 28, criticalBelow: 15, criticalAbove: 30 }, 'stored with the alert');

  // Reversed limits (written past the rules, e.g. by hand in the console) are ignored: the defaults apply.
  await addDevice('e2e-badlimits', false);
  await db.doc('devices/e2e-badlimits').update({
    limits: { temperatureC: { normalMin: 30, normalMax: 20, criticalBelow: 35, criticalAbove: 15 }, updatedAt: FieldValue.serverTimestamp() },
  });
  await upload('e2e-badlimits', [{ temperatureC: 33 }]);
  const bad = await until('in-app alert', async () => {
    const a = await alertsFor('e2e-badlimits', 'temperatureC');
    return a.length ? a : undefined;
  });
  assert.equal(bad[0].title, 'e2e-badlimits: water a bit warm');
  assert.match(bad[0].body, /Normal is 20 to 32 °C\./);
  assert.deepEqual(bad[0].limits, { normalMin: 20, normalMax: 32, criticalBelow: 15, criticalAbove: 35 });
});
