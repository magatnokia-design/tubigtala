// SMS senders. No email (dropped 13 Nov 2026).
//  - "log": writes what WOULD be sent to the function log (recipient masked) and sends nothing.
//    Always used in the emulator, so local tests can never send a real SMS.
//  - "textbee": the real sender (deployed functions only), through the TextBee Android gateway.
//    API checked 16 Nov 2026 against https://textbee.dev/docs/sending-sms/sending-sms :
//    POST https://api.textbee.dev/api/v1/gateway/send-sms, header x-api-key, JSON body
//    { recipients: [E.164], message, deviceId }; 200 = accepted and queued (NOT delivered),
//    body { data: { success, smsBatchId, ... } }; 400/401/403/429 = refused, nothing sent.
//  - push (since 16 Nov 2026): Firebase Cloud Messaging straight from firebase-admin, to the
//    tokens the app stores in users/{uid}/pushTokens - no Expo push service in between (decided
//    16 Nov 2026: fewer accounts and keys). The emulator only logs.
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';

import { maskPhone } from './policy.ts';

export interface SendResult {
  ok: boolean;
  /** short provider outcome for the delivery record; never contains secrets or recipients */
  detail: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** the alert's ID: a repeat of the same alert replaces the notification instead of stacking */
  tag: string;
}

export interface PushResult extends SendResult {
  /** tokens FCM says are gone (app uninstalled, data cleared): delete them */
  invalidTokens: string[];
}

export interface Providers {
  sms(to: string, text: string): Promise<SendResult>;
  push(tokens: string[], msg: PushMessage): Promise<PushResult>;
}

/** Set with `firebase functions:secrets:set ...` (docs/runbook.md). Never in the repo or the app. */
export const TEXTBEE_API_KEY = defineSecret('TEXTBEE_API_KEY');
export const TEXTBEE_DEVICE_ID = defineSecret('TEXTBEE_DEVICE_ID');

export const TEXTBEE_SEND_URL = 'https://api.textbee.dev/api/v1/gateway/send-sms';

export const logProviders: Providers = {
  async sms(to, text) {
    logger.info(`[sms:log] to ${maskPhone(to)} (${text.length} chars): ${text}`);
    return { ok: true, detail: 'logged only (no SMS provider configured)' };
  },
  async push(tokens, msg) {
    logger.info(`[push:log] to ${tokens.length} phone(s): ${msg.title} - ${msg.body}`);
    return { ok: true, detail: 'logged only (no push provider configured)', invalidTokens: [] };
  },
};

/** The part of firebase-admin's Messaging used here (a fake one in tests). */
export interface MulticastSender {
  sendEachForMulticast(message: {
    tokens: string[];
    notification: { title: string; body: string };
    android: { priority: 'high'; notification: { channelId: string; tag: string } };
  }): Promise<{ successCount: number; responses: { success: boolean; error?: { code?: string } }[] }>;
}

/** FCM error codes meaning the token will never work again. */
const DEAD_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

export function fcmPush(sender: MulticastSender): Providers['push'] {
  return async (tokens, msg) => {
    const res = await sender.sendEachForMulticast({
      tokens,
      notification: { title: msg.title, body: msg.body },
      // 'alerts' = the app's high-importance channel (services/notifications.ts).
      android: { priority: 'high', notification: { channelId: 'alerts', tag: msg.tag } },
    });
    const invalidTokens = res.responses.flatMap((r, i) => (!r.success && DEAD_TOKEN.has(r.error?.code ?? '') ? [tokens[i]] : []));
    const firstError = res.responses.find((r) => !r.success)?.error?.code;
    // Accepted by FCM is not proof the phone showed it (CLAUDE.md), but it is all FCM reports.
    return { ok: res.successCount > 0, detail: `FCM accepted ${res.successCount}/${tokens.length}${firstError ? `; ${firstError}` : ''}`, invalidTokens };
  };
}

/** Long digit runs (phone numbers) removed, so a provider message cannot leak a recipient. */
const scrub = (s: string) => s.replace(/\+?\d{7,}/g, '***').slice(0, 160);

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function textbeeProviders(apiKey: string, deviceId: string, fetchFn: FetchLike = fetch): Pick<Providers, 'sms'> {
  return {
    async sms(to, text) {
      const res = await fetchFn(TEXTBEE_SEND_URL, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: [to], message: text, deviceId }),
      });
      const body = (await res.json().catch(() => null)) as
        | { data?: { success?: boolean; smsBatchId?: string }; error?: unknown; message?: unknown }
        | null;
      if (res.ok && body?.data?.success !== false) {
        // Accepted and queued by TextBee - the phone still has to send it (CLAUDE.md: not proof of delivery).
        return { ok: true, detail: `queued by TextBee, batch ${scrub(String(body?.data?.smsBatchId ?? 'unknown'))}` };
      }
      // The docs use both `error` and `message` for the reason.
      const reason = scrub(String(body?.error ?? body?.message ?? ''));
      logger.warn(`[sms:textbee] HTTP ${res.status} for ${maskPhone(to)}${reason ? `: ${reason}` : ''}`);
      return { ok: false, detail: `TextBee HTTP ${res.status}${reason ? `: ${reason}` : ''}` };
    },
  };
}

/** For functions that only push (the station check): no TextBee secrets needed. The emulator logs. */
export function pushOnlyProviders(): Providers {
  if (process.env.FUNCTIONS_EMULATOR === 'true') return logProviders;
  return { sms: logProviders.sms, push: fcmPush(getMessaging()) };
}

/**
 * The emulator always logs (no real SMS or push from tests). Deployed functions push through FCM
 * and send SMS through TextBee with the two secrets; if either secret is empty, SMS falls back to
 * logging, so a missing secret cannot crash alert processing.
 */
export function providersFromEnv(): Providers {
  if (process.env.FUNCTIONS_EMULATOR === 'true') return logProviders;
  const push = fcmPush(getMessaging());
  const apiKey = TEXTBEE_API_KEY.value();
  const deviceId = TEXTBEE_DEVICE_ID.value();
  if (!apiKey || !deviceId) {
    logger.error('TextBee secrets missing: SMS is only logged. Set TEXTBEE_API_KEY and TEXTBEE_DEVICE_ID (docs/runbook.md).');
    return { sms: logProviders.sms, push };
  }
  return { sms: textbeeProviders(apiKey, deviceId).sms, push };
}
