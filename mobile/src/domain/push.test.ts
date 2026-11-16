// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pushTokenId } from './push.ts';

test('push token ID: stable, short, and allowed by the rules (^[a-z0-9]{1,32}$)', () => {
  const t = 'dQw4w9WgXcQ:APA91bH-fake_token_for_tests_0123456789abcdefABCDEF';
  assert.equal(pushTokenId(t), pushTokenId(t), 'same phone, same document');
  assert.match(pushTokenId(t), /^[a-z0-9]{1,32}$/);
  assert.notEqual(pushTokenId(t), pushTokenId(`${t}x`), 'different phones, different documents');
});
