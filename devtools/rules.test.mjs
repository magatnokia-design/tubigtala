// Security Rules tests (docs/data-model.md, "Access rules"). Run: npm run test:rules
import { test, before, beforeEach, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where,
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
test('owner can rename device', () => assertSucceeds(updateDoc(doc(as('owner'), `devices/${DEVICE}`), { name: 'Pond' })));
test('rename to blank is denied', () => assertFails(updateDoc(doc(as('owner'), `devices/${DEVICE}`), { name: '   ' })));
test('owner cannot reassign device', () =>
  assertFails(updateDoc(doc(as('owner'), `devices/${DEVICE}`), { ownerUid: 'stranger' })));
test('nobody can create devices from a client', () =>
  assertFails(setDoc(doc(as('owner'), 'devices/new'), { name: 'x', ownerUid: 'owner', deviceUid: 'b', simulated: false })));
test('owner cannot delete device', () => assertFails(deleteDoc(doc(as('owner'), `devices/${DEVICE}`))));

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
test('owner can read and mark own notifications read, nothing else', async () => {
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'users/juan/notifications/n1'), { title: 'pH high', body: 'x', read: false, createdAt: Timestamp.now() }));
  await assertSucceeds(getDoc(doc(as('juan'), 'users/juan/notifications/n1')));
  await assertFails(getDoc(doc(as('maria'), 'users/juan/notifications/n1')));
  await assertSucceeds(updateDoc(doc(as('juan'), 'users/juan/notifications/n1'), { read: true }));
  await assertFails(updateDoc(doc(as('juan'), 'users/juan/notifications/n1'), { title: 'edited' }));
  await assertFails(setDoc(doc(as('juan'), 'users/juan/notifications/n2'), { title: 'fake', body: 'x', read: false }));
  await assertFails(deleteDoc(doc(as('juan'), 'users/juan/notifications/n1')));
});
