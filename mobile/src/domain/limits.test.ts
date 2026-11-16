// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { alertDetail, alertText } from './alerts.ts';
import { exportSheets } from './export.ts';
import { insight } from './insights.ts';
import {
  isDefaultLimits, limitFieldError, limitsFromDoc, limitsOf, limitTexts, parseLimit, rangeFromStored, rangeFromTexts, toStored,
  validRange, type LimitTexts,
} from './limits.ts';
import { classify, normalRangeText, RANGES, type Range } from './thresholds.ts';

const PH_TIGHT: Range = { normal: [6.8, 8.0], warning: [6.5, 8.5] };
const stored = (r: Range) => toStored(r);

test('a station without limits uses the defaults', () => {
  for (const raw of [undefined, null, {}, 'junk', 42]) {
    const { limits, custom } = limitsFromDoc(raw);
    assert.deepEqual(limits, RANGES);
    assert.equal(custom, false);
  }
  assert.equal(limitsOf(null), RANGES);
  assert.equal(limitsOf({}), RANGES, 'a device cached by an app before 0.9.4 has no limits field');
});

test('stored limits are read sensor by sensor; an invalid one falls back to its default', () => {
  const { limits, custom } = limitsFromDoc({
    ph: stored(PH_TIGHT),
    temperatureC: { normalMin: 30, normalMax: 20, criticalBelow: 15, criticalAbove: 35 }, // reversed: invalid
    nh3GasMv: { normalMin: 0, normalMax: '1700' }, // not numbers: invalid
    updatedAt: 'a timestamp',
  });
  assert.deepEqual(limits.ph, PH_TIGHT);
  assert.deepEqual(limits.temperatureC, RANGES.temperatureC);
  assert.deepEqual(limits.nh3GasMv, RANGES.nh3GasMv);
  assert.equal(custom, true);
  assert.equal(limitsFromDoc({ ph: stored(RANGES.ph) }).custom, false, 'stored defaults are not custom');
  assert.equal(isDefaultLimits(RANGES), true);
});

test('validRange: same rules as firestore.rules validLimits', () => {
  assert.equal(validRange('ph', RANGES.ph), true);
  assert.equal(validRange('ph', { normal: [6.5, 6.5], warning: [6, 9] }), false, 'normal needs a width');
  assert.equal(validRange('ph', { normal: [6.5, 8.5], warning: [6.6, 9] }), false, 'critical low above normal low');
  assert.equal(validRange('ph', { normal: [6.5, 8.5], warning: [6, 8.4] }), false, 'critical high below normal high');
  assert.equal(validRange('ph', { normal: [6.5, 8.5], warning: [6.5, 8.5] }), true, 'no warning band: straight to critical');
  assert.equal(validRange('ph', { normal: [6.5, 8.5], warning: [-1, 9] }), false, 'below the sensor range');
  assert.equal(validRange('temperatureC', { normal: [-5, 30], warning: [-10, 125] }), true, 'temperature may go below zero');
  assert.equal(validRange('temperatureC', { normal: [20, 32], warning: [15, 126] }), false);
  assert.equal(validRange('nh3GasMv', { normal: [0, 1500], warning: [0, 2000] }), true);
  assert.equal(validRange('nh3GasMv', { normal: [100, 1500], warning: [0, 2000] }), false, 'gas has a high side only');
  assert.equal(validRange('ph', { normal: [Number.NaN, 8.5], warning: [6, 9] }), false);
  assert.equal(rangeFromStored('ph', { ...stored(PH_TIGHT), extra: 1 })?.normal[0], 6.8, 'extra keys are ignored when reading');
});

test('classify, wording and insights use the station limits', () => {
  // 6.6 is normal by default but outside the tighter normal range, still above its critical limit.
  assert.equal(classify('ph', 6.6).level, 'normal');
  assert.deepEqual(classify('ph', 6.6, PH_TIGHT), { level: 'warning', label: 'A bit acidic' });
  assert.deepEqual(classify('ph', 6.4, PH_TIGHT), { level: 'critical', label: 'Too acidic' });
  assert.equal(normalRangeText('ph', PH_TIGHT), '6.8 to 8.0');
  assert.equal(alertDetail('ph', 6.6, PH_TIGHT), 'pH 6.6 · normal 6.8 to 8.0');
  assert.equal(alertText('ph', 'A bit acidic', 6.6, 'Tank', { simulated: false, uncalibrated: false, range: PH_TIGHT }).body,
    'pH is 6.6. Normal is 6.8 to 8.0. Lower pH means more acidic.');
  assert.equal(alertText('ph', 'Too alkaline', 9.4, 'Tank', { simulated: false, uncalibrated: false }).body,
    'pH is 9.4. Normal is 6.5 to 8.5. Higher pH means more alkaline.', 'no range = the defaults, as before');
  const samples = [6.6, 7.0, 7.5, 8.2].map((v, i) => ({ t: i, v }));
  assert.equal(insight('ph', samples).normalPct, 100);
  assert.equal(insight('ph', samples, PH_TIGHT).normalPct, 50);
});

