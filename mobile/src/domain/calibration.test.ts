// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calibrationError, calibrationMethod, DEFAULT_BUFFERS, mvPerPh, phFromMv, stability } from './calibration.ts';

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
  // 6.86 / 4.01 kit: 2.85 pH apart, not 3
  assert.ok(Math.abs(mvPerPh(2510, 3023, { ph7: 6.86, ph4: 4.01 }) - 180) < 0.01);
});

test('6.86 / 4.01 buffers: the line passes through the true buffer values', () => {
  const b = { ph7: 6.86, ph4: 4.01 };
  assert.ok(Math.abs(phFromMv(2510, 2510, 3023, b) - 6.86) < 1e-9);
  assert.ok(Math.abs(phFromMv(3023, 2510, 3023, b) - 4.01) < 1e-9);
  // the probe voltage for true pH 7.00 reads 7.00, where treating the kit as 7/4 would be off
  const mvAt7 = 2510 - 0.14 * 180; // 180 mV per pH, higher voltage = more acidic
  assert.ok(Math.abs(phFromMv(mvAt7, 2510, 3023, b) - 7.0) < 0.001);
  assert.ok(Math.abs(phFromMv(mvAt7, 2510, 3023) - 7.0) > 0.1, 'the rounding error this fixes');
});

test('method text records the buffers used', () => {
  assert.equal(calibrationMethod({ ph7: 6.86, ph4: 4.01 }), 'Two-point, pH 6.86 and pH 4.01 buffers (app)');
  assert.equal(calibrationMethod(DEFAULT_BUFFERS), 'Two-point, pH 7.00 and pH 4.00 buffers (app)');
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
