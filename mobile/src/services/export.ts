// Builds the Excel export from Firestore and hands it to Android's share sheet
// (Drive, Messenger, email, Files...). Layout lives in domain/export.ts.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { endOfDay, type DayRange } from '@/domain/dates';
import { exportFileName, exportSheets } from '@/domain/export';
import type { Metric } from '@/domain/thresholds';
import type { Device } from '@/domain/types';
import { buildXlsx } from '@/lib/xlsx';
import { fetchReadingsBetween } from '@/services/devices';
import { fetchAlertsBetween } from '@/services/notifications';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface ExportResult {
  fileName: string;
  readingCount: number;
  alertCount: number;
  truncated: boolean;
}

export async function exportToExcel(uid: string, device: Device, range: DayRange, metrics: Metric[]): Promise<ExportResult> {
  const end = endOfDay(range.end);
  const [{ readings, truncated }, alerts] = await Promise.all([
    fetchReadingsBetween(device.id, range.start, end),
    fetchAlertsBetween(uid, device.id, range.start, end),
  ]);

  const bytes = buildXlsx(exportSheets({
    deviceName: device.name,
    simulated: device.simulated,
    range,
    metrics,
    readings: readings.map((r) => ({ t: r.serverTimeMs, ph: r.ph, phCalibrated: r.phCalibrated, temperatureC: r.temperatureC, nh3GasMv: r.nh3GasMv })),
    alerts: alerts.map((a) => ({ t: a.createdAtMs, metric: a.metric, title: a.title, body: a.body, value: a.value, level: a.level })),
    generatedAt: Date.now(),
    truncated,
  }));

  const fileName = exportFileName(device.name, range);
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  await file.write(bytes);

  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone.');
  await Sharing.shareAsync(file.uri, { mimeType: XLSX_MIME, dialogTitle: 'Save or send the Excel file' });
  return { fileName, readingCount: readings.length, alertCount: alerts.length, truncated };
}
