// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calibrationError, mvPerPh, phFromMv, stability } from './calibration.ts';

test('two-point line passes through both buffers', () => {
  assert.equal(phFromMv(2510, 2510, 3045), 7);
  assert.ok(Math.abs(phFromMv(3045, 2510, 3045) - 4) < 1e-9);
  // PH-4502C style: higher voltage = more acidic
  assert.ok(phFromMv(2800, 2510, 3045) < 7);
  // works for modules wired the other way round too
  assert.ok(Math.abs(phFromMv(1500, 2000, 1460) - 4.22) < 0.01);
});

test('matches the firmware nominal constants', () => {
  // firmware config.h: PH7_MV 2500, PH4_MV 3040 -> 3040 mV reads pH 4
  assert.ok(Math.abs(phFromMv(3040, 2500, 3040) - 4) < 1e-9);
});

test('sensitivity', () => {
  assert.equal(mvPerPh(2510, 3050), 180);
});

test('sanity checks on the buffer gap', () => {
  assert.ok(calibrationError(2510, 2560)); // 50 mV: probe not responding
  assert.ok(calibrationError(2510, 2510));
  assert.ok(calibrationError(500, 2500)); // 2000 mV: implausible
  assert.equal(calibrationError(2510, 3045), undefined);
  assert.equal(calibrationError(3045, 2510), undefined); // either direction
});

test('stability needs 3 readings within 5 mV, ignoring gaps', () => {
  assert.deepEqual(stability([]), { stable: false, value: null, spread: null });
  assert.equal(stability([2500, 2501]).stable, false);
  assert.deepEqual(stability([2400, 2500, null, 2503, 2501]), { stable: true, value: 2501, spread: 3 });
  assert.equal(stability([2500, 2510, 2520]).stable, false);
});
