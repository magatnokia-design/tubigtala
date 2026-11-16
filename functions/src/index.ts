// TubigTala Cloud Functions (Blaze plan since 16 Nov 2026; deploy steps in docs/runbook.md).
// Region matches the Firestore database (asia-southeast1).
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

import { providersFromEnv, TEXTBEE_API_KEY, TEXTBEE_DEVICE_ID } from './providers.ts';
import { processReading } from './readings.ts';

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
