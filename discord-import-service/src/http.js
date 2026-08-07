import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isAuthorizedBearer } from './auth.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const publicDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const DASHBOARD_ASSETS = new Map([
    ['/', { contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(publicDirectory, 'index.html')) }],
    ['/dashboard.css', { contentType: 'text/css; charset=utf-8', body: fs.readFileSync(path.join(publicDirectory, 'dashboard.css')) }],
    ['/dashboard.js', { contentType: 'text/javascript; charset=utf-8', body: fs.readFileSync(path.join(publicDirectory, 'dashboard.js')) }],
]);

function commonHeaders(contentType, contentLength) {
    return {
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
        'Content-Type': contentType,
        'Content-Length': contentLength,
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
    };
}

function eventStreamHeaders() {
    return {
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
    };
}

function json(response, status, body) {
    const payload = JSON.stringify(body);
    response.writeHead(status, commonHeaders('application/json; charset=utf-8', Buffer.byteLength(payload)));
    response.end(payload);
}

function asset(response, value) {
    response.writeHead(200, commonHeaders(value.contentType, value.body.length));
    response.end(value.body);
}

// 只信任回环 Host，阻断 DNS rebinding：远端页面把自有域名解析到 127.0.0.1 时，
// Host 头仍是攻击者域名，直接拒绝，避免恶意页面读取任务数据或投毒 manifest。
function isLoopbackHost(hostHeader) {
    if (!hostHeader) return false;
    try {
        const { hostname } = new URL(`http://${hostHeader}`);
        return ['127.0.0.1', 'localhost', '[::1]'].includes(hostname);
    } catch {
        return false;
    }
}

async function readJson(request) {
    const mediaType = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
    if (mediaType !== 'application/json') {
        const error = new Error('Content-Type must be application/json');
        error.statusCode = 415;
        throw error;
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
            const error = new Error('Request body exceeds 2 MB');
            error.statusCode = 413;
            throw error;
        }
        chunks.push(chunk);
    }
    try {
        return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    } catch {
        const error = new Error('Request body is not valid JSON');
        error.statusCode = 400;
        throw error;
    }
}

function jobRoute(pathname) {
    const match = pathname.match(/^\/api\/v1\/jobs\/([^/]+)(?:\/(claim|catalog|passes|complete|manifest|delivered|workflow|import-item|fail))?$/);
    return match ? { id: decodeURIComponent(match[1]), action: match[2] || '' } : null;
}

