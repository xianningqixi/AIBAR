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

export const useImageGenStore = defineStore('imageGen', () => {
  const settings = ref<ImageGenSettings>(normalizeImageSettings({}))
  const loaded = ref(false)
  const generating = ref(false)
  const testing = ref(false)
  const lastAsset = ref<ImageAsset | null>(null)
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  const providerMeta = computed(() => getImageProviderMeta(settings.value.provider))

  async function load() {
    if (loaded.value) return
    try {
      const stored = await loadAibarSettings<{ simple_ui_image_gen?: ImageGenSettings }>()
      settings.value = normalizeImageSettings(stored.simple_ui_image_gen)
    } catch (e) {
      console.warn('Load image generation settings failed', e)
    } finally {
      loaded.value = true
    }
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
      await saveAibarSettings({ simple_ui_image_gen: settings.value })
    } catch (e) {
      console.warn('Persist image generation settings failed', e)
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
    testing.value = true
    try {
      await testImageProvider(settings.value)
    } finally {
      testing.value = false
    }
  }

  async function generateAndSave(
    request: ImageGenerateRequest,
    overrides?: Partial<ImageGenSettings>,
  ): Promise<ImageAsset> {
    generating.value = true
    try {
      const runSettings = overrides
        ? normalizeImageSettings({ ...settings.value, ...overrides })
        : settings.value
      const result = await generateImage(runSettings, request)
      const asset = await saveGeneratedImage(result, request)
      lastAsset.value = asset
      return asset
    } finally {
      generating.value = false
    }
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
  }
})
