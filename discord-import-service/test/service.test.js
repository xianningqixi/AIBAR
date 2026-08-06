import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DiscordImportService } from '../src/service.js';
import { JsonStateStore } from '../src/store.js';

const threadId = '1478612237869519902';

function pass(tags, posts) {
    return {
        observedAt: '2026-08-06T02:05:00.000Z',
        view: { tags, tagMatch: 'any', sort: 'created-at' },
        posts,
    };
}

function card() {
    return {
        id: threadId,
        threadId,
        title: 'Service card',
        authorName: 'Author',
        sourceUrl: `https://discord.com/channels/1380075940285124724/${threadId}`,
        tags: ['原创', '多路线'],
        publishedAt: '2026-08-05T08:00:00.000Z',
        reactionCount: 6,
        replyCount: 1,
        resource: { availability: 'browser', kind: 'character-card' },
    };
}

test('the local service persists a complete T+1 job without contacting AIBAR', async (context) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aibar-discord-service-'));
    context.after(() => fs.rm(directory, { recursive: true, force: true }));
    const store = new JsonStateStore(path.join(directory, 'state.json'));
    const now = new Date('2026-08-06T02:00:00.000Z');
    const service = new DiscordImportService({
        store,
        clock: () => now,
        config: { runHour: 9, runMinute: 0, channelName: 'Discord T+1' },
    });
    await service.initialize();

    const queued = service.latestJob();
    assert.equal(queued.id, 't1-2026-08-05');
    assert.equal(queued.status, 'queued');
    await service.claim(queued.id, 'review-worker');
    await service.recordCatalog(queued.id, {
        tags: ['原创', '多路线'],
        observedAt: '2026-08-06T02:01:00.000Z',
    });
    await service.recordPass(queued.id, pass([], [card()]));
    await service.recordPass(queued.id, pass(['原创'], [card()]));
    await service.recordPass(queued.id, pass(['多路线'], [card()]));
    const ready = await service.complete(queued.id);

    assert.equal(ready.status, 'ready');
    assert.equal(service.getManifest(queued.id).cards.length, 1);
    assert.equal((await service.markDelivered(queued.id)).status, 'delivered');

    const reloadedStore = new JsonStateStore(path.join(directory, 'state.json'));
    await reloadedStore.load();
    assert.equal(reloadedStore.read().jobs[0].status, 'delivered');
});

test('passes and completion are rejected until the tag catalog is reported', async (context) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aibar-discord-catalog-'));
    context.after(() => fs.rm(directory, { recursive: true, force: true }));
    const store = new JsonStateStore(path.join(directory, 'state.json'));
    const service = new DiscordImportService({
        store,
        clock: () => new Date('2026-08-06T02:00:00.000Z'),
        config: { runHour: 9, runMinute: 0, channelName: 'Discord T+1' },
    });
    await service.initialize();
    const queued = service.latestJob();
    await service.claim(queued.id, 'review-worker');
    await assert.rejects(service.recordPass(queued.id, pass([], [card()])), /tag catalog/);
    await assert.rejects(service.complete(queued.id), /tag catalog/);
});

test('re-claiming a ready job keeps its manifest deliverable', async (context) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aibar-discord-reclaim-'));
    context.after(() => fs.rm(directory, { recursive: true, force: true }));
    const store = new JsonStateStore(path.join(directory, 'state.json'));
    const service = new DiscordImportService({
        store,
        clock: () => new Date('2026-08-06T02:00:00.000Z'),
        config: { runHour: 9, runMinute: 0, channelName: 'Discord T+1' },
    });
    await service.initialize();
    const queued = service.latestJob();
    await service.claim(queued.id, 'review-worker');
    await service.recordCatalog(queued.id, { tags: ['原创'], observedAt: '2026-08-06T02:01:00.000Z' });
    await service.recordPass(queued.id, pass([], [card()]));
    await service.recordPass(queued.id, pass(['原创'], [card()]));
    await service.complete(queued.id);

    const reclaimed = await service.claim(queued.id, 'review-worker');
    assert.equal(reclaimed.status, 'ready');
    assert.equal(service.getManifest(queued.id).cards.length, 1);
    await assert.rejects(service.claim(queued.id, 'another-worker'), /claimed by review-worker/);
});

test('T+1 jobs cannot target the current or a future natural day', async (context) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aibar-discord-window-'));
    context.after(() => fs.rm(directory, { recursive: true, force: true }));
    const store = new JsonStateStore(path.join(directory, 'state.json'));
    const service = new DiscordImportService({
        store,
        clock: () => new Date('2026-08-06T02:00:00.000Z'),
        config: { runHour: 9, runMinute: 0, channelName: 'Discord T+1' },
    });
    await service.initialize();
    await assert.rejects(service.trigger({ sourceDate: '2026-08-06' }), /completed natural day/);
    await assert.rejects(service.trigger({ sourceDate: '2027-01-01' }), /completed natural day/);
    assert.equal((await service.trigger({ sourceDate: '2026-08-01' })).id, 't1-2026-08-01');
});

