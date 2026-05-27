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

  const activePersona = computed<Persona | null>(() => {
    return personas.value.find((p) => p.id === activePersonaId.value) || null
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
        simple_ui_personas: personas.value,
        simple_ui_active_persona: activePersonaId.value,
      })
    } catch (e) {
      console.warn('Persist personas failed', e)
    }
  }

  async function load() {
    if (loaded.value) return
    try {
      const stored = await loadAibarSettings<{
        simple_ui_personas?: Persona[]
        simple_ui_active_persona?: string
      }>()
      if (Array.isArray(stored.simple_ui_personas)) {
        personas.value = stored.simple_ui_personas
        activePersonaId.value = stored.simple_ui_active_persona || ''
      }
    } catch (e) {
      console.warn('Load personas failed', e)
    } finally {
      loaded.value = true
    }
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
  }
})
