import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendRuntimeUpdates,
  createEmptyRuntimeState,
  createRuntimeIdentity,
  getRuntimeStateUpdateProgress,
  loadRuntimeState,
  markRuntimeStateUpdateProcessed,
  runtimeStatePath,
  saveRuntimeState,
  setRuntimeStateUpdateProgress,
  settleRuntimeStateUpdate,
} from '../src/runtimeState.js';

test('persists received updates and only commits their continuous prefix', () => {
  const identity = createRuntimeIdentity('123:token', 'telegram-bot');
  const initial = createEmptyRuntimeState(identity);
  const updates = [{ update_id: 10 }, { update_id: 11 }];
  const appended = appendRuntimeUpdates(initial, updates);

  assert.deepEqual(appended.accepted, updates);
  assert.equal(appended.state.offset, 0);
  assert.equal(appended.state.fetchOffset, 12);
  assert.deepEqual(appended.state.pendingUpdates, updates);
  assert.throws(
    () => settleRuntimeStateUpdate(appended.state, updates[1]),
    /无法按连续顺序提交/,
  );

  assert.throws(
    () => settleRuntimeStateUpdate(appended.state, updates[0]),
    /尚未成功处理/,
  );
  const firstProcessed = markRuntimeStateUpdateProcessed(appended.state, updates[0]);
  const firstSettled = settleRuntimeStateUpdate(firstProcessed, updates[0]);
  assert.equal(firstSettled.offset, 11);
  assert.deepEqual(firstSettled.pendingUpdates, [updates[1]]);
  const allSettled = settleRuntimeStateUpdate(
    markRuntimeStateUpdateProcessed(firstSettled, updates[1]),
    updates[1],
  );
  assert.equal(allSettled.offset, 12);
  assert.deepEqual(allSettled.pendingUpdates, []);
});

test('persists generated reply progress until the update is committed', () => {
  const identity = createRuntimeIdentity('123:token', 'telegram-bot');
  const update = { update_id: 22 };
  const pending = appendRuntimeUpdates(createEmptyRuntimeState(identity), [update]).state;
  const withReply = setRuntimeStateUpdateProgress(pending, update, {
    reply: 'cached model response',
    assistantMessageSaved: true,
  });
  assert.deepEqual(getRuntimeStateUpdateProgress(withReply, update), {
    reply: 'cached model response',
    assistantMessageSaved: true,
  });

  const processed = markRuntimeStateUpdateProcessed(withReply, update);
  const settled = settleRuntimeStateUpdate(processed, update);
  assert.deepEqual(getRuntimeStateUpdateProgress(settled, update), {});
});

test('isolates state by bot-token fingerprint and ST handle without persisting the token', (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aibar-telegram-state-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  const rawToken = '123456:super-secret-token';
  const firstIdentity = createRuntimeIdentity(rawToken, 'telegram-one');
  const firstPath = runtimeStatePath(dataDir, firstIdentity);
  const state = loadRuntimeState(firstPath, firstIdentity);
  state.offset = 42;
  state.fetchOffset = 44;
  state.pendingUpdates = [{ update_id: 43, message: { text: 'pending' } }];
  state.sessions['100'] = { characterAvatar: 'first.png' };
  saveRuntimeState(firstPath, state);

  assert.equal(firstPath.includes(rawToken), false);
  assert.equal(fs.readFileSync(firstPath, 'utf8').includes(rawToken), false);
  assert.equal(loadRuntimeState(firstPath, firstIdentity).offset, 42);
  assert.equal(loadRuntimeState(firstPath, firstIdentity).fetchOffset, 44);
  assert.deepEqual(loadRuntimeState(firstPath, firstIdentity).pendingUpdates, state.pendingUpdates);

  const changedToken = createRuntimeIdentity('654321:different-token', 'telegram-one');
  const changedHandle = createRuntimeIdentity(rawToken, 'telegram-two');
  assert.notEqual(runtimeStatePath(dataDir, changedToken), firstPath);
  assert.notEqual(runtimeStatePath(dataDir, changedHandle), firstPath);
  assert.equal(loadRuntimeState(runtimeStatePath(dataDir, changedToken), changedToken).offset, 0);
  assert.deepEqual(loadRuntimeState(runtimeStatePath(dataDir, changedHandle), changedHandle).sessions, {});
});

test('does not migrate the legacy unscoped state file', (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aibar-telegram-legacy-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify({ offset: 999, sessions: { leaked: true } }));

  const identity = createRuntimeIdentity('123:token', 'telegram-bot');
  const scoped = loadRuntimeState(runtimeStatePath(dataDir, identity), identity);
  assert.equal(scoped.offset, 0);
  assert.deepEqual(scoped.sessions, {});
});
