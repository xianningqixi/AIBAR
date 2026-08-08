import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DISCORD_SOURCES } from '../src/config.js';
import { DiscordImportService } from '../src/service.js';
import { JsonStateStore } from '../src/store.js';

const [TEXT_SOURCE, LIGHT_SOURCE, HEAVY_SOURCE] = DISCORD_SOURCES;
const threadId = '1478612237869519902';
const NOW = new Date('2026-08-06T02:00:00.000Z');

test('the configured manual sync covers exactly the three NSFW male-oriented forums', () => {
    assert.deepEqual(DISCORD_SOURCES, [
        { channelId: '1478601254312874024', channelName: '纯文字' },
        { channelId: '1478601664838766723', channelName: '轻前端·美化' },
        { channelId: '1478612237869519021', channelName: '重前端·独立前端' },
    ]);
});

function pass(tags, posts, sourceChannelId = HEAVY_SOURCE.channelId) {
    return {
        sourceChannelId,
        observedAt: '2026-08-06T02:05:00.000Z',
        view: { tags, tagMatch: 'any', sort: 'recent-activity' },
        posts,
    };
}

function card(overrides = {}) {
    return {
        id: threadId,
        threadId,
        title: 'Service card',
        authorName: 'Author',
        sourceUrl: `https://discord.com/channels/1380075940285124724/${threadId}`,
        tags: ['原创', '多路线'],
        publishedAt: '2026-08-06T01:00:00.000Z',
        reactionCount: 6,
        replyCount: 1,
        resource: { availability: 'browser', kind: 'character-card' },
        ...overrides,
    };
}

async function fixture(context, clock = () => NOW) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aibar-discord-service-'));
    context.after(() => fs.rm(directory, { recursive: true, force: true }));
    const store = new JsonStateStore(path.join(directory, 'state.json'));
    const service = new DiscordImportService({
        store,
        clock,
        config: { channelName: 'NSFW-男性向', sources: DISCORD_SOURCES.map(source => ({ ...source })) },
    });
    await service.initialize();
    return { directory, service, store };
}

async function scanCompleteJob(service, posts = [card()], trigger = {}) {
    const queued = await service.trigger(trigger);
    await service.claim(queued.id, 'browser-worker');
    for (const source of DISCORD_SOURCES) {
        const sourcePosts = source.channelId === HEAVY_SOURCE.channelId ? posts : [];
        await service.recordPass(queued.id, pass([], sourcePosts, source.channelId));
    }
    return { id: queued.id, ready: await service.complete(queued.id) };
}

test('startup creates no job and every local trigger creates an independent hot-top job', async (context) => {
    const { service } = await fixture(context);
    assert.equal(service.latestJob(), null);

    const first = await service.trigger();
    const second = await service.trigger({ limit: 50 });
    assert.notEqual(first.id, second.id);
    assert.match(first.id, /^manual-/);
    assert.equal(first.mode, 'hot-top');
    assert.equal(first.period, 'hot-top');
    assert.equal(first.limit, 100, '默认目标数量是 100');
    assert.equal(second.limit, 50);
    assert.equal(first.sourceCount, 3);
    assert.equal(first.sourceTargetCount, 3);
    assert.equal(first.sourceScopeComplete, true);
    assert.equal(first.localDate, '2026-08-06');
    assert.equal(first.window, null, '热度榜不再有快照窗口');
    assert.equal(first.passTargetCount, 3, '每栏目只要求一个最近活跃视图');
    assert.equal(service.listJobs().length, 2);
    await assert.rejects(service.trigger({ sourceDate: '2026-08-05' }), /not allowed/);
    await assert.rejects(service.trigger({ limit: 5 }), /between 10 and 300/);
    await assert.rejects(service.trigger({ limit: 301 }), /between 10 and 300/);
    await assert.rejects(service.trigger({ limit: 66.6 }), /between 10 and 300/);
});

