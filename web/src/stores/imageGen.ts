import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ImageAsset, ImageGenSettings } from '@/api/types'
import {
  generateImage,
  getImageProviderMeta,
  type ImageGenerateRequest,
  normalizeImageSettings,
  saveGeneratedImage,
  testImageProvider,
} from '@/api/imageGen'
import { loadAibarSettings, saveAibarSettings } from '@/api/settings'
import { notifyPersistFailure } from '@/stores/persistFeedback'

export const useImageGenStore = defineStore('imageGen', () => {
  const settings = ref<ImageGenSettings>(normalizeImageSettings({}))
  const loaded = ref(false)
  const generating = ref(false)
  const testing = ref(false)
  const lastAsset = ref<ImageAsset | null>(null)
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let storeVersion = 0
  let loadPromise: Promise<void> | null = null

  const providerMeta = computed(() => getImageProviderMeta(settings.value.provider))

  async function load() {
    if (loadPromise) return loadPromise
    if (loaded.value) return
    const version = storeVersion
    const promise = (async () => {
      try {
        const stored = await loadAibarSettings<{ simple_ui_image_gen?: ImageGenSettings }>()
        if (version === storeVersion) settings.value = normalizeImageSettings(stored.simple_ui_image_gen)
      } catch (e) {
        if (version === storeVersion) console.warn('Load image generation settings failed', e)
      } finally {
        if (version === storeVersion) {
          loaded.value = true
          loadPromise = null
        }
      }
    })()
    loadPromise = promise
    return promise
  }

  function schedulePersist() {
    if (!loaded.value) return
    if (persistTimer) clearTimeout(persistTimer)
    const version = storeVersion
    persistTimer = setTimeout(() => {
      persistTimer = null
      if (version === storeVersion) void persistNow(version)
    }, 300)
  }

  async function persistNow(version = storeVersion) {
    if (version !== storeVersion) return
    try {
      await saveAibarSettings({ simple_ui_image_gen: settings.value })
    } catch (e) {
      if (version === storeVersion) notifyPersistFailure('绘图设置', e)
    }
  }

  function updateSettings(updates: Partial<ImageGenSettings>) {
    settings.value = normalizeImageSettings({ ...settings.value, ...updates })
    schedulePersist()
  }

  function setProvider(provider: ImageGenSettings['provider']) {
    const meta = getImageProviderMeta(provider)
    updateSettings({
      provider,
      model: meta.defaultModel,
    })
  }

  async function testCurrentProvider() {
    const version = storeVersion
    testing.value = true
    try {
      await testImageProvider(settings.value)
    } finally {
      if (version === storeVersion) testing.value = false
    }
  }

  async function generateAndSave(
    request: ImageGenerateRequest,
    overrides?: Partial<ImageGenSettings>,
  ): Promise<ImageAsset> {
    const version = storeVersion
    generating.value = true
    try {
      const runSettings = overrides
        ? normalizeImageSettings({ ...settings.value, ...overrides })
        : settings.value
      const result = await generateImage(runSettings, request)
      if (version !== storeVersion) {
        throw new DOMException('Account changed before image could be saved', 'AbortError')
      }
      const asset = await saveGeneratedImage(result, request)
      if (version === storeVersion) lastAsset.value = asset
      return asset
    } finally {
      if (version === storeVersion) generating.value = false
    }
  }

  function reset() {
    storeVersion += 1
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = null
    loadPromise = null
    settings.value = normalizeImageSettings({})
    loaded.value = false
    generating.value = false
    testing.value = false
    lastAsset.value = null
  }

  return {
    settings,
    loaded,
    generating,
    testing,
    lastAsset,
    providerMeta,
    load,
    updateSettings,
    setProvider,
    testCurrentProvider,
    generateAndSave,
    reset,
  }
})
