import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ModelProfile, SecretStateMap } from '@/api/types'
import { providerConfigs } from '@/lib/providers'
import { generateId } from '@/lib/format'
import { readSecretState, writeSecret } from '@/api/secrets'
import { loadAibarSettings, saveAibarSettings } from '@/api/settings'

const LEGACY_PROFILES_KEY = 'aibar-model-profiles'
const LEGACY_ACTIVE_KEY = 'aibar-active-profile'
const REMOVED_PROFILE_SOURCES = new Set(['claude'])

function createDefaultProfile(): ModelProfile {
  return {
    id: 'default',
    name: '本地默认',
    source: 'custom',
    model: providerConfigs.custom.defaultModel,
    endpoint: providerConfigs.custom.defaultEndpoint,
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    presencePenalty: 0,
    frequencyPenalty: 0,
  }
}

function readLegacyProfiles(): { profiles: ModelProfile[]; activeId: string } | null {
  try {
    const raw = localStorage.getItem(LEGACY_PROFILES_KEY)
    const active = localStorage.getItem(LEGACY_ACTIVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.length) return null
    return {
      profiles: parsed,
      activeId: active ? JSON.parse(active) || parsed[0].id : parsed[0].id,
    }
  } catch {
    return null
  }
}

function clearLegacy() {
  try {
    localStorage.removeItem(LEGACY_PROFILES_KEY)
    localStorage.removeItem(LEGACY_ACTIVE_KEY)
  } catch {
    /* noop */
  }
}

function removeRetiredProfiles(sourceProfiles: ModelProfile[]): {
  profiles: ModelProfile[]
  changed: boolean
} {
  const profiles = sourceProfiles.filter((profile) => !REMOVED_PROFILE_SOURCES.has(profile.source))
  return {
    profiles,
    changed: profiles.length !== sourceProfiles.length,
  }
}

export const useModelProfilesStore = defineStore('modelProfiles', () => {
  const profiles = ref<ModelProfile[]>([createDefaultProfile()])
  const activeProfileId = ref<string>('default')
  const secretState = ref<SecretStateMap>({})
  const loadingSecrets = ref(false)
  const loaded = ref(false)
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  const activeProfile = computed<ModelProfile>(() => {
    return (
      profiles.value.find((p) => p.id === activeProfileId.value) ||
      profiles.value[0] ||
      createDefaultProfile()
    )
  })

  const providerOptions = computed(() => {
    return Object.entries(providerConfigs).map(([key, config]) => ({
      value: key,
      label: config.label,
    }))
  })

  function getProfile(id: string): ModelProfile | undefined {
    return profiles.value.find((p) => p.id === id)
  }

  function schedulePersist() {
    if (!loaded.value) return
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      void persistNow()
    }, 300)
  }

  async function persistNow() {
    try {
      await saveAibarSettings({
        simple_ui_model_profiles: profiles.value,
        simple_ui_active_profile: activeProfileId.value,
      })
    } catch (e) {
      console.warn('Persist profiles failed', e)
    }
  }

  async function load() {
    if (loaded.value) return
    let shouldPersist = false
    try {
      const stored = await loadAibarSettings<{
        simple_ui_model_profiles?: ModelProfile[]
        simple_ui_active_profile?: string
      }>()
      if (Array.isArray(stored.simple_ui_model_profiles) && stored.simple_ui_model_profiles.length) {
        const normalized = removeRetiredProfiles(stored.simple_ui_model_profiles)
        profiles.value = normalized.profiles.length ? normalized.profiles : [createDefaultProfile()]
        activeProfileId.value = profiles.value.some((profile) => profile.id === stored.simple_ui_active_profile)
          ? stored.simple_ui_active_profile!
          : profiles.value[0]?.id || 'default'
        shouldPersist = normalized.changed || activeProfileId.value !== stored.simple_ui_active_profile
      } else {
        const legacy = readLegacyProfiles()
        if (legacy) {
          const normalized = removeRetiredProfiles(legacy.profiles)
          profiles.value = normalized.profiles.length ? normalized.profiles : [createDefaultProfile()]
          activeProfileId.value = profiles.value.some((profile) => profile.id === legacy.activeId)
            ? legacy.activeId
            : profiles.value[0]?.id || 'default'
          loaded.value = true
          await persistNow()
          clearLegacy()
          return
        }
      }
    } catch (e) {
      console.warn('Load profiles failed', e)
    } finally {
      loaded.value = true
    }
    if (shouldPersist) await persistNow()
  }

  function createProfile(source = 'custom'): ModelProfile {
    const config = providerConfigs[source] || providerConfigs.custom
    const profile: ModelProfile = {
      id: generateId(),
      name: config.label,
      source,
      model: config.defaultModel || '',
      endpoint: config.defaultEndpoint || '',
      temperature: 0.7,
      maxTokens: 4096,
      topP: 1,
      presencePenalty: 0,
      frequencyPenalty: 0,
    }
    profiles.value.push(profile)
    schedulePersist()
    return profile
  }

  function updateProfile(id: string, updates: Partial<ModelProfile>) {
    const idx = profiles.value.findIndex((p) => p.id === id)
    if (idx !== -1) {
      profiles.value[idx] = { ...profiles.value[idx], ...updates }
      schedulePersist()
    }
  }

  function deleteProfile(id: string) {
    profiles.value = profiles.value.filter((p) => p.id !== id)
    if (activeProfileId.value === id) {
      activeProfileId.value = profiles.value[0]?.id || 'default'
    }
    if (profiles.value.length === 0) {
      profiles.value = [createDefaultProfile()]
      activeProfileId.value = 'default'
    }
    schedulePersist()
  }

  function setActive(id: string) {
    if (getProfile(id)) {
      activeProfileId.value = id
      schedulePersist()
    }
  }

  async function loadSecrets() {
    if (!loaded.value) await load()
    loadingSecrets.value = true
    try {
      secretState.value = await readSecretState()
      for (const profile of profiles.value) {
        const provider = providerConfigs[profile.source]
        const secrets = provider ? secretState.value[provider.secretKey] : null
        if (profile.secretId && secrets?.some((item) => item.id === profile.secretId)) {
          updateProfile(profile.id, { apiKeySaved: true })
        } else if (!profile.secretId && secrets?.some((item) => item.active)) {
          updateProfile(profile.id, { apiKeySaved: true })
        }
      }
    } finally {
      loadingSecrets.value = false
    }
  }

  async function saveApiKey(profileId: string, value: string) {
    const profile = getProfile(profileId)
    if (!profile) return
    const provider = providerConfigs[profile.source]
    if (!provider || !value.trim()) return
    const result = await writeSecret(provider.secretKey, value.trim(), profile.name || provider.label)
    updateProfile(profileId, { secretId: result.id, apiKeySaved: true })
    await loadSecrets()
  }

  function hasSavedApiKey(profile: ModelProfile): boolean {
    const provider = providerConfigs[profile.source]
    if (!provider) return false
    if (profile.apiKeySaved || profile.secretId) return true
    const secrets = secretState.value[provider.secretKey]
    return Boolean(secrets?.some((item) => item.active))
  }

  function getProviderSecretLabel(profile: ModelProfile): string {
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
    loaded,
    load,
    getProfile,
    createProfile,
    updateProfile,
    deleteProfile,
    setActive,
    loadSecrets,
    saveApiKey,
    hasSavedApiKey,
    getProviderSecretLabel,
  }
})
