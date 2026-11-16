// Security Rules tests (docs/data-model.md, "Access rules"). Run: npm run test:rules
import { test, before, beforeEach, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, collection, getDocs, query, where,
         serverTimestamp, Timestamp } from 'firebase/firestore';
import { PROJECT_ID, FIRESTORE_HOST, FIRESTORE_PORT } from './emulator.mjs';

let env;
const DEVICE = 'dev-1';
const path = (id) => `devices/${DEVICE}/readings/${id}`;

function reading(overrides = {}) {
  return {
    bootId: 'abcd1234', seq: 0, serverTime: serverTimestamp(), deviceTime: null,
    ph: 7.1, phCalibrated: false, phMv: 2480, temperatureC: 27.3, nh3GasMv: 410,
    simulated: false, firmware: 'test', ...overrides,
  };
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: FIRESTORE_HOST, port: FIRESTORE_PORT, rules: readFileSync('../firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `devices/${DEVICE}`), {
      name: 'Tank', ownerUid: 'owner', deviceUid: 'board', simulated: false, readingIntervalSec: 60,
    });
    await setDoc(doc(db, 'devices/other'), {
      name: 'Not mine', ownerUid: 'someone-else', deviceUid: 'board-2', simulated: false, readingIntervalSec: 60,
    });
    await setDoc(doc(db, path('seed-0')), { ...reading({ bootId: 'seed', seq: 0 }), serverTime: Timestamp.now() });
    // An unpaired station and its secret pairing code (docs/device-setup.md).
    await setDoc(doc(db, 'devices/free'), {
      name: 'TubigTala Station', ownerUid: null, deviceUid: 'board-3', simulated: false, readingIntervalSec: 60,
    });
    await setDoc(doc(db, 'devicePairing/free'), { code: 'ABCDEFGHJKMN' });
    await setDoc(doc(db, 'devicePairing/other'), { code: 'OTHERCODE234' });
  });
});

after(async () => env?.cleanup());

const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

// --- devices ---
test('owner can read own device', () => assertSucceeds(getDoc(doc(as('owner'), `devices/${DEVICE}`))));
test('stranger cannot read device', () => assertFails(getDoc(doc(as('stranger'), `devices/${DEVICE}`))));
test('signed-out user cannot read device', () => assertFails(getDoc(doc(as(null), `devices/${DEVICE}`))));
test('owner can list only own devices', () =>
  assertSucceeds(getDocs(query(collection(as('owner'), 'devices'), where('ownerUid', '==', 'owner')))));
test('unfiltered device list is denied', () => assertFails(getDocs(collection(as('owner'), 'devices'))));
test('the station name is fixed: the owner cannot rename it', () =>
  assertFails(updateDoc(doc(as('owner'), `devices/${DEVICE}`), { name: 'Pond' })));

// --- pairing (QR sticker) ---
const pair = (uid, id = 'free', code = 'ABCDEFGHJKMN', extra = {}) =>
  updateDoc(doc(as(uid), `devices/${id}`), { ownerUid: uid, pairCode: code, pairedAt: serverTimestamp(), ...extra });

test('pair an unowned station with the right code, then read it', async () => {
  await assertSucceeds(pair('maria'));
  await assertSucceeds(getDoc(doc(as('maria'), 'devices/free')));
});
test('wrong pairing code is rejected', () => assertFails(pair('maria', 'free', 'ABCDEFGHJKMP')));
test('a station that already has an owner cannot be taken, even with its code', () =>
  assertFails(pair('maria', 'other', 'OTHERCODE234')));
test('cannot pair a station for someone else', () =>
  assertFails(updateDoc(doc(as('maria'), 'devices/free'), { ownerUid: 'juan', pairCode: 'ABCDEFGHJKMN', pairedAt: serverTimestamp() })));
test('pairing cannot change anything else', () => assertFails(pair('maria', 'free', 'ABCDEFGHJKMN', { deviceUid: 'maria' })));
test('pairing time must be the server time', () =>
  assertFails(pair('maria', 'free', 'ABCDEFGHJKMN', { pairedAt: Timestamp.fromMillis(0) })));
