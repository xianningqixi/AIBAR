import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const RUNTIME_STATE_VERSION = 2;

function fingerprint(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export function createRuntimeIdentity(token, stUserHandle) {
  return {
    botTokenFingerprint: fingerprint(String(token || '').trim()),
    stUserHandle: String(stUserHandle || '').trim(),
  };
}

export function runtimeStatePath(dataDir, identity) {
  const handleFingerprint = fingerprint(identity.stUserHandle);
  const fileName = `${identity.botTokenFingerprint}-${handleFingerprint}.json`;
  return path.join(dataDir, 'state', fileName);
}

export function createEmptyRuntimeState(identity) {
  return {
    version: RUNTIME_STATE_VERSION,
    identity: { ...identity },
    offset: 0,
    fetchOffset: 0,
    pendingUpdates: [],
    processedUpdateIds: [],
    updateProgress: {},
    sessions: {},
  };
}

export function telegramUpdateId(update) {
  const id = Number(update?.update_id);
  if (!Number.isSafeInteger(id) || id < 0) throw new Error('Telegram update_id 无效');
  return id;
}

export function appendRuntimeUpdates(currentState, updates) {
  const known = new Set(currentState.pendingUpdates.map((update) => telegramUpdateId(update)));
  const accepted = [];
  for (const update of updates || []) {
    const id = telegramUpdateId(update);
    if (id < currentState.offset || known.has(id)) continue;
    known.add(id);
    accepted.push(update);
  }
  if (!accepted.length) return { state: currentState, accepted };
  return {
    state: {
      ...currentState,
      fetchOffset: Math.max(
        currentState.fetchOffset,
        ...accepted.map((update) => telegramUpdateId(update) + 1),
      ),
      pendingUpdates: [...currentState.pendingUpdates, ...accepted],
    },
    accepted,
  };
}

export function settleRuntimeStateUpdate(currentState, update) {
  const id = telegramUpdateId(update);
  const firstPendingId = currentState.pendingUpdates.length
    ? telegramUpdateId(currentState.pendingUpdates[0])
    : null;
  if (firstPendingId !== id) {
    throw new Error(`Telegram update ${id} 无法按连续顺序提交`);
  }
  if (!currentState.processedUpdateIds.includes(id)) {
    throw new Error(`Telegram update ${id} 尚未成功处理，不能提交`);
  }
  const updateProgress = { ...currentState.updateProgress };
  delete updateProgress[String(id)];
  return {
    ...currentState,
    offset: Math.max(currentState.offset, id + 1),
    fetchOffset: Math.max(currentState.fetchOffset, id + 1),
    pendingUpdates: currentState.pendingUpdates.slice(1),
    processedUpdateIds: currentState.processedUpdateIds.filter((value) => value !== id),
    updateProgress,
  };
}

export function markRuntimeStateUpdateProcessed(currentState, update) {
  const id = telegramUpdateId(update);
  if (!currentState.pendingUpdates.some((item) => telegramUpdateId(item) === id)) {
    throw new Error(`Telegram update ${id} 不在待处理队列中`);
  }
  if (currentState.processedUpdateIds.includes(id)) return currentState;
  return {
    ...currentState,
    processedUpdateIds: [...currentState.processedUpdateIds, id],
  };
}

export function setRuntimeStateUpdateProgress(currentState, update, patch) {
  const id = telegramUpdateId(update);
  if (!currentState.pendingUpdates.some((item) => telegramUpdateId(item) === id)) {
    throw new Error(`Telegram update ${id} 不在待处理队列中`);
  }
  const previous = currentState.updateProgress[String(id)];
  return {
    ...currentState,
    updateProgress: {
      ...currentState.updateProgress,
      [String(id)]: {
        ...(previous && typeof previous === 'object' ? previous : {}),
        ...(patch && typeof patch === 'object' ? patch : {}),
      },
    },
  };
}

export function getRuntimeStateUpdateProgress(currentState, update) {
  const value = currentState.updateProgress?.[String(telegramUpdateId(update))];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasMatchingIdentity(value, identity) {
  return value?.botTokenFingerprint === identity.botTokenFingerprint
    && value?.stUserHandle === identity.stUserHandle;
}

export function loadRuntimeState(filePath, identity) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed?.version !== RUNTIME_STATE_VERSION || !hasMatchingIdentity(parsed.identity, identity)) {
      return createEmptyRuntimeState(identity);
    }
    const offset = Number(parsed.offset);
    const safeOffset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const pendingUpdates = Array.isArray(parsed.pendingUpdates)
      ? parsed.pendingUpdates.filter((update) => (
        update && typeof update === 'object' && !Array.isArray(update)
        && Number.isSafeInteger(Number(update.update_id))
        && Number(update.update_id) >= safeOffset
      )).sort((left, right) => Number(left.update_id) - Number(right.update_id))
      : [];
    const pendingIds = new Set(pendingUpdates.map((update) => telegramUpdateId(update)));
    const processedUpdateIds = Array.isArray(parsed.processedUpdateIds)
      ? [...new Set(parsed.processedUpdateIds
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && pendingIds.has(id)))]
      : [];
    const updateProgress = {};
    if (parsed.updateProgress && typeof parsed.updateProgress === 'object' && !Array.isArray(parsed.updateProgress)) {
      for (const [key, value] of Object.entries(parsed.updateProgress)) {
        const id = Number(key);
        if (pendingIds.has(id) && value && typeof value === 'object' && !Array.isArray(value)) {
          updateProgress[String(id)] = value;
        }
      }
    }
    const minimumFetchOffset = pendingUpdates.reduce(
      (maximum, update) => Math.max(maximum, Number(update.update_id) + 1),
      safeOffset,
    );
    const fetchOffset = Number(parsed.fetchOffset);
    return {
      version: RUNTIME_STATE_VERSION,
      identity: { ...identity },
      offset: safeOffset,
      fetchOffset: Number.isSafeInteger(fetchOffset) && fetchOffset >= minimumFetchOffset
        ? fetchOffset
        : minimumFetchOffset,
      pendingUpdates,
      processedUpdateIds,
      updateProgress,
      sessions: parsed.sessions && typeof parsed.sessions === 'object' && !Array.isArray(parsed.sessions)
        ? parsed.sessions
        : {},
    };
  } catch {
    return createEmptyRuntimeState(identity);
  }
}

export function saveRuntimeState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}
