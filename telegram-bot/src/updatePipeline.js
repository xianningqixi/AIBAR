function defaultUpdateKeys(update, index) {
  const userId = update?.message?.from?.id;
  if (userId !== undefined && userId !== null) return [`user:${userId}`];
  const chatId = update?.message?.chat?.id;
  if (chatId !== undefined && chatId !== null) return [`chat:${chatId}`];
  return [`update:${update?.update_id ?? index}`];
}

export const DEFAULT_UPDATE_MAX_ATTEMPTS = 5;

function abortError() {
  return Object.assign(new Error('Telegram polling stopped'), { name: 'AbortError' });
}

/**
 * Wraps an update handler with a bounded exponential-backoff retry.
 * 超过重试上限后放弃这条 update：处理函数正常返回，pipeline 会把它标记为已处理并推进 offset，
 * 避免一条毒消息永远阻塞该用户的队列。
 */
export function createRetryingUpdateHandler({
  handle,
  isActive = () => true,
  sleep,
  onRetry,
  onGiveUp,
  maxAttempts = DEFAULT_UPDATE_MAX_ATTEMPTS,
  initialDelayMs = 1000,
  maxDelayMs = 30_000,
}) {
  const attemptLimit = Math.max(1, Number(maxAttempts) || 1);
  return async function handleUpdateWithRetry(update) {
    let delayMs = initialDelayMs;
    for (let attempt = 1; isActive(); attempt += 1) {
      try {
        await handle(update);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        if (!isActive()) throw abortError();
        if (attempt >= attemptLimit) {
          try {
            await onGiveUp?.(error, update, attempt);
          } catch (giveUpError) {
            // 放弃通知失败不能让这条 update 重新变成待处理状态。
            if (giveUpError?.name === 'AbortError') throw giveUpError;
          }
          return;
        }
        onRetry?.(error, update, attempt, delayMs);
        await sleep(delayMs);
        delayMs = Math.min(delayMs * 2, maxDelayMs);
      }
    }
    throw abortError();
  };
}

export function createUpdatePipeline(handlers) {
  const entries = [];
  const userTails = new Map();
  const pendingTasks = new Set();
  let settleTail = Promise.resolve();
  let pipelineError = null;
  let sequence = 0;

  function rememberError(error) {
    pipelineError ||= error;
  }

  function flushSettledPrefix() {
    const operation = settleTail.then(async () => {
      while (entries[0]?.settled) {
        await handlers.onSettled(entries[0].update);
        entries.shift();
      }
    });
    settleTail = operation.catch(rememberError);
    return operation;
  }

  function schedule(entry) {
    const requestedKeys = handlers.keys?.(entry.update, entry.sequence)
      ?? handlers.key?.(entry.update, entry.sequence)
      ?? defaultUpdateKeys(entry.update, entry.sequence);
    const keys = [...new Set((Array.isArray(requestedKeys) ? requestedKeys : [requestedKeys])
      .map((key) => String(key || '').trim())
      .filter(Boolean))];
    if (!keys.length) keys.push(`update:${entry.sequence}`);
    const previous = [...new Set(keys.map((key) => userTails.get(key)).filter(Boolean))];
    const task = Promise.all(previous).then(async () => {
      try {
        if (!handlers.isProcessed?.(entry.update)) {
          await handlers.handle(entry.update);
          await handlers.onProcessed?.(entry.update);
        }
        entry.settled = true;
        await flushSettledPrefix();
      } catch (error) {
        try {
          await handlers.onError?.(error, entry.update);
        } catch (nestedError) {
          rememberError(nestedError);
        }
        rememberError(error);
        throw error;
      }
    });

    for (const key of keys) userTails.set(key, task);
    pendingTasks.add(task);
    task.then(
      () => {
        pendingTasks.delete(task);
        for (const key of keys) {
          if (userTails.get(key) === task) userTails.delete(key);
        }
      },
      (error) => {
        rememberError(error);
        pendingTasks.delete(task);
        for (const key of keys) {
          if (userTails.get(key) === task) userTails.delete(key);
        }
      },
    );
  }

  function enqueue(updates) {
    if (pipelineError) throw pipelineError;
    for (const update of updates || []) {
      const entry = { update, sequence, settled: false };
      sequence += 1;
      entries.push(entry);
      schedule(entry);
    }
  }

  async function waitForCapacity(limit) {
    const maximum = Math.max(1, Number(limit) || 1);
    while (entries.length >= maximum) {
      if (pipelineError) throw pipelineError;
      if (!pendingTasks.size) await settleTail;
      if (entries.length < maximum) break;
      if (!pendingTasks.size && entries.length >= maximum) {
        throw new Error('Update pipeline cannot advance its settled prefix');
      }
      await Promise.race([...pendingTasks].map((task) => task.catch(() => undefined)));
      if (pipelineError) throw pipelineError;
    }
  }

  async function drain() {
    while (pendingTasks.size) {
      await Promise.allSettled([...pendingTasks]);
    }
    await settleTail;
    if (pipelineError) throw pipelineError;
  }

  return {
    enqueue,
    waitForCapacity,
    drain,
    get pendingCount() {
      return entries.length;
    },
  };
}

export async function processUpdates(updates, handlers) {
  const pipeline = createUpdatePipeline(handlers);
  pipeline.enqueue(updates);
  await pipeline.drain();
}