test('signed-out users cannot pair', () =>
  assertFails(updateDoc(doc(as(null), 'devices/free'), { ownerUid: null, pairCode: 'ABCDEFGHJKMN' })));
test('pairing codes cannot be read or written by any app account', async () => {
  await assertFails(getDoc(doc(as('maria'), 'devicePairing/free')));
  await assertFails(getDoc(doc(as('owner'), 'devicePairing/other')));
  await assertFails(setDoc(doc(as('maria'), 'devicePairing/free'), { code: 'MYOWNCODE234' }));
});
test('owner can remove (unpair) the station; then only a code holder can pair it again', async () => {
  await assertSucceeds(pair('maria'));
  const unpair = (uid) => updateDoc(doc(as(uid), 'devices/free'), { ownerUid: null, pairedAt: null, pairCode: deleteField() });
  await assertFails(unpair('juan'));
  await assertSucceeds(unpair('maria'));
  await assertFails(getDoc(doc(as('maria'), 'devices/free')));
  await assertFails(pair('juan', 'free', 'WRONGCODE234'));
  await assertSucceeds(pair('juan'));
});
test('removing must clear the pairing fields', () =>
  assertFails(updateDoc(doc(as('owner'), `devices/${DEVICE}`), { ownerUid: null, pairedAt: null, pairCode: 'ABCDEFGHJKMN' })));
test('owner cannot reassign device', () =>
  assertFails(updateDoc(doc(as('owner'), `devices/${DEVICE}`), { ownerUid: 'stranger' })));
test('nobody can create devices from a client', () =>
  assertFails(setDoc(doc(as('owner'), 'devices/new'), { name: 'x', ownerUid: 'owner', deviceUid: 'b', simulated: false })));
test('owner cannot delete device', () => assertFails(deleteDoc(doc(as('owner'), `devices/${DEVICE}`))));

// --- device reads its own record (pH calibration) ---
test('device can read its own record', () => assertSucceeds(getDoc(doc(as('board'), `devices/${DEVICE}`))));
test('device cannot read another device', () => assertFails(getDoc(doc(as('board'), 'devices/other'))));

// --- pH calibration ---
const calibration = (overrides = {}) => ({
  status: 'calibrated', calibratedAt: serverTimestamp(), method: 'Two-point, pH 7 and pH 4 buffers (app)',
  ph7Mv: 2510, ph4Mv: 3045, ...overrides,
});
const setCal = (uid, c) => updateDoc(doc(as(uid), `devices/${DEVICE}`), { phCalibration: c });

test('owner can save a valid calibration', () => assertSucceeds(setCal('owner', calibration())));
test('owner can reset to uncalibrated', () =>
  assertSucceeds(setCal('owner', { status: 'uncalibrated', calibratedAt: null, method: null })));
test('stranger cannot calibrate', () => assertFails(setCal('stranger', calibration())));
test('device itself cannot calibrate', () => assertFails(setCal('board', calibration())));
test('buffers more than 1500 mV apart are rejected', () => assertFails(setCal('owner', calibration({ ph7Mv: 1000, ph4Mv: 2600 }))));
test('calibration in the inverted direction is allowed', () => assertSucceeds(setCal('owner', calibration({ ph7Mv: 3045, ph4Mv: 2510 }))));
test('buffers closer than 100 mV are rejected (probe not responding)', () =>
  assertFails(setCal('owner', calibration({ ph7Mv: 2510, ph4Mv: 2560 }))));
test('calibration needs both buffer voltages', () => {
  const c = calibration();
  delete c.ph4Mv;
  return assertFails(setCal('owner', c));
});
test('calibration voltage out of range is rejected', () => assertFails(setCal('owner', calibration({ ph4Mv: 9000 }))));
test('client-chosen calibration time is rejected', () =>
  assertFails(setCal('owner', calibration({ calibratedAt: Timestamp.fromMillis(0) }))));
test('extra calibration field is rejected', () => assertFails(setCal('owner', calibration({ slope: 3 }))));
test('true buffer values (6.86 / 4.01 kit) are accepted', () =>
  assertSucceeds(setCal('owner', calibration({ ph7BufferPh: 6.86, ph4BufferPh: 4.01 }))));
