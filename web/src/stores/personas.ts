import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Persona } from '@/api/types'
import { generateId } from '@/lib/format'
import { loadAibarSettings, saveAibarSettings } from '@/api/settings'

export const usePersonasStore = defineStore('personas', () => {
  const personas = ref<Persona[]>([])
  const activePersonaId = ref('')
  const loaded = ref(false)
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let storeVersion = 0
  let loadPromise: Promise<void> | null = null

  const activePersona = computed<Persona | null>(() => {
    return personas.value.find((p) => p.id === activePersonaId.value) || null
  })

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
      await saveAibarSettings({
        simple_ui_personas: personas.value,
        simple_ui_active_persona: activePersonaId.value,
      })
    } catch (e) {
      if (version === storeVersion) console.warn('Persist personas failed', e)
    }
  }

  async function load() {
    if (loadPromise) return loadPromise
    if (loaded.value) return
    const version = storeVersion
    const promise = (async () => {
      try {
        const stored = await loadAibarSettings<{
          simple_ui_personas?: Persona[]
          simple_ui_active_persona?: string
        }>()
        if (version !== storeVersion) return
        if (Array.isArray(stored.simple_ui_personas)) {
          personas.value = stored.simple_ui_personas
          activePersonaId.value = stored.simple_ui_active_persona || ''
        }
      } catch (e) {
        if (version === storeVersion) console.warn('Load personas failed', e)
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

  function createPersona(): Persona {
    const p: Persona = {
      id: generateId(),
      name: '新 Persona',
      description: '',
    }
    personas.value.push(p)
    schedulePersist()
    return p
  }

  function updatePersona(id: string, updates: Partial<Persona>) {
    const idx = personas.value.findIndex((p) => p.id === id)
    if (idx !== -1) {
      personas.value[idx] = { ...personas.value[idx], ...updates }
      schedulePersist()
    }
  }

  function deletePersona(id: string) {
    personas.value = personas.value.filter((p) => p.id !== id)
    if (activePersonaId.value === id) {
      activePersonaId.value = ''
    }
    schedulePersist()
  }

  function getPersona(id: string): Persona | undefined {
    return personas.value.find((p) => p.id === id)
  }

  function setActive(id: string) {
    activePersonaId.value = id
    schedulePersist()
  }

  function reset() {
    storeVersion += 1
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = null
    loadPromise = null
    personas.value = []
    activePersonaId.value = ''
    loaded.value = false
  }

  return {
    personas,
    activePersonaId,
    activePersona,
    loaded,
    load,
    createPersona,
    updatePersona,
    deletePersona,
    getPersona,
    setActive,
    reset,
  }
})
