// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addDays, daysInRange, endOfDay, MAX_RANGE_DAYS, monthGrid, startOfDay, tapDay } from './dates.ts';
import { insight, insightSentence } from './insights.ts';
import { classify, isEscalation, normalRangeText } from './thresholds.ts';

test('classify: boundaries are inclusive and words match direction', () => {
  assert.deepEqual(classify('ph', 6.5), { level: 'normal', label: 'Normal' });
  assert.deepEqual(classify('ph', 8.5), { level: 'normal', label: 'Normal' });
  assert.deepEqual(classify('ph', 6.4), { level: 'warning', label: 'Slightly acidic' });
  assert.deepEqual(classify('ph', 6.0), { level: 'warning', label: 'Slightly acidic' });
  assert.deepEqual(classify('ph', 5.9), { level: 'critical', label: 'Too acidic' });
  assert.deepEqual(classify('ph', 9.1), { level: 'critical', label: 'Too basic' });
  assert.deepEqual(classify('temperatureC', 33), { level: 'warning', label: 'Warm' });
  assert.deepEqual(classify('temperatureC', 14), { level: 'critical', label: 'Too cold' });
  assert.deepEqual(classify('nh3GasMv', 600), { level: 'normal', label: 'Normal' });
  assert.deepEqual(classify('nh3GasMv', 750), { level: 'warning', label: 'Elevated' });
  assert.deepEqual(classify('nh3GasMv', 950), { level: 'critical', label: 'High' });
});

test('classify: missing is unknown, never normal', () => {
  assert.equal(classify('ph', null).level, 'unknown');
  assert.equal(classify('temperatureC', Number.NaN).level, 'unknown');
});

test('escalation only when it gets worse', () => {
  assert.equal(isEscalation('normal', 'warning'), true);
  assert.equal(isEscalation('warning', 'critical'), true);
  assert.equal(isEscalation('unknown', 'critical'), true);
  assert.equal(isEscalation('warning', 'warning'), false);
  assert.equal(isEscalation('critical', 'warning'), false);
  assert.equal(isEscalation('warning', 'normal'), false);
});

test('range text', () => {
  assert.equal(normalRangeText('ph'), '6.5 – 8.5');
  assert.equal(normalRangeText('temperatureC'), '20.0 – 32.0 °C');
  assert.equal(normalRangeText('nh3GasMv'), 'up to 600 mV');
});

test('insight skips missing values and finds extremes', () => {
  const i = insight('ph', [{ t: 1, v: 7 }, { t: 2, v: null }, { t: 3, v: 9.5 }, { t: 4, v: 7.2 }]);
  assert.equal(i.count, 3);
  assert.equal(i.normalPct, 67);
  assert.deepEqual(i.max, { t: 3, v: 9.5 });
  assert.deepEqual(i.min, { t: 1, v: 7 });
  assert.ok(Math.abs((i.change ?? 0) - 0.2) < 1e-9);
  assert.equal(insightSentence('ph', i), 'Normal 67% of the time · rose 0.2');
});

test('insight sentences for empty and steady data', () => {
  assert.equal(insightSentence('ph', insight('ph', [{ t: 1, v: null }])), 'No readings in this period');
  assert.equal(insightSentence('temperatureC', insight('temperatureC', [{ t: 1, v: 25 }, { t: 2, v: 25 }])), 'Normal the whole time · steady');
});

test('day helpers', () => {
  const noon = new Date(2026, 9, 27, 12, 30).getTime();
  assert.equal(startOfDay(noon), new Date(2026, 9, 27).getTime());
  assert.equal(endOfDay(noon), new Date(2026, 9, 28).getTime() - 1);
  assert.equal(addDays(new Date(2026, 9, 31).getTime(), 1), new Date(2026, 10, 1).getTime());
  assert.equal(daysInRange(new Date(2026, 9, 21).getTime(), new Date(2026, 9, 27).getTime()), 7);
});

test('month grid: October 2026 starts on Thursday, 31 days, 6x7', () => {
  const g = monthGrid(2026, 9);
  assert.equal(g.length, 6);
  assert.ok(g.every((row) => row.length === 7));
  assert.equal(g[0][3], null);
  assert.equal(g[0][4], new Date(2026, 9, 1).getTime());
  assert.equal(g.flat().filter((d) => d !== null).length, 31);
});

test('tapDay: single day, range, restart, and the 7-day cap', () => {
  const d = (n: number) => new Date(2026, 9, n).getTime();
  let s = tapDay(null, d(10), 'start');
  assert.deepEqual(s.range, { start: d(10), end: d(10) });
  s = tapDay(s.range, d(12), s.picking);
  assert.deepEqual(s.range, { start: d(10), end: d(12) });
  s = tapDay(s.range, d(5), s.picking); // picking start again
  assert.deepEqual(s.range, { start: d(5), end: d(5) });
  s = tapDay(s.range, d(30), s.picking); // too long: clamped
  assert.deepEqual(s.range, { start: d(5), end: d(5 + MAX_RANGE_DAYS - 1) });
  s = tapDay({ start: d(10), end: d(10) }, d(8), 'end'); // before start: restart there
  assert.deepEqual(s.range, { start: d(8), end: d(8) });
});
