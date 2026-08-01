import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ApiError, bootCsrf, resetCsrfToken } from '@/api/client'
import {
  getCurrentUser,
  loginUser,
  logoutUser,
  type SessionUser,
} from '@/api/auth'
import { invalidateSettingsCache } from '@/api/settings'
import { clearStoredTelegramBotAdminToken } from '@/lib/accountStorage'

export const useSessionStore = defineStore('session', () => {
  const csrfToken = ref('')
  const online = ref(false)
  const booted = ref(false)
  const user = ref<SessionUser | null>(null)
  const sessionEpoch = ref(0)
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let pingRequestId = 0

  const isBooted = computed(() => booted.value)
  const authenticated = computed(() => Boolean(user.value))
  const isAdmin = computed(() => Boolean(user.value?.admin))

  function beginSessionOperation() {
    sessionEpoch.value += 1
    stopPing()
    return sessionEpoch.value
  }

  function isCurrentSession(epoch: number) {
    return epoch === sessionEpoch.value
  }

  function clearAuthenticatedState(previousHandle: string) {
    if (previousHandle) clearStoredTelegramBotAdminToken(previousHandle)
    user.value = null
    invalidateSettingsCache()
    resetCsrfToken()
    csrfToken.value = ''
    stopPing()
  }

  async function refreshUserForEpoch(epoch: number) {
    const previousHandle = user.value?.handle || ''
    try {
      const nextUser = await getCurrentUser()
      if (!isCurrentSession(epoch)) return
      user.value = nextUser
      online.value = true
    } catch (error) {
      if (!isCurrentSession(epoch)) return
      if (error instanceof ApiError && error.status === 403) {
        clearAuthenticatedState(previousHandle)
        online.value = true
        return
      }
      throw error
    }
  }

  async function refreshUser() {
    const epoch = beginSessionOperation()
    try {
      await refreshUserForEpoch(epoch)
    } finally {
      if (isCurrentSession(epoch) && user.value) startPing()
    }
  }

  async function boot() {
    const epoch = beginSessionOperation()
    try {
      const token = await bootCsrf()
      if (!isCurrentSession(epoch)) return
      csrfToken.value = token
      await refreshUserForEpoch(epoch)
      if (!isCurrentSession(epoch)) return
      booted.value = true
      if (user.value) startPing()
    } catch (e) {
      if (!isCurrentSession(epoch)) return
      console.error('Boot failed:', e)
      resetCsrfToken()
      csrfToken.value = ''
      online.value = false
      booted.value = true
    }
  }

  async function login(handle: string, password: string) {
    const epoch = beginSessionOperation()
    const previousHandle = user.value?.handle || ''
    if (!csrfToken.value) {
      const token = await bootCsrf()
      if (!isCurrentSession(epoch)) return
      csrfToken.value = token
    }
    await loginUser(handle, password)
    if (!isCurrentSession(epoch)) return
    clearAuthenticatedState(previousHandle)
    const token = await bootCsrf()
    if (!isCurrentSession(epoch)) return
    csrfToken.value = token
    await refreshUserForEpoch(epoch)
    if (isCurrentSession(epoch) && user.value) startPing()
  }

  async function logout() {
    const epoch = beginSessionOperation()
    const previousHandle = user.value?.handle || ''
    try {
      await logoutUser()
    } finally {
      if (isCurrentSession(epoch)) {
        clearAuthenticatedState(previousHandle)
        try {
          const token = await bootCsrf()
          if (isCurrentSession(epoch)) {
            csrfToken.value = token
            online.value = true
          }
        } catch {
          if (isCurrentSession(epoch)) online.value = false
        }
      }
    }
  }

  function startPing() {
    stopPing()
    const epoch = sessionEpoch.value
    pingTimer = setInterval(async () => {
      const requestId = ++pingRequestId
      const token = csrfToken.value
      try {
        const response = await fetch('/api/ping?extend=true', {
          method: 'POST',
          headers: { 'X-CSRF-Token': token },
          credentials: 'same-origin',
        })
        if (!isCurrentSession(epoch) || requestId !== pingRequestId) return
        online.value = response.ok
        if (response.status === 403) {
          const previousHandle = user.value?.handle || ''
          clearAuthenticatedState(previousHandle)
        }
      } catch {
        if (!isCurrentSession(epoch) || requestId !== pingRequestId) return
        online.value = false
      }
    }, 5 * 60 * 1000)
  }

  function stopPing() {
    pingRequestId += 1
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  return {
    csrfToken,
    online,
    booted,
    user,
    sessionEpoch,
    isBooted,
    authenticated,
    isAdmin,
    boot,
    login,
    logout,
    refreshUser,
    startPing,
    stopPing,
  }
})
