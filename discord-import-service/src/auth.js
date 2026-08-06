import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const TOKEN_FILE_NAME = 'service-token';
const GENERATED_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export function serviceTokenPath(dataDirectory) {
    return path.join(dataDirectory, TOKEN_FILE_NAME);
}

/**
 * 本地 API 的 bearer token：优先取环境变量，否则读取/生成 data/service-token。
 * token 只存在管理员本机的 data 目录（0600），是 loopback + Host 校验之外的第三层边界。
 */
export async function loadOrCreateServiceToken(dataDirectory) {
    const envToken = process.env.AIBAR_DISCORD_SERVICE_TOKEN;
    if (envToken !== undefined && envToken !== '') {
        if (envToken.trim().length < 32) {
            throw new Error('AIBAR_DISCORD_SERVICE_TOKEN must be at least 32 characters');
        }
        return envToken.trim();
    }
    const tokenPath = serviceTokenPath(dataDirectory);
    try {
        const stored = (await fs.readFile(tokenPath, 'utf8')).trim();
        if (!GENERATED_TOKEN_PATTERN.test(stored)) {
            throw new Error(`${tokenPath} does not contain a valid service token; delete it to regenerate`);
        }
        return stored;
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    const token = crypto.randomBytes(32).toString('hex');
    await fs.mkdir(dataDirectory, { recursive: true, mode: 0o700 });
    await fs.writeFile(tokenPath, `${token}\n`, { encoding: 'utf8', mode: 0o600 });
    return token;
}

export function isAuthorizedBearer(headerValue, token) {
    if (!token) return false;
    const provided = /^Bearer\s+(.+)$/i.exec(headerValue || '')?.[1]?.trim();
    if (!provided) return false;
    const expected = Buffer.from(token, 'utf8');
    const actual = Buffer.from(provided, 'utf8');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
