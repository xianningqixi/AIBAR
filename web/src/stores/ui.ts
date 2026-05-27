import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'

export interface Toast {
  id: string
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
  duration?: number
}

export const useUiStore = defineStore('ui', () => {
  const theme = useLocalStorage<'dark' | 'light'>('aibar-theme', 'dark')
  const toasts = ref<Toast[]>([])
  const sidePanelOpen = ref(false)
  const modelDrawerOpen = ref(false)

  const isDark = computed(() => theme.value === 'dark')

  let toastId = 0

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    applyTheme()
  }

  function applyTheme() {
    document.documentElement.classList.toggle('dark', theme.value === 'dark')
    document.documentElement.classList.toggle('light', theme.value === 'light')
  }

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

  return {
    theme,
    toasts,
    sidePanelOpen,
    modelDrawerOpen,
    isDark,
    toggleTheme,
    applyTheme,
    addToast,
    removeToast,
    toggleSidePanel,
    toggleModelDrawer,
  }
})
