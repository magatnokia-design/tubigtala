// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatNationalInput, formatPhMobile, normalizePhMobile } from './phone.ts';
import { confirmPasswordError, emailError, nameError, newPasswordError, phoneError } from './validation.ts';

test('PH mobile numbers in the shapes people type', () => {
  for (const input of ['09001234567', '9001234567', '+639001234567', '639001234567', '0900 123 4567', '+63 900-123-4567', '(0900) 123 4567']) {
    assert.equal(normalizePhMobile(input), '+639001234567', input);
  }
});

test('non-mobile or malformed numbers are rejected', () => {
  for (const input of ['', '   ', '0281234567', '917123456', '90012345678', '08171234567', '+1 900 123 4567', '0917abc4567', '+6309001234567']) {
    assert.equal(normalizePhMobile(input), null, input);
  }
});

test('formatting', () => {
  assert.equal(formatPhMobile('+639001234567'), '+63 900 123 4567');
  assert.equal(formatNationalInput('9001234567'), '900 123 4567');
  assert.equal(formatNationalInput('900'), '900');
  assert.equal(formatNationalInput('90012'), '900 12');
  assert.equal(formatNationalInput('900123456789'), '900 123 4567'); // capped at 10 digits
});

test('name', () => {
  assert.ok(nameError(''));
  assert.ok(nameError('   '));
  assert.ok(nameError('x'.repeat(61)));
  assert.equal(nameError(' Juan '), undefined);
});

test('email', () => {
  assert.ok(emailError(''));
  assert.ok(emailError('juan@'));
  assert.equal(emailError(' juan@example.com '), undefined);
});

test('phone field', () => {
  assert.ok(phoneError(''));
  assert.ok(phoneError('800 123 4567'));
  assert.equal(phoneError('900 123 4567'), undefined);
});

test('passwords', () => {
  assert.ok(newPasswordError(''));
  assert.ok(newPasswordError('abc123')); // too short
  assert.ok(newPasswordError('abcdefgh')); // no number
  assert.ok(newPasswordError('12345678')); // no letter
  assert.equal(newPasswordError('tubig2026'), undefined);
  assert.ok(confirmPasswordError('tubig2026', ''));
  assert.ok(confirmPasswordError('tubig2026', 'tubig2025'));
  assert.equal(confirmPasswordError('tubig2026', 'tubig2026'), undefined);
});