test('buffer values outside 6.5-7.5 / 3.5-4.5 are rejected', async () => {
  await assertFails(setCal('owner', calibration({ ph7BufferPh: 9.18, ph4BufferPh: 4.01 })));
  await assertFails(setCal('owner', calibration({ ph7BufferPh: 6.86, ph4BufferPh: 6.86 })));
  await assertFails(setCal('owner', calibration({ ph7BufferPh: '6.86' })));
});
test('owner still cannot change other device fields with a calibration', () =>
  assertFails(updateDoc(doc(as('owner'), `devices/${DEVICE}`), { phCalibration: calibration(), deviceUid: 'owner' })));

// --- alert limits (devices/{id}.limits, domain/limits.ts) ---
const range = (normalMin, normalMax, criticalBelow, criticalAbove) => ({ normalMin, normalMax, criticalBelow, criticalAbove });
const limits = (o = {}) => ({
  ph: range(6.8, 8.0, 6.5, 8.5), temperatureC: range(22, 30, 18, 34), nh3GasMv: range(0, 1600, 0, 2000),
  updatedAt: serverTimestamp(), ...o,
});
const setLimits = (uid, l, device = DEVICE) => updateDoc(doc(as(uid), `devices/${device}`), { limits: l });

test('owner can save alert limits, change them, and go back to the defaults', async () => {
  await assertSucceeds(setLimits('owner', limits()));
  await assertSucceeds(setLimits('owner', limits({ ph: range(6.5, 8.5, 6, 9) })));
  await assertSucceeds(updateDoc(doc(as('owner'), `devices/${DEVICE}`), { limits: deleteField() }));
});
test('only the owner sets alert limits: not a stranger, not the station itself', async () => {
  await assertFails(setLimits('stranger', limits()));
  await assertFails(setLimits('board', limits()));
  await assertFails(setLimits('owner', limits(), 'other'));
  await assertFails(setLimits('owner', limits(), 'free'), 'an unpaired station has no owner to set them');
});
test('alert limits must be in order', async () => {
  await assertFails(setLimits('owner', limits({ ph: range(8.0, 6.8, 6.5, 8.5) })), 'normal reversed');
  await assertFails(setLimits('owner', limits({ ph: range(7, 7, 6.5, 8.5) })), 'normal with no width');
  await assertFails(setLimits('owner', limits({ ph: range(6.8, 8.0, 6.9, 8.5) })), 'critical low above normal low');
  await assertFails(setLimits('owner', limits({ ph: range(6.8, 8.0, 6.5, 7.9) })), 'critical high below normal high');
  await assertSucceeds(setLimits('owner', limits({ ph: range(6.8, 8.0, 6.8, 8.0) })), 'equal = no warning band');
});
test('alert limits must be within what each sensor can report', async () => {
  await assertFails(setLimits('owner', limits({ ph: range(6.8, 8.0, 6.5, 14.5) })));
  await assertFails(setLimits('owner', limits({ temperatureC: range(22, 30, -11, 34) })));
  await assertSucceeds(setLimits('owner', limits({ temperatureC: range(-5, 30, -10, 125) })));
  await assertFails(setLimits('owner', limits({ nh3GasMv: range(0, 1600, 0, 6000) })));
  await assertFails(setLimits('owner', limits({ nh3GasMv: range(100, 1600, 0, 2000) })), 'gas has a high side only');
  await assertFails(setLimits('owner', limits({ ph: range('6.8', 8.0, 6.5, 8.5) })), 'numbers only');
});
test('alert limits need all three sensors, the fixed shape and server time', async () => {
  const { nh3GasMv, ...noGas } = limits();
  void nh3GasMv;
  await assertFails(setLimits('owner', noGas));
  await assertFails(setLimits('owner', limits({ salinity: range(0, 1, 0, 1) })));
  await assertFails(setLimits('owner', limits({ ph: { ...range(6.8, 8.0, 6.5, 8.5), extra: 1 } })));
  await assertFails(setLimits('owner', limits({ updatedAt: Timestamp.fromMillis(0) })));
  await assertFails(setLimits('owner', 'loose'));
});
test('saving alert limits cannot change anything else on the station', async () => {
  await assertFails(updateDoc(doc(as('owner'), `devices/${DEVICE}`), { limits: limits(), deviceUid: 'owner' }));
  await assertFails(updateDoc(doc(as('owner'), `devices/${DEVICE}`), { limits: limits(), phCalibration: calibration() }));
});