test('oversized jobs deliver batch by batch until every manifest is applied', async (context) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aibar-discord-batches-'));
    context.after(() => fs.rm(directory, { recursive: true, force: true }));
    const store = new JsonStateStore(path.join(directory, 'state.json'));
    const service = new DiscordImportService({
        store,
        clock: () => new Date('2026-08-06T02:00:00.000Z'),
        config: { runHour: 9, runMinute: 0, channelName: 'Discord T+1' },
    });
    await service.initialize();
    const queued = service.latestJob();
    await service.claim(queued.id, 'review-worker');
    await service.recordCatalog(queued.id, { tags: [], observedAt: '2026-08-06T02:01:00.000Z' });
    const posts = Array.from({ length: 200 }, (_, index) => ({
        ...card(),
        id: `147861223786${String(9520000 + index)}`,
        threadId: `147861223786${String(9520000 + index)}`,
        sourceUrl: `https://discord.com/channels/1380075940285124724/147861223786${String(9520000 + index)}`,
        reactionCount: index,
    }));
    await service.recordPass(queued.id, pass([], posts.slice(0, 150)));
    await service.recordPass(queued.id, pass([], posts.slice(150)));

    const ready = await service.complete(queued.id);
    assert.equal(ready.status, 'ready');
    assert.equal(ready.batchCount, 1);
    assert.equal(service.getManifest(queued.id).cards.length, 200);

    // 手工放大到两批，验证逐批交接
    const oversized = Array.from({ length: 250 }, (_, index) => ({
        ...card(),
        id: `147861223786${String(9520000 + index)}`,
        threadId: `147861223786${String(9520000 + index)}`,
        sourceUrl: `https://discord.com/channels/1380075940285124724/147861223786${String(9520000 + index)}`,
        reactionCount: index,
    }));
    await service.recordPass(queued.id, pass([], oversized.slice(0, 125)));
    await service.recordPass(queued.id, pass([], oversized.slice(125)));
    const twoBatches = await service.complete(queued.id);
    assert.equal(twoBatches.batchCount, 2);

    assert.equal(service.getManifest(queued.id).cards.length, 200);
    const firstDelivery = await service.markDelivered(queued.id);
    assert.equal(firstDelivery.status, 'ready');
    assert.equal(firstDelivery.deliveredBatches, 1);
    assert.equal(service.getManifest(queued.id).cards.length, 50);
    const secondDelivery = await service.markDelivered(queued.id);
    assert.equal(secondDelivery.status, 'delivered');
});

test('missed schedule days are backfilled after a sleep, capped at seven days', async (context) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aibar-discord-backfill-'));
    context.after(() => fs.rm(directory, { recursive: true, force: true }));
    const store = new JsonStateStore(path.join(directory, 'state.json'));
    let now = new Date('2026-08-06T02:00:00.000Z');
    const service = new DiscordImportService({
        store,
        clock: () => now,
        config: { runHour: 9, runMinute: 0, channelName: 'Discord T+1' },
    });
    // 首次运行只建昨天，不回补历史
    await service.initialize();
    assert.deepEqual(service.listJobs().map(job => job.id), ['t1-2026-08-05']);

    // 休眠 3 天后唤醒：补齐 08-06、08-07、08-08
    now = new Date('2026-08-09T02:00:00.000Z');
    await service.ensureScheduledJobs();
    assert.deepEqual(
        service.listJobs().map(job => job.sourceDate).sort(),
        ['2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08'],
    );

    // 停机超过 7 天：只回补最近 7 天
    now = new Date('2026-08-30T02:00:00.000Z');
    await service.ensureScheduledJobs();
    const dates = service.listJobs().map(job => job.sourceDate).sort();
    assert.deepEqual(dates.slice(-7), [
        '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26',
        '2026-08-27', '2026-08-28', '2026-08-29',
    ]);
    assert.ok(!dates.includes('2026-08-22'));
});

test('an empty covered job cannot produce a handoff manifest', async (context) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aibar-discord-empty-'));
    context.after(() => fs.rm(directory, { recursive: true, force: true }));
    const store = new JsonStateStore(path.join(directory, 'state.json'));
    const service = new DiscordImportService({
        store,
        clock: () => new Date('2026-08-06T02:00:00.000Z'),
        config: { runHour: 9, runMinute: 0, channelName: 'Discord T+1' },
    });
    await service.initialize();
    const queued = service.latestJob();
    await service.recordCatalog(queued.id, { tags: [], observedAt: '2026-08-06T02:01:00.000Z' });
    await service.recordPass(queued.id, pass([], []));
    assert.equal((await service.complete(queued.id)).status, 'empty');
    assert.throws(() => service.getManifest(queued.id), /must not overwrite/);
});
