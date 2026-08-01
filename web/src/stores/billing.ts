import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  getPointAccount,
  redeemCreditCode,
  type PointLedgerEntry,
} from '@/api/billing'

export const useBillingStore = defineStore('billing', () => {
  const balance = ref(0)
  const held = ref(0)
  const available = ref(0)
  const updatedAt = ref('')
  const ledger = ref<PointLedgerEntry[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const redeeming = ref(false)
  let storeGeneration = 0
  let loadState: { generation: number; promise: Promise<void> } | null = null
  let loadRequestId = 0
  let redeemRequestId = 0

  const hasHeldPoints = computed(() => held.value > 0)

  function applyAccount(account: {
    balance: number
    held: number
    available: number
    updatedAt?: string
    ledger?: PointLedgerEntry[]
  }) {
    balance.value = Number(account.balance || 0)
    held.value = Number(account.held || 0)
    available.value = Number(account.available || 0)
    updatedAt.value = account.updatedAt || ''
    if (Array.isArray(account.ledger)) ledger.value = account.ledger
  }

  async function load(force = false) {
    const generation = storeGeneration
    if (loadState?.generation === generation && !force) return loadState.promise
    if (loaded.value && !force) return
    const requestId = ++loadRequestId
    loading.value = true
    const promise = (async () => {
      try {
        const account = await getPointAccount()
        if (generation !== storeGeneration || requestId !== loadRequestId) return
        applyAccount(account)
        loaded.value = true
      } finally {
        if (generation === storeGeneration && requestId === loadRequestId) {
          loading.value = false
          loadState = null
        }
      }
    })()
    loadState = { generation, promise }
    return promise
  }

  async function redeem(code: string) {
    const generation = storeGeneration
    const requestId = ++redeemRequestId
    redeeming.value = true
    try {
      const account = await redeemCreditCode(code)
      if (generation !== storeGeneration || requestId !== redeemRequestId) return
      applyAccount(account)
      await load(true)
    } finally {
      if (generation === storeGeneration && requestId === redeemRequestId) {
        redeeming.value = false
      }
    }
  }

  function reset() {
    storeGeneration += 1
    loadRequestId += 1
    redeemRequestId += 1
    loadState = null
    balance.value = 0
    held.value = 0
    available.value = 0
    updatedAt.value = ''
    ledger.value = []
    loading.value = false
    loaded.value = false
    redeeming.value = false
  }

  return {
    balance,
    held,
    available,
    updatedAt,
    ledger,
    loading,
    loaded,
    redeeming,
    hasHeldPoints,
    load,
    redeem,
    reset,
  }
})
