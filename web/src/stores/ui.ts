import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export interface Toast {
  id: string
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
  duration?: number
}

export type ThemePreference = 'light' | 'dark' | 'system'

const THEME_STORAGE_KEY = 'aibar-theme'
// 顶层惰性访问：Vitest 的 node 环境没有 window/localStorage
const isBrowser = typeof window !== 'undefined'
const systemDark = isBrowser ? window.matchMedia('(prefers-color-scheme: dark)') : null

function readStoredTheme(): ThemePreference {
  if (!isBrowser) return 'system'
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

function applyTheme(preference: ThemePreference) {
  if (!isBrowser || !systemDark) return
  const dark = preference === 'dark' || (preference === 'system' && systemDark.matches)
  document.documentElement.classList.toggle('dark', dark)
}

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<Toast[]>([])
  const sidePanelOpen = ref(false)
  const modelDrawerOpen = ref(false)
  const theme = ref<ThemePreference>(readStoredTheme())

  let toastId = 0

  function addToast(
    message: string,
    type: Toast['type'] = 'info',
    duration = 3000,
  ) {
    const id = String(++toastId)
    toasts.value.push({ id, message, type, duration })
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration)
    }
  }

  function removeToast(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function toggleSidePanel() {
    sidePanelOpen.value = !sidePanelOpen.value
  }

  function toggleModelDrawer() {
    modelDrawerOpen.value = !modelDrawerOpen.value
  }

  function setTheme(preference: ThemePreference) {
    theme.value = preference
  }

  watch(theme, (preference) => {
    if (isBrowser) localStorage.setItem(THEME_STORAGE_KEY, preference)
    applyTheme(preference)
  }, { immediate: true })

  // 跟随系统模式下，系统主题变化时实时翻转
  systemDark?.addEventListener('change', () => {
    if (theme.value === 'system') applyTheme('system')
  })

  return {
    toasts,
    sidePanelOpen,
    modelDrawerOpen,
    theme,
    addToast,
    removeToast,
    toggleSidePanel,
    toggleModelDrawer,
    setTheme,
  }
})
