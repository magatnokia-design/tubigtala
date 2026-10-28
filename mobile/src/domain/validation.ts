// Field checks shared by the sign-up, sign-in and profile forms. Client-side only - the
// Security Rules re-check what is stored (users/{uid}), and Firebase Auth checks accounts.
import { normalizePhMobile } from './phone.ts';

export const NAME_MAX = 60;
export const PASSWORD_MIN = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function nameError(name: string): string | undefined {
  const n = name.trim();
  if (!n) return 'Enter your name.';
  if (n.length > NAME_MAX) return `Keep it under ${NAME_MAX} characters.`;
  return undefined;
}

export function emailError(email: string): string | undefined {
  const e = email.trim();
  if (!e) return 'Enter your email.';
  if (!EMAIL_RE.test(e)) return 'That email address is not valid.';
  return undefined;
}

export function phoneError(nationalDigits: string): string | undefined {
  const d = nationalDigits.replace(/\D/g, '');
  if (!d) return 'Enter your mobile number.';
  if (!normalizePhMobile(d)) return 'Enter a PH mobile number: 9XX XXX XXXX.';
  return undefined;
}

export function newPasswordError(password: string): string | undefined {
  if (!password) return 'Create a password.';
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers.';
  return undefined;
}

export function confirmPasswordError(password: string, confirm: string): string | undefined {
  if (!confirm) return 'Re-enter your password.';
  if (confirm !== password) return 'Passwords do not match.';
  return undefined;
}
