import crypto from 'node:crypto';

import { DISCORD_CHANNEL_ID, DISCORD_SOURCES } from './config.js';
import {
    CARD_EXTENSIONS,
    buildManifests,
    mergePassCards,
    missingCoverage,
    normalizeCatalog,
    normalizeFilters,
    normalizePass,
} from './manifest.js';
import { dateKeyInShanghai } from './time.js';

const TERMINAL_STATUSES = new Set(['delivered', 'failed']);
const WORKER_STATES = new Set(['starting', 'idle', 'scanning', 'applying', 'waiting-selection', 'importing', 'blocked']);
const WORKFLOW_STATES = new Set(['waiting-selection', 'importing', 'complete', 'blocked']);
const IMPORT_ITEM_STATES = new Set(['pending', 'importing', 'imported', 'failed', 'skipped']);
const TERMINAL_IMPORT_ITEM_STATES = new Set(['imported', 'failed', 'skipped']);
const WORKFLOW_TRANSITIONS = new Map([
    ['waiting-selection', new Set(['waiting-selection', 'importing', 'complete', 'blocked'])],
    ['importing', new Set(['waiting-selection', 'importing', 'complete', 'blocked'])],
    ['blocked', new Set(['waiting-selection', 'importing', 'complete', 'blocked'])],
    ['complete', new Set(['complete'])],
]);
const WORKER_ONLINE_WINDOW_MS = 90_000;

function iso(clock) {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error('Clock returned an invalid date');
    return value.toISOString();
}

function manualJobId(createdAt, jobs) {
    const base = `manual-${createdAt.replace(/\D/g, '')}`;
    const existing = new Set(jobs.map(job => job.id));
    let id = base;
    let suffix = 2;
    while (existing.has(id)) {
        id = `${base}-${suffix}`;
        suffix += 1;
    }
    return id;
}

function manifestBatchId(manifest) {
    return crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

const HOT_TOP_DEFAULT_LIMIT = 100;
const HOT_TOP_MIN_LIMIT = 10;
const HOT_TOP_MAX_LIMIT = 300;

function normalizeTrigger(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('trigger must be an object');
    const allowed = new Set(['filters', 'limit']);
    const unsupported = Object.keys(value).find(key => !allowed.has(key));
    if (unsupported) throw new Error(`trigger.${unsupported} is not allowed`);
    let limit = HOT_TOP_DEFAULT_LIMIT;
    if (value.limit !== undefined) {
        limit = Number(value.limit);
        if (!Number.isInteger(limit) || limit < HOT_TOP_MIN_LIMIT || limit > HOT_TOP_MAX_LIMIT) {
            throw new Error(`trigger.limit must be an integer between ${HOT_TOP_MIN_LIMIT} and ${HOT_TOP_MAX_LIMIT}`);
        }
    }
    return { filters: normalizeFilters(value.filters), limit };
}

function normalizeWorkerHeartbeat(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('heartbeat must be an object');
    const allowed = new Set(['workerId', 'state', 'jobId', 'message', 'progress']);
    const unsupported = Object.keys(value).find(key => !allowed.has(key));
    if (unsupported) throw new Error(`heartbeat.${unsupported} is not allowed`);
    const workerId = String(value.workerId || '').trim();
    const state = String(value.state || '').trim();
    const jobId = String(value.jobId || '').trim();
    const message = String(value.message || '').trim();
    if (!workerId || workerId.length > 120) throw new Error('heartbeat.workerId is required');
    if (!WORKER_STATES.has(state)) throw new Error('heartbeat.state is invalid');
    if (jobId.length > 160) throw new Error('heartbeat.jobId is too long');
    if (message.length > 500) throw new Error('heartbeat.message is too long');
    let progress = null;
    if (value.progress !== undefined && value.progress !== null) {
        if (typeof value.progress !== 'object' || Array.isArray(value.progress)) throw new Error('heartbeat.progress must be an object');
        const progressAllowed = new Set(['done', 'total', 'label']);
        const progressUnsupported = Object.keys(value.progress).find(key => !progressAllowed.has(key));
        if (progressUnsupported) throw new Error(`heartbeat.progress.${progressUnsupported} is not allowed`);
        const done = Number(value.progress.done);
        const total = Number(value.progress.total);
        const label = String(value.progress.label || '').trim();
        if (!Number.isInteger(done) || done < 0 || done > 100000) throw new Error('heartbeat.progress.done is invalid');
        if (!Number.isInteger(total) || total < 1 || total > 100000) throw new Error('heartbeat.progress.total is invalid');
        if (label.length > 120) throw new Error('heartbeat.progress.label is too long');
        progress = { done: Math.min(done, total), total, label };
    }
    return { workerId, state, jobId, message, progress };
}

function normalizeWorkflowUpdate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('workflow must be an object');
    const allowed = new Set(['state', 'message']);
    const unsupported = Object.keys(value).find(key => !allowed.has(key));
    if (unsupported) throw new Error(`workflow.${unsupported} is not allowed`);
    const state = String(value.state || '').trim();
    const message = String(value.message || '').trim();
    if (!WORKFLOW_STATES.has(state)) throw new Error('workflow.state is invalid');
    if (message.length > 500) throw new Error('workflow.message is too long');
    return { state, message };
}

