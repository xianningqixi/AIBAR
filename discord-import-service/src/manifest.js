import { DISCORD_CHANNEL_ID, DISCORD_GUILD_ID, DISCORD_SOURCES } from './config.js';

const SNOWFLAKE_PATTERN = /^[1-9]\d{16,19}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const ALLOWED_CARD_KEYS = new Set([
    'id', 'threadId', 'title', 'authorName', 'sourceUrl', 'previewUrl', 'tags',
    'publishedAt', 'lastActiveAt', 'reactionCount', 'replyCount', 'resource',
]);
const ALLOWED_RESOURCE_KEYS = new Set([
    'availability', 'kind', 'fileName', 'note', 'launchUrl', 'runtime', 'bridgeVersion', 'permissions',
]);
const ALLOWED_VIEW_KEYS = new Set(['tags', 'tagMatch', 'sort']);
export const CARD_EXTENSIONS = new Set(['png', 'json', 'yaml', 'yml', 'charx', 'byaf']);
const RESOURCE_AVAILABILITY = new Set(['ready', 'browser', 'unsupported']);
const TAG_MATCH = new Set(['any', 'all']);
const VIEW_SORT = new Set(['created-at', 'recent-activity']);
const WEB_APP_PERMISSIONS = new Set(['generation', 'storage']);
const SOURCE_NAMES = new Map(DISCORD_SOURCES.map(source => [source.channelId, source.channelName]));

function object(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
    return value;
}

function exactKeys(value, allowed, label) {
    const key = Object.keys(value).find(candidate => !allowed.has(candidate));
    if (key) throw new Error(`${label}.${key} is not allowed`);
}

function text(value, label, maximum, { empty = false } = {}) {
    if (typeof value !== 'string') throw new Error(`${label} must be a string`);
    const normalized = value.trim();
    if (!empty && !normalized) throw new Error(`${label} must not be empty`);
    if (normalized.length > maximum) throw new Error(`${label} exceeds ${maximum} characters`);
    if (/\u0000|[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
        throw new Error(`${label} contains control characters`);
    }
    return normalized;
}

function timestamp(value, label) {
    const normalized = text(value, label, 40);
    if (!ISO_TIMESTAMP_PATTERN.test(normalized) || !Number.isFinite(Date.parse(normalized))) {
        throw new Error(`${label} must be an ISO 8601 timestamp with timezone`);
    }
    return normalized;
}

function snowflake(value, label) {
    const normalized = text(value, label, 20);
    if (!SNOWFLAKE_PATTERN.test(normalized)) throw new Error(`${label} must be a Discord snowflake`);
    return normalized;
}

function integer(value, label) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) {
        throw new Error(`${label} must be a non-negative safe integer`);
    }
    return value;
}