test('worker heartbeats appear online briefly without being persisted as job data', async (context) => {
    let now = new Date('2026-08-06T02:00:00.000Z');
    const { service } = await fixture(context, () => now);
    assert.equal(service.dashboardSnapshot().worker.online, false);
    assert.deepEqual(service.reportWorker({ workerId: 'codex-heartbeat', state: 'idle' }), {
        workerId: 'codex-heartbeat',
        state: 'idle',
        jobId: '',
        message: '',
        progress: null,
        observedAt: '2026-08-06T02:00:00.000Z',
        online: true,
    });
    // 进度心跳：done 超出 total 时钳到 total，供控制台渲染进度条
    const progressed = service.reportWorker({
        workerId: 'codex-heartbeat',
        state: 'scanning',
        progress: { done: 120, total: 100, label: '纯文字' },
    });
    assert.deepEqual(progressed.progress, { done: 100, total: 100, label: '纯文字' });
    assert.throws(
        () => service.reportWorker({ workerId: 'codex-heartbeat', state: 'idle', progress: { done: -1, total: 10 } }),
        /progress.done is invalid/,
    );
    // 一次性 Worker 的最终 idle 心跳不带 jobId；对应进程退出时仍要立即清掉。
    assert.equal(service.clearWorker('manual-finished-job').online, false);
    service.reportWorker({ workerId: 'codex-one-shot', state: 'starting' });
    now = new Date('2026-08-06T02:01:31.000Z');
    assert.equal(service.workerStatus().online, false);
    assert.equal(service.dashboardSnapshot().jobs.length, 0);
    assert.throws(() => service.reportWorker({ workerId: 'codex-heartbeat', state: 'unknown' }), /state is invalid/);
});

test('the local service persists a completed manual job without contacting AIBAR', async (context) => {
    const { directory, service } = await fixture(context);
    const { id, ready } = await scanCompleteJob(service);

    assert.equal(ready.status, 'ready');
    const batch = service.getManifest(id);
    assert.equal(batch.batchIndex, 0);
    assert.equal(batch.batchCount, 1);
    assert.equal(batch.manifest.period, 'hot-top');
    assert.equal(batch.manifest.cards.length, 1);
    const delivered = await service.markDelivered(id, { batchId: batch.batchId });
    assert.equal(delivered.status, 'delivered');
    assert.equal(delivered.workflowStatus, 'waiting-selection');

    const reloadedStore = new JsonStateStore(path.join(directory, 'state.json'));
    await reloadedStore.load();
    assert.equal(reloadedStore.read().jobs[0].status, 'delivered');
    assert.equal(reloadedStore.read().jobs[0].workflowStatus, 'waiting-selection');
});

test('workflow updates require delivery, validate transitions, and persist terminal completion', async (context) => {
    const { service } = await fixture(context);
    const queued = await service.trigger();
    await assert.rejects(
        service.updateWorkflow(queued.id, { state: 'importing' }),
        /only be updated after manifest delivery/,
    );
    await assert.rejects(
        service.updateWorkflow(queued.id, { state: 'unknown' }),
        /state is invalid/,
    );

    const { id } = await scanCompleteJob(service);
    const batch = service.getManifest(id);
    await service.markDelivered(id, { batchId: batch.batchId });
    await assert.rejects(
        service.updateWorkflow(id, { state: 'importing' }),
        /requires a dashboard import request/,
    );
    const requested = await service.requestImport(id, { cardIds: [threadId] });
    assert.equal(requested.importRequestedCount, 1);
    const importing = await service.updateWorkflow(id, { state: 'importing', message: '正在处理 1 张卡' });
    assert.equal(importing.workflowStatus, 'importing');
    assert.equal(importing.workflowMessage, '正在处理 1 张卡');
    const blocked = await service.updateWorkflow(id, { state: 'blocked', message: '等待资源口令' });
    assert.equal(blocked.workflowStatus, 'blocked');
    assert.equal((await service.updateWorkflow(id, { state: 'importing' })).workflowStatus, 'importing');
    await assert.rejects(
        service.updateWorkflow(id, { state: 'complete' }),
        /before every requested card has a terminal result/,
    );
    const item = await service.updateImportItem(id, {
        cardId: threadId,
        state: 'imported',
        message: '角色卡与故事卡已导入',
    });
    assert.equal(item.item.status, 'imported');
    assert.equal(item.importTerminalCount, 1);
    assert.equal((await service.updateWorkflow(id, { state: 'complete' })).workflowStatus, 'complete');
    assert.equal((await service.updateWorkflow(id, { state: 'complete' })).workflowStatus, 'complete');
    await assert.rejects(
        service.updateWorkflow(id, { state: 'importing' }),
        /cannot transition from complete/,
    );
    assert.equal(service.listJobs().find(job => job.id === id)?.workflowStatus, 'complete');
});

