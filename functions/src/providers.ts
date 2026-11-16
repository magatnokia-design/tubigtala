// SMS senders. No email (dropped 13 Nov 2026).
//  - "log": writes what WOULD be sent to the function log (recipient masked) and sends nothing.
//    Always used in the emulator, so local tests can never send a real SMS.
//  - "textbee": the real sender (deployed functions only), through the TextBee Android gateway.
//    API checked 16 Nov 2026 against https://textbee.dev/docs/sending-sms/sending-sms :
//    POST https://api.textbee.dev/api/v1/gateway/send-sms, header x-api-key, JSON body
//    { recipients: [E.164], message, deviceId }; 200 = accepted and queued (NOT delivered),
//    body { data: { success, smsBatchId, ... } }; 400/401/403/429 = refused, nothing sent.
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';

import { maskPhone } from './policy.ts';

export interface SendResult {
  ok: boolean;
  /** short provider outcome for the delivery record; never contains secrets or recipients */
  detail: string;
}

export interface Providers {
  sms(to: string, text: string): Promise<SendResult>;
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
};

/** Long digit runs (phone numbers) removed, so a provider message cannot leak a recipient. */
const scrub = (s: string) => s.replace(/\+?\d{7,}/g, '***').slice(0, 160);

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function textbeeProviders(apiKey: string, deviceId: string, fetchFn: FetchLike = fetch): Providers {
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

/**
 * The emulator always logs (no real SMS from tests). Deployed functions send through TextBee with
 * the two secrets; if either is empty they fall back to logging, so a missing secret cannot crash
 * alert processing.
 */
export function providersFromEnv(): Providers {
  if (process.env.FUNCTIONS_EMULATOR === 'true') return logProviders;
  const apiKey = TEXTBEE_API_KEY.value();
  const deviceId = TEXTBEE_DEVICE_ID.value();
  if (!apiKey || !deviceId) {
    logger.error('TextBee secrets missing: SMS is only logged. Set TEXTBEE_API_KEY and TEXTBEE_DEVICE_ID (docs/runbook.md).');
    return logProviders;
  }
  return textbeeProviders(apiKey, deviceId);
}
