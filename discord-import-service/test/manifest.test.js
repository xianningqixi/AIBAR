import assert from 'node:assert/strict';
import test from 'node:test';

import { DISCORD_SOURCES } from '../src/config.js';
import {
    buildManifests,
    MANIFEST_BATCH_SIZE,
    MAX_TOTAL_CARDS,
    mergePassCards,
    missingCoverage,
    normalizeCatalog,
    normalizePass,
} from '../src/manifest.js';

const [TEXT_SOURCE, LIGHT_SOURCE, HEAVY_SOURCE] = DISCORD_SOURCES;
const threadId = '1478612237869519901';

function job(filters = { tags: [], tagMatch: 'any' }) {
    return {
        id: 'manual-20260806020000000',
        mode: 'manual',
        period: 'today',
        localDate: '2026-08-06',
        window: {
            start: '2026-08-05T16:00:00.000Z',
            end: '2026-08-06T02:00:00.000Z',
        },
        channelName: 'NSFW-男性向',
        sources: DISCORD_SOURCES.map(source => ({ ...source })),
        filters,
        tagCatalogBySource: Object.fromEntries(DISCORD_SOURCES.map(source => [source.channelId, ['原创', '多路线']])),
        coverage: {},
        cards: [],
    };
}

function post(overrides = {}) {
    return {
        id: threadId,
        threadId,
        title: 'Today card',
        authorName: 'Author',
        sourceUrl: `https://discord.com/channels/1380075940285124724/${threadId}`,
        tags: ['原创', '多路线'],
        publishedAt: '2026-08-06T01:00:00.000Z',
        lastActiveAt: '2026-08-06T01:30:00.000Z',
        reactionCount: 4,
        replyCount: 2,
        resource: { availability: 'browser', kind: 'character-card' },
        ...overrides,
    };
}

function discoveryPass(
    tags,
    posts = [post()],
    observedAt = '2026-08-06T01:05:00.000Z',
    sourceChannelId = HEAVY_SOURCE.channelId,
) {
    return {
        sourceChannelId,
        observedAt,
        view: { tags, tagMatch: 'any', sort: 'created-at' },
        posts,
    };
}

test('unfiltered manual jobs require every current Discord tag plus a catch-all pass', () => {
    const value = job();
    assert.equal(missingCoverage(value).length, 9);

    for (const source of DISCORD_SOURCES) {
        for (const pass of [
            discoveryPass([], source === HEAVY_SOURCE ? [post()] : [], undefined, source.channelId),
            discoveryPass(['原创'], source === HEAVY_SOURCE ? [post()] : [], undefined, source.channelId),
            discoveryPass(['多路线'], source === HEAVY_SOURCE ? [post()] : [], undefined, source.channelId),
        ]) {
            const normalized = normalizePass(pass, value);
            value.cards = mergePassCards(value.cards, normalized);
            value.coverage[normalized.signature] = { observedAt: normalized.observedAt };
        }
    }

    assert.deepEqual(missingCoverage(value), []);
    const manifests = buildManifests(value, '2026-08-06T01:10:00.000Z');
    assert.equal(manifests.length, 1);
    assert.equal(manifests[0].period, 'today');
    assert.deepEqual(manifests[0].filters, { tags: [], tagMatch: 'any' });
    assert.equal(manifests[0].cards.length, 1);
    assert.equal(manifests[0].channelId, HEAVY_SOURCE.channelId);
});

test('oversized jobs split into hot-first batches within the AIBAR manifest limit', () => {
    const value = job();
    value.coverage = Object.fromEntries(DISCORD_SOURCES.flatMap(source => [
        [`${source.channelId}/unfiltered`, {}],
        [`${source.channelId}/any:["原创"]`, {}],
        [`${source.channelId}/any:["多路线"]`, {}],
    ]));
    value.cards = Array.from({ length: MANIFEST_BATCH_SIZE + 50 }, (_, index) => ({
        ...post({
            id: `147861223786${String(9520000 + index)}`,
            threadId: `147861223786${String(9520000 + index)}`,
            reactionCount: index,
        }),
        sourceChannelId: HEAVY_SOURCE.channelId,
        observedAt: '2026-08-06T01:05:00.000Z',
    }));

    const manifests = buildManifests(value, '2026-08-06T01:10:00.000Z');
    assert.equal(manifests.length, 2);
    assert.equal(manifests[0].cards.length, MANIFEST_BATCH_SIZE);
    assert.equal(manifests[1].cards.length, 50);
    // 第一批必须是回应数最高的帖子
    assert.equal(manifests[0].cards[0].reactionCount, MANIFEST_BATCH_SIZE + 49);
    assert.ok(manifests[0].cards.at(-1).reactionCount > manifests[1].cards[0].reactionCount);
    assert.ok(manifests.every(manifest => manifest.cards.every(card => card.observedAt === undefined)));

    value.cards = Array.from({ length: MAX_TOTAL_CARDS + 1 }, (_, index) => value.cards[0]);
    assert.throws(() => buildManifests(value, '2026-08-06T01:10:00.000Z'), /narrow the job filters/);
});

