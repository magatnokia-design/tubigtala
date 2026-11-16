// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isCriticalStreak, manilaClock, manilaKeys, maskPhone, reserveSms, smsMetricAllowed, smsText,
  SMS_DAY_CAP, SMS_MONTH_CAP,
} from './policy.ts';

// 4 Nov 2026, 15:42 in Manila = 07:42 UTC
const T = Date.UTC(2026, 10, 4, 7, 42);

test('day and month follow Philippine time, not UTC', () => {
  assert.deepEqual(manilaKeys(T), { day: '2026-11-04', month: '2026-11' });
  // 30 Nov 17:00 UTC is already 1 Dec in Manila
  assert.deepEqual(manilaKeys(Date.UTC(2026, 10, 30, 17)), { day: '2026-12-01', month: '2026-12' });
});

test('SMS only for temperature and calibrated pH, never ammonia gas', () => {
  assert.equal(smsMetricAllowed('temperatureC', false), true);
  assert.equal(smsMetricAllowed('ph', true), true);
  assert.equal(smsMetricAllowed('ph', false), false);
  assert.equal(smsMetricAllowed('nh3GasMv', true), false);
});

test('streak needs 3 critical readings in a row; missing or milder values break it', () => {
  assert.equal(isCriticalStreak('temperatureC', [36, 37, 38]), true);
  assert.equal(isCriticalStreak('temperatureC', [36, 37]), false);
  assert.equal(isCriticalStreak('temperatureC', [36, 33, 38]), false); // 33 is only a warning
  assert.equal(isCriticalStreak('temperatureC', [36, null, 38]), false);
  assert.equal(isCriticalStreak('ph', [9.2, 9.5, 5.5]), true); // too high or too low, both critical
});

test('caps: 5 a day, 100 a month, counters restart with the Philippine day/month', () => {
  const first = reserveSms(null, T, 1);
  assert.deepEqual(first, { ok: true, next: { day: '2026-11-04', dayCount: 1, month: '2026-11', monthCount: 1 } });
  assert.deepEqual(reserveSms({ day: '2026-11-04', dayCount: SMS_DAY_CAP, month: '2026-11', monthCount: 20 }, T, 1), { ok: false, reason: 'day' });
  assert.deepEqual(reserveSms({ day: '2026-11-04', dayCount: 1, month: '2026-11', monthCount: SMS_MONTH_CAP }, T, 1), { ok: false, reason: 'month' });
  // yesterday's 5 do not count today; last month's 100 do not count this month
  assert.equal(reserveSms({ day: '2026-11-03', dayCount: SMS_DAY_CAP, month: '2026-11', monthCount: 10 }, T, 1).ok, true);
  assert.equal(reserveSms({ day: '2026-10-31', dayCount: 5, month: '2026-10', monthCount: SMS_MONTH_CAP }, T, 1).ok, true);
});

test('SMS text: plain GSM characters, one text, all critical fields', () => {
  assert.equal(manilaClock(T), '3:42 PM');
  assert.equal(smsText('Tank 1', [{ metric: 'ph', label: 'Too alkaline', value: 9.4 }], T),
    'TubigTala: Tank 1 pH 9.4 TOO ALKALINE (normal 6.5-8.5) at 3:42 PM');
  const two = smsText('Tank 1', [{ metric: 'ph', label: 'Too acidic', value: 5.8 }, { metric: 'temperatureC', label: 'Too hot', value: 36.24 }], T);
  assert.equal(two, 'TubigTala: Tank 1 pH 5.8 TOO ACIDIC (normal 6.5-8.5); water 36.2 C TOO HOT (normal 20-32 C) at 3:42 PM');
  // worst case: a 40-character name with emoji/degree signs, two fields
  const long = smsText('Tänk 🐟 °'.padEnd(40, 'x'), [{ metric: 'ph', label: 'Too alkaline', value: 13.9 }, { metric: 'temperatureC', label: 'Too cold', value: -9.9 }], T);
  assert.ok(long.length <= 160, `${long.length} chars`);
  assert.match(long, /^[A-Za-z0-9 .,:;()'!?#&+\-_/]+$/, 'only GSM-safe characters');
});

test('logs never show full phone numbers', () => {
  assert.equal(maskPhone('+639171234567'), '+63917*****67');
});

test("the station's own limits decide the streak and the SMS text", () => {
  const warm = { normal: [20, 28] as [number, number], warning: [15, 30] as [number, number] };
  // 31 °C is only "a bit warm" by default, but critical when the owner set critical above 30.
  assert.equal(isCriticalStreak('temperatureC', [31, 31, 31]), false);
  assert.equal(isCriticalStreak('temperatureC', [31, 31, 31], warm), true);
  assert.equal(smsText('Tank 1', [{ metric: 'temperatureC', label: 'Too hot', value: 31, range: warm }], T),
    'TubigTala: Tank 1 water 31.0 C TOO HOT (normal 20-28 C) at 3:42 PM');
  // A normal range starting below zero is written with "to", not a double minus.
  const cold = { normal: [-5, 10] as [number, number], warning: [-10, 15] as [number, number] };
  assert.equal(smsText('Tank 1', [{ metric: 'temperatureC', label: 'Too hot', value: 16, range: cold }], T),
    'TubigTala: Tank 1 water 16.0 C TOO HOT (normal -5 to 10 C) at 3:42 PM');
  // Worst case length with custom decimals still fits one SMS.
  const ph = { normal: [6.8, 8.2] as [number, number], warning: [6.5, 8.5] as [number, number] };
  const long = smsText('x'.repeat(40), [{ metric: 'ph', label: 'Too alkaline', value: 13.9, range: ph }, { metric: 'temperatureC', label: 'Too cold', value: -9.9, range: cold }], T);
  assert.ok(long.length <= 160, `${long.length} chars`);
});
