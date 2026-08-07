import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import os from 'node:os';

const PHASES = new Set(['sync', 'import']);

function workerPrompt(workspaceDirectory, aibarUrl, jobId, phase) {
    const clientCommand = 'cd discord-import-service && npm run client --';
    const shared = `
在 ${workspaceDirectory} 作为 AIBAR Discord 一次性可见浏览器 Worker 运行。

这是用户在本地控制台明确点击后启动的单次任务，jobId=${jobId}，phase=${phase}。完整遵守 AGENTS.md、docs/local-discord-import-service.md、docs/discord-hot-import-runbook.md、docs/discord-browser-import.md。只使用用户已登录的 Chrome 可见操作；严禁 Discord 私有 API、self-bot 或后台绕过页面授权。

绝不调用 trigger，绝不处理其他 job，绝不轮询或等待未来操作。不要修改仓库。不得读取、复制、输出或保存 Discord/AIBAR 密码、Cookie、token、Authorization 头、localStorage 凭据、资源口令或短期签名 CDN URL。临时 JSON 只能放系统临时目录，且不得包含上述敏感数据。`;

    if (phase === 'sync') {
        return `${shared}

先确认 http://127.0.0.1:4317/health 可用，然后执行 ${clientCommand} get ${jobId}。确认状态为 queued 或 scanning 后，用 ${clientCommand} claim ${jobId} codex-browser，并用 ${clientCommand} heartbeat codex-browser scanning ${jobId} 上报状态。

按任务的 Asia/Shanghai 当日 00:00 至触发时刻窗口，依次扫描纯文字、轻前端·美化、重前端·独立前端三个固定 Discord 栏目。每个栏目动态读取并遍历自己的原生标签按钮，使用 ${clientCommand} catalog ${jobId} <临时JSON路径> 和 ${clientCommand} pass ${jobId} <临时JSON路径> 上报对应 sourceChannelId，按 threadId 去重，并以无标签视图补漏。逐 pass 上报后执行 ${clientCommand} complete ${jobId}，再逐批执行 ${clientCommand} manifest ${jobId} 读取信封，并用每个信封原 batchId 执行 ${clientCommand} delivered ${jobId} <batchId>。不得把 manifest 载入 AIBAR。

任务进入 delivered/waiting-selection 后，执行 ${clientCommand} heartbeat codex-browser waiting-selection ${jobId} 并立即结束本次进程。若结果为 empty，执行 ${clientCommand} heartbeat codex-browser idle 后结束。登录、成人内容确认等必须由用户处理时，使用 ${clientCommand} fail ${jobId} <原因> 记录明确原因后结束。不要等待“发布已选”，该点击会另行启动新的单次 Worker。`;
    }

    return `${shared}

先确认 http://127.0.0.1:4317/health 可用，然后执行 ${clientCommand} get ${jobId}。确认该 job 已持久化 importRequest 后，用 ${clientCommand} workflow ${jobId} importing 更新流程，并用 ${clientCommand} heartbeat codex-browser importing ${jobId} 上报状态。

本次发布目标固定为已部署的 AIBAR 服务器：${aibarUrl}。必须使用这个完整服务器地址；严禁改用 localhost、127.0.0.1、本地 Vite 或本地 SillyTavern。

只处理 importItems 中 pending、failed 或 importing 的已选卡。处理每项前，从 job 卡片读取 id、threadId、sourceChannelId、sourceUrl、title、authorName 和 tags。以 ${aibarUrl} 为基础保留 source=discord，并在 hash 路由查询参数中加入 discordGuildId=1380075940285124724、discordChannelId、discordThreadId、discordCardId、discordSourceUrl、discordTitle、discordAuthorName；每个标签用一个重复的 discordTag 参数。所有值都必须用 URLSearchParams 正确编码，不得拼接未转义文本。

逐项打开 Discord sourceUrl 执行 /下载，按 PNG > JSON > CHARX > BYAF > YAML 的优先级选择卡体文件（版本列表里同时有多种时选优先级最高的最新版）；ZIP/RAR、APK、安装器和普通图片不是卡体。取得短期 CDN URL 后立即打开该项带来源参数的远端 AIBAR URL，确认地址仍是上述服务器，通过唯一的卡体链接入口点击“发布到公共区”。私人角色写入仅是远端 SillyTavern 解析所需的内部暂存，不能算完成。只有页面稳定显示 data-publish-status=published 或 duplicate，并提供对应公共作品入口时，才能用 ${clientCommand} import-item ${jobId} <cardId> imported <已发布到公共区或已关联公共区重复作品> 写回成功，然后立即丢弃短期 CDN URL。没有任何受支持卡体文件、只有压缩包或普通图片时写 skipped；解析或公共发布失败写 failed。

所有请求项进入终态后执行 ${clientCommand} workflow ${jobId} complete，再执行 ${clientCommand} heartbeat codex-browser idle 并立即结束。只有需要用户处理登录、成人内容确认或资源口令时才执行 ${clientCommand} workflow ${jobId} blocked <原因> 和 ${clientCommand} heartbeat codex-browser blocked ${jobId} <原因>，然后结束。不要等待新的请求，不要重试循环。`;
}

