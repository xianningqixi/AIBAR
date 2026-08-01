import assert from 'node:assert/strict';
import test from 'node:test';

import { createRetryingUpdateHandler, createUpdatePipeline, processUpdates } from '../src/updatePipeline.js';

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function update(id, userId) {
  return {
    update_id: id,
    message: {
      from: { id: userId },
      chat: { id: userId },
    },
  };
}

test('serializes each user while allowing different users to run concurrently', async () => {
  const firstUserStarted = deferred();
  const releaseFirst = deferred();
  const otherUserFinished = deferred();
  const events = [];
  const settled = [];

  const pipeline = createUpdatePipeline({
    async handle(item) {
      events.push(`start:${item.update_id}`);
      if (item.update_id === 1) {
        firstUserStarted.resolve();
        await releaseFirst.promise;
      }
      events.push(`end:${item.update_id}`);
      if (item.update_id === 3) otherUserFinished.resolve();
    },
    async onSettled(item) {
      settled.push(item.update_id);
    },
  });

  pipeline.enqueue([update(1, 10)]);
  await firstUserStarted.promise;
  pipeline.enqueue([update(2, 10), update(3, 20)]);

  await otherUserFinished.promise;
  assert.deepEqual(events, ['start:1', 'start:3', 'end:3']);
  assert.deepEqual(settled, [], 'a later update must not advance the offset past unfinished work');

  releaseFirst.resolve();
  await pipeline.drain();

  assert.ok(events.indexOf('start:2') > events.indexOf('end:1'));
  assert.deepEqual(settled, [1, 2, 3]);
});

test('does not commit a failed update or run later updates for the same user', async () => {
  const handled = [];
  const failed = [];
  const settled = [];

  await assert.rejects(
    processUpdates([update(10, 10), update(11, 10)], {
      async handle(item) {
        handled.push(item.update_id);
        if (item.update_id === 10) throw new Error('failed');
      },
      async onError(error, item) {
        failed.push([item.update_id, error.message]);
      },
      async onSettled(item) {
        settled.push(item.update_id);
      },
    }),
    /failed/,
  );

  assert.deepEqual(handled, [10]);
  assert.deepEqual(failed, [[10, 'failed']]);
  assert.deepEqual(settled, []);
});

test('can lock different users to the same ST chat while other chats continue', async () => {
  const sharedStarted = deferred();
  const releaseShared = deferred();
  const events = [];
  const pipeline = createUpdatePipeline({
    keys(item) {
      return [`user:${item.message.from.id}`, `st-chat:${item.chatKey}`];
    },
    async handle(item) {
      events.push(`start:${item.update_id}`);
      if (item.update_id === 1) {
        sharedStarted.resolve();
        await releaseShared.promise;
      }
      events.push(`end:${item.update_id}`);
    },
    async onSettled() {},
  });

  pipeline.enqueue([
    { ...update(1, 10), chatKey: 'shared' },
    { ...update(2, 20), chatKey: 'shared' },
    { ...update(3, 30), chatKey: 'other' },
  ]);
  await sharedStarted.promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['start:1', 'start:3', 'end:3']);

  releaseShared.resolve();
  await pipeline.drain();
  assert.ok(events.indexOf('start:2') > events.indexOf('end:1'));
});

test('a poison update is skipped after the retry cap so the offset can advance', async () => {
  const attempts = [];
  const retries = [];
  const gaveUp = [];
  const sleeps = [];
  const processed = [];
  const settled = [];

  const handle = createRetryingUpdateHandler({
    maxAttempts: 3,
    async handle(item) {
      attempts.push(item.update_id);
      throw new Error(`poison:${item.update_id}`);
    },
    async sleep(ms) {
      sleeps.push(ms);
    },
    onRetry(error, item, attempt, delayMs) {
      retries.push([item.update_id, attempt, delayMs]);
    },
    onGiveUp(error, item, attempt) {
      gaveUp.push([item.update_id, error.message, attempt]);
    },
  });

  await processUpdates([update(1, 10), update(2, 10)], {
    handle,
    async onProcessed(item) {
      processed.push(item.update_id);
    },
    async onSettled(item) {
      settled.push(item.update_id);
    },
  });

  assert.deepEqual(attempts, [1, 1, 1, 2, 2, 2], 'each update is retried up to the cap and no further');
  assert.deepEqual(retries, [[1, 1, 1000], [1, 2, 2000], [2, 1, 1000], [2, 2, 2000]]);
  assert.deepEqual(sleeps, [1000, 2000, 1000, 2000], 'retries back off exponentially');
  assert.deepEqual(gaveUp, [[1, 'poison:1', 3], [2, 'poison:2', 3]]);
  assert.deepEqual(processed, [1, 2]);
  assert.deepEqual(settled, [1, 2], 'a skipped update must settle so the Telegram offset can advance');
});

test('a failed give-up notification still lets the poison update settle', async () => {
  const settled = [];

  await processUpdates([update(7, 10)], {
    handle: createRetryingUpdateHandler({
      maxAttempts: 1,
      async handle() {
        throw new Error('poison');
      },
      async sleep() {},
      onGiveUp() {
        throw new Error('sendMessage failed');
      },
    }),
    async onSettled(item) {
      settled.push(item.update_id);
    },
  });

  assert.deepEqual(settled, [7]);
});

test('retrying stops immediately once polling is no longer active', async () => {
  let active = true;
  const attempts = [];

  const handle = createRetryingUpdateHandler({
    maxAttempts: 10,
    isActive: () => active,
    async handle(item) {
      attempts.push(item.update_id);
      active = false;
      throw new Error('shutting down');
    },
    async sleep() {},
    onGiveUp() {
      throw new Error('must not give up while shutting down');
    },
  });

  await assert.rejects(() => handle(update(3, 10)), (error) => error.name === 'AbortError');
  assert.deepEqual(attempts, [3], 'an aborted update stays pending instead of being skipped');
});
