// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';

import { autoWidths, buildXlsx, columnName, escapeXml, safeSheetName } from '../lib/xlsx.ts';
import { exportFileName, exportSheets, type ExportInput } from './export.ts';

const day = (n: number) => new Date(2026, 9, n).getTime();
const input = (overrides: Partial<ExportInput> = {}): ExportInput => ({
  deviceName: 'Tank 1',
  simulated: false,
  range: { start: day(21), end: day(27) },
  metrics: ['ph', 'nh3GasMv'],
  readings: [
    { t: day(21) + 3_600_000, ph: 7.1, phCalibrated: false, temperatureC: 27, nh3GasMv: 420 },
    { t: day(22) + 3_600_000, ph: 9.4, phCalibrated: true, temperatureC: null, nh3GasMv: null },
  ],
  alerts: [{ t: day(22) + 3_600_000, metric: 'ph', title: 'pH too basic', body: 'Tank 1: 9.4', value: 9.4, level: 'critical' }],
  generatedAt: day(27) + 8 * 3_600_000,
  truncated: false,
  ...overrides,
});

test('xlsx helpers', () => {
  assert.equal(columnName(0), 'A');
  assert.equal(columnName(25), 'Z');
  assert.equal(columnName(26), 'AA');
  assert.equal(escapeXml('a<b & "c"\u0001'), 'a&lt;b &amp; &quot;c&quot;');
  assert.equal(safeSheetName('a/b:c'.padEnd(40, 'x')).length, 31);
  // auto-fit: longest content + padding, clamped 10..60; long merged notes ignored
  assert.deepEqual(autoWidths([['2026-10-27 14:05:09', 7.1], [{ v: 'x'.repeat(200), s: 'muted' }]]), [23, 10]);
});

test('workbook has the required parts and only the chosen fields', () => {
  const zip = unzipSync(buildXlsx(exportSheets(input())));
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
    'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']) {
    assert.ok(zip[part], `missing ${part}`);
  }
  const readings = strFromU8(zip['xl/worksheets/sheet2.xml']);
  assert.ok(readings.includes('pH level status'));
  assert.ok(readings.includes('Ammonia (mV)'));
  assert.ok(!readings.includes('Temperature'), 'temperature was not selected');
  assert.ok(readings.includes('Too basic'));
  assert.ok(readings.includes('pH calibrated'), 'calibration flag column');
  assert.ok(readings.includes('No reading'), 'missing value is labelled, not zero');
  assert.ok(readings.includes('state="frozen"'));
  assert.ok(readings.includes('showGridLines="0"'), 'gridlines hidden');
  assert.ok(readings.includes('zeroHeight="1"'), 'unused rows hidden');
  assert.ok(/<col min="7" max="16384"[^>]*hidden="1"/.test(readings), 'unused columns hidden');
  assert.ok(strFromU8(zip['xl/worksheets/sheet1.xml']).includes('<mergeCell ref="A1:F1"/>'), 'title banner merged');
  assert.ok(strFromU8(zip['xl/styles.xml']).includes('FF0079CE'), 'brand blue header');
  assert.ok(strFromU8(zip['xl/workbook.xml']).includes('name="Alerts"'));
});

test('calibration notes reflect the readings', () => {
  const mixed = JSON.stringify(exportSheets(input())[0].rows);
  assert.ok(mixed.includes('1 of 2 readings are from an uncalibrated probe'));
  const allCal = exportSheets(input({ readings: [{ t: day(21), ph: 7, phCalibrated: true, temperatureC: 25, nh3GasMv: 400 }] }));
  assert.ok(!JSON.stringify(allCal[0].rows).includes('uncalibrated probe'), 'no warning when all calibrated');
});

test('summary notes are honest', () => {
  const sheets = exportSheets(input({ simulated: true, truncated: true }));
  const text = JSON.stringify(sheets[0].rows);
  assert.ok(text.includes('Simulated device'));
  assert.ok(text.includes('not ppm'));
  assert.ok(text.includes('read limit'));
});

test('no fields selected is an error', () => {
  assert.throws(() => exportSheets(input({ metrics: [] })));
});

test('file name', () => {
  assert.equal(exportFileName('Simulated tank!', { start: day(21), end: day(27) }), 'TubigTala_Simulated-tank_2026-10-21_to_2026-10-27.xlsx');
  assert.equal(exportFileName('', { start: day(27), end: day(27) }), 'TubigTala_device_2026-10-27.xlsx');
});
