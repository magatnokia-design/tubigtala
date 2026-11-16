// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ALERT_COOLDOWN_MS, alertDetail, alertHeadline, alertMeaning, alertText, nextAlertStep, shouldAlert, valueText, type AlertState } from './alerts.ts';

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

test('nextAlertStep: raise, update the level only, or do nothing', () => {
  assert.deepEqual(nextAlertStep(null, 'unknown', T), { kind: 'none' });
  assert.deepEqual(nextAlertStep(null, 'normal', T), { kind: 'update', state: { level: 'normal', alertLevel: null, alertedAtMs: null } });
  assert.deepEqual(nextAlertStep(state({}), 'normal', T), { kind: 'none' });
  assert.deepEqual(nextAlertStep(state({}), 'critical', T), { kind: 'raise', state: { level: 'critical', alertLevel: 'critical', alertedAtMs: T } });
  // improving keeps the last alert, so the cooldown still applies
  const after = state({ level: 'critical', alertLevel: 'critical', alertedAtMs: T });
  assert.deepEqual(nextAlertStep(after, 'warning', T + 60_000), { kind: 'update', state: { level: 'warning', alertLevel: 'critical', alertedAtMs: T } });
  assert.deepEqual(nextAlertStep(after, 'critical', T + 60_000), { kind: 'none' });
});

test('alert title says which tank, what is wrong in plain words, and the reading', () => {
  assert.equal(alertText('ph', 'Too alkaline', 9.4, 'Tank 1', { simulated: false, uncalibrated: false }).title, 'Tank 1: water too alkaline (pH 9.4)');
  assert.equal(alertText('ph', 'A bit acidic', 6.2, 'Tank 1', { simulated: false, uncalibrated: false }).title, 'Tank 1: water a bit acidic (pH 6.2)');
  assert.equal(alertText('temperatureC', 'Too hot', 36.2, 'Tank 2', { simulated: false, uncalibrated: false }).title, 'Tank 2: water too hot (36.2 °C)');
  assert.equal(alertText('nh3GasMv', 'A bit high', 1850, 'Tank 3', { simulated: false, uncalibrated: false }).title, 'Tank 3: ammonia gas a bit high (1850 mV)');
});

test('alert body gives value and normal range, what acidic / alkaline means, caveats last', () => {
  assert.equal(alertText('ph', 'Too alkaline', 9.4, 'Tank 1', { simulated: false, uncalibrated: false }).body,
    'pH is 9.4. Normal is 6.5 to 8.5. Higher pH means more alkaline.');
  assert.equal(alertText('ph', 'Too acidic', 5.8, 'Tank 1', { simulated: false, uncalibrated: true }).body,
    'pH is 5.8. Normal is 6.5 to 8.5. Lower pH means more acidic. The pH sensor is not calibrated yet, so this may be off.');
  assert.equal(alertText('temperatureC', 'A bit cold', 18.5, 'Tank 2', { simulated: true, uncalibrated: false }).body,
    'Water is 18.5 °C. Normal is 20 to 32 °C. Test data, not a real sensor.');
  assert.equal(alertText('nh3GasMv', 'A bit high', 1850, 'Tank 3', { simulated: false, uncalibrated: false }).body,
    'Ammonia gas above the water is 1850 mV. Normal is up to 1700 mV. A relative reading, not ppm.');
});

test('alert text fits the stored limits (title 80, body 200) with a 40-character tank name', () => {
  const name = 'x'.repeat(40);
  for (const [m, label, v] of [['nh3GasMv', 'A bit high', 1234], ['ph', 'A bit alkaline', 13.9], ['temperatureC', 'Too cold', -9.9]] as const) {
    const t = alertText(m, label, v, name, { simulated: true, uncalibrated: true });
    assert.ok(t.title.length <= 80, t.title);
    assert.ok(t.body.length <= 200, t.body);
  }
});

test('in-app headline and detail leave out the station name; pH is named', () => {
  assert.equal(alertHeadline('temperatureC', 'A bit warm'), 'Water a bit warm');
  assert.equal(alertHeadline('ph', 'Too acidic'), 'Water too acidic');
  assert.equal(alertHeadline('nh3GasMv', 'Too high'), 'Ammonia gas too high');
  assert.equal(alertDetail('temperatureC', 33.4), '33.4 °C · normal 20 to 32 °C');
  assert.equal(alertDetail('nh3GasMv', 3586), '3586 mV · normal up to 1700 mV');
  assert.equal(alertDetail('ph', 5.8), 'pH 5.8 · normal 6.5 to 8.5', 'a bare "5.8" did not say it was pH');
  assert.equal(alertDetail('ph', null), 'pH — · normal 6.5 to 8.5', 'missing value is a dash, never 0');
  assert.equal(valueText('temperatureC', 36.24), '36.2 °C');
});

test('what an out-of-range pH can mean, never a safety verdict', () => {
  assert.match(alertMeaning('ph', 5.8) ?? '', /^Lower pH means more acidic\. Acidic water can taste metallic and corrode pipes\.$/);
  assert.match(alertMeaning('ph', 9.4) ?? '', /^Higher pH means more alkaline\./);
  assert.equal(alertMeaning('ph', 7.2), null);
  assert.equal(alertMeaning('ph', null), null);
  assert.equal(alertMeaning('temperatureC', 40), null);
  // With the station's own limits: 6.6 is below a normal range starting at 6.8.
  assert.match(alertMeaning('ph', 6.6, { normal: [6.8, 8.0], warning: [6.5, 8.5] }) ?? '', /acidic/);
  for (const v of [5.8, 9.4]) assert.doesNotMatch(alertMeaning('ph', v) ?? '', /unsafe|safe to drink|dangerous/i);
});
