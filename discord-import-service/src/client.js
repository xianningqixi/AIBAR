import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { serviceTokenPath } from './auth.js';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.AIBAR_DISCORD_SERVICE_URL || 'http://127.0.0.1:4317';
const [command = 'latest', ...args] = process.argv.slice(2);

async function serviceToken() {
    const envToken = process.env.AIBAR_DISCORD_SERVICE_TOKEN;
    if (envToken) return envToken.trim();
    const dataDirectory = path.resolve(process.env.AIBAR_DISCORD_SERVICE_DATA || path.join(serviceRoot, 'data'));
    try {
        return (await fs.readFile(serviceTokenPath(dataDirectory), 'utf8')).trim();
    } catch {
        throw new Error('Service token not found; start the service once or set AIBAR_DISCORD_SERVICE_TOKEN');
    }
}

async function request(method, pathname, body) {
    const response = await fetch(new URL(pathname, baseUrl), {
        method,
        headers: {
            Authorization: `Bearer ${await serviceToken()}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
}

async function fileBody(filePath) {
    if (!filePath) throw new Error('A JSON file path is required');
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function required(value, label) {
    if (!value) throw new Error(`${label} is required`);
    return value;
}

let result;
if (command === 'latest') {
    result = await request('GET', '/api/v1/jobs/latest');
} else if (command === 'list') {
    result = await request('GET', '/api/v1/jobs');
} else if (command === 'trigger') {
    const trigger = args[0] ? { sourceDate: args[0] } : {};
    if (args[1]) trigger.filters = await fileBody(args[1]);
    result = await request('POST', '/api/v1/jobs/trigger', trigger);
} else if (command === 'claim') {
    result = await request('POST', `/api/v1/jobs/${encodeURIComponent(required(args[0], 'jobId'))}/claim`, {
        workerId: required(args[1], 'workerId'),
    });
} else if (command === 'catalog' || command === 'pass') {
    const action = command === 'pass' ? 'passes' : 'catalog';
    result = await request(
        'POST',
        `/api/v1/jobs/${encodeURIComponent(required(args[0], 'jobId'))}/${action}`,
        await fileBody(args[1]),
    );
} else if (['complete', 'delivered'].includes(command)) {
    result = await request(
        'POST',
        `/api/v1/jobs/${encodeURIComponent(required(args[0], 'jobId'))}/${command}`,
        {},
    );
} else if (command === 'manifest') {
    result = await request('GET', `/api/v1/jobs/${encodeURIComponent(required(args[0], 'jobId'))}/manifest`);
} else if (command === 'fail') {
    result = await request('POST', `/api/v1/jobs/${encodeURIComponent(required(args[0], 'jobId'))}/fail`, {
        error: required(args.slice(1).join(' '), 'error'),
    });
} else {
    throw new Error(`Unknown command: ${command}`);
}

console.log(JSON.stringify(result, null, 2));