function workerError(message, statusCode = 503) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

export class CodexWorkerLauncher extends EventEmitter {
    constructor({ service, workspaceDirectory, aibarUrl, codexCommand, spawnProcess = spawn }) {
        super();
        this.service = service;
        this.workspaceDirectory = workspaceDirectory;
        this.aibarUrl = aibarUrl;
        this.codexCommand = codexCommand;
        this.spawnProcess = spawnProcess;
        this.active = null;
    }

    isBusy() {
        return Boolean(this.active);
    }

    // 心跳 90 秒过期只代表 Worker 没有上报，进程是否仍在运行以此为准。
    status() {
        return {
            busy: Boolean(this.active),
            jobId: this.active?.jobId || '',
            phase: this.active?.phase || '',
        };
    }

    assertAvailable() {
        if (this.active) throw workerError('Worker 正在处理另一项任务，请等待本次运行结束', 409);
    }

    async launch(jobId, phase) {
        if (!PHASES.has(phase)) throw new Error('Unknown worker phase');
        this.assertAvailable();

        const args = [
            'exec',
            '--ephemeral',
            '--color', 'never',
            '--approve-for-me',
            '--cd', this.workspaceDirectory,
            '--add-dir', os.tmpdir(),
            '--config', 'mcp_servers.node_repl.required=true',
            '-',
        ];
        let child;
        try {
            child = this.spawnProcess(this.codexCommand, args, {
                cwd: this.workspaceDirectory,
                env: process.env,
                shell: false,
                stdio: ['pipe', 'ignore', 'ignore'],
                windowsHide: true,
            });
        } catch (error) {
            throw workerError(`无法启动一次性 Worker：${error.message}`);
        }

        this.active = { child, jobId, phase };
        this.service.reportWorker({
            workerId: 'codex-one-shot',
            state: 'starting',
            jobId,
            message: phase === 'sync' ? '正在启动同步 Worker' : '正在启动发布 Worker',
        });
        this.emit('change');

        const started = new Promise((resolve, reject) => {
            let settled = false;
            child.once('spawn', () => {
                if (settled) return;
                settled = true;
                resolve({ jobId, phase });
            });
            child.once('error', (error) => {
                if (this.active?.child === child) this.active = null;
                this.service.clearWorker(jobId);
                this.emit('change');
                if (!settled) {
                    settled = true;
                    reject(workerError(`无法启动一次性 Worker：${error.message}`));
                }
            });
            child.stdin.once('error', (error) => {
                if (this.active?.child !== child) return;
                if (!settled) {
                    settled = true;
                    this.active = null;
                    this.service.clearWorker(jobId);
                    this.emit('change');
                    child.kill('SIGTERM');
                    reject(workerError(`无法写入一次性 Worker 指令：${error.message}`));
                    return;
                }
                child.kill('SIGTERM');
                void this.handleExit(child, jobId, phase, null, `指令写入失败：${error.message}`);
            });
            child.once('exit', (code, signal) => {
                void this.handleExit(child, jobId, phase, code, signal);
            });
        });

        try {
            child.stdin.end(workerPrompt(this.workspaceDirectory, this.aibarUrl, jobId, phase));
        } catch (error) {
            child.stdin.emit('error', error);
        }
        return started;
    }

    async handleExit(child, jobId, phase, code, signal) {
        if (this.active?.child !== child) return;
        this.active = null;
        this.service.clearWorker(jobId);
        try {
            const job = this.service.getJob(jobId);
            if (phase === 'sync' && !['empty', 'delivered', 'failed'].includes(job.status)) {
                await this.service.fail(jobId, `一次性 Worker 未完成同步（${signal || `退出码 ${code}`}）`);
            }
            if (phase === 'import' && job.status === 'delivered'
                && !['complete', 'blocked'].includes(job.workflowStatus)) {
                await this.service.updateWorkflow(jobId, {
                    state: 'blocked',
                    message: `一次性 Worker 未完成发布（${signal || `退出码 ${code}`}）`,
                });
            }
        } catch (error) {
            console.error(`Failed to record one-shot Worker exit for ${jobId}:`, error.message);
        }
        this.emit('change');
    }

    shutdown() {
        this.active?.child.kill('SIGTERM');
    }
}

export { workerPrompt };
