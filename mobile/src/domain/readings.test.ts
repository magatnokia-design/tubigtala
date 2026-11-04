// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { downsample, stats } from './readings.ts';

test('stats skip missing values instead of counting them as zero', () => {
  assert.deepEqual(stats([7, null, 8, 9]), { min: 7, max: 9, avg: 8, count: 3 });
  assert.equal(stats([null, null]), null);
  assert.equal(stats([]), null);
  assert.deepEqual(stats([0]), { min: 0, max: 0, avg: 0, count: 1 });
});

test('downsample keeps short series, averages buckets, keeps gaps', () => {
  const short = [{ t: 1, v: 1 }, { t: 2, v: null }];
  assert.equal(downsample(short, 10), short);

  const pts = Array.from({ length: 100 }, (_, i) => ({ t: i, v: i < 50 ? null : 10 }));
  const out = downsample(pts, 10);
  assert.equal(out.length, 10);
  assert.equal(out[0].v, null); // all-missing bucket stays a gap
  assert.equal(out[9].v, 10);
  assert.ok(out.every((p, i) => i === 0 || p.t > out[i - 1].t)); // time order kept
});
