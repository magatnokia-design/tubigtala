// What happens when a device uploads a reading (docs/data-model.md, "Alert policy"):
//  1. Each field is classified with the app's own thresholds and run through the same
//     alertState transaction as the app (domain/alerts.ts nextAlertStep), writing the in-app
//     alert with the same document ID. The app may still raise alerts while open; whichever
//     commits first wins and the other sees the updated state, so there is one alert either way.
//  2. If a field is critical, pH (calibrated) or temperature, for SMS_STREAK readings in a row:
//     one SMS per alert episode, within the account-wide day/month caps.
// No email (dropped 13 Nov 2026): alerts reach the user as in-app/phone notifications and SMS.
// Deliveries are recorded in alertDeliveries/{id}, created before sending: a second run for the
// same reading or episode finds the record and sends nothing. The app cannot read these records.
import { FieldValue, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { alertText, nextAlertStep, type AlertState } from '../../mobile/src/domain/alerts.ts';
import { classify, type Metric } from '../../mobile/src/domain/thresholds.ts';
import {
  isCriticalStreak, maskPhone, reserveSms, smsMetricAllowed, smsText, SMS_STREAK,
  type SmsBudget, type SmsItem,
} from './policy.ts';
import type { Providers } from './providers.ts';

const METRICS: Metric[] = ['ph', 'temperatureC', 'nh3GasMv'];

function toAlertState(d: DocumentData | undefined): AlertState | null {
  if (!d) return null;
  return {
    level: d.level === 'warning' || d.level === 'critical' ? d.level : 'normal',
    alertLevel: d.alertLevel === 'warning' || d.alertLevel === 'critical' ? d.alertLevel : null,
    alertedAtMs: d.alertedAt instanceof Timestamp ? d.alertedAt.toMillis() : null,
  };
}

export interface Deps {
  db: Firestore;
  providers: Providers;
  nowMs?: () => number;
}

export async function processReading(deps: Deps, deviceId: string, readingId: string, reading: DocumentData): Promise<void> {
  const { db } = deps;
  const device = (await db.doc(`devices/${deviceId}`).get()).data();
  if (!device || typeof device.ownerUid !== 'string') {
    logger.warn(`reading ${deviceId}/${readingId}: device record missing or has no owner, skipped`);
    return;
  }
  const uid: string = device.ownerUid;
  const deviceName: string = typeof device.name === 'string' ? device.name : deviceId;
  const simulated = device.simulated === true || reading.simulated === true;
  const phCalibrated = reading.phCalibrated === true;
  // Server time of the reading drives the cooldown, as in the app. Fall back to now if missing.
  const readingMs = reading.serverTime instanceof Timestamp ? reading.serverTime.toMillis() : (deps.nowMs ?? Date.now)();

  const critical: (SmsItem & { alertedAtMs: number })[] = [];

  for (const metric of METRICS) {
    const value = typeof reading[metric] === 'number' ? (reading[metric] as number) : null;
    const status = classify(metric, value);
    if (status.level === 'unknown') continue;

    const stateRef = db.doc(`users/${uid}/alertState/${deviceId}_${metric}`);
    const alertRef = db.doc(`users/${uid}/notifications/${deviceId}_${metric}_${readingId}`);
    const after = await db.runTransaction(async (tx) => {
      const state = toAlertState((await tx.get(stateRef)).data());
      const step = nextAlertStep(state, status.level, readingMs);
      if (step.kind === 'none') return state;
      if (step.kind === 'raise') {
        const text = alertText(metric, status.label, value, deviceName, { simulated, uncalibrated: metric === 'ph' && !phCalibrated });
        // Same fields and ID as the app's alert (services/alerts.ts), so either can create it.
        tx.set(alertRef, {
          title: text.title.slice(0, 80),
          body: text.body.slice(0, 200),
          deviceId,
          metric,
          value,
          level: step.state.alertLevel,
          readingId,
          createdAt: FieldValue.serverTimestamp(),
          read: false,
        });
      }
      tx.set(stateRef, {
        level: step.state.level,
        alertLevel: step.state.alertLevel,
        alertedAt: step.state.alertedAtMs === null ? null : Timestamp.fromMillis(step.state.alertedAtMs),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return step.state;
    });

    if (status.level === 'critical' && after?.alertLevel === 'critical' && after.alertedAtMs !== null && value !== null) {
      critical.push({ metric, label: status.label, value, alertedAtMs: after.alertedAtMs });
    }
  }

  if (critical.length === 0) return;
  const profile = (await db.doc(`users/${uid}`).get()).data();
  await sendSms(deps, { uid, deviceId, readingId, deviceName, simulated, phCalibrated, readingMs, profile }, critical);
}

interface Ctx {
  uid: string;
  deviceId: string;
  readingId: string;
  deviceName: string;
  simulated: boolean;
  readingMs: number;
  profile: DocumentData | undefined;
}

async function sendSms(deps: Deps, ctx: Ctx & { phCalibrated: boolean }, critical: (SmsItem & { alertedAtMs: number })[]): Promise<void> {
  const { db } = deps;
  if (ctx.simulated) return; // test data never costs an SMS
  const phone = ctx.profile?.smsAlertsEnabled === true && typeof ctx.profile.phoneE164 === 'string' ? (ctx.profile.phoneE164 as string) : null;
  if (!phone) return;
  const allowed = critical.filter((c) => smsMetricAllowed(c.metric, ctx.phCalibrated));
  if (allowed.length === 0) return;

  // The newest readings by server time; this one is among them unless a newer one already arrived.
  const recent = await db.collection(`devices/${ctx.deviceId}/readings`).orderBy('serverTime', 'desc').limit(SMS_STREAK).get();
  const streak = allowed.filter((c) => isCriticalStreak(c.metric, recent.docs.map((d) => d.get(c.metric))));
  if (streak.length === 0) return;

  // One SMS per alert episode (an episode = one critical alert, identified by when it was raised),
  // reserved against the caps in one transaction so concurrent readings cannot overspend.
  const episodeId = (c: { metric: Metric; alertedAtMs: number }) => `sms_${ctx.uid}_${ctx.deviceId}_${c.metric}_${c.alertedAtMs}`;
  const budgetRef = db.doc('smsBudget/global');
  const toSend = await db.runTransaction(async (tx) => {
    const refs = streak.map((c) => db.doc(`alertDeliveries/${episodeId(c)}`));
    const [budget, ...episodes] = await tx.getAll(budgetRef, ...refs);
    const fresh = streak.filter((_, i) => !episodes[i].exists);
    if (fresh.length === 0) return [];
    const base = { channel: 'sms', uid: ctx.uid, deviceId: ctx.deviceId, readingId: ctx.readingId, createdAt: FieldValue.serverTimestamp() };
    const reservation = reserveSms((budget.data() as SmsBudget | undefined) ?? null, (deps.nowMs ?? Date.now)(), 1);
    if (!reservation.ok) {
      // Recorded as skipped, so this episode does not keep retrying; the in-app alert already exists.
      for (const c of fresh) tx.create(db.doc(`alertDeliveries/${episodeId(c)}`), { ...base, metric: c.metric, status: `skipped: ${reservation.reason} cap reached` });
      logger.warn(`SMS ${reservation.reason} cap reached; ${ctx.deviceId} ${fresh.map((c) => c.metric).join(',')} not texted`);
      return [];
    }
    tx.set(budgetRef, reservation.next);
    for (const c of fresh) tx.create(db.doc(`alertDeliveries/${episodeId(c)}`), { ...base, metric: c.metric, status: 'sending' });
    return fresh;
  });
  if (toSend.length === 0) return;

  const text = smsText(ctx.deviceName, toSend, ctx.readingMs);
  const result = await deps.providers.sms(phone, text).catch((e: unknown) => ({ ok: false, detail: String(e).slice(0, 200) }));
  // A failed send keeps its budget slot: better one unused slot than a retry storm.
  if (!result.ok) logger.error(`SMS to ${maskPhone(phone)} failed: ${result.detail}`);
  const batch = db.batch();
  for (const c of toSend) {
    batch.update(db.doc(`alertDeliveries/${episodeId(c)}`), { status: result.ok ? 'sent' : 'failed', detail: result.detail, updatedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
}
