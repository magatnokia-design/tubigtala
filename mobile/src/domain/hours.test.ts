// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HOUR_MS, hourIdOf, hourStartOf, packReading, unpackHour } from './hours.ts';

const T = Date.UTC(2026, 10, 17, 8, 43, 59, 120); // 17 Nov 2026, 16:43:59 in Manila

test('a reading belongs to its UTC hour, with an ID that sorts as text', () => {
  assert.equal(hourStartOf(T), Date.UTC(2026, 10, 17, 8));
  assert.equal(hourIdOf(T), '2026111708');
  assert.equal(hourIdOf(Date.UTC(2026, 10, 17, 8)), '2026111708', 'the first millisecond');
  assert.equal(hourIdOf(Date.UTC(2026, 10, 17, 9) - 1), '2026111708', 'the last millisecond');
  assert.ok(hourIdOf(Date.UTC(2026, 11, 1, 0)) > hourIdOf(Date.UTC(2026, 10, 30, 23)));
});

test('pack and unpack keep every value, and missing values stay missing', () => {
  const packed = packReading({ serverTimeMs: T, ph: 6.8, phCalibrated: true, temperatureC: 28.25, nh3GasMv: 2183, seq: 9 });
  assert.deepEqual(packed, [T - Date.UTC(2026, 10, 17, 8), 6.8, 1, 28.25, 2183, 9]);
  const empty = packReading({ serverTimeMs: T + 60_000, ph: null, phCalibrated: false, temperatureC: undefined, nh3GasMv: 'x', seq: 10 });
  assert.deepEqual(empty.slice(1), [null, 0, null, null, 10], 'no value is null, never 0');
  const back = unpackHour(hourStartOf(T), { 'b-10': empty, 'b-9': packed }, false);
  assert.equal(back.length, 2);
  assert.deepEqual(back.map((r) => r.id), ['b-9', 'b-10'], 'oldest first');
  assert.equal(back[0].serverTimeMs, T);
  assert.equal(back[0].ph, 6.8);
  assert.equal(back[0].phCalibrated, true);
  assert.equal(back[0].temperatureC, 28.25);
  assert.equal(back[0].nh3GasMv, 2183);
  assert.equal(back[0].seq, 9);
  assert.equal(back[1].temperatureC, null);
});

test('malformed pack entries are skipped', () => {
  const start = hourStartOf(T);
  assert.deepEqual(unpackHour(start, null, false), []);
  assert.deepEqual(unpackHour(start, { a: 'junk', b: [1, 2], c: [HOUR_MS, 7, 1, 20, 1000, 1], d: [-1, 7, 1, 20, 1000, 1] }, false), []);
  assert.equal(unpackHour(start, { ok: [5, 7, 1, 20, 1000, 1] }, true)[0].simulated, true);
});