// --- readings: read ---
test('owner can read readings', () => assertSucceeds(getDoc(doc(as('owner'), path('seed-0')))));
test('stranger cannot read readings', () => assertFails(getDoc(doc(as('stranger'), path('seed-0')))));

// --- readings: create ---
test('device can create a valid reading', () => assertSucceeds(setDoc(doc(as('board'), path('abcd1234-0')), reading())));
test('null sensor values are accepted', () =>
  assertSucceeds(setDoc(doc(as('board'), path('abcd1234-0')), reading({ ph: null, temperatureC: null, nh3GasMv: null, phMv: null }))));
test('owner cannot write readings', () => assertFails(setDoc(doc(as('owner'), path('abcd1234-0')), reading())));
test('another device cannot write readings', () => assertFails(setDoc(doc(as('board-2'), path('abcd1234-0')), reading())));
test('ID must equal bootId-seq', () => assertFails(setDoc(doc(as('board'), path('abcd1234-7')), reading())));
test('client-chosen serverTime is rejected', () =>
  assertFails(setDoc(doc(as('board'), path('abcd1234-0')), reading({ serverTime: Timestamp.fromMillis(0) }))));
test('pH above 14 is rejected', () => assertFails(setDoc(doc(as('board'), path('abcd1234-0')), reading({ ph: 15 }))));
test('temperature out of range is rejected', () =>
  assertFails(setDoc(doc(as('board'), path('abcd1234-0')), reading({ temperatureC: -127 }))));
test('hot water up to the sensor limit (125 °C) is accepted, so it shows as too hot', () =>
  assertSucceeds(setDoc(doc(as('board'), path('abcd1234-0')), reading({ temperatureC: 72.5 }))));
test('temperature above 125 °C is rejected', () =>
  assertFails(setDoc(doc(as('board'), path('abcd1234-0')), reading({ temperatureC: 125.5 }))));
test('string value is rejected', () => assertFails(setDoc(doc(as('board'), path('abcd1234-0')), reading({ ph: '7' }))));
test('missing field is rejected', () => {
  const r = reading();
  delete r.nh3GasMv;
  return assertFails(setDoc(doc(as('board'), path('abcd1234-0')), r));
});
test('extra field is rejected', () => assertFails(setDoc(doc(as('board'), path('abcd1234-0')), reading({ ppm: 3 }))));
test('real device cannot claim simulated', () =>
  assertFails(setDoc(doc(as('board'), path('abcd1234-0')), reading({ simulated: true }))));

// --- duplicates, updates, deletes ---
test('re-sending the same reading is rejected (dedupe)', async () => {
  const db = as('board');
  await assertSucceeds(setDoc(doc(db, path('abcd1234-0')), reading()));
  await assertFails(setDoc(doc(db, path('abcd1234-0')), reading()));
});
test('readings cannot be deleted', () => assertFails(deleteDoc(doc(as('owner'), path('seed-0')))));

// --- users/{uid} profiles ---
function profile(overrides = {}) {
  return {
    displayName: 'Juan', phoneE164: '+639000000001', smsAlertsEnabled: false, pushEnabled: false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides,
  };
}
const userPath = (uid) => `users/${uid}`;

test('user can create own profile', () => assertSucceeds(setDoc(doc(as('juan'), userPath('juan')), profile())));
test('user cannot create someone else\'s profile', () =>
  assertFails(setDoc(doc(as('juan'), userPath('maria')), profile())));
test('signed-out cannot create a profile', () => assertFails(setDoc(doc(as(null), userPath('juan')), profile())));
test('profile without phone is allowed (Google sign-up step)', () =>
  assertSucceeds(setDoc(doc(as('juan'), userPath('juan')), profile({ phoneE164: null }))));
for (const bad of ['09001234567', '+639001234', '+63900123456789', '+638171234567', '+1 900 123 4567']) {
  test(`phone ${bad} is rejected`, () => assertFails(setDoc(doc(as('juan'), userPath('juan')), profile({ phoneE164: bad }))));
}
test('SMS alerts need a phone number', () =>
  assertFails(setDoc(doc(as('juan'), userPath('juan')), profile({ phoneE164: null, smsAlertsEnabled: true }))));
