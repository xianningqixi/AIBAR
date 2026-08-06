import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildManifests,
    MANIFEST_BATCH_SIZE,
    MAX_TOTAL_CARDS,
    mergePassCards,
    missingCoverage,
    normalizePass,
} from '../src/manifest.js';

const threadId = '1478612237869519901';

function job(filters = { tags: [], tagMatch: 'any' }) {
    return {
        id: 't1-2026-08-05',
        sourceDate: '2026-08-05',
        window: {
            start: '2026-08-04T16:00:00.000Z',
            end: '2026-08-05T16:00:00.000Z',
        },
        channelName: 'Discord T+1',
        filters,
        tagCatalog: ['原创', '多路线'],
        coverage: {},
        cards: [],
    };
}

function post(overrides = {}) {
    return {
        id: threadId,
        threadId,
        title: 'T+1 card',
        authorName: 'Author',
        sourceUrl: `https://discord.com/channels/1380075940285124724/${threadId}`,
        tags: ['原创', '多路线'],
        publishedAt: '2026-08-05T08:00:00.000Z',
        lastActiveAt: '2026-08-05T09:00:00.000Z',
        reactionCount: 4,
        replyCount: 2,
        resource: { availability: 'browser', kind: 'character-card' },
        ...overrides,
    };
}

function discoveryPass(tags, posts = [post()], observedAt = '2026-08-06T01:05:00.000Z') {
    return {
        observedAt,
        view: { tags, tagMatch: 'any', sort: 'created-at' },
        posts,
    };
}

test('unfiltered T+1 jobs require every current Discord tag plus a catch-all pass', () => {
    const value = job();
    assert.deepEqual(missingCoverage(value), ['unfiltered', 'any:["原创"]', 'any:["多路线"]']);

    for (const pass of [discoveryPass([]), discoveryPass(['原创']), discoveryPass(['多路线'])]) {
        const normalized = normalizePass(pass, value);
        value.cards = mergePassCards(value.cards, normalized);
        value.coverage[normalized.signature] = { observedAt: normalized.observedAt };
    }

    assert.deepEqual(missingCoverage(value), []);
    const manifests = buildManifests(value, '2026-08-06T01:10:00.000Z');
    assert.equal(manifests.length, 1);
    assert.equal(manifests[0].period, 'previous-day');
    assert.deepEqual(manifests[0].filters, { tags: [], tagMatch: 'any' });
    assert.equal(manifests[0].cards.length, 1);
});

test('oversized jobs split into hot-first batches within the AIBAR manifest limit', () => {
    const value = job();
    value.coverage = {
        unfiltered: {},
        'any:["原创"]': {},
        'any:["多路线"]': {},
    };
    value.cards = Array.from({ length: MANIFEST_BATCH_SIZE + 50 }, (_, index) => ({
        ...post({
            id: `147861223786${String(9520000 + index)}`,
            threadId: `147861223786${String(9520000 + index)}`,
            reactionCount: index,
        }),
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
        posts: [post({ publishedAt: '2026-08-05T16:00:00.000Z' })],
    }, value), /outside the T\+1 source window/);
});

test('coverage signatures never collide across tag boundaries', () => {
    const single = { tags: ['原创|多路线'], tagMatch: 'any', sort: 'created-at' };
    const pair = { tags: ['原创', '多路线'], tagMatch: 'any', sort: 'created-at' };
    const value = job();
    value.tagCatalog = ['原创', '多路线', '原创|多路线'];
    assert.notEqual(
        normalizePass(discoveryPass(single.tags, []), value).signature,
        normalizePass(discoveryPass(pair.tags, []), value).signature,
    );
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
