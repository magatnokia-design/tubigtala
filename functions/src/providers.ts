// SMS and email senders. Only the "log" providers exist so far: they write what WOULD be sent to
// the function log (recipients masked) and send nothing, so no SMS or email credits can be used.
// Real TextBee/Brevo senders come with Blaze (docs/data-model.md, "Alert policy").
import { logger } from 'firebase-functions';

import { maskEmail, maskPhone } from './policy.ts';

export interface SendResult {
  ok: boolean;
  /** short provider outcome for the delivery record; never contains secrets or recipients */
  detail: string;
}

export interface Providers {
  sms(to: string, text: string): Promise<SendResult>;
  email(to: string, content: { subject: string; text: string; html: string }): Promise<SendResult>;
}

export const logProviders: Providers = {
  async sms(to, text) {
    logger.info(`[sms:log] to ${maskPhone(to)} (${text.length} chars): ${text}`);
    return { ok: true, detail: 'logged only (no SMS provider configured)' };
  },
  async email(to, content) {
    logger.info(`[email:log] to ${maskEmail(to)}: ${content.subject}\n${content.text}`);
    return { ok: true, detail: 'logged only (no email provider configured)' };
  },
};

/** ALERT_DELIVERY selects the senders; "log" (the default) is the only one built. */
export function providersFromEnv(): Providers {
  const mode = process.env.ALERT_DELIVERY ?? 'log';
  if (mode === 'log') return logProviders;
  throw new Error(`ALERT_DELIVERY="${mode}" is not built yet; only "log" exists`);
}
