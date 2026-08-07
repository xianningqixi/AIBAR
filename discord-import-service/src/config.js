import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SERVICE_TIMEZONE } from './time.js';

export const DISCORD_GUILD_ID = '1380075940285124724';
export const DISCORD_SOURCES = Object.freeze([
    Object.freeze({ channelId: '1478601254312874024', channelName: '纯文字' }),
    Object.freeze({ channelId: '1478601664838766723', channelName: '轻前端·美化' }),
    Object.freeze({ channelId: '1478612237869519021', channelName: '重前端·独立前端' }),
]);
// 旧状态文件没有 sources 字段时，按原先唯一配置的重前端栏目读取。
export const DISCORD_CHANNEL_ID = DISCORD_SOURCES[2].channelId;

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(serviceRoot, '..');
const bundledCodexCommand = '/Applications/ChatGPT.app/Contents/Resources/codex';

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
        timezone: SERVICE_TIMEZONE,
        guildId: DISCORD_GUILD_ID,
        channelId: DISCORD_CHANNEL_ID,
        channelName: 'NSFW-男性向',
        sources: DISCORD_SOURCES.map(source => ({ ...source })),
        aibarUrl: process.env.AIBAR_DISCORD_AIBAR_URL || 'https://172.86.116.166/aibar/#/hub?source=discord',
        workspaceDirectory: repositoryRoot,
        codexCommand: process.env.AIBAR_DISCORD_CODEX_BIN
            || (fs.existsSync(bundledCodexCommand) ? bundledCodexCommand : 'codex'),
    };
}
