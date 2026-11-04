// TubigTala Cloud Functions. Deploying needs the Blaze plan; until then they run only on the
// local emulator (docs/runbook.md). Region matches the Firestore database (asia-southeast1).
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

import { providersFromEnv } from './providers.ts';
import { processReading } from './readings.ts';

initializeApp();

export const onReadingCreated = onDocumentCreated(
  { document: 'devices/{deviceId}/readings/{readingId}', region: 'asia-southeast1' },
  async (event) => {
    if (!event.data) return;
    await processReading(
      { db: getFirestore(), auth: getAuth(), providers: providersFromEnv() },
      event.params.deviceId,
      event.params.readingId,
      event.data.data(),
    );
  },
);
