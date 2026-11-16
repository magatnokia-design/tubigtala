// What happens when a device uploads a reading (docs/data-model.md, "Alert policy"):
//  1. Each field is classified with the app's own rule (domain/thresholds.ts) against the station's
//     alert limits (devices/{id}.limits via domain/limits.ts limitsFromDoc: the owner's own limits,
//     or the defaults for any sensor without valid ones) and run through the alertState transaction
//     (domain/alerts.ts nextAlertStep), writing the in-app alert. Since app 0.9.4 only this function
//     raises alerts (the rules no longer let the app write alerts or alertState), so an old app
//     with the default limits built in cannot raise alerts the owner's limits would not.
//  2. If this reading has an alert: one phone push per alert to the owner's registered phones
//     (users/{uid}/pushTokens), when phone notifications are on.
//  3. If a field is critical, pH (calibrated) or temperature, for SMS_STREAK readings in a row:
//     one SMS per alert episode, within the account-wide day/month caps.
//  4. A field with no value: after SENSOR_MISSING_MS without one, one "sensor not reading" alert
//     (push only), tracked in the same alertState document (missingSince, missingAlertedAt).
//     Station offline: stations.ts.
//  5. The gas sensor warming up after a power-on (domain/warmup.ts): its values are skipped -
//     no alert, no "not reading" - for its first 15 minutes, as the Water card shows it.
// No email (dropped 13 Nov 2026): alerts reach the user as in-app/phone notifications and SMS.
// Deliveries are recorded in alertDeliveries/{id}, created before sending: a second run for the
// same reading or episode finds the record and sends nothing. The app cannot read these records.
import { FieldValue, Timestamp, type DocumentData, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { alertText, nextAlertStep, type AlertState } from '../../mobile/src/domain/alerts.ts';
import { limitsFromDoc, toStored } from '../../mobile/src/domain/limits.ts';
import { classify, type Metric } from '../../mobile/src/domain/thresholds.ts';
import { warmingUp } from '../../mobile/src/domain/warmup.ts';
import { missingStep, sensorMissingText } from './health.ts';
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

/** An alert to push (value alerts, sensor not reading, station offline), as stored in users/{uid}/notifications. */
export interface PushAlert {
  /** the field it is about; null for station offline / back online */
  metric: Metric | null;
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
  // The owner's alert limits, sensor by sensor (invalid or missing = the defaults), read from the
  // device record already loaded above: no extra document read.
  const { limits } = limitsFromDoc(device.limits);
  // Server time of the reading drives the cooldown. Fall back to now if missing.
  const readingMs = reading.serverTime instanceof Timestamp ? reading.serverTime.toMillis() : (deps.nowMs ?? Date.now)();
  // For the gas sensor's warm-up after a power-on (domain/warmup.ts, same rule as the Water card).
  const warmup = { seq: typeof reading.seq === 'number' ? reading.seq : null, simulated };
  const intervalSec = typeof device.readingIntervalSec === 'number' && device.readingIntervalSec > 0 ? device.readingIntervalSec : 60;

  const critical: (SmsItem & { alertedAtMs: number })[] = [];
  const alerts: PushAlert[] = [];

  for (const metric of METRICS) {
    const value = typeof reading[metric] === 'number' ? (reading[metric] as number) : null;
    const range = limits[metric];
    const status = classify(metric, value, range);
    const stateRef = db.doc(`users/${uid}/alertState/${deviceId}_${metric}`);

    if (warmingUp(metric, warmup, intervalSec)) {
      // The gas sensor is still warming up after a power-on: its value says nothing yet, so no
      // alert and no "not reading" (decided 16 Nov 2026; it used to raise "a bit high" each time).
      // A value still ends an earlier missing-value run, as below.
      if (value !== null) await endMissing(db, stateRef);
      continue;
    }

    if (status.level === 'unknown') {
      // No value says nothing about the water, but if it lasts the sensor needs looking at.
      const missing = await trackMissing(db, stateRef, metric, { uid, deviceId, readingId, deviceName, simulated, readingMs });
      if (missing) alerts.push(missing);
      continue;
    }

    const alertRef = db.doc(`users/${uid}/notifications/${deviceId}_${metric}_${readingId}`);
    const after = await db.runTransaction(async (tx) => {
      const raw = (await tx.get(stateRef)).data();
      const state = toAlertState(raw);
      const step = nextAlertStep(state, status.level, readingMs);
      if (step.kind === 'none') {
        // A value again after missing ones: the sensor is back, so the missing episode ends.
        // (A raise/update below replaces the whole document, which ends it too.)
        if (raw?.missingSince != null || raw?.missingAlertedAt != null) {
          tx.update(stateRef, { missingSince: FieldValue.delete(), missingAlertedAt: FieldValue.delete() });
        }
        return state;
      }
      if (step.kind === 'raise') {
        const text = alertText(metric, status.label, value, deviceName, { simulated, uncalibrated: metric === 'ph' && !phCalibrated, range });
        tx.set(alertRef, {
          title: text.title.slice(0, 80),
          body: text.body.slice(0, 200),
          deviceId,
          metric,
          value,
          level: step.state.alertLevel,
          // The limits it was checked against, so the app keeps showing this alert's status words
          // and normal range as they were, even after the owner changes the limits.
          limits: toStored(range),
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
    // Did this reading raise an alert? Its ID is fixed, so look - this also finds it when a retried
    // run's transaction sees the state already updated by the first run.
    const alert = await alertRef.get();
    if (alert.exists) alerts.push({ metric, alertId: alertRef.id, title: String(alert.get('title')), body: String(alert.get('body')) });
    if (status.level === 'critical' && after?.alertLevel === 'critical' && after.alertedAtMs !== null && value !== null) {
      critical.push({ metric, label: status.label, value, range, alertedAtMs: after.alertedAtMs });
    }
  }

  if (alerts.length === 0 && critical.length === 0) return;
  const profile = (await db.doc(`users/${uid}`).get()).data();
  const ctx = { uid, deviceId, readingId, deviceName, simulated, phCalibrated, readingMs, profile };
  if (alerts.length > 0) await sendPush(deps, ctx, alerts);
  if (critical.length > 0) await sendSms(deps, ctx, critical);
}

/** A value is back: ends the missing-value run (if any) without touching the alert level. */
async function endMissing(db: Firestore, stateRef: DocumentReference): Promise<void> {
  await db.runTransaction(async (tx) => {
    const raw = (await tx.get(stateRef)).data();
    if (raw?.missingSince != null || raw?.missingAlertedAt != null) {
      tx.update(stateRef, { missingSince: FieldValue.delete(), missingAlertedAt: FieldValue.delete() });
    }
  });
}

/**
 * A reading without a value for `metric`: starts the missing-value episode, or raises the one
 * "sensor not reading" alert once it has lasted SENSOR_MISSING_MS (health.ts). The alert has
 * metric null, so every app version shows its own title and text; `sensor` says which one.
 */
async function trackMissing(
  db: Firestore, stateRef: DocumentReference, metric: Metric,
  ctx: Pick<Ctx, 'uid' | 'deviceId' | 'readingId' | 'deviceName' | 'simulated' | 'readingMs'>,
): Promise<PushAlert | null> {
  const alertRef = db.doc(`users/${ctx.uid}/notifications/${ctx.deviceId}_${metric}_missing_${ctx.readingId}`);
  return db.runTransaction(async (tx) => {
    const raw = (await tx.get(stateRef)).data();
    const sinceMs = raw?.missingSince instanceof Timestamp ? raw.missingSince.toMillis() : null;
    const step = missingStep({ sinceMs, alerted: raw?.missingAlertedAt instanceof Timestamp }, ctx.readingMs);
    if (step === 'none') return null;
    if (step === 'start') {
      tx.set(stateRef, { missingSince: Timestamp.fromMillis(ctx.readingMs), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return null;
    }
    const text = sensorMissingText(metric, ctx.deviceName, sinceMs ?? ctx.readingMs, ctx.readingMs, ctx.simulated);
    tx.set(alertRef, {
      title: text.title.slice(0, 80),
      body: text.body.slice(0, 200),
      deviceId: ctx.deviceId,
      metric: null,
      value: null,
      level: 'warning',
      kind: 'sensor',
      sensor: metric,
      readingId: ctx.readingId,
      createdAt: FieldValue.serverTimestamp(),
      read: false,
    });
    tx.set(stateRef, { missingAlertedAt: Timestamp.fromMillis(ctx.readingMs), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    logger.info(`${ctx.deviceId}: ${metric} has had no value since ${new Date(sinceMs ?? ctx.readingMs).toISOString()}`);
    return { metric, alertId: alertRef.id, title: text.title, body: text.body };
  });
}

/**
 * One push per alert to every phone the owner registered, when phone notifications are on.
 * Recorded in alertDeliveries (push_{uid}_{alertId}) before sending, so a retried run sends
 * nothing twice. Tokens FCM rejects for good are deleted. Also used by stations.ts.
 */
export async function sendPush(deps: Deps, ctx: Pick<Ctx, 'uid' | 'deviceId' | 'readingId' | 'profile'>, alerts: PushAlert[]): Promise<void> {
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
  const streak = allowed.filter((c) => isCriticalStreak(c.metric, recent.docs.map((d) => d.get(c.metric)), c.range));
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
