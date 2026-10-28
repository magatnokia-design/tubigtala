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

test('alert text names device, value, range and calibration', () => {
  const t = alertText('ph', 'Too acidic', 5.8, 'Tank 1', { simulated: false, uncalibrated: true });
  assert.equal(t.title, 'pH level: Too acidic (uncalibrated)');
  assert.equal(t.body, 'Tank 1 · 5.8 (uncalibrated) · normal 6.5 – 8.5');
  const u = alertText('temperatureC', 'Too hot', 36.5, 'Tank 1', { simulated: true, uncalibrated: false });
  assert.equal(u.title, 'Temperature: Too hot');
  assert.ok(u.body.startsWith('Tank 1 (simulated) · 36.5 °C'));
});
