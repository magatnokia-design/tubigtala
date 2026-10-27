// What goes into an Excel export: a Summary sheet, a Readings sheet with only the chosen
// fields (each with its plain-language status), and an Alerts sheet. Pure data in, sheets
// out - no Firestore or file system here, so it is testable.
import type { Cell, CellValue, Sheet } from '../lib/xlsx.ts';
import { formatRange, isoLocal, type DayRange } from './dates.ts';
import { insight } from './insights.ts';
import { classify, METRIC_INFO, normalRangeText, type Level, type Metric } from './thresholds.ts';

export const EXPORT_METRICS: Metric[] = ['ph', 'temperatureC', 'nh3GasMv'];

export interface ExportReading {
  t: number;
  ph: number | null;
  temperatureC: number | null;
  nh3GasMv: number | null;
}

export interface ExportAlert {
  t: number;
  metric: Metric | null;
  title: string;
  body: string;
  value: number | null;
  level: Level | null;
}

export interface ExportInput {
  deviceName: string;
  simulated: boolean;
  range: DayRange;
  metrics: Metric[];
  readings: ExportReading[];
  alerts: ExportAlert[];
  generatedAt: number;
  /** true when the reading query hit its cap and older readings are missing */
  truncated: boolean;
}

const statusStyle = (level: Level) => (level === 'critical' ? 'critical' : level === 'warning' ? 'warning' : level === 'normal' ? 'normal' : 'cell');
const columnLabel = (m: Metric) => `${METRIC_INFO[m].name}${METRIC_INFO[m].unit ? ` (${METRIC_INFO[m].unit})` : ''}`;

/** Alternating white / pale-blue rows for readability. */
const band = (i: number, v: CellValue): Cell => ({ v, s: i % 2 ? 'cellAlt' : 'cell' });

export function exportSheets(input: ExportInput): Sheet[] {
  const metrics = EXPORT_METRICS.filter((m) => input.metrics.includes(m));
  if (!metrics.length) throw new Error('Choose at least one field to export');

  const notes: string[] = [];
  if (input.simulated) notes.push('Simulated device: values were generated for testing, not measured.');
  if (metrics.includes('ph')) notes.push('pH: indicative until the probe is calibrated.');
  if (metrics.includes('nh3GasMv')) notes.push('Ammonia: gas in the air above the water, uncalibrated relative mV (not ppm).');
  if (input.truncated) notes.push('Only the most recent readings in this range were included (read limit reached).');

  // ---- Summary (6 columns)
  const S = 'F';
  const info = (label: string, value: CellValue): Cell[] => [{ v: label, s: 'bold' }, { v: value, s: 'cell' }];
  const summaryRows: Cell[][] = [
    [{ v: 'TubigTala water report', s: 'title' }],
    info('Device', input.deviceName),
    info('Dates', formatRange(input.range)),
    info('Generated', isoLocal(input.generatedAt)),
    info('Alerts', input.alerts.length),
    [],
    ['Field', 'Readings', 'Lowest', 'Average', 'Highest', 'Normal range'].map((h) => ({ v: h, s: 'header' as const })),
    ...metrics.map((m, i): Cell[] => {
      const ins = insight(m, input.readings.map((r) => ({ t: r.t, v: r[m] })));
      const d = METRIC_INFO[m].decimals;
      const valid = input.readings.map((r) => r[m]).filter((v): v is number => v !== null);
      const avg = valid.length ? Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(d)) : null;
      return [
        { v: columnLabel(m), s: 'bold' },
        band(i, ins.count),
        band(i, ins.min ? Number(ins.min.v.toFixed(d)) : null),
        band(i, avg),
        band(i, ins.max ? Number(ins.max.v.toFixed(d)) : null),
        band(i, normalRangeText(m)),
      ];
    }),
  ];
  const firstNote = summaryRows.length + 2; // one blank row, then notes (1-based)
  if (notes.length) summaryRows.push([], ...notes.map((n): Cell[] => [{ v: n, s: 'muted' }]));
  const summary: Sheet = {
    name: 'Summary',
    headerRow: 7,
    rows: summaryRows,
    merges: [
      `A1:${S}1`,
      ...[2, 3, 4, 5].map((r) => `B${r}:${S}${r}`),
      ...notes.map((_, i) => `A${firstNote + i}:${S}${firstNote + i}`),
    ],
  };

  // ---- Readings
  const readings: Sheet = {
    name: 'Readings',
    headerRow: 1,
    rows: [
      ['Date and time', ...metrics.flatMap((m) => [columnLabel(m), `${METRIC_INFO[m].name} status`])].map((h) => ({ v: h, s: 'header' as const })),
      ...input.readings.map((r, i): Cell[] => [
        band(i, isoLocal(r.t)),
        ...metrics.flatMap((m): Cell[] => {
          const st = classify(m, r[m]);
          return [band(i, r[m]), { v: r[m] === null ? 'No reading' : st.label, s: statusStyle(st.level) }];
        }),
      ]),
    ],
  };

  // ---- Alerts
  const alerts: Sheet = {
    name: 'Alerts',
    headerRow: 1,
    rows: [
      ['Date and time', 'Field', 'Value', 'Status', 'Message'].map((h) => ({ v: h, s: 'header' as const })),
      ...input.alerts.map((a, i): Cell[] => [
        band(i, isoLocal(a.t)),
        band(i, a.metric ? METRIC_INFO[a.metric].name : ''),
        band(i, a.value),
        a.level && a.metric ? { v: classify(a.metric, a.value).label, s: statusStyle(a.level) } : band(i, ''),
        band(i, `${a.title}${a.body ? ` - ${a.body}` : ''}`),
      ]),
      ...(input.alerts.length ? [] : [[{ v: 'No alerts in this period', s: 'cell' as const }]]),
    ],
  };

  return [summary, readings, alerts];
}

/** TubigTala_Simulated-tank_2026-10-21_to_2026-10-27.xlsx */
export function exportFileName(deviceName: string, range: DayRange): string {
  const day = (ms: number) => isoLocal(ms).slice(0, 10);
  const safe = deviceName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'device';
  return `TubigTala_${safe}_${day(range.start)}${range.end !== range.start ? `_to_${day(range.end)}` : ''}.xlsx`;
}
