// Philippine mobile numbers. Stored as E.164 (+639XXXXXXXXX) in users/{uid}.phoneE164
// (docs/data-model.md); the same pattern is enforced in firestore.rules.

export const PH_MOBILE_E164 = /^\+639\d{9}$/;

/**
 * Accepts what people actually type - 0900 123 4567, 900-123-4567, +63 900 123 4567,
 * 639001234567 - and returns +639001234567, or null if it is not a PH mobile number.
 */
export function normalizePhMobile(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digits)) return null;
  let national: string;
  if (digits.startsWith('63')) national = digits.slice(2);
  else if (digits.startsWith('0')) national = digits.slice(1);
  else national = digits;
  const e164 = `+63${national}`;
  return PH_MOBILE_E164.test(e164) ? e164 : null;
}

/** +639001234567 -> "+63 900 123 4567" */
export function formatPhMobile(e164: string): string {
  if (!PH_MOBILE_E164.test(e164)) return e164;
  const n = e164.slice(3);
  return `+63 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

/** Display while typing after a fixed "+63" prefix: "9001234567" -> "900 123 4567". */
export function formatNationalInput(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(' ');
}
