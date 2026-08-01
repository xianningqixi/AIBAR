import assert from 'node:assert/strict';
import test from 'node:test';

import { isUsableAdminToken, pollingReadiness } from '../src/runtimeConfig.js';

test('polling requires a Telegram token and complete ST service-account credentials', () => {
  assert.deepEqual(pollingReadiness({ token: '', stUserHandle: '' }), {
    ready: false,
    message: 'TELEGRAM_BOT_TOKEN 未配置，轮询未启动',
  });
  assert.deepEqual(pollingReadiness({ token: '123:token', stUserHandle: '' }), {
    ready: false,
    message: 'ST_USER_HANDLE 未配置，轮询未启动',
  });
  assert.deepEqual(pollingReadiness({ token: '123:token', stUserHandle: 'telegram-bot', stUserPassword: '' }), {
    ready: false,
    message: 'ST_USER_PASSWORD 未配置，轮询未启动',
  });
  assert.deepEqual(pollingReadiness({
    token: '123:token',
    stUserHandle: 'telegram-bot',
    stUserPassword: 'service-account-password',
    allowedUserIds: new Set(),
  }), {
    ready: false,
    message: 'TELEGRAM_ALLOWED_USER_IDS 为空，轮询按默认拒绝策略保持关闭',
  });
  assert.equal(pollingReadiness({
    token: '123:token',
    stUserHandle: 'telegram-bot',
    stUserPassword: 'service-account-password',
    allowedUserIds: new Set(['allowed-user']),
  }).ready, true);
});

test('admin authentication rejects empty and common placeholder tokens', () => {
  assert.equal(isUsableAdminToken(''), false);
  assert.equal(isUsableAdminToken('replace-with-a-long-random-token'), false);
  assert.equal(isUsableAdminToken('CHANGE-ME'), false);
  assert.equal(isUsableAdminToken('too-short'), false);
  assert.equal(isUsableAdminToken('a-real-random-admin-token-7f6d5e4c'), true);
});
