import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { generateId } from '@/lib/format'
import { loadAibarSettings, saveAibarSettings } from '@/api/settings'

export interface ModItem {
  id: string
  name: string
  description: string
  content: string
  position: 'system_append' | 'system_prepend' | 'user_suffix'
  enabled: boolean
  builtin?: boolean
}

const BUILTIN_MODS: ModItem[] = [
  {
    id: 'mod-no-explain',
    name: '不要解释',
    description: '禁止模型用 OOC 解释、点评自己的回答。',
    content: '回答时严格保持角色口吻,不要做任何元解释、自我点评或质疑指令。',
    position: 'system_append',
    enabled: false,
    builtin: true,
  },
  {
    id: 'mod-detailed',
    name: '细节增强',
    description: '让模型回答更长、注重场景描写。',
    content: '增加环境、动作、表情、心理活动的细节描写,适度延长回复长度,避免简单一句话回复。',
    position: 'system_append',
    enabled: false,
    builtin: true,
  },
  {
    id: 'mod-chinese',
    name: '强制中文',
    description: '强制使用简体中文回复,除非角色设定要求其他语言。',
    content: '使用简体中文回复,除非角色设定中明确要求其他语言。',
    position: 'system_append',
    enabled: false,
    builtin: true,
  },
]

function cloneBuiltins(): ModItem[] {
  return BUILTIN_MODS.map((m) => ({ ...m }))
}

export const useModsStore = defineStore('mods', () => {
  const mods = ref<ModItem[]>(cloneBuiltins())
  const loaded = ref(false)
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let storeVersion = 0
  let loadPromise: Promise<void> | null = null

  const enabledGlobalMods = computed(() => mods.value.filter((m) => m.enabled))

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
      await saveMods(version)
    } catch (e) {
      if (version === storeVersion) console.warn('Persist mods failed', e)
    }
  }

  async function saveMods(version = storeVersion) {
    if (version !== storeVersion) return
    await saveAibarSettings({ simple_ui_mods: mods.value })
  }

  async function flushPersist() {
    const version = storeVersion
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    await saveMods(version)
  }

  async function load() {
    if (loadPromise) return loadPromise
    if (loaded.value) return
    const version = storeVersion
    const promise = (async () => {
      try {
        const stored = await loadAibarSettings<{ simple_ui_mods?: ModItem[] }>()
        if (version !== storeVersion) return
        if (Array.isArray(stored.simple_ui_mods) && stored.simple_ui_mods.length) {
          const byId = new Map(stored.simple_ui_mods.map((m) => [m.id, m]))
          const merged: ModItem[] = []
          for (const builtin of BUILTIN_MODS) {
            const persisted = byId.get(builtin.id)
            merged.push(persisted ? { ...builtin, ...persisted, builtin: true } : { ...builtin })
            byId.delete(builtin.id)
          }
          for (const extra of byId.values()) merged.push(extra)
          mods.value = merged
        }
      } catch (e) {
        if (version === storeVersion) console.warn('Load mods failed', e)
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

  function createMod(): ModItem {
    const m: ModItem = {
      id: generateId(),
      name: '新 MOD',
      description: '',
      content: '',
      position: 'system_append',
      enabled: false,
    }
    mods.value.push(m)
    schedulePersist()
    return m
  }

  function updateMod(id: string, updates: Partial<ModItem>) {
    const idx = mods.value.findIndex((m) => m.id === id)
    if (idx !== -1) {
      mods.value[idx] = { ...mods.value[idx], ...updates }
      schedulePersist()
    }
  }

  function deleteMod(id: string) {
    const m = mods.value.find((it) => it.id === id)
    if (!m) return
    if (m.builtin) {
      updateMod(id, { enabled: false })
      return
    }
    mods.value = mods.value.filter((it) => it.id !== id)
    schedulePersist()
  }

  function getMod(id: string): ModItem | undefined {
    return mods.value.find((m) => m.id === id)
  }

  function getModsByIds(ids: string[]): ModItem[] {
    return ids.map((id) => mods.value.find((m) => m.id === id)).filter(Boolean) as ModItem[]
  }

  function mergeImportedMod(imported: ModItem, preserveState = false) {
    const normalized: ModItem = {
      ...imported,
      enabled: preserveState ? imported.enabled : false,
      builtin: preserveState ? imported.builtin : false,
    }
    const index = mods.value.findIndex((mod) => mod.id === normalized.id)
    if (index === -1) mods.value.push(normalized)
    else mods.value[index] = normalized
  }

  function reset() {
    storeVersion += 1
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = null
    loadPromise = null
    mods.value = cloneBuiltins()
    loaded.value = false
  }

  return {
    mods,
    loaded,
    enabledGlobalMods,
    load,
    flushPersist,
    createMod,
    updateMod,
    deleteMod,
    getMod,
    getModsByIds,
    mergeImportedMod,
    reset,
  }
})
