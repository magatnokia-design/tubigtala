// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GAS_SETTLE_MS, gasWarmupLeftMs, isFirstReading, uptimeMs, warmingUp } from './warmup.ts';

const r = (seq: number | null, simulated = false) => ({ seq, simulated });

test('uptime comes from the reading counter and the interval', () => {
  assert.equal(uptimeMs(0, 60), 0);
  assert.equal(uptimeMs(4, 60), 4 * 60_000);
  assert.equal(uptimeMs(null, 60), null);
  assert.equal(uptimeMs(undefined, 60), null, 'a reading cached by an app before 0.9.5 has no seq');
  assert.equal(uptimeMs(-1, 60), null);
});

test('gas warms up for 15 minutes after power-on, the other sensors never', () => {
  // tank-01, 16 Nov 2026: 1844 mV at seq 4 (4 min after power-on) - that is warm-up, not an alert.
  assert.equal(warmingUp('nh3GasMv', r(4), 60), true);
  assert.equal(gasWarmupLeftMs(r(4), 60), GAS_SETTLE_MS - 4 * 60_000);
  assert.equal(warmingUp('nh3GasMv', r(14), 60), true);
  assert.equal(warmingUp('nh3GasMv', r(15), 60), false, 'ready at 15 minutes');
  assert.equal(gasWarmupLeftMs(r(500), 60), 0);
  assert.equal(warmingUp('ph', r(0), 60), false);
  assert.equal(warmingUp('temperatureC', r(2), 60), false);
});

test('no warm-up when it cannot be known, or for simulated devices', () => {
  assert.equal(warmingUp('nh3GasMv', r(null), 60), false, 'unknown uptime: treat as running');
  assert.equal(warmingUp('nh3GasMv', r(1, true), 10), false, 'the simulator has no heater');
  assert.equal(isFirstReading(r(0)), true);
  assert.equal(isFirstReading(r(1)), false);
  assert.equal(isFirstReading(r(0, true)), false);
});

test('a faster station warms up for the same time, over more readings', () => {
  assert.equal(warmingUp('nh3GasMv', r(60), 10), true, '10 minutes at one reading per 10 s');
  assert.equal(warmingUp('nh3GasMv', r(90), 10), false);
});