test('a blocked import keeps a resumable request until it is complete', async (context) => {
    const { service } = await fixture(context);
    const { id } = await scanCompleteJob(service);
    assert.throws(() => service.resumeImport(id), /No persisted import request/);
    const batch = service.getManifest(id);
    await service.markDelivered(id, { batchId: batch.batchId });
    assert.throws(() => service.resumeImport(id), /No persisted import request/);

    await service.requestImport(id, { cardIds: [threadId] });
    assert.equal(service.resumeImport(id).importRetryableCount, 1);
    await service.updateWorkflow(id, { state: 'importing' });
    await service.updateImportItem(id, { cardId: threadId, state: 'failed', message: '下载超时' });
    await service.updateWorkflow(id, { state: 'blocked', message: '需要用户处理后重试' });

    const resumable = service.resumeImport(id);
    assert.equal(resumable.workflowStatus, 'blocked');
    assert.equal(resumable.importTerminalCount, 1);
    // failed 是终态但可重试，恢复时仍算剩余项。
    assert.equal(resumable.importRetryableCount, 1);

    await service.updateWorkflow(id, { state: 'importing' });
    await service.updateImportItem(id, { cardId: threadId, state: 'imported' });
    await service.updateWorkflow(id, { state: 'complete' });
    assert.throws(() => service.resumeImport(id), /already complete/);
});

test('dashboard exposes safe ranked cards and persists one validated import request', async (context) => {
    const { service } = await fixture(context);
    const selectable = card({ previewUrl: 'https://cdn.discordapp.com/attachments/1/2/secret.png?ex=short' });
    const unsupportedId = '1478612237869519903';
    const unsupported = card({
        id: unsupportedId,
        threadId: unsupportedId,
        sourceUrl: `https://discord.com/channels/1380075940285124724/${unsupportedId}`,
        resource: { availability: 'unsupported', kind: 'character-card', note: '只有普通预览图' },
    });
    const jsonCardId = '1478612237869519904';
    const jsonCard = card({
        id: jsonCardId,
        threadId: jsonCardId,
        sourceUrl: `https://discord.com/channels/1380075940285124724/${jsonCardId}`,
        resource: { availability: 'browser', kind: 'character-card', fileName: 'card.json' },
    });
    const { id } = await scanCompleteJob(service, [selectable, unsupported, jsonCard]);
    const batch = service.getManifest(id);
    await service.markDelivered(id, { batchId: batch.batchId });

    const snapshot = service.dashboardSnapshot();
    assert.equal(snapshot.cards.length, 3);
    assert.equal(snapshot.cards[0].previewUrl, undefined);
    assert.equal(snapshot.cards.find(item => item.id === unsupportedId).selectable, false);
    // 远端入口已支持全部卡体格式，JSON 卡体可直接勾选发布
    assert.equal(snapshot.cards.find(item => item.id === jsonCardId).selectable, true);
    await assert.rejects(
        service.requestImport(id, { cardIds: [unsupportedId] }),
        /cannot be selected/,
    );
    await assert.rejects(
        service.requestImport(id, { cardIds: [threadId, threadId] }),
        /duplicates/,
    );
    assert.equal((await service.requestImport(id, { cardIds: [threadId] })).importRequestedCount, 1);
    assert.equal((await service.requestImport(id, { cardIds: [threadId] })).importRequestedCount, 1);
    await assert.rejects(
        service.requestImport(id, { cardIds: [unsupportedId] }),
        /already has an import request/,
    );
    await assert.rejects(
        service.updateImportItem(id, { cardId: unsupportedId, state: 'failed' }),
        /not part of the active request/,
    );
});

