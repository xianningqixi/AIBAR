import crypto from 'node:crypto';

import {
    buildManifests,
    mergePassCards,
    missingCoverage,
    normalizeCatalog,
    normalizeFilters,
    normalizePass,
} from './manifest.js';
import {
    dateKeyInShanghai,
    isAtOrAfterRunTime,
    nextRunAt,
    previousDayKey,
    shiftDateKey,
    sourceWindow,
} from './t1.js';

// 休眠/停机跨天后最多自动回补的天数；更早的历史仍需显式 trigger
const MAX_BACKFILL_DAYS = 7;

const TERMINAL_STATUSES = new Set(['delivered', 'failed']);

function iso(clock) {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error('Clock returned an invalid date');
    return value.toISOString();
}

function jobId(sourceDate, filters) {
    if (!filters.tags.length) return `t1-${sourceDate}`;
    const digest = crypto.createHash('sha256').update(JSON.stringify(filters)).digest('hex').slice(0, 10);
    return `t1-${sourceDate}-${digest}`;
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

// 标签目录是覆盖检查的基准：没有目录时 "unfiltered" 一个 pass 就能通过 complete，
// 会静默漏扫全部标签视图，所以在接受 pass 和 complete 之前强制要求已上报目录。
function assertCatalogReported(job) {
    if (!job.catalogObservedAt) {
        const error = new Error('Report the Discord tag catalog before submitting passes or completing');
        error.statusCode = 409;
        throw error;
    }
}

// 兼容旧状态文件里的单 manifest 字段
function jobManifests(job) {
    if (Array.isArray(job.manifests)) return job.manifests;
    return job.manifest ? [job.manifest] : [];
}

function summary(job) {
    return {
        id: job.id,
        sourceDate: job.sourceDate,
        window: job.window,
        status: job.status,
        filters: job.filters,
        tagCount: job.tagCatalog.length,
        passCount: Object.keys(job.coverage).length,
        cardCount: job.cards.length,
        batchCount: jobManifests(job).length,
        deliveredBatches: job.deliveredBatches || 0,
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
    }

    async initialize() {
        await this.store.load();
        if (isAtOrAfterRunTime(this.clock(), this.config.runHour, this.config.runMinute)) {
            await this.ensureScheduledJobs();
        }
    }

    /**
     * 建单入口（每日调度和启动补建共用）：从最近一个默认任务的次日补到昨天，
     * 覆盖休眠/停机跨天漏掉的日期，最多回补 MAX_BACKFILL_DAYS 天。
     * 首次运行（没有任何默认任务）只建昨天，与历史行为一致。
     */
    async ensureScheduledJobs() {
        const yesterday = previousDayKey(this.clock());
        const scheduledDates = this.store.read().jobs
            .filter(job => !job.filters.tags.length)
            .map(job => job.sourceDate)
            .sort();
        const latest = scheduledDates[scheduledDates.length - 1] || '';
        const targets = [];
        if (!latest) {
            targets.push(yesterday);
        } else {
            let cursor = yesterday;
            for (let day = 0; day < MAX_BACKFILL_DAYS && cursor > latest; day += 1) {
                targets.unshift(cursor);
                cursor = shiftDateKey(cursor, -1);
            }
        }
        const summaries = [];
        for (const sourceDate of targets) {
            summaries.push(await this.trigger({ sourceDate }));
        }
        return summaries;
    }

    async trigger({ sourceDate = previousDayKey(this.clock()), filters = { tags: [], tagMatch: 'any' } } = {}) {
        const normalizedFilters = normalizeFilters(filters);
        const window = sourceWindow(sourceDate);
        // T+1 只处理已经结束的自然日；今天/未来的窗口会让所有帖子都落在窗口外
        if (sourceDate >= dateKeyInShanghai(this.clock())) {
            const error = new Error('sourceDate must be a completed natural day in Asia/Shanghai');
            error.statusCode = 422;
            throw error;
        }
        const id = jobId(sourceDate, normalizedFilters);
        const createdAt = iso(this.clock);
        return this.store.update((state) => {
            const existing = state.jobs.find(job => job.id === id);
            if (existing) return summary(existing);
            const job = {
                id,
                sourceDate,
                window,
                status: 'queued',
                filters: normalizedFilters,
                channelName: this.config.channelName,
                tagCatalog: [],
                coverage: {},
                cards: [],
                manifest: null,
                workerId: '',
                error: '',
                createdAt,
                updatedAt: createdAt,
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
            // 重新 claim 不降级已完成扫描的任务：ready 任务保持可交接，
            // 补扫会经由 recordPass 自然回到 scanning
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
            job.tagCatalog = catalog.tags;
            job.catalogObservedAt = catalog.observedAt;
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
            assertCatalogReported(job);
            const discoveryPass = normalizePass(value, job);
            job.cards = mergePassCards(job.cards, discoveryPass);
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
            assertCatalogReported(job);
            const manifests = buildManifests(job, completedAt);
            job.manifests = manifests;
            job.manifest = null;
            job.deliveredBatches = 0;
            job.status = manifests.length ? 'ready' : 'empty';
            job.error = manifests.length ? '' : 'No posts were found in the T+1 source window';
            job.updatedAt = completedAt;
            return summary(job);
        });
    }

    // 始终返回下一个未交接的批次；worker 每次 delivered 之后重新 GET 即可拿到下一批
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
        const index = Math.min(job.deliveredBatches || 0, manifests.length - 1);
        return structuredClone(manifests[index]);
    }

    async markDelivered(id) {
        const deliveredAt = iso(this.clock);
        return this.store.update((state) => {
            const job = findJob(state, id);
            const manifests = jobManifests(job);
            if (job.status !== 'ready' || !manifests.length) {
                const error = new Error('Only ready jobs can be marked delivered');
                error.statusCode = 409;
                throw error;
            }
            job.deliveredBatches = (job.deliveredBatches || 0) + 1;
            job.updatedAt = deliveredAt;
            if (job.deliveredBatches >= manifests.length) {
                job.status = 'delivered';
                job.deliveredAt = deliveredAt;
            }
            return summary(job);
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

    nextRunAt() {
        return nextRunAt(this.clock(), this.config.runHour, this.config.runMinute);
    }
}

export class T1Scheduler {
    constructor(service) {
        this.service = service;
        this.timer = null;
    }

    start() {
        this.#schedule();
    }

    close() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    #schedule() {
        const runAt = this.service.nextRunAt();
        const delay = Math.max(1, runAt.getTime() - Date.now());
        this.timer = setTimeout(async () => {
            try {
                await this.service.ensureScheduledJobs();
            } catch (error) {
                console.error('Discord import service failed to create the scheduled job:', error);
            } finally {
                this.#schedule();
            }
        }, delay);
        this.timer.unref?.();
    }
}
