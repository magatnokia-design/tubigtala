// SMS sender. Only the "log" provider exists so far: it writes what WOULD be sent to the function
// log (recipient masked) and sends nothing, so no SMS credits can be used. The real TextBee
// sender comes with Blaze (docs/data-model.md, "Alert policy"). No email (dropped 13 Nov 2026).
import { logger } from 'firebase-functions';

import { maskPhone } from './policy.ts';

export interface SendResult {
  ok: boolean;
  /** short provider outcome for the delivery record; never contains secrets or recipients */
  detail: string;
}

export interface Providers {
  sms(to: string, text: string): Promise<SendResult>;
}

export const logProviders: Providers = {
  async sms(to, text) {
    logger.info(`[sms:log] to ${maskPhone(to)} (${text.length} chars): ${text}`);
    return { ok: true, detail: 'logged only (no SMS provider configured)' };
  },
};

/** ALERT_DELIVERY selects the sender; "log" (the default) is the only one built. */
export function providersFromEnv(): Providers {
  const mode = process.env.ALERT_DELIVERY ?? 'log';
  if (mode === 'log') return logProviders;
  throw new Error(`ALERT_DELIVERY="${mode}" is not built yet; only "log" exists`);
}