test('dashboard merges cards from all three sources into one hot-ranked list', async (context) => {
    const { service } = await fixture(context);
    const queued = await service.trigger();
    for (const [index, source] of DISCORD_SOURCES.entries()) {
        const id = `147861223786951991${index}`;
        const sourceCard = card({
            id,
            threadId: id,
            sourceUrl: `https://discord.com/channels/1380075940285124724/${id}`,
            reactionCount: index + 1,
            tags: ['原创'],
        });
        await service.recordPass(queued.id, pass([], [sourceCard], source.channelId));
    }
    await service.complete(queued.id);
    for (let batch = service.getManifest(queued.id);;) {
        const delivered = await service.markDelivered(queued.id, { batchId: batch.batchId });
        if (delivered.status === 'delivered') break;
        batch = service.getManifest(queued.id);
    }

    const snapshot = service.dashboardSnapshot();
    assert.deepEqual(snapshot.cards.map(item => item.sourceName), [
        HEAVY_SOURCE.channelName,
        LIGHT_SOURCE.channelName,
        TEXT_SOURCE.channelName,
    ]);
    assert.deepEqual(snapshot.cards.map(item => item.reactionCount), [3, 2, 1]);
    assert.ok(snapshot.cards.every(item => item.previewUrl === undefined));
});

test('hot-top jobs skip the tag catalog and cap the final list at the requested limit', async (context) => {
    const { service } = await fixture(context);
    // 12 张卡、limit 10：完成时全局按回应数排序只保留前 10
    const posts = Array.from({ length: 12 }, (_, index) => card({
        id: `147861223786${String(9530000 + index)}`,
        threadId: `147861223786${String(9530000 + index)}`,
        sourceUrl: `https://discord.com/channels/1380075940285124724/147861223786${String(9530000 + index)}`,
        reactionCount: index,
    }));
    const { id, ready } = await scanCompleteJob(service, posts, { limit: 10 });
    assert.equal(ready.status, 'ready', '没有 catalog 也能完成热度榜任务');
    const manifest = service.getManifest(id).manifest;
    assert.equal(manifest.cards.length, 10);
    // 回应数最高的排最前，最低的两张被截掉
    assert.equal(manifest.cards[0].reactionCount, 11);
    assert.equal(manifest.cards.at(-1).reactionCount, 2);
});

test('re-claiming a ready job keeps its manifest deliverable', async (context) => {
    const { service } = await fixture(context);
    const { id } = await scanCompleteJob(service);

    const reclaimed = await service.claim(id, 'browser-worker');
    assert.equal(reclaimed.status, 'ready');
    assert.equal(service.getManifest(id).manifest.cards.length, 1);
    await assert.rejects(service.claim(id, 'another-worker'), /claimed by browser-worker/);
});

test('hot-top jobs accept any publish date but require recent-activity sorting', async (context) => {
    const { service } = await fixture(context);
    const queued = await service.trigger();
    // 一年前发布的老热卡也能进榜
    const oldHot = card({ publishedAt: '2025-01-01T00:00:00.000Z', reactionCount: 999 });
    await service.recordPass(queued.id, pass([], [oldHot]));
    // 旧的发帖日期排序视图被拒绝
    await assert.rejects(
        service.recordPass(queued.id, {
            ...pass([], []),
            view: { tags: [], tagMatch: 'any', sort: 'created-at' },
        }),
        /recent-activity sorting/,
    );
});

