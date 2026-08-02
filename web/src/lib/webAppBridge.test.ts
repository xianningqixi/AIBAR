import { describe, expect, it } from 'vitest'
import {
  WEB_APP_BRIDGE_VERSION,
  isWebAppBridgeRequestId,
  loadWebAppStorage,
  parseWebAppBridgeRequest,
  parseWebAppGenerationRequest,
  parseWebAppStorageKey,
  parseWebAppStorageSet,
  permissionForWebAppMethod,
  saveWebAppStorage,
} from './webAppBridge'

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key) {
      return values.get(key) ?? null
    },
    key(index) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, value)
    },
  }
}

describe('AIBAR web app bridge', () => {
  it('accepts only the versioned bridge request envelope', () => {
    expect(isWebAppBridgeRequestId('request-1')).toBe(true)
    expect(isWebAppBridgeRequestId('x'.repeat(81))).toBe(false)
    expect(parseWebAppBridgeRequest({ type: 'other' })).toBeNull()
    expect(parseWebAppBridgeRequest({
      type: 'aibar.web-app.request',
      version: WEB_APP_BRIDGE_VERSION,
      requestId: 'request-1',
      method: 'bridge.handshake',
      params: {},
    })).toMatchObject({ requestId: 'request-1', method: 'bridge.handshake' })
    expect(() => parseWebAppBridgeRequest({
      type: 'aibar.web-app.request',
      version: WEB_APP_BRIDGE_VERSION,
      requestId: 'request-2',
      method: 'bridge.handshake',
      unexpected: true,
    })).toThrow('不是受支持的字段')
  })

  it('maps every privileged method to its manifest permission', () => {
    expect(permissionForWebAppMethod('bridge.handshake')).toBeNull()
    expect(permissionForWebAppMethod('llm.generate')).toBe('generation')
    expect(permissionForWebAppMethod('llm.cancel')).toBe('generation')
    expect(permissionForWebAppMethod('storage.set')).toBe('storage')
  })

  it('validates generation messages and finite options', () => {
    expect(parseWebAppGenerationRequest({
      messages: [{ role: 'user', content: 'Hello' }],
      options: { temperature: 0.7, maxTokens: 1024, topP: 0.9 },
    })).toMatchObject({ options: { temperature: 0.7, maxTokens: 1024, topP: 0.9 } })
    expect(() => parseWebAppGenerationRequest({
      messages: [{ role: 'user', content: 'Hello' }],
      options: { temperature: Number.NaN },
    })).toThrow('temperature')
    expect(() => parseWebAppGenerationRequest({
      messages: [{ role: 'user', content: 'Hello' }],
      options: { topP: Number.NaN },
    })).toThrow('topP')
  })

  it('round-trips isolated JSON storage and rejects unsafe keys or oversized values', () => {
    const storage = createMemoryStorage()
    const storageKey = 'aibar.web-app.test.thread.v1'
    const snapshot = { version: WEB_APP_BRIDGE_VERSION, values: { progress: { chapter: 3 } } }
    saveWebAppStorage(storage, storageKey, snapshot)
    expect(loadWebAppStorage(storage, storageKey)).toEqual(snapshot)
    expect(parseWebAppStorageKey({ key: 'save.slot-1' })).toBe('save.slot-1')
    expect(() => parseWebAppStorageKey({ key: '__proto__' })).toThrow('存档键')
    expect(() => parseWebAppStorageSet({ key: 'large', value: 'x'.repeat(256 * 1024) })).toThrow('256 KB')
  })
})
