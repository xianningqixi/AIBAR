import assert from 'node:assert/strict';
import test from 'node:test';

import { StClient } from '../src/index.js';

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

test('logs in with the configured AIBAR service account before private requests', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const responses = [
    jsonResponse({ token: 'csrf-before-login' }, { headers: { 'Set-Cookie': 'sid=anonymous; Path=/' } }),
    jsonResponse({ handle: 'telegram-bot' }, { headers: { 'Set-Cookie': 'sid=authenticated; Path=/' } }),
    jsonResponse({ token: 'csrf-after-login' }),
    jsonResponse({ characters: [] }),
  ];

  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    const response = responses.shift();
    if (!response) throw new Error('Unexpected fetch');
    return response;
  };

  try {
    const client = new StClient('http://127.0.0.1:8001', {
      handle: 'telegram-bot',
      password: 'correct horse battery staple',
    });
    await client.post('/api/characters/all');

    assert.equal(requests.length, 4);
    assert.equal(requests[1].url, 'http://127.0.0.1:8001/api/users/login');
    assert.equal(requests[1].init.headers['X-CSRF-Token'], 'csrf-before-login');
    assert.equal(requests[1].init.headers.Cookie, 'sid=anonymous');
    assert.deepEqual(JSON.parse(requests[1].init.body), {
      handle: 'telegram-bot',
      password: 'correct horse battery staple',
    });
    assert.equal(requests[3].init.headers['X-CSRF-Token'], 'csrf-after-login');
    assert.equal(requests[3].init.headers.Cookie, 'sid=authenticated');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refuses private API use without a configured service account', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error('fetch should not run');
  };

  try {
    const client = new StClient('http://127.0.0.1:8001');
    await assert.rejects(
      client.post('/api/settings/get'),
      /ST_USER_HANDLE 未配置/,
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shares one login boot across concurrent private requests', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let csrfCalls = 0;
  let loginCalls = 0;

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    requests.push({ url: target, init });
    if (target.endsWith('/csrf-token')) {
      csrfCalls += 1;
      return jsonResponse(
        { token: csrfCalls === 1 ? 'csrf-before-login' : 'csrf-after-login' },
        csrfCalls === 1 ? { headers: { 'Set-Cookie': 'sid=anonymous; Path=/' } } : {},
      );
    }
    if (target.endsWith('/api/users/login')) {
      loginCalls += 1;
      return jsonResponse({ handle: 'telegram-bot' }, { headers: { 'Set-Cookie': 'sid=authenticated; Path=/' } });
    }
    return jsonResponse({ ok: true });
  };

  try {
    const client = new StClient('http://127.0.0.1:8001', {
      handle: 'telegram-bot',
      password: 'password',
    });
    await Promise.all([
      client.post('/api/characters/all'),
      client.post('/api/settings/get'),
    ]);

    assert.equal(csrfCalls, 2);
    assert.equal(loginCalls, 1);
    assert.equal(requests.filter((item) => item.url.includes('/api/characters/all')).length, 1);
    assert.equal(requests.filter((item) => item.url.includes('/api/settings/get')).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
