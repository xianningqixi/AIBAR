import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeCoordinator, supervisePolling } from '../src/runtimeLifecycle.js';

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

test('fully drains the old runtime before writing config and reloading', async () => {
  const drained = deferred();
  const events = [];
  const coordinator = createRuntimeCoordinator({
    async stop() {
      events.push('stop:start');
      await drained.promise;
      events.push('stop:end');
    },
    reload() {
      events.push('reload');
    },
    start() {
      events.push('start');
    },
  });

  const operation = coordinator.reconfigure(() => events.push('write'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['stop:start']);

  drained.resolve();
  await operation;
  assert.deepEqual(events, ['stop:start', 'stop:end', 'write', 'reload', 'start']);
});

test('serializes concurrent runtime reconfiguration requests', async () => {
  const events = [];
  let cycle = 0;
  const coordinator = createRuntimeCoordinator({
    async stop() {
      cycle += 1;
      events.push(`stop:${cycle}`);
    },
    reload() {
      events.push(`reload:${cycle}`);
    },
    start() {
      events.push(`start:${cycle}`);
    },
  });

  await Promise.all([
    coordinator.reconfigure(() => events.push('write:1')),
    coordinator.reconfigure(() => events.push('write:2')),
  ]);

  assert.deepEqual(events, [
    'stop:1', 'write:1', 'reload:1', 'start:1',
    'stop:2', 'write:2', 'reload:2', 'start:2',
  ]);
});

test('restarts polling whenever it stops while still desired', async () => {
  const runs = [];
  const restarts = [];
  const sleeps = [];
  let desired = true;

  await supervisePolling({
    isActive: () => desired,
    async run() {
      runs.push(runs.length + 1);
      // 第一次崩溃，第二次静默返回（旧代码就是在这里停摆），第三次收到停止指令。
      if (runs.length === 1) throw new Error('pipeline broke');
      if (runs.length === 3) desired = false;
    },
    async sleep(ms) {
      sleeps.push(ms);
    },
    onRestart(error, delayMs) {
      restarts.push([error?.message ?? null, delayMs]);
    },
  });

  assert.deepEqual(runs, [1, 2, 3], 'polling.desired === true must keep the loop running');
  assert.deepEqual(restarts, [['pipeline broke', 1000], [null, 2000]]);
  assert.deepEqual(sleeps, [1000, 2000], 'restarts back off exponentially');
});

test('does not restart polling after it has been stopped', async () => {
  let runs = 0;
  let restarts = 0;
  let desired = true;

  await supervisePolling({
    isActive: () => desired,
    async run() {
      runs += 1;
      desired = false;
    },
    async sleep() {
      throw new Error('must not wait for a restart after a clean stop');
    },
    onRestart() {
      restarts += 1;
    },
  });

  assert.equal(runs, 1);
  assert.equal(restarts, 0);
});
