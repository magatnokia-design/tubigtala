// TubigTala Cloud Functions (Blaze plan since 16 Nov 2026; deploy steps in docs/runbook.md).
// Region matches the Firestore database (asia-southeast1).
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { providersFromEnv, pushOnlyProviders, TEXTBEE_API_KEY, TEXTBEE_DEVICE_ID } from './providers.ts';
import { processReading } from './readings.ts';
import { checkStationsOnce } from './stations.ts';

initializeApp();

export const onReadingCreated = onDocumentCreated(
  {
    document: 'devices/{deviceId}/readings/{readingId}',
    region: 'asia-southeast1',
    // Readable only by this function, from Secret Manager (never in the repo or the app).
    secrets: [TEXTBEE_API_KEY, TEXTBEE_DEVICE_ID],
    // One reading a minute per station: a small instance is plenty, and capping instances keeps
    // a runaway (e.g. a flood of uploads) from scaling up cost.
    memory: '256MiB',
    maxInstances: 2,
  },
  async (event) => {
    if (!event.data) return;
    await processReading(
      { db: getFirestore(), providers: providersFromEnv() },
      event.params.deviceId,
      event.params.readingId,
      event.data.data(),
    );
  },
);

// Station offline / back online (stations.ts). A station that stops uploading triggers nothing
// above, so this looks every 5 minutes. One Cloud Scheduler job (free: 3 jobs per billing account,
// then USD 0.10 a month each); about 3 document reads per paired station per run.
export const checkStations = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Manila',
    region: 'asia-southeast1',
    memory: '256MiB',
    maxInstances: 1,
  },
  async () => {
    await checkStationsOnce({ db: getFirestore(), providers: pushOnlyProviders() });
  },
);
