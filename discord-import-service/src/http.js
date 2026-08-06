import http from 'node:http';

import { isAuthorizedBearer } from './auth.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function json(response, status, body) {
    const payload = JSON.stringify(body);
    response.writeHead(status, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'X-Content-Type-Options': 'nosniff',
    });
    response.end(payload);
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
    const match = pathname.match(/^\/api\/v1\/jobs\/([^/]+)(?:\/(claim|catalog|passes|complete|manifest|delivered|fail))?$/);
    return match ? { id: decodeURIComponent(match[1]), action: match[2] || '' } : null;
}

export function createHttpServer(service, config) {
    return http.createServer(async (request, response) => {
        try {
            if (!isLoopbackHost(request.headers.host)) {
                return json(response, 403, { error: 'Host header must be a loopback address' });
            }
            const url = new URL(request.url || '/', `http://${config.host}:${config.port}`);
            if (request.method === 'GET' && url.pathname === '/health') {
                return json(response, 200, { ok: true, service: 'aibar-discord-import', now: new Date().toISOString() });
            }
            // /health 之外的所有接口都要求本地 bearer token（data/service-token）
            if (!isAuthorizedBearer(request.headers.authorization, config.token)) {
                return json(response, 401, { error: 'Missing or invalid service token' });
            }
            if (request.method === 'GET' && url.pathname === '/api/v1/config') {
                return json(response, 200, {
                    guildId: config.guildId,
                    channelId: config.channelId,
                    timezone: config.timezone,
                    runHour: config.runHour,
                    runMinute: config.runMinute,
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
            if (request.method === 'POST' && url.pathname === '/api/v1/jobs/trigger') {
                return json(response, 201, await service.trigger(await readJson(request)));
            }

            const route = jobRoute(url.pathname);
            if (!route) return json(response, 404, { error: 'Route not found' });
            if (request.method === 'GET' && !route.action) return json(response, 200, service.getJob(route.id));
            if (request.method === 'GET' && route.action === 'manifest') {
                return json(response, 200, service.getManifest(route.id));
            }
            if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed' });

            const body = await readJson(request);
            if (route.action === 'claim') return json(response, 200, await service.claim(route.id, body.workerId));
            if (route.action === 'catalog') return json(response, 200, await service.recordCatalog(route.id, body));
            if (route.action === 'passes') return json(response, 200, await service.recordPass(route.id, body));
            if (route.action === 'complete') return json(response, 200, await service.complete(route.id));
            if (route.action === 'delivered') return json(response, 200, await service.markDelivered(route.id));
            if (route.action === 'fail') return json(response, 200, await service.fail(route.id, body.error));
            return json(response, 404, { error: 'Route not found' });
        } catch (error) {
            const status = Number.isInteger(error.statusCode) ? error.statusCode : 400;
            return json(response, status, { error: String(error.message || error) });
        }
    });
}
