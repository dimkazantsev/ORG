import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLoadTarget} from './target.mjs';

const cloud = 'https://production-project.supabase.co';
const cloudKey = 'sb_publishable_production_public_value';
const testKey = 'sb_publishable_test_key_only';
const selfhost = 'https://qwiz-test.example.org';

test('legacy cloud CI target stays unchanged without override', () => {
  const result = resolveLoadTarget({}, cloud, cloudKey);
  assert.deepEqual(result, {target: 'cloud', url: cloud, key: cloudKey});
});
test('selfhost requires explicit opt-in', () => {
  assert.throws(() => resolveLoadTarget({
    QWIZ_LOAD_TARGET: 'selfhost', QWIZ_LOAD_URL: selfhost, QWIZ_LOAD_KEY: testKey
  }, cloud, cloudKey), /confirm/i);
});
test('selfhost only accepts independent HTTPS host and publishable key', () => {
  const result = resolveLoadTarget({
    QWIZ_LOAD_TARGET: 'selfhost', QWIZ_LOAD_CONFIRM: 'ISOLATED_SELFHOST_ONLY',
    QWIZ_LOAD_URL: selfhost, QWIZ_LOAD_KEY: testKey
  }, cloud, cloudKey);
  assert.deepEqual(result, {target: 'selfhost', url: selfhost, key: testKey});
});
test('rejects any supabase.co endpoint when testing selfhost', () => {
  const input = {QWIZ_LOAD_TARGET: 'selfhost', QWIZ_LOAD_CONFIRM: 'ISOLATED_SELFHOST_ONLY', QWIZ_LOAD_KEY: testKey};
  for (const host of [cloud, 'https://anything.supabase.co', 'https://supabase.co']) {
    assert.throws(() => resolveLoadTarget({...input, QWIZ_LOAD_URL: host}, cloud, cloudKey), /Cloud/);
  }
});
test('rejects invalid/insecure remote targets and URL credentials', () => {
  const input = {QWIZ_LOAD_TARGET: 'selfhost', QWIZ_LOAD_CONFIRM: 'ISOLATED_SELFHOST_ONLY', QWIZ_LOAD_KEY: testKey};
  for (const url of ['http://qwiz-test.example.org', 'https://name:password@qwiz-test.example.org', 'https://qwiz-test.example.org/auth/v1', 'https://qwiz-test.example.org/?token=abc']) {
    assert.throws(() => resolveLoadTarget({...input, QWIZ_LOAD_URL: url}, cloud, cloudKey));
  }
});
test('localhost HTTP is allowed for a private development test', () => {
  const input = {QWIZ_LOAD_TARGET: 'selfhost', QWIZ_LOAD_CONFIRM: 'ISOLATED_SELFHOST_ONLY', QWIZ_LOAD_KEY: testKey, QWIZ_LOAD_URL: 'http://127.0.0.1:8000'};
  assert.equal(resolveLoadTarget(input, cloud, cloudKey).url, input.QWIZ_LOAD_URL);
});
test('rejects privileged keys, while allowing anon JWT', () => {
  const input = {QWIZ_LOAD_TARGET: 'selfhost', QWIZ_LOAD_CONFIRM: 'ISOLATED_SELFHOST_ONLY', QWIZ_LOAD_URL: selfhost};
  assert.throws(() => resolveLoadTarget({...input, QWIZ_LOAD_KEY: 'sb_secret_example'}, cloud, cloudKey), /secret/);
  const token = role => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({role})).toString('base64url'), 'test'].join('.');
  assert.throws(() => resolveLoadTarget({...input, QWIZ_LOAD_KEY: token('service_role')}, cloud, cloudKey), /anon role/);
  assert.equal(resolveLoadTarget({...input, QWIZ_LOAD_KEY: token('anon')}, cloud, cloudKey).target, 'selfhost');
});
test('cloud mode refuses custom endpoint or key overrides', () => {
  assert.throws(() => resolveLoadTarget({QWIZ_LOAD_URL: selfhost}, cloud, cloudKey), /requires/);
});
