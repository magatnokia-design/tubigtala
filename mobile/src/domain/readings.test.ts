// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chartSeries, niceTicks, stats } from './readings.ts';

const MIN = 60_000;

test('stats skip missing values instead of counting them as zero', () => {
  assert.deepEqual(stats([7, null, 8, 9]), { min: 7, max: 9, avg: 8, count: 3 });
  assert.equal(stats([null, null]), null);
  assert.equal(stats([]), null);
  assert.deepEqual(stats([0]), { min: 0, max: 0, avg: 0, count: 1 });
});

test('chart series: a station that was off leaves a gap, not a straight line', () => {
  // the 7 Nov bug: readings on 5 Nov, nothing for two days, readings again on 7 Nov
  const pts = [{ t: 0, v: 25 }, { t: MIN, v: 25.1 }, { t: 2 * 24 * 60 * MIN, v: 24.7 }, { t: 2 * 24 * 60 * MIN + MIN, v: 24.8 }];
  const out = chartSeries(pts, 160, 3 * MIN);
  assert.equal(out.length, 5);
  assert.equal(out[2].v, null, 'a null is inserted in the gap');
  assert.deepEqual(out.filter((p) => p.v !== null), pts);
});

test('chart series: steady readings stay one line; missing values stay gaps', () => {
  const steady = Array.from({ length: 60 }, (_, i) => ({ t: i * MIN, v: 1400 }));
  assert.ok(chartSeries(steady, 160, 3 * MIN).every((p) => p.v !== null));
  const warmup = [{ t: 0, v: 1400 }, { t: MIN, v: null }, { t: 2 * MIN, v: 1410 }];
  assert.deepEqual(chartSeries(warmup, 160, 3 * MIN), warmup);
});

test('chart series: long series are averaged into time buckets, gaps kept', () => {
  // 1000 readings in the first hour, 1000 in the third: the empty second hour must stay a gap
  const a = Array.from({ length: 1000 }, (_, i) => ({ t: (i * 60 * MIN) / 1000, v: 10 }));
  const b = Array.from({ length: 1000 }, (_, i) => ({ t: 120 * MIN + (i * 60 * MIN) / 1000, v: 20 }));
  const out = chartSeries([...a, ...b], 100, 3 * MIN);
  assert.ok(out.length <= 102);
  const nulls = out.filter((p) => p.v === null);
  assert.equal(nulls.length, 1);
  assert.ok(nulls[0].t > 60 * MIN && nulls[0].t < 120 * MIN);
  assert.ok(out.every((p, i) => i === 0 || p.t > out[i - 1].t), 'time order kept');
  assert.equal(chartSeries([{ t: 0, v: null }, ...Array.from({ length: 300 }, (_, i) => ({ t: i, v: null }))], 10, 3 * MIN)[0].v, null);
});

test('axis ticks are round numbers inside the range', () => {
  assert.deepEqual(niceTicks(1208, 4886), [2000, 4000]);
  assert.deepEqual(niceTicks(1340, 1575), [1400, 1500]);
  assert.deepEqual(niceTicks(7.5, 58), [20, 40]);
  assert.deepEqual(niceTicks(24.65, 24.95), [24.7, 24.8, 24.9]);
});
