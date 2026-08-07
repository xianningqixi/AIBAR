import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Toast {
  id: string
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
  duration?: number
}

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<Toast[]>([])
  const sidePanelOpen = ref(false)
  const modelDrawerOpen = ref(false)

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

  return {
    toasts,
    sidePanelOpen,
    modelDrawerOpen,
    addToast,
    removeToast,
    toggleSidePanel,
    toggleModelDrawer,
  }
})
