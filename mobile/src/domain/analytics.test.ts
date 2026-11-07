// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addDays, DATA_START_DAY, daysInRange, endOfDay, isSelectableDay, lastPickableEnd, monthGrid, pickModeOf, startOfDay } from './dates.ts';
import { insight, insightSentence } from './insights.ts';
import { classify, isEscalation, normalRangeText } from './thresholds.ts';

test('classify: boundaries are inclusive and words match direction', () => {
  assert.deepEqual(classify('ph', 6.5), { level: 'normal', label: 'Normal' });
  assert.deepEqual(classify('ph', 8.5), { level: 'normal', label: 'Normal' });
  assert.deepEqual(classify('ph', 6.4), { level: 'warning', label: 'A bit low' });
  assert.deepEqual(classify('ph', 6.0), { level: 'warning', label: 'A bit low' });
  assert.deepEqual(classify('ph', 5.9), { level: 'critical', label: 'Too low' });
  assert.deepEqual(classify('ph', 8.7), { level: 'warning', label: 'A bit high' });
  assert.deepEqual(classify('ph', 9.1), { level: 'critical', label: 'Too high' });
  assert.deepEqual(classify('temperatureC', 33), { level: 'warning', label: 'A bit warm' });
  assert.deepEqual(classify('temperatureC', 18), { level: 'warning', label: 'A bit cold' });
  assert.deepEqual(classify('temperatureC', 14), { level: 'critical', label: 'Too cold' });
  assert.deepEqual(classify('temperatureC', 36), { level: 'critical', label: 'Too hot' });
  assert.deepEqual(classify('nh3GasMv', 1700), { level: 'normal', label: 'Normal' });
  assert.deepEqual(classify('nh3GasMv', 1701), { level: 'warning', label: 'A bit high' });
  assert.deepEqual(classify('nh3GasMv', 2201), { level: 'critical', label: 'Too high' });
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
  assert.equal(normalRangeText('ph'), '6.5 to 8.5');
  assert.equal(normalRangeText('temperatureC'), '20 to 32 °C');
  assert.equal(normalRangeText('nh3GasMv'), 'up to 1700 mV');
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

test('newest reading is "now": a missing newest value is not covered by an older one', () => {
  // the case seen on 5 Nov: pH values during a test, then readings with no pH
  const i = insight('ph', [{ t: 1, v: 10.9 }, { t: 2, v: null }, { t: 3, v: null }]);
  assert.deepEqual(i.newest, { t: 3, v: null });
  assert.deepEqual(i.latest, { t: 1, v: 10.9 }, 'last valid value is still known, for the "last value" line');
  assert.deepEqual(insight('ph', [{ t: 1, v: 7 }, { t: 2, v: 7.4 }]).newest, { t: 2, v: 7.4 });
  assert.equal(insight('ph', []).newest, null);
  assert.equal(insight('ph', [{ t: 5, v: Number.NaN }]).newest?.v, null, 'NaN is no value, not a number');
});

test('calendar: only 1 Nov 2026 up to today can be picked', () => {
  const today = new Date(2026, 10, 7).getTime();
  assert.equal(DATA_START_DAY, new Date(2026, 10, 1).getTime());
  assert.equal(isSelectableDay(new Date(2026, 9, 31).getTime(), today), false, '31 Oct: before data started');
  assert.equal(isSelectableDay(new Date(2026, 10, 1).getTime(), today), true);
  assert.equal(isSelectableDay(today, today), true);
  assert.equal(isSelectableDay(addDays(today, 1), today), false, 'tomorrow');
});

test('calendar: mode of a selection, and how far a range may reach', () => {
  const today = new Date(2026, 10, 7).getTime();
  assert.equal(pickModeOf({ start: today, end: today }, today), 'today');
  assert.equal(pickModeOf({ start: addDays(today, -2), end: addDays(today, -2) }, today), 'day');
  assert.equal(pickModeOf({ start: addDays(today, -2), end: today }, today), 'range');
  assert.equal(lastPickableEnd(new Date(2026, 10, 1).getTime(), today), today, 'capped at today');
  assert.equal(lastPickableEnd(new Date(2026, 10, 1).getTime(), new Date(2026, 10, 20).getTime()), new Date(2026, 10, 7).getTime(), '7 days');
});