function normalizeImportRequest(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('importRequest must be an object');
    const unsupported = Object.keys(value).find(key => key !== 'cardIds');
    if (unsupported) throw new Error(`importRequest.${unsupported} is not allowed`);
    if (!Array.isArray(value.cardIds) || !value.cardIds.length || value.cardIds.length > 1000) {
        throw new Error('importRequest.cardIds must contain 1 to 1000 items');
    }
    const cardIds = value.cardIds.map((id) => String(id || '').trim());
    if (cardIds.some(id => !/^\d{17,20}$/.test(id))) throw new Error('importRequest.cardIds contains an invalid card id');
    if (new Set(cardIds).size !== cardIds.length) throw new Error('importRequest.cardIds contains duplicates');
    return { cardIds };
}

function normalizeImportItemUpdate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('importItem must be an object');
    const allowed = new Set(['cardId', 'state', 'message']);
    const unsupported = Object.keys(value).find(key => !allowed.has(key));
    if (unsupported) throw new Error(`importItem.${unsupported} is not allowed`);
    const cardId = String(value.cardId || '').trim();
    const state = String(value.state || '').trim();
    const message = String(value.message || '').trim();
    if (!/^\d{17,20}$/.test(cardId)) throw new Error('importItem.cardId is required');
    if (!IMPORT_ITEM_STATES.has(state) || state === 'pending') throw new Error('importItem.state is invalid');
    if (message.length > 500) throw new Error('importItem.message is too long');
    return { cardId, state, message };
}

function findJob(state, id) {
    const job = state.jobs.find(candidate => candidate.id === id);
    if (!job) {
        const error = new Error('Job not found');
        error.statusCode = 404;
        throw error;
    }
    return job;
}

function assertMutable(job) {
    if (TERMINAL_STATUSES.has(job.status)) {
        const error = new Error(`Job is already ${job.status}`);
        error.statusCode = 409;
        throw error;
    }
}

function jobSources(job) {
    if (Array.isArray(job.sources) && job.sources.length) return job.sources;
    return [{
        channelId: job.channelId || DISCORD_CHANNEL_ID,
        channelName: job.channelName || '重前端·独立前端',
    }];
}

function sourceCatalog(job, sourceId) {
    if (Array.isArray(job.sources) && job.sources.length) return job.tagCatalogBySource?.[sourceId] || [];
    return job.tagCatalog || [];
}

function sourceCatalogObservedAt(job, sourceId) {
    if (Array.isArray(job.sources) && job.sources.length) return job.catalogObservedAtBySource?.[sourceId] || '';
    return job.catalogObservedAt || '';
}

function assertCatalogReported(job, onlySourceId = '') {
    const sources = jobSources(job).filter(source => !onlySourceId || source.channelId === onlySourceId);
    if (!sources.length) {
        const error = new Error('Discord source is not part of this job');
        error.statusCode = 409;
        throw error;
    }
    // 热度榜靠卡片自带标签做筛选，不再强制 worker 读取整份标签目录
    if (job.mode === 'hot-top') return;
    const missing = sources.find(source => (
        !sourceCatalogObservedAt(job, source.channelId) || !sourceCatalog(job, source.channelId).length
    ));
    if (missing) {
        const error = new Error('Report a non-empty Discord tag catalog before submitting passes or completing');
        error.statusCode = 409;
        throw error;
    }
}

function assertDeliveryNotStarted(job) {
    if ((job.deliveredBatches || 0) > 0) {
        const error = new Error('A job cannot be rescanned after manifest delivery has started');
        error.statusCode = 409;
        throw error;
    }
}

