import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { bootCsrf } from '@/api/client'

export const useSessionStore = defineStore('session', () => {
  const csrfToken = ref('')
  const online = ref(false)
  const booted = ref(false)
  let pingTimer: ReturnType<typeof setInterval> | null = null

  const isBooted = computed(() => booted.value)

  async function boot() {
    try {
      csrfToken.value = await bootCsrf()
      online.value = true
      booted.value = true
      startPing()
    } catch (e) {
      console.error('Boot failed:', e)
      online.value = false
      booted.value = true
    }
  }

  function startPing() {
    stopPing()
    pingTimer = setInterval(async () => {
      try {
        await fetch('/api/ping?extend=true', {
          method: 'POST',
          headers: { 'X-CSRF-Token': csrfToken.value },
          credentials: 'same-origin',
        })
        online.value = true
      } catch {
        online.value = false
      }
    }, 5 * 60 * 1000)
  }

  function stopPing() {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  return { csrfToken, online, booted, isBooted, boot, startPing, stopPing }
})
