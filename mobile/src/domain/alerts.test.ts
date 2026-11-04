// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ALERT_COOLDOWN_MS, alertText, shouldAlert, type AlertState } from './alerts.ts';

const T = 1_800_000_000_000;
const state = (s: Partial<AlertState>): AlertState => ({ level: 'normal', alertLevel: null, alertedAtMs: null, ...s });

test('first problem alerts; staying bad does not', () => {
  assert.equal(shouldAlert(null, 'warning', T), true);
  assert.equal(shouldAlert(null, 'critical', T), true);
  assert.equal(shouldAlert(state({ level: 'warning', alertLevel: 'warning', alertedAtMs: T }), 'warning', T + 60_000), false);
});

test('normal, unknown and improving never alert', () => {
  assert.equal(shouldAlert(null, 'normal', T), false);
  assert.equal(shouldAlert(null, 'unknown', T), false);
  assert.equal(shouldAlert(state({ level: 'critical' }), 'warning', T), false);
});

test('getting worse alerts even inside the cooldown', () => {
  assert.equal(shouldAlert(state({ level: 'warning', alertLevel: 'warning', alertedAtMs: T }), 'critical', T + 60_000), true);
});

test('bouncing across a limit does not re-alert within the cooldown', () => {
  // alerted critical, dipped to warning, back to critical 5 minutes later
  const s = state({ level: 'warning', alertLevel: 'critical', alertedAtMs: T });
  assert.equal(shouldAlert(s, 'critical', T + 5 * 60_000), false);
  // after the cooldown it is news again
  assert.equal(shouldAlert(s, 'critical', T + ALERT_COOLDOWN_MS + 1), true);
});

test('recovering then relapsing after the cooldown alerts again', () => {
  const s = state({ level: 'normal', alertLevel: 'warning', alertedAtMs: T });
  assert.equal(shouldAlert(s, 'warning', T + 10 * 60_000), false);
  assert.equal(shouldAlert(s, 'warning', T + ALERT_COOLDOWN_MS + 1), true);
});

test('alert title says which tank and what is wrong, in plain words', () => {
  assert.equal(alertText('ph', 'Too high', 9.4, 'Tank 1', { simulated: false, uncalibrated: false }).title, 'Tank 1: pH too high');
  assert.equal(alertText('temperatureC', 'Too hot', 36.2, 'Tank 2', { simulated: false, uncalibrated: false }).title, 'Tank 2: water too hot');
  assert.equal(alertText('nh3GasMv', 'A bit high', 750, 'Tank 3', { simulated: false, uncalibrated: false }).title, 'Tank 3: ammonia gas a bit high');
});

test('alert body gives value and normal range, caveats last', () => {
  assert.equal(alertText('ph', 'Too high', 9.4, 'Tank 1', { simulated: false, uncalibrated: false }).body,
    'pH is 9.4. Normal is 6.5 to 8.5.');
  assert.equal(alertText('ph', 'Too low', 5.8, 'Tank 1', { simulated: false, uncalibrated: true }).body,
    'pH is 5.8. Normal is 6.5 to 8.5. The pH sensor is not calibrated yet, so this may be off.');
  assert.equal(alertText('temperatureC', 'A bit cold', 18.5, 'Tank 2', { simulated: true, uncalibrated: false }).body,
    'Water is 18.5 °C. Normal is 20 to 32 °C. Test data, not a real sensor.');
  assert.equal(alertText('nh3GasMv', 'A bit high', 750, 'Tank 3', { simulated: false, uncalibrated: false }).body,
    'Ammonia gas above the water is 750 mV. Normal is up to 600 mV.');
});

test('alert text fits the stored limits (title 80, body 200) with a 40-character tank name', () => {
  const name = 'x'.repeat(40);
  const t = alertText('nh3GasMv', 'A bit high', 1234, name, { simulated: true, uncalibrated: true });
  assert.ok(t.title.length <= 80);
  assert.ok(t.body.length <= 200);
});