test('form: values as typed, field errors, and the saved range', () => {
  const t = (o: Partial<LimitTexts> = {}): LimitTexts => ({ ...limitTexts('ph', RANGES.ph), ...o });
  assert.deepEqual(limitTexts('ph', RANGES.ph), { normalMin: '6.5', normalMax: '8.5', criticalBelow: '6', criticalAbove: '9' });
  assert.equal(parseLimit(' 6,5 '), 6.5, 'a comma works as the decimal point');
  assert.equal(parseLimit('6.5.1'), undefined);
  assert.equal(parseLimit('abc'), undefined);
  assert.equal(limitFieldError('ph', 'normalMin', t({ normalMin: '' })), 'Enter a number.');
  assert.equal(limitFieldError('ph', 'normalMin', t({ normalMin: 'x' })), 'Enter a number.');
  assert.equal(limitFieldError('ph', 'normalMin', t({ normalMin: '6.55' })), 'Use at most 1 decimal.');
  assert.equal(limitFieldError('nh3GasMv', 'normalMax', { ...limitTexts('nh3GasMv', RANGES.nh3GasMv), normalMax: '1700.5' }), 'Use a whole number.');
  assert.equal(limitFieldError('ph', 'criticalAbove', t({ criticalAbove: '15' })), 'Use 0 to 14.');
  assert.equal(limitFieldError('temperatureC', 'criticalBelow', { ...limitTexts('temperatureC', RANGES.temperatureC), criticalBelow: '-11' }), 'Use -10 to 125.');
  // A broken pair shows on both fields, each naming the other's value.
  assert.equal(limitFieldError('ph', 'normalMin', t({ normalMin: '9' })), 'Must be less than 8.5.');
  assert.equal(limitFieldError('ph', 'normalMax', t({ normalMin: '9' })), 'Must be more than 9.');
  assert.equal(limitFieldError('ph', 'criticalBelow', t({ criticalBelow: '7' })), 'Must be 6.5 or less.');
  assert.equal(limitFieldError('ph', 'normalMin', t({ criticalBelow: '7' })), 'Must be 7 or more.');
  assert.equal(limitFieldError('ph', 'criticalAbove', t({ criticalAbove: '8' })), 'Must be 8.5 or more.');
  assert.equal(limitFieldError('ph', 'normalMax', t({ criticalAbove: '8' })), 'Must be 8 or less.');
  assert.equal(limitFieldError('ph', 'normalMin', t({ normalMax: 'x' })), undefined, 'no order message against an unreadable field');
  // Equal limits are allowed: no warning band on that side.
  assert.deepEqual(rangeFromTexts('ph', t({ criticalBelow: '6.5' })), { normal: [6.5, 8.5], warning: [6.5, 9] });
  assert.equal(rangeFromTexts('ph', t({ normalMin: '9' })), null);
  assert.deepEqual(rangeFromTexts('nh3GasMv', { ...limitTexts('nh3GasMv', RANGES.nh3GasMv), normalMax: '1500', criticalAbove: '2000' }),
    { normal: [0, 1500], warning: [0, 2000] });
});

test('export: statuses and the normal range use the station limits; alerts keep their own', () => {
  const sheets = exportSheets({
    deviceName: 'Tank', simulated: false, range: { start: 0, end: 0 }, metrics: ['ph'], generatedAt: 0, truncated: false,
    readings: [{ t: 1, ph: 6.6, phCalibrated: true, temperatureC: null, nh3GasMv: null }],
    // Raised before the limits changed (stored with the defaults): stays "Too alkaline".
    alerts: [{ t: 1, metric: 'ph', title: 'Tank: water too alkaline (pH 9.2)', body: '', value: 9.2, level: 'critical', limits: null }],
    limits: { ...RANGES, ph: PH_TIGHT },
    customLimits: true,
  });
  const text = JSON.stringify(sheets);
  assert.ok(text.includes('6.8 to 8.0'), 'normal range column');
  assert.ok(text.includes('A bit acidic'), '6.6 with the tighter limits');
  assert.ok(text.includes('this station uses its own limits'));
  assert.ok(JSON.stringify(sheets[2].rows).includes('Too alkaline'));
});
