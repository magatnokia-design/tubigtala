// Run: npm test  (Node's built-in runner; no extra packages)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deviceStatus, OFFLINE_AFTER_MS } from './status.ts';
import { formatAge, formatNumber, MISSING } from './format.ts';

const NOW = 1_800_000_000_000;
const interval = 60; // s -> stale after 180 s

test('no readings is no-data, not offline', () => {
  assert.equal(deviceStatus(null, interval, NOW), 'no-data');
});

test('live up to and including 3 intervals', () => {
  assert.equal(deviceStatus(NOW, interval, NOW), 'live');
  assert.equal(deviceStatus(NOW - 180_000, interval, NOW), 'live');
});

test('stale just past 3 intervals', () => {
  assert.equal(deviceStatus(NOW - 180_001, interval, NOW), 'stale');
});

test('stale up to and including 15 min, offline after', () => {
  assert.equal(deviceStatus(NOW - OFFLINE_AFTER_MS, interval, NOW), 'stale');
  assert.equal(deviceStatus(NOW - OFFLINE_AFTER_MS - 1, interval, NOW), 'offline');
});

test('long interval: offline wins over stale', () => {
  assert.equal(deviceStatus(NOW - 16 * 60_000, 600, NOW), 'offline');
});

test('phone clock behind the server still counts as live', () => {
  assert.equal(deviceStatus(NOW + 5_000, interval, NOW), 'live');
});

test('missing values format as a dash, zero stays zero', () => {
  assert.equal(formatNumber(null, 2), MISSING);
  assert.equal(formatNumber(Number.NaN, 2), MISSING);
  assert.equal(formatNumber(0, 1), '0.0');
  assert.equal(formatNumber(7.126, 2), '7.13');
});

test('ages', () => {
  assert.equal(formatAge(3_000), 'just now');
  assert.equal(formatAge(45_000), '45 s ago');
  assert.equal(formatAge(12 * 60_000), '12 min ago');
  assert.equal(formatAge(3 * 3_600_000), '3 h ago');
  assert.equal(formatAge(3 * 86_400_000), '3 d ago');
});
