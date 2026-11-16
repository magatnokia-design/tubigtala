// Run: npm test. The TextBee sender with a fake fetch - nothing is sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fcmPush, textbeeProviders, TEXTBEE_SEND_URL, type MulticastSender } from './providers.ts';

test('FCM push: alert channel and tag, accepted count, and dead tokens reported for cleanup', async () => {
  let sent: Parameters<MulticastSender['sendEachForMulticast']>[0] | undefined;
  const sender: MulticastSender = {
    async sendEachForMulticast(m) {
      sent = m;
      return {
        successCount: 1,
        responses: [
          { success: true },
          { success: false, error: { code: 'messaging/registration-token-not-registered' } },
          { success: false, error: { code: 'messaging/internal-error' } },
        ],
      };
    },
  };
  const r = await fcmPush(sender)(['tok-a', 'tok-b', 'tok-c'], { title: 'TubigTala Station: water too hot', body: 'Water is 41 °C.', tag: 'tank-01_temperatureC_x-1' });
  assert.deepEqual(sent?.tokens, ['tok-a', 'tok-b', 'tok-c']);
  assert.deepEqual(sent?.notification, { title: 'TubigTala Station: water too hot', body: 'Water is 41 °C.' });
  assert.deepEqual(sent?.android, { priority: 'high', notification: { channelId: 'alerts', tag: 'tank-01_temperatureC_x-1' } });
  assert.equal(r.ok, true);
  assert.equal(r.detail, 'FCM accepted 1/3; messaging/registration-token-not-registered');
  assert.deepEqual(r.invalidTokens, ['tok-b'], 'only a dead token is removed, not a temporary error');
});

test('FCM push: nothing accepted is a failure', async () => {
  const sender: MulticastSender = { sendEachForMulticast: async () => ({ successCount: 0, responses: [{ success: false, error: { code: 'messaging/third-party-auth-error' } }] }) };
  const r = await fcmPush(sender)(['tok-a'], { title: 't', body: 'b', tag: 'x' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.invalidTokens, []);
});

type Call = { url: string; init: { method: string; headers: Record<string, string>; body: string } };

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fn = async (url: string, init: Call['init']) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fn, calls };
}

test('TextBee: documented request - URL, x-api-key, recipients in E.164, message, deviceId', async () => {
  const { fn, calls } = fakeFetch(200, { data: { success: true, message: 'SMS added to queue for processing', smsBatchId: 'b1', recipientCount: 1 } });
  const r = await textbeeProviders('key-123', 'dev-456', fn).sms('+639171234567', 'TubigTala: test');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, TEXTBEE_SEND_URL);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['x-api-key'], 'key-123');
  assert.deepEqual(JSON.parse(calls[0].init.body), { recipients: ['+639171234567'], message: 'TubigTala: test', deviceId: 'dev-456' });
  assert.deepEqual(r, { ok: true, detail: 'queued by TextBee, batch b1' });
});

test('TextBee: a refusal is a failure with the reason, and never repeats the phone number', async () => {
  const { fn } = fakeFetch(429, { message: 'Monthly limit reached for +639171234567' });
  const r = await textbeeProviders('k', 'd', fn).sms('+639171234567', 'x');
  assert.equal(r.ok, false);
  assert.match(r.detail, /^TextBee HTTP 429: Monthly limit reached/);
  assert.doesNotMatch(r.detail, /9171234567/);
});

test('TextBee: 200 with success false, or a body that is not JSON, is handled', async () => {
  const refused = await textbeeProviders('k', 'd', fakeFetch(200, { data: { success: false }, error: 'No enabled device found.' }).fn).sms('+639171234567', 'x');
  assert.equal(refused.ok, false);
  assert.match(refused.detail, /No enabled device found/);
  const broken = { fn: async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }) };
  const r = await textbeeProviders('k', 'd', broken.fn).sms('+639171234567', 'x');
  assert.deepEqual(r, { ok: false, detail: 'TextBee HTTP 502' });
});