test('repeated filter passes merge by thread and keep the highest visible counters', () => {
    const value = job();
    const first = normalizePass(discoveryPass([], [post()]), value);
    value.cards = mergePassCards(value.cards, first);
    const second = normalizePass(discoveryPass(
        ['原创'],
        [post({ reactionCount: 9, replyCount: 5 })],
        '2026-08-06T01:06:00.000Z',
    ), value);
    value.cards = mergePassCards(value.cards, second);

    assert.equal(value.cards.length, 1);
    assert.equal(value.cards[0].reactionCount, 9);
    assert.equal(value.cards[0].replyCount, 5);
});

test('filtered jobs require the exact Discord match mode and reject out-of-window posts', () => {
    const value = job({ tags: ['原创', '多路线'], tagMatch: 'all' });
    assert.throws(() => normalizePass(discoveryPass(['原创']), value), /does not match the job filters/);
    assert.throws(() => normalizePass({
        ...discoveryPass(['原创', '多路线']),
        view: { tags: ['原创', '多路线'], tagMatch: 'all', sort: 'created-at' },
        posts: [post({ publishedAt: '2026-08-06T02:00:00.000Z' })],
    }, value), /outside the manual snapshot window/);
});

test('coverage signatures never collide across tag boundaries', () => {
    const single = { tags: ['原创|多路线'], tagMatch: 'any', sort: 'created-at' };
    const pair = { tags: ['原创', '多路线'], tagMatch: 'any', sort: 'created-at' };
    const value = job();
    value.tagCatalogBySource[HEAVY_SOURCE.channelId] = ['原创', '多路线', '原创|多路线'];
    assert.notEqual(
        normalizePass(discoveryPass(single.tags, []), value).signature,
        normalizePass(discoveryPass(pair.tags, []), value).signature,
    );
});

test('source ids are validated and the same tag in separate forums has independent coverage', () => {
    assert.throws(() => normalizeCatalog({
        sourceChannelId: '1478601254312874999',
        tags: ['原创'],
        observedAt: '2026-08-06T01:00:00.000Z',
    }), /not a configured Discord source/);

    const value = job();
    const heavy = normalizePass(discoveryPass([], [], undefined, HEAVY_SOURCE.channelId), value);
    value.coverage[heavy.signature] = {};
    assert.ok(missingCoverage(value).includes(`${TEXT_SOURCE.channelId}/unfiltered`));
    assert.ok(missingCoverage(value).includes(`${LIGHT_SOURCE.channelId}/any:["原创"]`));
    assert.ok(missingCoverage(value).includes(`${HEAVY_SOURCE.channelId}/any:["原创"]`));
});

test('cards from all forums are emitted as v1 manifests with their real source channel', () => {
    const value = job({ tags: ['原创'], tagMatch: 'any' });
    value.coverage = Object.fromEntries(DISCORD_SOURCES.map(source => [
        `${source.channelId}/any:["原创"]`,
        {},
    ]));
    value.cards = DISCORD_SOURCES.map((source, index) => ({
        ...post({
            id: `147861223786951991${index}`,
            threadId: `147861223786951991${index}`,
            sourceUrl: `https://discord.com/channels/1380075940285124724/147861223786951991${index}`,
            reactionCount: 9 - index,
        }),
        sourceChannelId: source.channelId,
        observedAt: '2026-08-06T01:05:00.000Z',
    }));

    const manifests = buildManifests(value, '2026-08-06T01:10:00.000Z');
    assert.deepEqual(manifests.map(manifest => manifest.channelId), DISCORD_SOURCES.map(source => source.channelId));
    assert.deepEqual(manifests.map(manifest => manifest.channelName), DISCORD_SOURCES.map(source => source.channelName));
    assert.ok(manifests.every(manifest => manifest.version === 1 && manifest.cards.length === 1));
    assert.ok(manifests.every(manifest => manifest.cards[0].sourceChannelId === undefined));
});

test('a discovery pass only covers posts that satisfy its visible Discord filters', () => {
    const value = job();
    assert.throws(() => normalizePass(
        discoveryPass(['原创'], [post({ tags: ['多路线'] })]),
        value,
    ), /does not satisfy the Discord view filters/);
});

test('resource fields stay aligned with the AIBAR manifest contract', () => {
    const value = job();
    assert.throws(() => normalizePass(discoveryPass([], [post({
        resource: {
            availability: 'browser',
            kind: 'character-card',
            launchUrl: 'https://example.com/',
        },
    })]), value), /only valid for web apps/);
    assert.throws(() => normalizePass(discoveryPass([], [post({
        resource: {
            availability: 'ready',
            kind: 'web-app',
            fileName: 'card.png',
            launchUrl: 'https://example.com/',
        },
    })]), value), /do not use character-card files/);
});
