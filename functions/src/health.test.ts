// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  manilaWhen, missingStep, offlineChange, offlineText, onlineText, sensorMissingText, SENSOR_MISSING_MS,
} from './health.ts';

// 16 Nov 2026, 16:21 in Manila = 08:21 UTC
const T = Date.UTC(2026, 10, 16, 8, 21);
const MIN = 60_000;

test('missing values: remember the first, alert once after 10 minutes', () => {
  assert.equal(missingStep({ sinceMs: null, alerted: false }, T), 'start');
  assert.equal(missingStep({ sinceMs: T, alerted: false }, T + 9 * MIN), 'none', '9 minutes is not long enough');
  assert.equal(missingStep({ sinceMs: T, alerted: false }, T + SENSOR_MISSING_MS), 'raise', 'exactly 10 minutes raises');
  assert.equal(missingStep({ sinceMs: T, alerted: true }, T + 30 * MIN), 'none', 'one alert per episode');
  assert.equal(missingStep({ sinceMs: T, alerted: false }, T - MIN), 'start', 'an older reading arriving late moves the start back');
});

test('the gas warm-up after a restart (3 readings without a value) never alerts', () => {
  let since: number | null = null;
  for (let i = 0; i < 3; i++) {
    const step = missingStep({ sinceMs: since, alerted: false }, T + i * MIN);
    assert.notEqual(step, 'raise');
    if (step === 'start') since = T + i * MIN;
  }
});

test('offline is news only when it changes', () => {
  assert.equal(offlineChange(false, 'offline'), 'offline');
  assert.equal(offlineChange(true, 'offline'), null, 'no repeat while it stays offline');
  assert.equal(offlineChange(true, 'live'), 'online');
  assert.equal(offlineChange(true, 'stale'), 'online', 'a reading arrived, even if not quite on time');
  assert.equal(offlineChange(false, 'stale'), null, 'stale is not offline');
  assert.equal(offlineChange(false, 'no-data'), null, 'a station that never uploaded is not offline');
});

test('times: clock today, date and clock on another day, Philippine time', () => {
  assert.equal(manilaWhen(T, T + 5 * MIN), '4:21 PM');
  assert.equal(manilaWhen(T - 24 * 60 * MIN, T), 'Nov 15, 4:21 PM');
});

test('alert words', () => {
  assert.deepEqual(sensorMissingText('temperatureC', 'TubigTala Station', T, T + 10 * MIN, false), {
    title: 'TubigTala Station: temperature sensor not reading',
    body: 'No temperature value since 4:21 PM. Check the temperature probe and its wires.',
  });
  assert.match(sensorMissingText('ph', 'Tank 2', T, T, true).body, /probe is in liquid\. Test data, not a real sensor\.$/);
  assert.deepEqual(offlineText('TubigTala Station', T, T + 20 * MIN), {
    title: 'TubigTala Station: offline',
    body: 'No readings since 4:21 PM. Check its power and Wi-Fi.',
  });
  assert.deepEqual(onlineText('TubigTala Station', T, T + 42 * MIN, T + 45 * MIN), {
    title: 'TubigTala Station: back online',
    body: 'Readings resumed at 5:03 PM. The last one before that was at 4:21 PM.',
  });
  assert.equal(onlineText('X', null, T, T).body, 'Readings resumed at 4:21 PM.');
  for (const m of ['ph', 'temperatureC', 'nh3GasMv'] as const) {
    assert.ok(sensorMissingText(m, 'TubigTala Station', T, T, true).title.length <= 80, 'fits the alert title limit');
  }
});