test('batch delivery acknowledgements are ordered and idempotent', async (context) => {
    const { service } = await fixture(context);
    const queued = await service.trigger({ limit: 300 });
    await service.claim(queued.id, 'browser-worker');
    const posts = Array.from({ length: 250 }, (_, index) => card({
        id: `147861223786${String(9520000 + index)}`,
        threadId: `147861223786${String(9520000 + index)}`,
        sourceUrl: `https://discord.com/channels/1380075940285124724/147861223786${String(9520000 + index)}`,
        reactionCount: index,
    }));
    // 同一栏目分多次 pass 上报是合法的（worker 每 30-50 个帖子上报一批）
    await service.recordPass(queued.id, pass([], posts.slice(0, 125)));
    await service.recordPass(queued.id, pass([], posts.slice(125)));
    for (const source of [TEXT_SOURCE, LIGHT_SOURCE]) {
        await service.recordPass(queued.id, pass([], [], source.channelId));
    }
    const ready = await service.complete(queued.id);
    assert.equal(ready.batchCount, 2);

    const first = service.getManifest(queued.id);
    assert.equal(first.batchIndex, 0);
    assert.equal(first.manifest.cards.length, 200);
    assert.equal((await service.markDelivered(queued.id, { batchId: first.batchId })).deliveredBatches, 1);
    assert.equal((await service.markDelivered(queued.id, { batchId: first.batchId })).deliveredBatches, 1);
    assert.equal((await service.complete(queued.id)).deliveredBatches, 1);
    await assert.rejects(service.recordPass(queued.id, pass([], [])), /delivery has started/);

    const second = service.getManifest(queued.id);
    assert.equal(second.batchIndex, 1);
    assert.equal(second.manifest.cards.length, 50);
    await assert.rejects(service.markDelivered(queued.id, { batchId: '0'.repeat(64) }), /does not belong/);
    assert.equal((await service.markDelivered(queued.id, { batchId: second.batchId })).status, 'delivered');
    assert.equal((await service.markDelivered(queued.id, { batchId: second.batchId })).status, 'delivered');
});

test('an empty fully covered hot-top job cannot produce a handoff manifest', async (context) => {
    const { service } = await fixture(context);
    const queued = await service.trigger();
    for (const source of DISCORD_SOURCES) {
        await service.recordPass(queued.id, pass([], [], source.channelId));
    }
    assert.equal((await service.complete(queued.id)).status, 'empty');
    assert.throws(() => service.getManifest(queued.id), /must not overwrite/);
});

test('old persisted single-source empty jobs remain readable', async (context) => {
    const { service, store } = await fixture(context);
    await store.update((state) => {
        state.jobs.push({
            id: 'manual-legacy-empty',
            mode: 'manual',
            period: 'today',
            localDate: '2026-08-05',
            window: { start: '2026-08-04T16:00:00.000Z', end: '2026-08-05T02:00:00.000Z' },
            status: 'empty',
            filters: { tags: [], tagMatch: 'any' },
            channelName: 'Discord 今日热门角色卡',
            tagCatalog: [],
            coverage: {},
            cards: [],
            manifests: [],
            deliveredBatches: 0,
            importRequest: null,
            importItems: {},
            workerId: '',
            error: 'No posts were found',
            createdAt: '2026-08-05T02:00:00.000Z',
            updatedAt: '2026-08-05T02:00:00.000Z',
        });
    });

    const legacy = service.latestJob();
    assert.equal(legacy.id, 'manual-legacy-empty');
    assert.equal(legacy.status, 'empty');
    assert.equal(legacy.sourceCount, 1);
    assert.equal(legacy.sourceTargetCount, 3);
    assert.equal(legacy.sourceScopeComplete, false);
    assert.deepEqual(service.dashboardSnapshot().cards, []);
});
