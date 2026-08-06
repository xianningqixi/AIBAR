import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import { createHttpServer } from '../src/http.js';

async function listen(server) {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not expose a TCP address');
    return `http://127.0.0.1:${address.port}`;
}

test('the HTTP API stays loopback-oriented and requires JSON POST bodies', async (context) => {
    const service = {
        listJobs: () => [],
        latestJob: () => null,
        trigger: async value => ({ id: 't1-2026-08-05', input: value }),
    };
    const token = 'test-token-0123456789abcdef0123456789abcdef';
    const server = createHttpServer(service, {
        host: '127.0.0.1',
        port: 4317,
        guildId: '1380075940285124724',
        channelId: '1478612237869519021',
        timezone: 'Asia/Shanghai',
        runHour: 9,
        runMinute: 0,
        aibarUrl: 'https://example.com/aibar/',
        token,
    });
    context.after(() => new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    }));
    const baseUrl = await listen(server);

    // /health 不要求 token，供 launchd/监控探活
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('access-control-allow-origin'), null);
    assert.deepEqual((await health.json()).ok, true);

    const unauthorized = await fetch(`${baseUrl}/api/v1/jobs`);
    assert.equal(unauthorized.status, 401);
    const wrongToken = await fetch(`${baseUrl}/api/v1/jobs`, {
        headers: { Authorization: 'Bearer wrong-token' },
    });
    assert.equal(wrongToken.status, 401);

    const rejected = await fetch(`${baseUrl}/api/v1/jobs/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
        body: '{}',
    });
    assert.equal(rejected.status, 415);

    const nonJsonMediaType = await fetch(`${baseUrl}/api/v1/jobs/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/jsonx' },
        body: '{}',
    });
    assert.equal(nonJsonMediaType.status, 415);

    // DNS rebinding：远端域名解析到 127.0.0.1 时 Host 头仍是攻击者域名。
    // fetch 按规范禁止覆盖 Host，用原生 http.request 模拟。
    const rebound = await new Promise((resolve, reject) => {
        const req = http.request(`${baseUrl}/api/v1/jobs`, { headers: { host: 'evil.example' } }, resolve);
        req.on('error', reject);
        req.end();
    });
    assert.equal(rebound.statusCode, 403);
    rebound.resume();

    const created = await fetch(`${baseUrl}/api/v1/jobs/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDate: '2026-08-05' }),
    });
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), {
        id: 't1-2026-08-05',
        input: { sourceDate: '2026-08-05' },
    });
});