export function createHttpServer(service, config, workerLauncher = null) {
    const dashboardClients = new Set();
    let dashboardActionStarting = false;
    const dashboardSnapshot = () => ({
        ...service.dashboardSnapshot(),
        guildId: config.guildId,
        channelId: config.channelId,
        discordUrl: `https://discord.com/channels/${config.guildId}/${config.channelId}`,
        sources: config.sources.map(source => ({
            ...source,
            discordUrl: `https://discord.com/channels/${config.guildId}/${source.channelId}`,
        })),
        aibarUrl: config.aibarUrl,
        launcher: workerLauncher?.status?.() || { busy: false, jobId: '', phase: '' },
    });
    const sendDashboardSnapshot = (response) => {
        response.write(`event: snapshot\ndata: ${JSON.stringify(dashboardSnapshot())}\n\n`);
    };
    const broadcastDashboard = () => {
        for (const client of dashboardClients) {
            try {
                sendDashboardSnapshot(client);
            } catch {
                dashboardClients.delete(client);
            }
        }
    };
    const requireLauncher = () => {
        if (!workerLauncher) {
            const error = new Error('一次性 Worker 启动器不可用');
            error.statusCode = 503;
            throw error;
        }
        if (dashboardActionStarting) {
            const error = new Error('Worker 正在启动，请稍候');
            error.statusCode = 409;
            throw error;
        }
        workerLauncher.assertAvailable();
    };
    const respondMutation = async (response, status, operation) => {
        const body = await operation();
        json(response, status, body);
        broadcastDashboard();
    };
    const onWorkerChange = () => broadcastDashboard();
    workerLauncher?.on('change', onWorkerChange);

    const server = http.createServer(async (request, response) => {
        try {
            if (!isLoopbackHost(request.headers.host)) {
                return json(response, 403, { error: 'Host header must be a loopback address' });
            }
            const url = new URL(request.url || '/', `http://${config.host}:${config.port}`);
            if (request.method === 'GET' && DASHBOARD_ASSETS.has(url.pathname)) {
                return asset(response, DASHBOARD_ASSETS.get(url.pathname));
            }
            if (request.method === 'GET' && url.pathname === '/health') {
                return json(response, 200, { ok: true, service: 'aibar-discord-import', now: new Date().toISOString() });
            }
            if (request.method === 'GET' && url.pathname === '/api/v1/dashboard') {
                return json(response, 200, dashboardSnapshot());
            }
            if (request.method === 'GET' && url.pathname === '/api/v1/dashboard/events') {
                response.writeHead(200, eventStreamHeaders());
                dashboardClients.add(response);
                sendDashboardSnapshot(response);
                request.once('close', () => dashboardClients.delete(response));
                return;
            }
            // 控制台只公开低敏感的操作入口；每次明确点击启动一个临时 Worker。
            if (request.method === 'POST' && url.pathname === '/api/v1/dashboard/trigger') {
                const body = await readJson(request);
                requireLauncher();
                dashboardActionStarting = true;
                let job;
                try {
                    job = await service.trigger(body);
                    try {
                        await workerLauncher.launch(job.id, 'sync');
                    } catch (error) {
                        await service.fail(job.id, '无法启动一次性同步 Worker');
                        throw error;
                    }
                    return json(response, 201, job);
                } finally {
                    dashboardActionStarting = false;
                    broadcastDashboard();
                }
            }
            const dashboardImportRoute = url.pathname.match(/^\/api\/v1\/dashboard\/jobs\/([^/]+)\/import-request$/);
            if (request.method === 'POST' && dashboardImportRoute) {
                const body = await readJson(request);
                requireLauncher();
                dashboardActionStarting = true;
                const jobId = decodeURIComponent(dashboardImportRoute[1]);
                try {
                    const job = await service.requestImport(jobId, body);
                    try {
                        await workerLauncher.launch(jobId, 'import');
                    } catch (error) {
                        await service.updateWorkflow(jobId, {
                            state: 'blocked',
                            message: '无法启动一次性发布 Worker',
                        });
                        throw error;
                    }
                    return json(response, 200, job);
                } finally {
                    dashboardActionStarting = false;
                    broadcastDashboard();
                }
            }
            // 发布受阻或 Worker 中途退出后，用已持久化的 importRequest 重启一次性发布 Worker。
            const dashboardResumeRoute = url.pathname.match(/^\/api\/v1\/dashboard\/jobs\/([^/]+)\/import-resume$/);
            if (request.method === 'POST' && dashboardResumeRoute) {
                await readJson(request);
                requireLauncher();
                dashboardActionStarting = true;
                const jobId = decodeURIComponent(dashboardResumeRoute[1]);
                try {
                    const job = service.resumeImport(jobId);
                    try {
                        await workerLauncher.launch(jobId, 'import');
                    } catch (error) {
                        await service.updateWorkflow(jobId, {
                            state: 'blocked',
                            message: '无法启动一次性发布 Worker',
                        });
                        throw error;
                    }
                    return json(response, 200, job);
                } finally {
                    dashboardActionStarting = false;
                    broadcastDashboard();
                }
            }
            // dashboard 摘要/建单与 /health 之外的接口都要求本地 bearer token。
            if (!isAuthorizedBearer(request.headers.authorization, config.token)) {
                return json(response, 401, { error: 'Missing or invalid service token' });
            }
            if (request.method === 'GET' && url.pathname === '/api/v1/config') {
                return json(response, 200, {
                    guildId: config.guildId,
                    channelId: config.channelId,
                    sources: config.sources,
                    timezone: config.timezone,
                    mode: 'manual',
                    aibarUrl: config.aibarUrl,
                });
            }
            if (request.method === 'GET' && url.pathname === '/api/v1/jobs') {
                return json(response, 200, { jobs: service.listJobs() });
            }
            if (request.method === 'GET' && url.pathname === '/api/v1/jobs/latest') {
                const job = service.latestJob();
                return job ? json(response, 200, job) : json(response, 404, { error: 'No jobs exist' });
            }
            if (request.method === 'POST' && url.pathname === '/api/v1/worker/heartbeat') {
                const body = await readJson(request);
                return respondMutation(response, 200, async () => service.reportWorker(body));
            }

            const route = jobRoute(url.pathname);
            if (!route) return json(response, 404, { error: 'Route not found' });
            if (request.method === 'GET' && !route.action) return json(response, 200, service.getJob(route.id));
            if (request.method === 'GET' && route.action === 'manifest') {
                return json(response, 200, service.getManifest(route.id));
            }
            if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed' });

            const body = await readJson(request);
            if (route.action === 'claim') return respondMutation(response, 200, () => service.claim(route.id, body.workerId));
            if (route.action === 'catalog') return respondMutation(response, 200, () => service.recordCatalog(route.id, body));
            if (route.action === 'passes') return respondMutation(response, 200, () => service.recordPass(route.id, body));
            if (route.action === 'complete') return respondMutation(response, 200, () => service.complete(route.id));
            if (route.action === 'delivered') return respondMutation(response, 200, () => service.markDelivered(route.id, body));
            if (route.action === 'workflow') return respondMutation(response, 200, () => service.updateWorkflow(route.id, body));
            if (route.action === 'import-item') return respondMutation(response, 200, () => service.updateImportItem(route.id, body));
            if (route.action === 'fail') return respondMutation(response, 200, () => service.fail(route.id, body.error));
            return json(response, 404, { error: 'Route not found' });
        } catch (error) {
            const status = Number.isInteger(error.statusCode) ? error.statusCode : 400;
            return json(response, status, { error: String(error.message || error) });
        }
    });
    server.once('close', () => {
        workerLauncher?.off('change', onWorkerChange);
        for (const client of dashboardClients) client.end();
        dashboardClients.clear();
    });
    return server;
}
