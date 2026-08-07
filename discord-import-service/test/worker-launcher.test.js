import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import test from 'node:test';

import { CodexWorkerLauncher, workerPrompt } from '../src/worker-launcher.js';

function fakeChild() {
    const child = new EventEmitter();
    child.input = '';
    child.stdin = new Writable({
        write(chunk, _encoding, callback) {
            child.input += chunk.toString();
            callback();
        },
    });
    child.kill = signal => child.emit('exit', null, signal);
    return child;
}

function fixture(job = { id: 'manual-20260807090000000', status: 'delivered', workflowStatus: 'waiting-selection' }) {
    const calls = { reports: [], clears: [], failures: [], workflows: [], spawns: [] };
    const service = {
        reportWorker(value) {
            calls.reports.push(value);
            return { ...value, online: true };
        },
        clearWorker(jobId) {
            calls.clears.push(jobId);
            return { online: false, state: 'offline' };
        },
        getJob() {
            return job;
        },
        async fail(jobId, message) {
            calls.failures.push({ jobId, message });
        },
        async updateWorkflow(jobId, value) {
            calls.workflows.push({ jobId, ...value });
        },
    };
    let child;
    const launcher = new CodexWorkerLauncher({
        service,
        workspaceDirectory: '/workspace/AIBAR',
        aibarUrl: 'https://aibar.example/aibar/#/hub?source=discord',
        codexCommand: '/Applications/ChatGPT.app/Contents/Resources/codex',
        spawnProcess(command, args, options) {
            child = fakeChild();
            calls.spawns.push({ command, args, options });
            queueMicrotask(() => child.emit('spawn'));
            return child;
        },
    });
    return { launcher, calls, get child() { return child; } };
}

test('the dashboard launcher starts one ephemeral Codex process only after an explicit action', async () => {
    const state = fixture();
    assert.equal(state.launcher.isBusy(), false);
    assert.deepEqual(state.calls.spawns, []);

    await state.launcher.launch('manual-20260807090000000', 'sync');
    assert.equal(state.launcher.isBusy(), true);
    assert.equal(state.calls.spawns.length, 1);
    assert.equal(state.calls.spawns[0].command, '/Applications/ChatGPT.app/Contents/Resources/codex');
    assert.deepEqual(state.calls.spawns[0].args.slice(0, 3), ['exec', '--ephemeral', '--color']);
    assert.equal(state.calls.spawns[0].args.includes('--approve-for-me'), true);
    assert.equal(state.calls.spawns[0].args.includes('--sandbox'), false);
    assert.equal(state.calls.spawns[0].options.stdio[1], 'ignore');
    assert.match(state.child.input, /jobId=manual-20260807090000000/);
    assert.match(state.child.input, /cd discord-import-service && npm run client -- get/);
    assert.match(state.child.input, /不要等待“发布已选”/);
    assert.doesNotMatch(state.child.input, /Authorization:/);
    await assert.rejects(
        state.launcher.launch('manual-20260807090000001', 'sync'),
        /正在处理另一项任务/,
    );

    state.child.emit('exit', 0, null);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.launcher.isBusy(), false);
    assert.deepEqual(state.calls.clears, ['manual-20260807090000000']);
    assert.deepEqual(state.calls.failures, []);
});

test('an incomplete one-shot process leaves a recoverable failure instead of polling forever', async () => {
    const job = { id: 'manual-20260807090000002', status: 'scanning', workflowStatus: '' };
    const state = fixture(job);
    await state.launcher.launch(job.id, 'sync');
    state.child.emit('exit', 1, null);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.calls.failures.length, 1);
    assert.match(state.calls.failures[0].message, /未完成同步/);
});

test('public-publish prompts are one-shot and never wait for future requests', () => {
    const prompt = workerPrompt(
        '/workspace/AIBAR',
        'https://aibar.example/aibar/#/hub?source=discord',
        'manual-20260807090000003',
        'import',
    );
    assert.match(prompt, /只处理 importItems/);
    assert.match(prompt, /不要等待新的请求/);
    assert.match(prompt, /不得读取、复制、输出或保存/);
    assert.match(prompt, /https:\/\/aibar\.example\/aibar\/#\/hub\?source=discord/);
    assert.match(prompt, /严禁改用 localhost、127\.0\.0\.1/);
    assert.match(prompt, /discordChannelId/);
    assert.match(prompt, /data-publish-status=published 或 duplicate/);
    assert.match(prompt, /私人角色写入仅是.*内部暂存，不能算完成/);
});

test('stdin failures reject startup and clear the one-shot worker without an unhandled stream error', async () => {
    const state = fixture();
    state.launcher.spawnProcess = (command, args, options) => {
        const child = fakeChild();
        child.stdin.end = () => child.stdin.emit('error', new Error('closed pipe'));
        state.calls.spawns.push({ command, args, options });
        return child;
    };

    await assert.rejects(
        state.launcher.launch('manual-20260807090000004', 'sync'),
        /无法写入一次性 Worker 指令/,
    );
    assert.equal(state.launcher.isBusy(), false);
    assert.deepEqual(state.calls.clears, ['manual-20260807090000004']);
});
