// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { durationText, percentages, periodBadge, periodInsight, periodSummary, type PeriodReading } from './period.ts';
import { RANGES } from './thresholds.ts';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 16, 6, 0); // 16 Nov 2026, 2:00 PM in Manila
const reading = (i: number, o: Partial<PeriodReading> = {}): PeriodReading => ({
  serverTimeMs: T0 + i * MIN, seq: 1000 + i, simulated: false, phCalibrated: true, ph: 6.8, temperatureC: 27, nh3GasMv: 1400, ...o,
});
const opts = (minutes: number) => ({ intervalSec: 60, startMs: T0, endMs: T0 + minutes * MIN, nowMs: T0 + minutes * MIN });
const when = (t: number) => `+${Math.round((t - T0) / MIN)} min`;

test('a hot spell: shares, the worst status, its peak and the longest spell outside normal', () => {
  // Like the 16 Nov test: 60 normal minutes, then 30 minutes of hot water peaking at 57.8 °C,
  // passing 33 (a bit warm) on the way up and down.
  const rs = [
    ...Array.from({ length: 60 }, (_, i) => reading(i)),
    reading(60, { temperatureC: 33 }),
    ...Array.from({ length: 28 }, (_, i) => reading(61 + i, { temperatureC: i === 14 ? 57.8 : 45 })),
    reading(89, { temperatureC: 33 }),
    ...Array.from({ length: 10 }, (_, i) => reading(90 + i)),
  ];
  const p = periodInsight('temperatureC', rs, RANGES.temperatureC, opts(100));
  assert.equal(p.count, 100);
  assert.deepEqual(p.shares.map((s) => [s.label, s.pct]), [['Normal', 70], ['A bit warm', 2], ['Too hot', 28]]);
  assert.equal(p.shares.reduce((a, s) => a + s.pct, 0), 100);
  assert.deepEqual(p.worst, { level: 'critical', label: 'Too hot', high: true });
  assert.equal(p.max?.v, 57.8);
  assert.deepEqual(p.longestOut && { minutes: p.longestOut.minutes, label: p.longestOut.label }, { minutes: 30, label: 'Too hot' });
  assert.deepEqual(periodBadge(p), { level: 'critical', label: 'Too hot at times' });
  assert.equal(periodSummary('temperatureC', p, when), 'Normal 70% of the time. Too hot at times: up to 57.8 °C (+75 min).');
});

test('all normal: "Normal throughout" and the average', () => {
  const p = periodInsight('temperatureC', Array.from({ length: 30 }, (_, i) => reading(i)), RANGES.temperatureC, opts(30));
  assert.deepEqual(periodBadge(p), { level: 'normal', label: 'Normal throughout' });
  assert.equal(periodSummary('temperatureC', p, when), 'Normal the whole time, averaging 27.0 °C.');
  assert.equal(p.longestOut, null);
  assert.equal(p.change, 0);
});

test('too cold is a low status; the summary names the lowest value', () => {
  const rs = [reading(0), reading(1, { temperatureC: 12 }), reading(2, { temperatureC: 11.5 }), reading(3)];
  const p = periodInsight('temperatureC', rs, RANGES.temperatureC, opts(4));
  assert.deepEqual(p.worst, { level: 'critical', label: 'Too cold', high: false });
  assert.equal(periodSummary('temperatureC', p, when), 'Normal 50% of the time. Too cold at times: down to 11.5 °C (+2 min).');
});

test('gas warm-up readings after a power-on are not judged', () => {
  // Power-on at seq 0: the first 30 minutes are warm-up (2552 mV at 4 min on 17 Nov).
  const rs = Array.from({ length: 40 }, (_, i) => reading(i, { seq: i, nh3GasMv: i < 30 ? 2552 : 1650 }));
  const p = periodInsight('nh3GasMv', rs, RANGES.nh3GasMv, opts(40));
  assert.equal(p.warmupSkipped, 30);
  assert.equal(p.count, 10);
  assert.deepEqual(periodBadge(p), { level: 'normal', label: 'Normal throughout' });
});

test('a gap in the data ends a spell outside normal; missing values never count', () => {
  const rs = [
    reading(0, { temperatureC: 34 }), reading(1, { temperatureC: 34 }),
    reading(30, { temperatureC: 34 }), // 29 minutes later: a new spell, not one of 31 minutes
    reading(31, { temperatureC: null }),
  ];
  const p = periodInsight('temperatureC', rs, RANGES.temperatureC, opts(32));
  assert.equal(p.count, 3);
  assert.equal(p.longestOut?.minutes, 2);
});

test('data coverage counts hours with readings; pH flags uncalibrated readings', () => {
  const rs = [reading(0, { phCalibrated: false }), reading(1), reading(150)];
  const p = periodInsight('ph', rs, RANGES.ph, { intervalSec: 60, startMs: T0, endMs: T0 + 24 * 60 * MIN, nowMs: T0 + 4 * 60 * MIN });
  assert.equal(p.hoursWithData, 2);
  assert.equal(p.hoursTotal, 4, 'only up to now');
  assert.equal(p.uncalibrated, 1);
  assert.equal(periodInsight('ph', [], RANGES.ph, opts(10)).worst, null);
  assert.deepEqual(periodBadge(periodInsight('ph', [], RANGES.ph, opts(10))), { level: 'unknown', label: 'No readings' });
});

test('percentages add up to 100; durations read naturally', () => {
  assert.deepEqual(percentages([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(percentages([0, 0]), [0, 0]);
  assert.equal(percentages([2, 997, 1]).reduce((a, b) => a + b, 0), 100);
  assert.equal(durationText(45), '45 min');
  assert.equal(durationText(200), '3 h 20 min');
  assert.equal(durationText(120), '2 h');
  assert.equal(durationText(52 * 60), '2 d 4 h');
});