test('blank name is rejected', () => assertFails(setDoc(doc(as('juan'), userPath('juan')), profile({ displayName: '  ' }))));
test('extra profile field is rejected', () =>
  assertFails(setDoc(doc(as('juan'), userPath('juan')), profile({ isAdmin: true }))));
test('client-chosen createdAt is rejected', () =>
  assertFails(setDoc(doc(as('juan'), userPath('juan')), profile({ createdAt: Timestamp.fromMillis(0) }))));

test('owner can read and update own profile, others cannot read it', async () => {
  await assertSucceeds(setDoc(doc(as('juan'), userPath('juan')), profile()));
  await assertSucceeds(getDoc(doc(as('juan'), userPath('juan'))));
  await assertFails(getDoc(doc(as('maria'), userPath('juan'))));
  await assertSucceeds(updateDoc(doc(as('juan'), userPath('juan')), { smsAlertsEnabled: true, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('juan'), userPath('juan')), { createdAt: Timestamp.fromMillis(0), updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(as('juan'), userPath('juan'))));
});

// --- users/{uid}/notifications ---
// 'owner' owns devices/dev-1 (see beforeEach); 'stranger' owns nothing.
function alert(overrides = {}) {
  return {
    title: 'pH too basic', body: 'Tank: 9.4 (normal 6.5 – 8.5)', deviceId: DEVICE, metric: 'ph', value: 9.4,
    level: 'critical', readingId: 'abcd1234-5', createdAt: serverTimestamp(), read: false, ...overrides,
  };
}
const alertPath = (uid, a = alert()) => `users/${uid}/notifications/${a.deviceId}_${a.metric}_${a.readingId}`;

// Since app 0.9.4 only the backend raises alerts (with the station's own limits); an app - even an
// old one with the default limits built in - cannot create one, however well-formed.
test('the app cannot raise alerts, not even for its own device (server only since 0.9.4)', async () => {
  await assertFails(setDoc(doc(as('owner'), alertPath('owner')), alert()));
  await assertFails(setDoc(doc(as('stranger'), alertPath('owner')), alert()));
  await assertFails(setDoc(doc(as('owner'), alertPath('owner')), alert({ limits: { normalMin: 6.5, normalMax: 8.5, criticalBelow: 6, criticalAbove: 9 } })));
});

test('owner can read, mark read and delete own notifications; others cannot', async () => {
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'users/juan/notifications/n1'), { title: 'pH high', body: 'x', read: false, createdAt: Timestamp.now() }));
  await assertSucceeds(getDoc(doc(as('juan'), 'users/juan/notifications/n1')));
  await assertFails(getDoc(doc(as('maria'), 'users/juan/notifications/n1')));
  await assertSucceeds(updateDoc(doc(as('juan'), 'users/juan/notifications/n1'), { read: true }));
  await assertFails(updateDoc(doc(as('juan'), 'users/juan/notifications/n1'), { title: 'edited' }));
  await assertFails(deleteDoc(doc(as('maria'), 'users/juan/notifications/n1')));
  await assertSucceeds(deleteDoc(doc(as('juan'), 'users/juan/notifications/n1')));
});

// --- users/{uid}/pushTokens ---
const tokenDoc = (uid, id = 'abc123') => `users/${uid}/pushTokens/${id}`;
const pushToken = (o = {}) => ({ token: 'fcm-token-'.padEnd(40, 'x'), platform: 'android', appVersion: '0.9.2', updatedAt: serverTimestamp(), ...o });

test('owner can register, refresh, read and delete own push token', async () => {
  await assertSucceeds(setDoc(doc(as('owner'), tokenDoc('owner')), pushToken()));
  await assertSucceeds(setDoc(doc(as('owner'), tokenDoc('owner')), pushToken({ appVersion: '0.9.3' })));
  await assertSucceeds(getDoc(doc(as('owner'), tokenDoc('owner'))));
  await assertSucceeds(deleteDoc(doc(as('owner'), tokenDoc('owner'))));
});

