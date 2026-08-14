import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ModelProfile, SecretStateMap } from '@/api/types'
import { deleteSharedModel, listSharedModels, saveSharedModel } from '@/api/billing'
import { readSecretState, writeSecret } from '@/api/secrets'
import { loadAibarSettings, saveAibarSettings } from '@/api/settings'
import {
  fallbackSharedModelProviderSources,
  getProviderLabel,
  providerConfigs,
} from '@/lib/providers'
import { generateId } from '@/lib/format'
import { useSessionStore } from './session'
import { notifyPersistFailure } from '@/stores/persistFeedback'

const UNAVAILABLE_PROFILE: ModelProfile = {
  id: '',
  name: '暂无可用模型',
  source: 'custom',
  model: '',
  endpoint: '',
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1,
  presencePenalty: 0,
  frequencyPenalty: 0,
  inputPrice: 0,
  outputPrice: 0,
  enabled: false,
}

export const useModelProfilesStore = defineStore('modelProfiles', () => {
  const profiles = ref<ModelProfile[]>([])
  // 渠道白名单以后端 /models/list 返回为准，静态清单仅在列表加载前兜底，
  // 避免前后端两份手工清单再次漂移。
  const supportedSources = ref<string[]>([...fallbackSharedModelProviderSources])
  const activeProfileId = ref('')
  const secretState = ref<SecretStateMap>({})
  const loadingSecrets = ref(false)
  const loaded = ref(false)
  let loadPromise: Promise<void> | null = null
  let loadVersion = 0
  const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const profileRevisions = new Map<string, number>()
  const deletingProfileIds = new Set<string>()
  interface ProfileSaveRun {
    version: number
    dirty: boolean
    promise: Promise<ModelProfile>
  }
  const saveRuns = new Map<string, ProfileSaveRun>()

  const activeProfile = computed<ModelProfile>(() => (
    profiles.value.find((profile) => profile.id === activeProfileId.value && profile.enabled !== false)
    || profiles.value.find((profile) => profile.enabled !== false)
    || UNAVAILABLE_PROFILE
  ))

  const providerOptions = computed(() => supportedSources.value.map((value) => ({
    value,
    label: getProviderLabel(value),
  })))

  function isSupportedSource(source: string): boolean {
    return supportedSources.value.includes(source)
  }

  function getProfile(id: string): ModelProfile | undefined {
    return profiles.value.find((profile) => profile.id === id)
  }

  function profileRevision(id: string): number {
    return profileRevisions.get(id) || 0
  }

  function bumpProfileRevision(id: string): number {
    const revision = profileRevision(id) + 1
    profileRevisions.set(id, revision)
    const run = saveRuns.get(id)
    if (run) run.dirty = true
    return revision
  }

  function requireAdmin() {
    if (!useSessionStore().isAdmin) throw new Error('只有管理员可以配置共享模型')
  }

  async function persistActive(version = loadVersion) {
    const profileId = activeProfileId.value
    if (version !== loadVersion) return
    await saveAibarSettings({ simple_ui_active_profile: profileId })
  }

  async function load(force = false) {
    if (loadPromise) return loadPromise
    if (loaded.value && !force) return
    const version = loadVersion
    const promise = (async () => {
      try {
        const [remoteModels, settings] = await Promise.all([
          listSharedModels(),
          loadAibarSettings<{ simple_ui_active_profile?: string }>(),
        ])
        if (version !== loadVersion) return
        const remoteProfiles = remoteModels.models
        if (remoteModels.supportedSources.length) {
          supportedSources.value = remoteModels.supportedSources
        }
        profiles.value = remoteProfiles
        profileRevisions.clear()
        for (const profile of remoteProfiles) profileRevisions.set(profile.id, 0)
        const requestedId = String(settings.simple_ui_active_profile || '')
        const selected = profiles.value.find((profile) => (
          profile.id === requestedId && profile.enabled !== false
        )) || profiles.value.find((profile) => profile.enabled !== false)
        activeProfileId.value = selected?.id || ''
        loaded.value = true
        if (requestedId !== activeProfileId.value) await persistActive(version)
      } finally {
        if (version === loadVersion) loadPromise = null
      }
    })()
    loadPromise = promise
    return promise
  }

  async function loadSecrets() {
    const version = loadVersion
    await load()
    if (version !== loadVersion) return
    if (!useSessionStore().isAdmin) {
      secretState.value = {}
      return
    }
    loadingSecrets.value = true
    try {
      const nextSecretState = await readSecretState()
      if (version !== loadVersion) return
      secretState.value = nextSecretState
      profiles.value = profiles.value.map((profile) => {
        if (profile.canManageCredentials === false) return profile
        const provider = providerConfigs[profile.source]
        const secrets = provider ? secretState.value[provider.secretKey] : null
        const apiKeySaved = profile.secretId
          ? Boolean(secrets?.some((item) => item.id === profile.secretId))
          : Boolean(secrets?.some((item) => item.active))
        return { ...profile, apiKeySaved }
      })
    } finally {
      if (version === loadVersion) loadingSecrets.value = false
    }
  }

  function createProfile(source = 'custom'): ModelProfile {
    requireAdmin()
    const safeSource = isSupportedSource(source) ? source : 'custom'
    // 后端新增而前端尚无展示配置的渠道，用 custom 的默认参数兜底。
    const config = providerConfigs[safeSource] || providerConfigs.custom
    const profile: ModelProfile = {
      id: generateId(),
      name: getProviderLabel(safeSource),
      source: safeSource,
      model: config.defaultModel || '',
      endpoint: config.defaultEndpoint || '',
      temperature: 0.7,
      maxTokens: 4096,
      topP: 1,
      presencePenalty: 0,
      frequencyPenalty: 0,
      inputPrice: 0,
      outputPrice: 0,
      enabled: true,
      sortOrder: profiles.value.length,
      canManageCredentials: true,
    }
    profiles.value.push(profile)
    profileRevisions.set(profile.id, 0)
    schedulePersist(profile.id)
    return profile
  }

  function updateProfile(id: string, updates: Partial<ModelProfile>) {
    requireAdmin()
    const index = profiles.value.findIndex((profile) => profile.id === id)
    if (index === -1) return
    if (updates.source && !isSupportedSource(updates.source)) {
      throw new Error('不支持的共享模型渠道')
    }
    const current = profiles.value[index]
    const safeUpdates = { ...updates }
    if (current.canManageCredentials === false) {
      delete safeUpdates.source
      delete safeUpdates.endpoint
      delete safeUpdates.secretId
      delete safeUpdates.apiKeySaved
      delete safeUpdates.canManageCredentials
    }
    profiles.value[index] = { ...current, ...safeUpdates }
    bumpProfileRevision(id)
    schedulePersist(id)
    if (updates.enabled === false && activeProfileId.value === id) {
      activeProfileId.value = profiles.value.find((profile) => (
        profile.id !== id && profile.enabled !== false
      ))?.id || ''
      const version = loadVersion
      void persistActive(version).catch((error) => {
        if (version === loadVersion) notifyPersistFailure('模型选择', error)
      })
    }
  }

  function schedulePersist(id: string) {
    const existing = persistTimers.get(id)
    if (existing) clearTimeout(existing)
    const version = loadVersion
    persistTimers.set(id, setTimeout(() => {
      persistTimers.delete(id)
      if (version !== loadVersion) return
      void saveProfile(id).catch((error) => {
        if (version === loadVersion) notifyPersistFailure('模型配置', error)
      })
    }, 350))
  }

  async function saveProfile(id: string): Promise<ModelProfile> {
    requireAdmin()
    const version = loadVersion
    const timer = persistTimers.get(id)
    if (timer) clearTimeout(timer)
    persistTimers.delete(id)
    const existingRun = saveRuns.get(id)
    if (existingRun?.version === version) {
      existingRun.dirty = true
      return existingRun.promise
    }

    const run: ProfileSaveRun = { version, dirty: false, promise: Promise.resolve(UNAVAILABLE_PROFILE) }
    run.promise = (async () => {
      let lastSaved: ModelProfile | null = null
      do {
        run.dirty = false
        if (version !== loadVersion) throw new Error('账号已切换，模型保存已取消')
        const profile = getProfile(id)
        if (!profile || deletingProfileIds.has(id)) {
          if (lastSaved) return lastSaved
          throw new Error('共享模型不存在')
        }
        if (!isSupportedSource(profile.source)) throw new Error('不支持的共享模型渠道')
        const revision = profileRevision(id)
        const saved = await saveSharedModel({ ...profile })
        lastSaved = saved
        if (version !== loadVersion) throw new Error('账号已切换，模型保存已取消')
        const index = profiles.value.findIndex((item) => item.id === saved.id)
        if (index === -1 || deletingProfileIds.has(id)) return saved
        if (revision !== profileRevision(id)) {
          run.dirty = true
          continue
        }
        profiles.value[index] = { ...profiles.value[index], ...saved }
      } while (run.dirty && version === loadVersion)

      if (!lastSaved) throw new Error('共享模型保存失败')
      return lastSaved
    })().finally(() => {
      if (saveRuns.get(id) === run) saveRuns.delete(id)
    })
    saveRuns.set(id, run)
    return run.promise
  }

  async function deleteProfile(id: string) {
    requireAdmin()
    const version = loadVersion
    const timer = persistTimers.get(id)
    if (timer) clearTimeout(timer)
    persistTimers.delete(id)
    const index = profiles.value.findIndex((profile) => profile.id === id)
    if (index === -1) throw new Error('共享模型不存在')
    const snapshot = { ...profiles.value[index] }
    const wasActive = activeProfileId.value === id
    deletingProfileIds.add(id)
    bumpProfileRevision(id)
    profiles.value.splice(index, 1)
    if (wasActive) {
      activeProfileId.value = profiles.value.find((profile) => profile.enabled !== false)?.id || ''
    }

    try {
      await saveRuns.get(id)?.promise.catch(() => undefined)
      if (version !== loadVersion) return
      await deleteSharedModel(id)
    } catch (error) {
      if (version === loadVersion && !getProfile(id)) {
        profiles.value.splice(Math.min(index, profiles.value.length), 0, snapshot)
        profileRevisions.set(id, profileRevision(id) + 1)
        if (wasActive) activeProfileId.value = id
      }
      throw error
    } finally {
      if (version === loadVersion) deletingProfileIds.delete(id)
    }

    if (version === loadVersion && wasActive) {
      await persistActive(version)
    }
  }

  function setActive(id: string) {
    const profile = getProfile(id)
    if (!profile || profile.enabled === false) return
    activeProfileId.value = id
    const version = loadVersion
    void persistActive(version).catch((error) => {
      if (version === loadVersion) notifyPersistFailure('模型选择', error)
    })
  }

  async function saveApiKey(profileId: string, value: string) {
    requireAdmin()
    const version = loadVersion
    const profile = getProfile(profileId)
    if (!profile || !value.trim()) return
    if (profile.canManageCredentials === false) {
      throw new Error('该共享模型的凭据由其他管理员维护')
    }
    const revision = profileRevision(profileId)
    const provider = providerConfigs[profile.source]
    if (!provider) throw new Error('不支持的模型渠道')
    const result = await writeSecret(provider.secretKey, value.trim(), profile.name || provider.label)
    if (version !== loadVersion) return
    const index = profiles.value.findIndex((item) => item.id === profileId)
    if (index === -1) return
    if (revision !== profileRevision(profileId)) {
      throw new Error('模型配置已变化，请重新保存 API Key')
    }
    profiles.value[index] = { ...profiles.value[index], secretId: result.id, apiKeySaved: true }
    bumpProfileRevision(profileId)
    await saveProfile(profileId)
    if (version !== loadVersion) return
    await loadSecrets()
  }

  function reset() {
    loadVersion += 1
    for (const timer of persistTimers.values()) clearTimeout(timer)
    persistTimers.clear()
    profileRevisions.clear()
    deletingProfileIds.clear()
    saveRuns.clear()
    profiles.value = []
    supportedSources.value = [...fallbackSharedModelProviderSources]
    activeProfileId.value = ''
    secretState.value = {}
    loadingSecrets.value = false
    loaded.value = false
    loadPromise = null
  }

  function hasSavedApiKey(profile: ModelProfile): boolean {
    if (profile.apiKeySaved || profile.secretId) return true
    if (profile.canManageCredentials === false) return false
    const provider = providerConfigs[profile.source]
    const secrets = provider ? secretState.value[provider.secretKey] : null
    return Boolean(secrets?.some((item) => item.active))
  }

  function getProviderSecretLabel(profile: ModelProfile): string {
    if (profile.canManageCredentials === false) return '由其他管理员维护'
    const provider = providerConfigs[profile.source]
    if (!provider) return '未配置'
    const secrets = secretState.value[provider.secretKey]
    const matched = profile.secretId
      ? secrets?.find((item) => item.id === profile.secretId)
      : secrets?.find((item) => item.active)
    return matched ? `${matched.label || provider.label} (${matched.value})` : '未配置'
  }

  return {
    profiles,
    activeProfileId,
    activeProfile,
    secretState,
    loadingSecrets,
    providerOptions,
    supportedSources,
    isSupportedSource,
    loaded,
    load,
    loadSecrets,
    getProfile,
    createProfile,
    updateProfile,
    saveProfile,
    deleteProfile,
    setActive,
    saveApiKey,
    hasSavedApiKey,
    getProviderSecretLabel,
    reset,
  }
})
