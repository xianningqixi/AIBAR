export function createRuntimeCoordinator({ stop, reload, start }) {
  let tail = Promise.resolve();

  function reconfigure(beforeReload) {
    const operation = tail.then(async () => {
      await stop();
      try {
        if (beforeReload) await beforeReload();
        const result = reload();
        start();
        return result;
      } catch (error) {
        start();
        throw error;
      }
    });
    tail = operation.catch(() => undefined);
    return operation;
  }

  return { reconfigure };
}

/**
 * Keeps the polling loop alive for as long as it is desired.
 * 只要 desired 还是 true，轮询循环无论是崩溃还是自行返回都会在退避后重启，
 * 保证 polling.desired === true 时不会出现"静默停摆"。
 */
export async function supervisePolling({
  run,
  isActive,
  sleep,
  onRestart,
  restartDelayMs = 1000,
  maxRestartDelayMs = 30_000,
}) {
  let delayMs = restartDelayMs;
  while (isActive()) {
    let failure = null;
    try {
      await run();
    } catch (error) {
      failure = error || new Error('Telegram polling crashed');
    }
    if (!isActive()) return;
    onRestart?.(failure, delayMs);
    await sleep(delayMs);
    delayMs = Math.min(delayMs * 2, maxRestartDelayMs);
  }
}