test("nobody can read, write or delete another user's push tokens", async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), tokenDoc('owner')), { ...pushToken(), updatedAt: Timestamp.now() }));
  await assertFails(getDoc(doc(as('stranger'), tokenDoc('owner'))));
  await assertFails(setDoc(doc(as('stranger'), tokenDoc('owner', 'evil1')), pushToken()));
  await assertFails(deleteDoc(doc(as('stranger'), tokenDoc('owner'))));
  await assertFails(getDoc(doc(as(null), tokenDoc('owner'))));
});

test('push tokens must have the fixed shape', async () => {
  await assertFails(setDoc(doc(as('owner'), tokenDoc('owner')), pushToken({ platform: 'ios' })));
  await assertFails(setDoc(doc(as('owner'), tokenDoc('owner')), pushToken({ token: 'short' })));
  await assertFails(setDoc(doc(as('owner'), tokenDoc('owner')), pushToken({ updatedAt: Timestamp.fromMillis(0) })));
  await assertFails(setDoc(doc(as('owner'), tokenDoc('owner')), pushToken({ extra: true })));
  await assertFails(setDoc(doc(as('owner'), tokenDoc('owner', 'Bad-ID')), pushToken()));
  const { appVersion, ...noVersion } = pushToken();
  void appVersion;
  await assertFails(setDoc(doc(as('owner'), tokenDoc('owner')), noVersion));
});

// --- users/{uid}/alertState ---
const stateDoc = (uid, key = `${DEVICE}_ph`) => `users/${uid}/alertState/${key}`;
const alertState = (o = {}) => ({ level: 'critical', alertLevel: 'critical', alertedAt: serverTimestamp(), updatedAt: serverTimestamp(), ...o });

test('alert state: the owner can read it, but only the backend writes it (since 0.9.4)', async () => {
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), stateDoc('owner')), { ...alertState(), alertedAt: Timestamp.now(), updatedAt: Timestamp.now() }));
  await assertSucceeds(getDoc(doc(as('owner'), stateDoc('owner'))));
  await assertFails(setDoc(doc(as('owner'), stateDoc('owner')), alertState({ level: 'normal' })));
  await assertFails(setDoc(doc(as('owner'), stateDoc('owner', `${DEVICE}_temperatureC`)), alertState()));
  await assertFails(deleteDoc(doc(as('owner'), stateDoc('owner'))));
});
test('others cannot read or write the owner alert state', async () => {
  await assertFails(setDoc(doc(as('stranger'), stateDoc('owner')), alertState()));
  await assertFails(getDoc(doc(as('stranger'), stateDoc('owner'))));
});

// --- server-only records (Cloud Functions, firebase-admin bypasses rules) ---
test('alertDeliveries and smsBudget are closed to every app account, even the owner', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'alertDeliveries/sms_owner_dev-1_ph_1'), { channel: 'sms', uid: 'owner', deviceId: DEVICE, status: 'sent' });
    await setDoc(doc(ctx.firestore(), 'smsBudget/global'), { day: '2026-11-04', dayCount: 1, month: '2026-11', monthCount: 1 });
  });
  await assertFails(getDoc(doc(as('owner'), 'alertDeliveries/sms_owner_dev-1_ph_1')));
  await assertFails(getDocs(query(collection(as('owner'), 'alertDeliveries'), where('uid', '==', 'owner'))));
  await assertFails(setDoc(doc(as('owner'), 'alertDeliveries/sms_owner_dev-1_ph_2'), { channel: 'sms', uid: 'owner' }));
  await assertFails(getDoc(doc(as('owner'), 'smsBudget/global')));
  await assertFails(setDoc(doc(as('owner'), 'smsBudget/global'), { day: '2026-11-04', dayCount: 0, month: '2026-11', monthCount: 0 }));
});

test('pushTokenOwners is closed to every app account: nobody can claim or read another phone', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'pushTokenOwners/abc123'), { uid: 'owner' });
  });
  await assertFails(getDoc(doc(as('owner'), 'pushTokenOwners/abc123')));
  await assertFails(setDoc(doc(as('stranger'), 'pushTokenOwners/abc123'), { uid: 'stranger' }));
  await assertFails(deleteDoc(doc(as('owner'), 'pushTokenOwners/abc123')));
});