function tags(value, label, maximum = 64) {
    if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} must contain at most ${maximum} tags`);
    const normalized = value.map((tag, index) => text(tag, `${label}[${index}]`, 48));
    const folded = normalized.map(tag => tag.toLocaleLowerCase('en-US'));
    if (new Set(folded).size !== normalized.length) throw new Error(`${label} contains duplicate tags`);
    return normalized;
}

function optionalText(record, key, label, maximum) {
    return key in record ? text(record[key], `${label}.${key}`, maximum) : undefined;
}

function sourceChannelId(value, label = 'sourceChannelId') {
    const normalized = snowflake(value, label);
    if (!SOURCE_NAMES.has(normalized)) throw new Error(`${label} is not a configured Discord source`);
    return normalized;
}

function sourceUrl(value, sourceId, threadId, cardId) {
    let parsed;
    try {
        parsed = new URL(text(value, 'post.sourceUrl', 2048));
    } catch {
        throw new Error('post.sourceUrl is invalid');
    }
    if (
        parsed.protocol !== 'https:'
        || parsed.hostname.toLowerCase() !== 'discord.com'
        || parsed.username
        || parsed.password
        || parsed.port
        || parsed.search
        || parsed.hash
    ) throw new Error('post.sourceUrl must be a safe Discord URL');
    const segments = parsed.pathname.split('/').filter(Boolean);
    const channelRef = segments[2];
    const messageRef = segments[3];
    const matchesThread = channelRef === threadId || messageRef === threadId || messageRef === cardId;
    if (
        (segments.length !== 3 && segments.length !== 4)
        || segments[0] !== 'channels'
        || segments[1] !== DISCORD_GUILD_ID
        || !matchesThread
        || (channelRef !== threadId && channelRef !== sourceId)
    ) throw new Error('post.sourceUrl does not match the configured Discord thread');
    return parsed.toString();
}

function previewUrl(value) {
    let parsed;
    try {
        parsed = new URL(text(value, 'post.previewUrl', 4096));
    } catch {
        throw new Error('post.previewUrl is invalid');
    }
    const host = parsed.hostname.toLowerCase();
    if (
        parsed.protocol !== 'https:'
        || !['cdn.discordapp.com', 'media.discordapp.net'].includes(host)
        || parsed.username
        || parsed.password
        || parsed.port
        || !parsed.pathname.includes('/attachments/')
    ) throw new Error('post.previewUrl must be a Discord CDN attachment URL');
    return parsed.toString();
}

function safeWebAppUrl(value) {
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return false;
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (!host || host === 'localhost' || host.endsWith('.local')) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false;
    const secondOctet = Number(host.split('.')[1]);
    if (host.startsWith('172.') && secondOctet >= 16 && secondOctet <= 31) return false;
    return !host.includes(':');
}

function normalizeResource(value) {
    const record = object(value, 'post.resource');
    exactKeys(record, ALLOWED_RESOURCE_KEYS, 'post.resource');
    if (!RESOURCE_AVAILABILITY.has(record.availability)) throw new Error('post.resource.availability is invalid');
    const kind = record.kind === undefined ? 'character-card' : record.kind;
    if (!['character-card', 'web-app'].includes(kind)) throw new Error('post.resource.kind is invalid');
    // AIBAR 前端 manifest 校验的 note 上限是 500，这里必须保持一致，否则交接时被拒
    const note = optionalText(record, 'note', 'post.resource', 500);

    if (kind === 'character-card') {
        for (const key of ['launchUrl', 'runtime', 'bridgeVersion', 'permissions']) {
            if (key in record) throw new Error(`post.resource.${key} is only valid for web apps`);
        }
        const fileName = optionalText(record, 'fileName', 'post.resource', 255);
        if (fileName) {
            if (/[/\\]/.test(fileName)) throw new Error('post.resource.fileName must be a plain file name');
            const extension = fileName.split('.').pop()?.toLowerCase() || '';
            if (record.availability !== 'unsupported' && !CARD_EXTENSIONS.has(extension)) {
                throw new Error('post.resource.fileName is not an importable card type');
            }
        }
        return {
            availability: record.availability,
            kind,
            ...(fileName ? { fileName } : {}),
            ...(note ? { note } : {}),
        };
    }

    if (record.availability !== 'ready') throw new Error('web apps must be ready');
    if ('fileName' in record) throw new Error('web apps do not use character-card files');
    const launchUrl = text(record.launchUrl, 'post.resource.launchUrl', 2048);
    if (!safeWebAppUrl(launchUrl)) throw new Error('post.resource.launchUrl must be a public HTTPS URL');
    const runtime = record.runtime === undefined ? 'standalone' : record.runtime;
    if (!['standalone', 'aibar-bridge'].includes(runtime)) throw new Error('post.resource.runtime is invalid');
    const permissions = record.permissions === undefined ? [] : record.permissions;
    if (!Array.isArray(permissions) || permissions.some(permission => !WEB_APP_PERMISSIONS.has(permission))) {
        throw new Error('post.resource.permissions is invalid');
    }
    if (new Set(permissions).size !== permissions.length) throw new Error('post.resource.permissions contains duplicates');
    if (runtime === 'standalone' && permissions.length) throw new Error('standalone web apps cannot request permissions');
    if (runtime === 'standalone' && 'bridgeVersion' in record) {
        throw new Error('standalone web apps cannot declare bridgeVersion');
    }
    if (runtime === 'aibar-bridge' && record.bridgeVersion !== 1) throw new Error('bridge apps require bridgeVersion 1');
    return {
        availability: 'ready',
        kind,
        launchUrl,
        runtime,
        ...(runtime === 'aibar-bridge' ? { bridgeVersion: 1 } : {}),
        permissions,
        ...(note ? { note } : {}),
    };
}

export function normalizeFilters(value = { tags: [], tagMatch: 'any' }) {
    const record = object(value, 'filters');
    exactKeys(record, new Set(['tags', 'tagMatch']), 'filters');
    const normalizedTags = tags(record.tags, 'filters.tags');
    if (!TAG_MATCH.has(record.tagMatch)) throw new Error('filters.tagMatch must be any or all');
    return { tags: normalizedTags, tagMatch: record.tagMatch };
}

export function normalizeCatalog(value) {
    const record = object(value, 'catalog');
    exactKeys(record, new Set(['sourceChannelId', 'tags', 'observedAt']), 'catalog');
    return {
        sourceChannelId: sourceChannelId(record.sourceChannelId, 'catalog.sourceChannelId'),
        tags: tags(record.tags, 'catalog.tags'),
        observedAt: timestamp(record.observedAt, 'catalog.observedAt'),
    };
}

function normalizeView(value) {
    const record = object(value, 'pass.view');
    exactKeys(record, ALLOWED_VIEW_KEYS, 'pass.view');
    const normalizedTags = tags(record.tags, 'pass.view.tags');
    if (!TAG_MATCH.has(record.tagMatch)) throw new Error('pass.view.tagMatch must be any or all');
    if (!VIEW_SORT.has(record.sort)) throw new Error('pass.view.sort is invalid');
    return { tags: normalizedTags, tagMatch: record.tagMatch, sort: record.sort };
}

function matchesFilters(cardTags, filters) {
    if (!filters.tags.length) return true;
    const available = new Set(cardTags.map(tag => tag.toLocaleLowerCase('en-US')));
    const expected = filters.tags.map(tag => tag.toLocaleLowerCase('en-US'));
    return filters.tagMatch === 'all'
        ? expected.every(tag => available.has(tag))
        : expected.some(tag => available.has(tag));
}

function matchesView(cardTags, view) {
    if (!view.tags.length) return true;
    return matchesFilters(cardTags, { tags: view.tags, tagMatch: view.tagMatch });
}

export function normalizePost(value, job, sourceId) {
    const record = object(value, 'post');
    exactKeys(record, ALLOWED_CARD_KEYS, 'post');
    const id = snowflake(record.id, 'post.id');
    const threadId = snowflake(record.threadId, 'post.threadId');
    const publishedAt = timestamp(record.publishedAt, 'post.publishedAt');
    const publishedTime = Date.parse(publishedAt);
    if (publishedTime < Date.parse(job.window.start) || publishedTime >= Date.parse(job.window.end)) {
        throw new Error(`post ${threadId} is outside the manual snapshot window`);
    }
    const normalized = {
        id,
        threadId,
        title: text(record.title, 'post.title', 240),
        authorName: text(record.authorName, 'post.authorName', 120),
        sourceChannelId: sourceId,
        sourceUrl: sourceUrl(record.sourceUrl, sourceId, threadId, id),
        ...(record.previewUrl ? { previewUrl: previewUrl(record.previewUrl) } : {}),
        tags: tags(record.tags, 'post.tags', 16),
        publishedAt,
        ...(record.lastActiveAt ? { lastActiveAt: timestamp(record.lastActiveAt, 'post.lastActiveAt') } : {}),
        reactionCount: integer(record.reactionCount, 'post.reactionCount'),
        replyCount: integer(record.replyCount, 'post.replyCount'),
        resource: normalizeResource(record.resource),
    };
    if (!matchesFilters(normalized.tags, job.filters)) {
        throw new Error(`post ${threadId} does not satisfy the job filters`);
    }
    return normalized;
}

export function passSignature(view) {
    if (!view.tags.length) return 'unfiltered';
    // JSON 编码逐个标签，避免标签内容里出现分隔符时不同视图折叠成同一个覆盖键
    const sorted = [...view.tags].sort((left, right) => left.localeCompare(right));
    return `${view.tagMatch}:${JSON.stringify(sorted)}`;
}

function usesSourceCoverage(job) {
    return Array.isArray(job.sources) && job.sources.length > 0;
}

function coverageSignature(job, sourceId, view) {
    const signature = passSignature(view);
    return usesSourceCoverage(job) ? `${sourceId}/${signature}` : signature;
}

function jobSources(job) {
    if (usesSourceCoverage(job)) {
        return job.sources.map(source => ({
            channelId: sourceChannelId(source.channelId, 'job.sources.channelId'),
            channelName: SOURCE_NAMES.get(source.channelId),
        }));
    }
    const legacyId = job.channelId || DISCORD_CHANNEL_ID;
    return [{
        channelId: sourceChannelId(legacyId, 'job.channelId'),
        channelName: job.channelName || SOURCE_NAMES.get(legacyId),
    }];
}

function sourceCatalog(job, sourceId) {
    if (usesSourceCoverage(job)) return job.tagCatalogBySource?.[sourceId] || [];
    return job.tagCatalog || [];
}

export function normalizePass(value, job) {
    const record = object(value, 'pass');
    exactKeys(record, new Set(['sourceChannelId', 'observedAt', 'view', 'posts']), 'pass');
    const normalizedSourceId = sourceChannelId(record.sourceChannelId, 'pass.sourceChannelId');
    const allowedSources = new Set(jobSources(job).map(source => source.channelId));
    if (!allowedSources.has(normalizedSourceId)) throw new Error('pass.sourceChannelId is not part of this job');
    const observedAt = timestamp(record.observedAt, 'pass.observedAt');
    const view = normalizeView(record.view);
    if (view.sort !== 'created-at') throw new Error('Manual discovery passes must use Discord post-date sorting');
    if (!Array.isArray(record.posts) || record.posts.length > 200) throw new Error('pass.posts must contain at most 200 items');
    const configuredTags = sourceCatalog(job, normalizedSourceId);
    if (configuredTags.length) {
        const catalog = new Set(configuredTags.map(tag => tag.toLocaleLowerCase('en-US')));
        const unknown = view.tags.find(tag => !catalog.has(tag.toLocaleLowerCase('en-US')));
        if (unknown) throw new Error(`pass.view.tags contains an unknown Discord tag: ${unknown}`);
    }
    if (job.filters.tags.length) {
        const expected = passSignature({ tags: job.filters.tags, tagMatch: job.filters.tagMatch });
        if (passSignature(view) !== expected) throw new Error('pass.view does not match the job filters');
    }
    const posts = record.posts.map(post => normalizePost(post, job, normalizedSourceId));
    const mismatched = posts.find(post => !matchesView(post.tags, view));
    if (mismatched) {
        throw new Error(`post ${mismatched.threadId} does not satisfy the Discord view filters`);
    }
    return {
        sourceChannelId: normalizedSourceId,
        observedAt,
        view,
        signature: coverageSignature(job, normalizedSourceId, view),
        posts,
    };
}

export function mergePassCards(existingCards, discoveryPass) {
    const byThread = new Map(existingCards.map(card => [card.threadId, card]));
    for (const post of discoveryPass.posts) {
        const current = byThread.get(post.threadId);
        if (!current) {
            byThread.set(post.threadId, { ...post, observedAt: discoveryPass.observedAt });
            continue;
        }
        if (current.sourceChannelId && current.sourceChannelId !== post.sourceChannelId) {
            throw new Error(`post ${post.threadId} was reported under multiple Discord sources`);
        }
        const newer = Date.parse(discoveryPass.observedAt) >= Date.parse(current.observedAt);
        const tagMap = new Map([...current.tags, ...post.tags].map(tag => [tag.toLocaleLowerCase('en-US'), tag]));
        byThread.set(post.threadId, {
            ...(newer ? post : current),
            tags: [...tagMap.values()],
            reactionCount: Math.max(current.reactionCount, post.reactionCount),
            replyCount: Math.max(current.replyCount, post.replyCount),
            previewUrl: post.previewUrl || current.previewUrl,
            observedAt: newer ? discoveryPass.observedAt : current.observedAt,
        });
    }
    return [...byThread.values()];
}

export function missingCoverage(job) {
    const covered = new Set(Object.keys(job.coverage || {}));
    const filters = job.filters || { tags: [], tagMatch: 'any' };
    const required = [];
    for (const source of jobSources(job)) {
        if (filters.tags.length) {
            required.push(coverageSignature(job, source.channelId, filters));
            continue;
        }
        required.push(coverageSignature(job, source.channelId, { tags: [], tagMatch: 'any' }));
        for (const tag of sourceCatalog(job, source.channelId)) {
            required.push(coverageSignature(job, source.channelId, { tags: [tag], tagMatch: 'any' }));
        }
    }
    return required.filter(signature => !covered.has(signature));
}

// AIBAR 前端单个 manifest 的硬上限；超出的卡拆成后续批次逐批交接
export const MANIFEST_BATCH_SIZE = 200;
// 单次手动任务的总量护栏：超过说明筛选条件太宽，应显式失败而不是无限拆批。
export const MAX_TOTAL_CARDS = 1000;

export function buildManifests(job, syncedAt) {
    const missing = missingCoverage(job);
    if (missing.length) throw new Error(`Discord filter coverage is incomplete: ${missing.join(', ')}`);
    const jobCards = job.cards || [];
    if (jobCards.length > MAX_TOTAL_CARDS) {
        throw new Error(`Manual job exceeds ${MAX_TOTAL_CARDS} cards; narrow the job filters before completing`);
    }
    const normalizedSyncedAt = timestamp(syncedAt, 'syncedAt');
    const sources = jobSources(job);
    const cards = [...jobCards]
        .sort((left, right) => (
            right.reactionCount - left.reactionCount
            || Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
            || left.threadId.localeCompare(right.threadId)
        ))
        .map((card) => {
            const sourceId = card.sourceChannelId || (sources.length === 1 ? sources[0].channelId : '');
            if (!sourceId || !sources.some(source => source.channelId === sourceId)) {
                throw new Error(`post ${card.threadId} is missing a configured Discord source`);
            }
            return { ...card, sourceChannelId: sourceId };
        });
    const manifests = [];
    for (const source of sources) {
        const sourceCards = cards.filter(card => card.sourceChannelId === source.channelId);
        for (let start = 0; start < sourceCards.length; start += MANIFEST_BATCH_SIZE) {
            manifests.push({
                version: 1,
                guildId: DISCORD_GUILD_ID,
                channelId: source.channelId,
                channelName: source.channelName,
                syncedAt: normalizedSyncedAt,
                timezone: 'Asia/Shanghai',
                period: job.period || 'today',
                sort: 'reactions',
                filters: job.filters,
                cards: sourceCards.slice(start, start + MANIFEST_BATCH_SIZE).map(({
                    sourceChannelId: _sourceChannelId,
                    observedAt: _observedAt,
                    ...card
                }) => card),
            });
        }
    }
    return manifests;
}
