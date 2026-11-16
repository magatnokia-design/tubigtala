// What happens when a device uploads a reading (docs/data-model.md, "Alert policy"):
//  1. Each field is classified with the app's own thresholds and run through the same
//     alertState transaction as the app (domain/alerts.ts nextAlertStep), writing the in-app
//     alert with the same document ID. The app may still raise alerts while open; whichever
//     commits first wins and the other sees the updated state, so there is one alert either way.
//  2. If this reading has an alert (raised here or by the app): one phone push per alert to the
//     owner's registered phones (users/{uid}/pushTokens), when phone notifications are on.
//  3. If a field is critical, pH (calibrated) or temperature, for SMS_STREAK readings in a row:
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
const ALREADY_EXISTS = 6; // gRPC status code from create() on an existing document

/** Creates the delivery record; false if it already exists (this delivery was already handled). */
async function claim(db: Firestore, id: string, data: DocumentData): Promise<boolean> {
  try {
    await db.doc(`alertDeliveries/${id}`).create({ ...data, status: 'sending', createdAt: FieldValue.serverTimestamp() });
    return true;
  } catch (e) {
    if ((e as { code?: number }).code === ALREADY_EXISTS) return false;
    throw e;
  }
}

/** An alert this reading raised (here or in the app), as stored in users/{uid}/notifications. */
interface PushAlert {
  metric: Metric;
  alertId: string;
  title: string;
  body: string;
}

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
  const alerts: PushAlert[] = [];

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

    if (status.level === 'normal') continue;
    // Did this reading raise an alert, here or in the app (if it was open)? Its ID is fixed, so look.
    const alert = await alertRef.get();
    if (alert.exists) alerts.push({ metric, alertId: alertRef.id, title: String(alert.get('title')), body: String(alert.get('body')) });
    if (status.level === 'critical' && after?.alertLevel === 'critical' && after.alertedAtMs !== null && value !== null) {
      critical.push({ metric, label: status.label, value, alertedAtMs: after.alertedAtMs });
    }
  }

  if (alerts.length === 0 && critical.length === 0) return;
  const profile = (await db.doc(`users/${uid}`).get()).data();
  const ctx = { uid, deviceId, readingId, deviceName, simulated, phCalibrated, readingMs, profile };
  if (alerts.length > 0) await sendPush(deps, ctx, alerts);
  if (critical.length > 0) await sendSms(deps, ctx, critical);
}

/**
 * One push per alert to every phone the owner registered, when phone notifications are on.
 * Recorded in alertDeliveries (push_{uid}_{alertId}) before sending, so a retried run sends
 * nothing twice. Tokens FCM rejects for good are deleted.
 */
async function sendPush(deps: Deps, ctx: Ctx, alerts: PushAlert[]): Promise<void> {
  const { db } = deps;
  if (ctx.profile?.pushEnabled !== true) return;
  const tokenDocs = (await db.collection(`users/${ctx.uid}/pushTokens`).get()).docs;
  const tokens = [...new Set(tokenDocs.map((d) => d.get('token')).filter((t): t is string => typeof t === 'string' && t.length >= 20))];
  for (const a of alerts) {
    const id = `push_${ctx.uid}_${a.alertId}`;
    if (!(await claim(db, id, { channel: 'push', uid: ctx.uid, deviceId: ctx.deviceId, readingId: ctx.readingId, metric: a.metric }))) continue;
    if (tokens.length === 0) {
      await db.doc(`alertDeliveries/${id}`).update({ status: 'skipped: no phone registered', updatedAt: FieldValue.serverTimestamp() });
      continue;
    }
    const result = await deps.providers.push(tokens, { title: a.title, body: a.body, tag: a.alertId })
      .catch((e: unknown) => ({ ok: false, detail: String(e).slice(0, 200), invalidTokens: [] as string[] }));
    await db.doc(`alertDeliveries/${id}`).update({ status: result.ok ? 'sent' : 'failed', detail: result.detail, updatedAt: FieldValue.serverTimestamp() });
    if (result.invalidTokens.length > 0) {
      const dead = new Set(result.invalidTokens);
      const batch = db.batch();
      for (const d of tokenDocs) if (dead.has(d.get('token'))) batch.delete(d.ref);
      await batch.commit();
      logger.info(`removed ${dead.size} push token(s) that FCM no longer accepts`);
    }
  }
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
