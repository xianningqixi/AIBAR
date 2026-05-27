import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Preset } from '@/api/types'
import { generateId } from '@/lib/format'
import { loadAibarSettings, saveAibarSettings } from '@/api/settings'

const DEFAULTS: Preset[] = [
  {
    id: 'preset-creative',
    name: '创意模式',
    temperature: 0.9,
    topP: 0.95,
    maxTokens: 4096,
    presencePenalty: 0.3,
    frequencyPenalty: 0.3,
    systemPrompt: '',
  },
  {
    id: 'preset-precise',
    name: '精确模式',
    temperature: 0.3,
    topP: 0.5,
    maxTokens: 2048,
    presencePenalty: 0,
    frequencyPenalty: 0,
    systemPrompt: '',
  },
  {
    id: 'preset-balanced',
    name: '平衡模式',
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 4096,
    presencePenalty: 0.1,
    frequencyPenalty: 0.1,
    systemPrompt: '',
  },
]

function cloneDefaults(): Preset[] {
  return DEFAULTS.map((p) => ({ ...p }))
}

export const usePresetsStore = defineStore('presets', () => {
  const presets = ref<Preset[]>(cloneDefaults())
  const activePresetId = ref('')
  const loaded = ref(false)
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  const activePreset = computed<Preset | null>(() => {
    return presets.value.find((p) => p.id === activePresetId.value) || null
  })

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
        simple_ui_presets: presets.value,
        simple_ui_active_preset: activePresetId.value,
      })
    } catch (e) {
      console.warn('Persist presets failed', e)
    }
  }

  async function load() {
    if (loaded.value) return
    try {
      const stored = await loadAibarSettings<{
        simple_ui_presets?: Preset[]
        simple_ui_active_preset?: string
      }>()
      if (Array.isArray(stored.simple_ui_presets) && stored.simple_ui_presets.length) {
        presets.value = stored.simple_ui_presets
        activePresetId.value = stored.simple_ui_active_preset || ''
      }
    } catch (e) {
      console.warn('Load presets failed', e)
    } finally {
      loaded.value = true
    }
  }

  function createPreset(): Preset {
    const p: Preset = {
      id: generateId(),
      name: '新预设',
      temperature: 0.7,
      topP: 1,
      maxTokens: 4096,
      presencePenalty: 0,
      frequencyPenalty: 0,
      systemPrompt: '',
    }
    presets.value.push(p)
    schedulePersist()
    return p
  }

  function updatePreset(id: string, updates: Partial<Preset>) {
    const idx = presets.value.findIndex((p) => p.id === id)
    if (idx !== -1) {
      presets.value[idx] = { ...presets.value[idx], ...updates }
      schedulePersist()
    }
  }

  function deletePreset(id: string) {
    presets.value = presets.value.filter((p) => p.id !== id)
    if (activePresetId.value === id) {
      activePresetId.value = ''
    }
    schedulePersist()
  }

  function getPreset(id: string): Preset | undefined {
    return presets.value.find((p) => p.id === id)
  }

  function setActive(id: string) {
    activePresetId.value = id
    schedulePersist()
  }

  return {
    presets,
    activePresetId,
    activePreset,
    loaded,
    load,
    createPreset,
    updatePreset,
    deletePreset,
    getPreset,
    setActive,
  }
})
