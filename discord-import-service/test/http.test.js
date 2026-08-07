import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import test from 'node:test';

import { DISCORD_SOURCES } from '../src/config.js';
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
    let triggerCount = 0;
    const launches = [];
    const service = {
        listJobs: () => [],
        latestJob: () => null,
        trigger: async value => {
            triggerCount += 1;
            return { id: 'manual-20260806020000000', input: value };
        },
        dashboardSnapshot: () => ({
            mode: 'manual',
            timezone: 'Asia/Shanghai',
            now: '2026-08-06T02:00:00.000Z',
            worker: { online: false, state: 'offline' },
            latestJob: null,
            jobs: [],
        }),
        reportWorker: value => ({ online: true, observedAt: '2026-08-06T02:00:00.000Z', ...value }),
        updateWorkflow: async (id, value) => ({ id, ...value }),
        requestImport: async (id, value) => ({ id, ...value }),
        resumeImport: id => ({ id, resumed: true }),
        updateImportItem: async (id, value) => ({ id, ...value }),
    };
    const token = 'test-token-0123456789abcdef0123456789abcdef';
    const workerLauncher = new EventEmitter();
    workerLauncher.assertAvailable = () => {};
    workerLauncher.status = () => ({ busy: false, jobId: '', phase: '' });
    workerLauncher.launch = async (jobId, phase) => {
        launches.push({ jobId, phase });
    };
    const server = createHttpServer(service, {
        host: '127.0.0.1',
        port: 4317,
        guildId: '1380075940285124724',
        channelId: '1478612237869519021',
        sources: DISCORD_SOURCES.map(source => ({ ...source })),
        timezone: 'Asia/Shanghai',
        aibarUrl: 'https://example.com/aibar/',
        token,
    }, workerLauncher);
    context.after(() => new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    }));
    const baseUrl = await listen(server);

    // /health 不要求 token，供 launchd/监控探活
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('access-control-allow-origin'), null);
    assert.deepEqual((await health.json()).ok, true);

    const dashboardPage = await fetch(`${baseUrl}/`);
    assert.equal(dashboardPage.status, 200);
    assert.match(dashboardPage.headers.get('content-type'), /text\/html/);
    assert.match(await dashboardPage.text(), /同步 Discord 今日热门/);
    assert.match(dashboardPage.headers.get('content-security-policy'), /default-src 'self'/);

    const dashboard = await fetch(`${baseUrl}/api/v1/dashboard`);
    assert.equal(dashboard.status, 200);
    const dashboardBody = await dashboard.json();
    assert.equal(dashboardBody.mode, 'manual');
    assert.deepEqual(dashboardBody.sources.map(source => source.channelName), ['纯文字', '轻前端·美化', '重前端·独立前端']);
    assert.deepEqual(dashboardBody.launcher, { busy: false, jobId: '', phase: '' });
    assert.equal(triggerCount, 0);
    assert.deepEqual(launches, []);

    const dashboardEvents = await fetch(`${baseUrl}/api/v1/dashboard/events`);
    assert.match(dashboardEvents.headers.get('content-type'), /text\/event-stream/);
    const eventReader = dashboardEvents.body.getReader();
    const firstEvent = await eventReader.read();
    assert.match(new TextDecoder().decode(firstEvent.value), /event: snapshot/);
    await eventReader.cancel();
    assert.deepEqual(launches, []);

    const dashboardTrigger = await fetch(`${baseUrl}/api/v1/dashboard/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
    });
    assert.equal(dashboardTrigger.status, 201);
    assert.equal((await dashboardTrigger.json()).id, 'manual-20260806020000000');
    assert.equal(triggerCount, 1);
    assert.deepEqual(launches, [{ jobId: 'manual-20260806020000000', phase: 'sync' }]);

    const importRequest = await fetch(`${baseUrl}/api/v1/dashboard/jobs/manual-20260806020000000/import-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardIds: ['1478612237869519902'] }),
    });
    assert.equal(importRequest.status, 200);
    assert.deepEqual(await importRequest.json(), {
        id: 'manual-20260806020000000',
        cardIds: ['1478612237869519902'],
    });
    assert.deepEqual(launches, [
        { jobId: 'manual-20260806020000000', phase: 'sync' },
        { jobId: 'manual-20260806020000000', phase: 'import' },
    ]);

    // 受阻或 Worker 退出后，用持久化请求重启一次性导入 Worker。
    const importResume = await fetch(`${baseUrl}/api/v1/dashboard/jobs/manual-20260806020000000/import-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
    });
    assert.equal(importResume.status, 200);
    assert.deepEqual(await importResume.json(), { id: 'manual-20260806020000000', resumed: true });
    assert.deepEqual(launches.at(-1), { jobId: 'manual-20260806020000000', phase: 'import' });
    assert.equal(launches.length, 3);

    const unauthorized = await fetch(`${baseUrl}/api/v1/jobs`);
    assert.equal(unauthorized.status, 401);
    const wrongToken = await fetch(`${baseUrl}/api/v1/jobs`, {
        headers: { Authorization: 'Bearer wrong-token' },
    });
    assert.equal(wrongToken.status, 401);

    const heartbeat = await fetch(`${baseUrl}/api/v1/worker/heartbeat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerId: 'codex-heartbeat', state: 'idle' }),
    });
    assert.equal(heartbeat.status, 200);
    assert.equal((await heartbeat.json()).online, true);
    assert.equal(triggerCount, 1);
    assert.equal(launches.length, 3);

    const workflow = await fetch(`${baseUrl}/api/v1/jobs/manual-20260806020000000/workflow`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'importing', message: '处理中' }),
    });
    assert.equal(workflow.status, 200);
    assert.deepEqual(await workflow.json(), {
        id: 'manual-20260806020000000',
        state: 'importing',
        message: '处理中',
    });

    const importItem = await fetch(`${baseUrl}/api/v1/jobs/manual-20260806020000000/import-item`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: '1478612237869519902', state: 'imported', message: '完成' }),
    });
    assert.equal(importItem.status, 200);
    assert.deepEqual(await importItem.json(), {
        id: 'manual-20260806020000000',
        cardId: '1478612237869519902',
        state: 'imported',
        message: '完成',
    });

    const rejected = await fetch(`${baseUrl}/api/v1/dashboard/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{}',
    });
    assert.equal(rejected.status, 415);

    const nonJsonMediaType = await fetch(`${baseUrl}/api/v1/dashboard/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/jsonx' },
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

    const workerCannotTrigger = await fetch(`${baseUrl}/api/v1/jobs/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    });
    assert.equal(workerCannotTrigger.status, 404);
    assert.equal(triggerCount, 1);
});
