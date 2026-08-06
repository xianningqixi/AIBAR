import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SERVICE_TIMEZONE } from './t1.js';

export const DISCORD_GUILD_ID = '1380075940285124724';
export const DISCORD_CHANNEL_ID = '1478612237869519021';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function integerEnv(name, fallback, minimum, maximum) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return value;
}

export function loadConfig() {
    const host = process.env.AIBAR_DISCORD_SERVICE_HOST || '127.0.0.1';
    if (!['127.0.0.1', '::1'].includes(host)) {
        throw new Error('AIBAR_DISCORD_SERVICE_HOST must be a loopback address');
    }
    return {
        host,
        port: integerEnv('AIBAR_DISCORD_SERVICE_PORT', 4317, 1, 65535),
        dataDirectory: path.resolve(process.env.AIBAR_DISCORD_SERVICE_DATA || path.join(serviceRoot, 'data')),
        runHour: integerEnv('AIBAR_DISCORD_SERVICE_RUN_HOUR', 9, 0, 23),
        runMinute: integerEnv('AIBAR_DISCORD_SERVICE_RUN_MINUTE', 0, 0, 59),
        timezone: SERVICE_TIMEZONE,
        guildId: DISCORD_GUILD_ID,
        channelId: DISCORD_CHANNEL_ID,
        channelName: process.env.AIBAR_DISCORD_CHANNEL_NAME || 'Discord T+1 角色卡',
        aibarUrl: process.env.AIBAR_DISCORD_AIBAR_URL || 'https://172.86.116.166/aibar/#/hub?source=discord',
    };
}