// 兼容 review 前状态文件里的单 manifest 字段。
function jobManifests(job) {
    if (Array.isArray(job.manifests)) return job.manifests;
    return job.manifest ? [job.manifest] : [];
}

function manifestCards(job) {
    const seen = new Set();
    return jobManifests(job).flatMap(manifest => (manifest.cards || []).map(card => ({
        ...card,
        sourceChannelId: manifest.channelId || job.channelId || DISCORD_CHANNEL_ID,
        sourceName: manifest.channelName || job.channelName || 'Discord 栏目',
    }))).filter((card) => {
        if (seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
    });
}

function selectableCard(card) {
    // 远端 AIBAR 支持全部卡体格式（PNG/JSON/CHARX/BYAF/YAML），与 manifest 契约保持同一集合
    const fileName = String(card.resource?.fileName || '').toLowerCase();
    const extension = fileName.split('.').pop() || '';
    return (card.resource?.kind || 'character-card') === 'character-card'
        && card.resource?.availability !== 'unsupported'
        && (!fileName || CARD_EXTENSIONS.has(extension));
}

function dashboardCards(job) {
    if (!job || !['ready', 'delivered'].includes(job.status)) return [];
    return manifestCards(job)
        .filter(card => (card.resource?.kind || 'character-card') === 'character-card')
        .map((card) => {
            const item = job.importItems?.[card.id];
            return {
                id: card.id,
                title: card.title,
                authorName: card.authorName,
                sourceUrl: card.sourceUrl,
                sourceChannelId: card.sourceChannelId,
                sourceName: card.sourceName,
                tags: card.tags,
                reactionCount: card.reactionCount,
                replyCount: card.replyCount,
                availability: card.resource?.availability || 'browser',
                selectable: selectableCard(card),
                importStatus: item?.status || '',
                importMessage: item?.message || '',
            };
        })
        .sort((left, right) => (
            right.reactionCount - left.reactionCount
            || left.sourceName.localeCompare(right.sourceName)
            || left.id.localeCompare(right.id)
        ));
}

function importProgress(job) {
    const requested = job.importRequest?.cardIds || [];
    const terminal = requested.filter(id => TERMINAL_IMPORT_ITEM_STATES.has(job.importItems?.[id]?.status)).length;
    // failed 虽是终态但允许重试，所以“剩余”按未成功/未跳过统计。
    const retryable = requested.filter(id => !['imported', 'skipped'].includes(job.importItems?.[id]?.status)).length;
    return { requested: requested.length, terminal, retryable };
}

function summary(job) {
    const progress = importProgress(job);
    const sources = jobSources(job);
    const filters = job.filters || { tags: [], tagMatch: 'any' };
    const tagCount = sources.reduce((total, source) => total + sourceCatalog(job, source.channelId).length, 0);
    const scannedSourceCount = sources.filter(source => sourceCatalogObservedAt(job, source.channelId)).length;
    const passTargetCount = job.mode === 'hot-top'
        ? sources.length
        : (filters.tags.length ? sources.length : tagCount + sources.length);
    return {
        id: job.id,
        mode: job.mode || (job.sourceDate ? 'legacy-t1' : 'manual'),
        period: job.period || (job.sourceDate ? 'previous-day' : 'today'),
        limit: job.limit || 0,
        localDate: job.localDate || job.sourceDate || '',
        window: job.window || null,
        status: job.status,
        workflowStatus: job.workflowStatus || (job.status === 'delivered' ? 'complete' : ''),
        workflowMessage: job.workflowMessage || '',
        workflowUpdatedAt: job.workflowUpdatedAt || '',
        filters,
        sourceCount: sources.length,
        sourceTargetCount: DISCORD_SOURCES.length,
        sourceScopeComplete: sources.length === DISCORD_SOURCES.length,
        scannedSourceCount,
        tagCount,
        passCount: Object.keys(job.coverage || {}).length,
        passTargetCount,
        cardCount: (job.cards || []).length,
        batchCount: jobManifests(job).length,
        deliveredBatches: job.deliveredBatches || 0,
        importRequestedCount: progress.requested,
        importTerminalCount: progress.terminal,
        importRetryableCount: progress.retryable,
        missingCoverage: missingCoverage(job),
        workerId: job.workerId || '',
        error: job.error || '',
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
    };
}

export class DiscordImportService {
    constructor({ store, config, clock = () => new Date() }) {
        this.store = store;
        this.config = config;
        this.clock = clock;
        this.workerHeartbeat = null;
    }

    async initialize() {
        await this.store.load();
    }

    async trigger(value = {}) {
        const { filters: normalizedFilters, limit } = normalizeTrigger(value);
        const triggeredAt = iso(this.clock);
        return this.store.update((state) => {
            const id = manualJobId(triggeredAt, state.jobs);
            const job = {
                id,
                mode: 'hot-top',
                period: 'hot-top',
                limit,
                localDate: dateKeyInShanghai(new Date(triggeredAt)),
                triggeredAt,
                window: null,
                status: 'queued',
                workflowStatus: '',
                workflowMessage: '',
                workflowUpdatedAt: '',
                filters: normalizedFilters,
                channelName: this.config.channelName,
                sources: (this.config.sources || DISCORD_SOURCES).map(source => ({ ...source })),
                tagCatalogBySource: {},
                catalogObservedAtBySource: {},
                tagCatalog: [],
                coverage: {},
                cards: [],
                manifests: [],
                manifest: null,
                deliveredBatches: 0,
                deliveredBatchIds: [],
                importRequest: null,
                importItems: {},
                workerId: '',
                error: '',
                createdAt: triggeredAt,
                updatedAt: triggeredAt,
            };
            state.jobs.push(job);
            state.jobs.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
            return summary(job);
        });
    }

    listJobs() {
        return this.store.read().jobs.map(summary);
    }

    latestJob() {
        return this.listJobs()[0] || null;
    }

    dashboardSnapshot() {
        const state = this.store.read();
        const latest = state.jobs[0] || null;
        return {
            mode: 'manual',
            timezone: 'Asia/Shanghai',
            sources: (this.config.sources || DISCORD_SOURCES).map(source => ({ ...source })),
            now: iso(this.clock),
            worker: this.workerStatus(),
            latestJob: latest ? summary(latest) : null,
            cards: dashboardCards(latest),
            jobs: state.jobs.slice(0, 12).map(summary),
        };
    }

    workerStatus() {
        if (!this.workerHeartbeat) {
            return { online: false, state: 'offline', workerId: '', jobId: '', message: '', progress: null, observedAt: '' };
        }
        const now = this.clock();
        if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Clock returned an invalid date');
        return {
            ...this.workerHeartbeat,
            online: now.getTime() - Date.parse(this.workerHeartbeat.observedAt) <= WORKER_ONLINE_WINDOW_MS,
        };
    }

    reportWorker(value) {
        const heartbeat = normalizeWorkerHeartbeat(value);
        if (heartbeat.jobId) findJob(this.store.read(), heartbeat.jobId);
        this.workerHeartbeat = { ...heartbeat, observedAt: iso(this.clock) };
        return this.workerStatus();
    }

    clearWorker(jobId = '') {
        if (!jobId || !this.workerHeartbeat?.jobId || this.workerHeartbeat.jobId === jobId) {
            this.workerHeartbeat = null;
        }
        return this.workerStatus();
    }

    getJob(id) {
        return findJob(this.store.read(), id);
    }

    async claim(id, workerId) {
        const normalizedWorkerId = String(workerId || '').trim();
        if (!normalizedWorkerId || normalizedWorkerId.length > 120) throw new Error('workerId is required');
        const updatedAt = iso(this.clock);
        return this.store.update((state) => {
            const job = findJob(state, id);
            assertMutable(job);
            if (job.workerId && job.workerId !== normalizedWorkerId) {
                const error = new Error(`Job is claimed by ${job.workerId}`);
                error.statusCode = 409;
                throw error;
            }
            job.workerId = normalizedWorkerId;
            if (job.status === 'queued') job.status = 'scanning';
            job.updatedAt = updatedAt;
            return summary(job);
        });
    }

    async recordCatalog(id, value) {
        const catalog = normalizeCatalog(value);
        const updatedAt = iso(this.clock);
        return this.store.update((state) => {
            const job = findJob(state, id);
            assertMutable(job);
            assertDeliveryNotStarted(job);
            const source = jobSources(job).find(candidate => candidate.channelId === catalog.sourceChannelId);
            if (!source) throw new Error('catalog.sourceChannelId is not part of this job');
            if (Array.isArray(job.sources) && job.sources.length) {
                job.tagCatalogBySource ||= {};
                job.catalogObservedAtBySource ||= {};
                job.tagCatalogBySource[catalog.sourceChannelId] = catalog.tags;
                job.catalogObservedAtBySource[catalog.sourceChannelId] = catalog.observedAt;
            } else {
                job.tagCatalog = catalog.tags;
                job.catalogObservedAt = catalog.observedAt;
            }
            job.status = 'scanning';
            job.updatedAt = updatedAt;
            return summary(job);
        });
    }

    async recordPass(id, value) {
        const updatedAt = iso(this.clock);
        return this.store.update((state) => {
            const job = findJob(state, id);
            assertMutable(job);
            assertDeliveryNotStarted(job);
            assertCatalogReported(job, value?.sourceChannelId);
            const discoveryPass = normalizePass(value, job);
            job.cards = mergePassCards(job.cards || [], discoveryPass);
            job.coverage ||= {};
            job.coverage[discoveryPass.signature] = {
                observedAt: discoveryPass.observedAt,
                postCount: discoveryPass.posts.length,
                view: discoveryPass.view,
            };
            job.status = 'scanning';
            job.error = '';
            job.updatedAt = updatedAt;
            return summary(job);
        });
    }

    async complete(id) {
        const completedAt = iso(this.clock);
        return this.store.update((state) => {
            const job = findJob(state, id);
            assertMutable(job);
            if (job.status === 'ready' || job.status === 'empty') return summary(job);
            assertDeliveryNotStarted(job);
            assertCatalogReported(job);
            const manifests = buildManifests(job, job.triggeredAt || completedAt);
            job.manifests = manifests;
            job.manifest = null;
            job.deliveredBatches = 0;
            job.deliveredBatchIds = [];
            job.status = manifests.length ? 'ready' : 'empty';
            job.error = manifests.length ? '' : 'No posts were found in the manual snapshot window';
            job.updatedAt = completedAt;
            return summary(job);
        });
    }

    getManifest(id) {
        const job = this.getJob(id);
        const manifests = jobManifests(job);
        if (job.status !== 'ready' || !manifests.length) {
            const error = new Error(job.status === 'empty'
                ? 'Empty jobs must not overwrite the current AIBAR batch'
                : 'Manifest is not ready');
            error.statusCode = 409;
            throw error;
        }
        const batchIndex = job.deliveredBatches || 0;
        if (batchIndex >= manifests.length) throw new Error('Manifest delivery state is invalid');
        const manifest = manifests[batchIndex];
        return {
            batchId: manifestBatchId(manifest),
            batchIndex,
            batchCount: manifests.length,
            manifest: structuredClone(manifest),
        };
    }

    async markDelivered(id, value) {
        const requestedBatchId = String(value?.batchId || '').trim();
        if (!/^[a-f0-9]{64}$/.test(requestedBatchId)) throw new Error('batchId is required');
        const deliveredAt = iso(this.clock);
        return this.store.update((state) => {
            const job = findJob(state, id);
            const manifests = jobManifests(job);
            const batchIds = manifests.map(manifestBatchId);
            const requestedIndex = batchIds.indexOf(requestedBatchId);
            if (requestedIndex < 0) {
                const error = new Error('batchId does not belong to this job');
                error.statusCode = 409;
                throw error;
            }
            const deliveredBatches = job.deliveredBatches || 0;
            if (requestedIndex < deliveredBatches) return summary(job);
            if (job.status !== 'ready' || !manifests.length) {
                const error = new Error('Only ready jobs can be marked delivered');
                error.statusCode = 409;
                throw error;
            }
            if (requestedIndex !== deliveredBatches) {
                const error = new Error('Only the current manifest batch can be marked delivered');
                error.statusCode = 409;
                throw error;
            }
            job.deliveredBatches = deliveredBatches + 1;
            job.deliveredBatchIds = batchIds.slice(0, job.deliveredBatches);
            job.updatedAt = deliveredAt;
            if (job.deliveredBatches >= manifests.length) {
                job.status = 'delivered';
                job.deliveredAt = deliveredAt;
                job.workflowStatus = 'waiting-selection';
                job.workflowMessage = '';
                job.workflowUpdatedAt = deliveredAt;
            }
            return summary(job);
        });
    }

    async updateWorkflow(id, value) {
        const workflow = normalizeWorkflowUpdate(value);
        const updatedAt = iso(this.clock);
        return this.store.update((state) => {
            const job = findJob(state, id);
            if (job.status !== 'delivered') {
                const error = new Error('Workflow can only be updated after manifest delivery');
                error.statusCode = 409;
                throw error;
            }
            const current = job.workflowStatus || 'complete';
            if (!WORKFLOW_TRANSITIONS.get(current)?.has(workflow.state)) {
                const error = new Error(`Workflow cannot transition from ${current} to ${workflow.state}`);
                error.statusCode = 409;
                throw error;
            }
            if (workflow.state === 'importing' && !job.importRequest?.cardIds?.length) {
                const error = new Error('Importing requires a dashboard import request');
                error.statusCode = 409;
                throw error;
            }
            if (workflow.state === 'complete') {
                const progress = importProgress(job);
                if (!progress.requested || progress.terminal !== progress.requested) {
                    const error = new Error('Workflow cannot complete before every requested card has a terminal result');
                    error.statusCode = 409;
                    throw error;
                }
            }
            job.workflowStatus = workflow.state;
            job.workflowMessage = workflow.message;
            job.workflowUpdatedAt = updatedAt;
            job.updatedAt = updatedAt;
            return summary(job);
        });
    }

    async requestImport(id, value) {
        const request = normalizeImportRequest(value);
        const requestedAt = iso(this.clock);
        return this.store.update((state) => {
            const job = findJob(state, id);
            if (job.status !== 'delivered' || !['waiting-selection', 'blocked'].includes(job.workflowStatus)) {
                const error = new Error('Cards can only be selected after the hot list is ready');
                error.statusCode = 409;
                throw error;
            }
            const existing = job.importRequest?.cardIds || [];
            if (existing.length) {
                if (existing.length === request.cardIds.length && existing.every((cardId, index) => cardId === request.cardIds[index])) {
                    return summary(job);
                }
                const error = new Error('This job already has an import request');
                error.statusCode = 409;
                throw error;
            }
            const cardById = new Map(manifestCards(job).map(card => [card.id, card]));
            for (const cardId of request.cardIds) {
                const card = cardById.get(cardId);
                if (!card || !selectableCard(card)) {
                    const error = new Error(`Card ${cardId} cannot be selected for import`);
                    error.statusCode = 422;
                    throw error;
                }
            }
            job.importRequest = { cardIds: request.cardIds, requestedAt };
            job.importItems = Object.fromEntries(request.cardIds.map(cardId => [cardId, {
                status: 'pending',
                message: '',
                updatedAt: requestedAt,
            }]));
            job.workflowMessage = `已请求发布 ${request.cardIds.length} 项，等待 Worker`;
            job.workflowUpdatedAt = requestedAt;
            job.updatedAt = requestedAt;
            return summary(job);
        });
    }

    // “继续发布”只校验已持久化请求仍可恢复，不改任务状态；由 HTTP 层再启动一次性发布 Worker。
    resumeImport(id) {
        const job = findJob(this.store.read(), id);
        if (job.status !== 'delivered' || !job.importRequest?.cardIds?.length) {
            const error = new Error('No persisted import request to resume');
            error.statusCode = 409;
            throw error;
        }
        if (job.workflowStatus === 'complete') {
            const error = new Error('Import is already complete');
            error.statusCode = 409;
            throw error;
        }
        return summary(job);
    }

    async updateImportItem(id, value) {
        const update = normalizeImportItemUpdate(value);
        const updatedAt = iso(this.clock);
        return this.store.update((state) => {
            const job = findJob(state, id);
            const item = job.importItems?.[update.cardId];
            if (job.status !== 'delivered' || !item || !job.importRequest?.cardIds?.includes(update.cardId)) {
                const error = new Error('Import item is not part of the active request');
                error.statusCode = 409;
                throw error;
            }
            if (TERMINAL_IMPORT_ITEM_STATES.has(item.status) && item.status !== 'failed' && item.status !== update.state) {
                const error = new Error(`Import item cannot transition from ${item.status} to ${update.state}`);
                error.statusCode = 409;
                throw error;
            }
            item.status = update.state;
            item.message = update.message;
            item.updatedAt = updatedAt;
            job.updatedAt = updatedAt;
            return { ...summary(job), item: { cardId: update.cardId, ...item } };
        });
    }

    async fail(id, message) {
        const errorMessage = String(message || '').trim().slice(0, 1000);
        if (!errorMessage) throw new Error('error is required');
        const failedAt = iso(this.clock);
        return this.store.update((state) => {
            const job = findJob(state, id);
            if (job.status === 'delivered') {
                const error = new Error('Delivered jobs cannot be failed');
                error.statusCode = 409;
                throw error;
            }
            job.status = 'failed';
            job.error = errorMessage;
            job.updatedAt = failedAt;
            return summary(job);
        });
    }
}
