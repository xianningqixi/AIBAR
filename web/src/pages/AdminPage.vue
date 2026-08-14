<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  createInvite,
  getAdminOverview,
  reviewRegistration,
  setUserEnabled,
  toggleInvite,
  type AdminInvite,
  type AdminOverview,
} from '@/api/auth'
import {
  createCreditCodes,
  getAdminPointOverview,
  toggleCreditCode,
  type AdminPointOverview,
  type CreatedCreditCode,
  type CreditCodeRecord,
} from '@/api/billing'
import { getApiErrorMessage } from '@/api/client'
import { useBillingStore } from '@/stores/billing'
import { formatPoints } from '@/lib/points'
import { formatDateTime } from '@/lib/format'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import AppButton from '@/components/ui/AppButton.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSegmentedControl from '@/components/ui/AppSegmentedControl.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'

const session = useSessionStore()
const ui = useUiStore()
const billing = useBillingStore()
const overview = ref<AdminOverview | null>(null)
const pointOverview = ref<AdminPointOverview | null>(null)
const accountLoading = ref(false)
const pointLoading = ref(false)
const accountError = ref('')
const pointError = ref('')
const creating = ref(false)
const latestInvite = ref<AdminInvite | null>(null)
const inviteForm = reactive({ label: '', maxUses: 1, expiresAt: '' })
const creditForm = reactive({ label: '', amount: 100, count: 1, expiresAt: '' })
const creatingCredits = ref(false)
const latestCreditCodes = ref<CreatedCreditCode[]>([])
let pageEpoch = 0
let accountRequestId = 0
let pointRequestId = 0

type AdminSection = 'pending' | 'credits' | 'invites' | 'users'
const activeSection = ref<AdminSection>('pending')
const adminSections: Array<{ value: AdminSection; label: string }> = [
  { value: 'pending', label: '待审核' },
  { value: 'credits', label: '额度卡' },
  { value: 'invites', label: '邀请码' },
  { value: 'users', label: '用户' },
]
function scrollToAdminSection(id: AdminSection) {
  document.getElementById(`admin-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

interface AdminContext {
  epoch: number
  handle: string
}

function captureAdminContext(): AdminContext | null {
  const handle = session.user?.handle || ''
  return handle && session.isAdmin ? { epoch: pageEpoch, handle } : null
}

function isCurrentAdminContext(context: AdminContext | null): context is AdminContext {
  return Boolean(
    context
    && context.epoch === pageEpoch
    && context.handle === (session.user?.handle || '')
    && session.isAdmin,
  )
}

function clearAdminState() {
  accountRequestId += 1
  pointRequestId += 1
  overview.value = null
  pointOverview.value = null
  accountLoading.value = false
  pointLoading.value = false
  accountError.value = ''
  pointError.value = ''
  creating.value = false
  latestInvite.value = null
  creatingCredits.value = false
  latestCreditCodes.value = []
}

const pending = computed(() => overview.value?.registrations.filter(item => item.status === 'pending') || [])

function accountAvailable(handle: string): number | null {
  return pointOverview.value?.accounts.find(account => account.handle === handle)?.available ?? null
}

function toIsoDateTime(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('过期时间格式无效')
  return date.toISOString()
}

async function loadAccounts() {
  const context = captureAdminContext()
  if (!context) return
  const requestId = ++accountRequestId
  accountLoading.value = true
  accountError.value = ''
  try {
    const next = await getAdminOverview()
    if (!isCurrentAdminContext(context) || requestId !== accountRequestId) return
    overview.value = next
  } catch (error) {
    if (!isCurrentAdminContext(context) || requestId !== accountRequestId) return
    accountError.value = getApiErrorMessage(error, '账号与邀请码加载失败')
  } finally {
    if (isCurrentAdminContext(context) && requestId === accountRequestId) accountLoading.value = false
  }
}

async function loadPoints() {
  const context = captureAdminContext()
  if (!context) return
  const requestId = ++pointRequestId
  pointLoading.value = true
  pointError.value = ''
  try {
    const next = await getAdminPointOverview()
    if (!isCurrentAdminContext(context) || requestId !== pointRequestId) return
    pointOverview.value = next
  } catch (error) {
    if (!isCurrentAdminContext(context) || requestId !== pointRequestId) return
    pointError.value = getApiErrorMessage(error, '积分数据加载失败')
  } finally {
    if (isCurrentAdminContext(context) && requestId === pointRequestId) pointLoading.value = false
  }
}

async function load() {
  await Promise.allSettled([loadAccounts(), loadPoints()])
}

async function makeInvite() {
  const context = captureAdminContext()
  if (!context) return
  creating.value = true
  try {
    const created = await createInvite({
      label: inviteForm.label,
      maxUses: Number(inviteForm.maxUses),
      expiresAt: toIsoDateTime(inviteForm.expiresAt),
    })
    if (!isCurrentAdminContext(context)) return
    latestInvite.value = created
    inviteForm.label = ''
    await loadAccounts()
  } catch (e: unknown) {
    if (!isCurrentAdminContext(context)) return
    ui.addToast(`创建邀请码失败：${getApiErrorMessage(e)}`, 'error')
  } finally {
    if (isCurrentAdminContext(context)) creating.value = false
  }
}

async function copyCode() {
  const context = captureAdminContext()
  if (!context) return
  if (!latestInvite.value?.code) return
  await navigator.clipboard.writeText(latestInvite.value.code)
  if (!isCurrentAdminContext(context)) return
  ui.addToast('邀请码已复制', 'success')
}

async function review(id: string, action: 'approve' | 'reject') {
  const context = captureAdminContext()
  if (!context) return
  await reviewRegistration(id, action)
  if (!isCurrentAdminContext(context)) return
  ui.addToast(action === 'approve' ? '账号已创建' : '申请已拒绝', 'success')
  await loadAccounts()
}

async function changeInvite(invite: AdminInvite) {
  const context = captureAdminContext()
  if (!context) return
  await toggleInvite(invite.id, !invite.enabled)
  if (!isCurrentAdminContext(context)) return
  await loadAccounts()
}

async function changeUser(handle: string, enabled: boolean) {
  const context = captureAdminContext()
  if (!context) return
  await setUserEnabled(handle, enabled)
  if (!isCurrentAdminContext(context)) return
  await loadAccounts()
}

async function makeCreditCodes() {
  const context = captureAdminContext()
  if (!context) return
  creatingCredits.value = true
  try {
    const result = await createCreditCodes({
      label: creditForm.label,
      amount: Number(creditForm.amount),
      count: Number(creditForm.count),
      expiresAt: toIsoDateTime(creditForm.expiresAt),
    })
    if (!isCurrentAdminContext(context)) return
    latestCreditCodes.value = result.cards
    creditForm.label = ''
    await Promise.all([loadPoints(), billing.load(true)])
    if (!isCurrentAdminContext(context)) return
    ui.addToast(`已生成 ${result.cards.length} 张额度卡`, 'success')
  } catch (e: unknown) {
    if (!isCurrentAdminContext(context)) return
    ui.addToast(`额度卡生成失败：${getApiErrorMessage(e)}`, 'error')
  } finally {
    if (isCurrentAdminContext(context)) creatingCredits.value = false
  }
}

async function copyCreditCodes() {
  const context = captureAdminContext()
  if (!context) return
  if (!latestCreditCodes.value.length) return
  await navigator.clipboard.writeText(latestCreditCodes.value.map(card => card.code).join('\n'))
  if (!isCurrentAdminContext(context)) return
  ui.addToast('额度卡兑换码已复制', 'success')
}

async function changeCreditCode(card: CreditCodeRecord) {
  const context = captureAdminContext()
  if (!context) return
  await toggleCreditCode(card.id, !card.enabled)
  if (!isCurrentAdminContext(context)) return
  await loadPoints()
}

watch(
  [() => session.user?.handle || '', () => session.sessionEpoch, () => session.isAdmin],
  ([handle, _sessionEpoch, isAdmin]) => {
    pageEpoch += 1
    clearAdminState()
    if (handle && isAdmin) void load()
  },
  { immediate: true },
)
</script>

<template>
  <div class="min-h-[100dvh] bg-bg">
    <AppPageHeader title="管理后台" subtitle="账号、邀请码、积分与审核" back-to="/account" />
    <div v-if="session.isAdmin && accountLoading && pointLoading && !overview && !pointOverview" class="py-20"><AppSpinner size="lg" /></div>
    <main v-else-if="session.isAdmin" class="mx-auto max-w-6xl space-y-6 px-5 py-6 md:px-8 lg:px-10">
      <div class="sticky top-16 z-20 -mx-5 mb-2 border-b border-border bg-bg/95 px-5 py-2 backdrop-blur md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
        <AppSegmentedControl v-model="activeSection" :options="adminSections" @update:model-value="scrollToAdminSection" />
      </div>

      <section v-if="accountError" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3">
        <p class="text-sm text-danger-strong">账号数据加载失败：{{ accountError }}</p>
        <AppButton size="sm" variant="secondary" :loading="accountLoading" :disabled="accountLoading" @click="loadAccounts">重试账号数据</AppButton>
      </section>
      <section v-if="pointError" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3">
        <p class="text-sm text-danger-strong">积分数据加载失败：{{ pointError }}</p>
        <AppButton size="sm" variant="secondary" :loading="pointLoading" :disabled="pointLoading" @click="loadPoints">重试积分数据</AppButton>
      </section>
      <section v-if="accountLoading && !overview" class="py-10"><AppSpinner /></section>

      <section v-if="overview" id="admin-pending" class="scroll-mt-28">
        <div class="mb-4 flex items-end justify-between gap-4 border-b border-border-subtle pb-3">
          <div><h2 class="text-lg font-semibold text-ink-primary">待审核申请</h2><p class="mt-1 text-sm text-ink-muted">{{ pending.length }} 条待处理</p></div>
        </div>
        <div v-if="pending.length" class="divide-y divide-border-subtle">
          <div v-for="item in pending" :key="item.id" class="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
            <div class="min-w-0 flex-1">
              <p class="font-medium text-ink-primary">{{ item.name }} <span class="font-normal text-ink-muted">@{{ item.handle }}</span></p>
              <p class="mt-1 text-xs text-ink-muted">{{ formatDateTime(item.createdAt) }} · {{ item.id }}</p>
            </div>
            <div class="flex gap-2"><AppButton size="sm" @click="review(item.id, 'approve')">批准</AppButton><AppButton size="sm" variant="danger" @click="review(item.id, 'reject')">拒绝</AppButton></div>
          </div>
        </div>
        <p v-else class="py-8 text-sm text-ink-muted">当前没有待审核申请。</p>
      </section>

      <section id="admin-credits" class="scroll-mt-28">
        <div class="mb-4 flex items-end justify-between gap-4 border-b border-border-subtle pb-3">
          <div>
            <h2 class="text-lg font-semibold text-ink-primary">积分额度卡</h2>
            <p class="mt-1 text-sm text-ink-muted">兑换码只在生成后显示一次，复制后私下发给用户。</p>
          </div>
        </div>
        <form class="space-y-4" @submit.prevent="makeCreditCodes">
          <AppCard padding="md">
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <AppFormField label="备注"><AppInput v-model="creditForm.label" placeholder="批次或用户备注" /></AppFormField>
              <AppFormField label="每张积分"><AppInput v-model="creditForm.amount" type="number" min="0.000001" step="0.000001" /></AppFormField>
              <AppFormField label="张数"><AppInput v-model="creditForm.count" type="number" min="1" max="100" /></AppFormField>
              <AppFormField label="过期时间"><AppInput v-model="creditForm.expiresAt" type="datetime-local" /></AppFormField>
            </div>
            <div class="mt-4 flex justify-end">
              <AppButton type="submit" :loading="creatingCredits" :disabled="creatingCredits">生成额度卡</AppButton>
            </div>
          </AppCard>
        </form>
        <div v-if="latestCreditCodes.length" class="mt-4 rounded-xl border border-success/30 bg-success-soft p-4">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-semibold text-success-strong">本次生成的兑换码</p>
            <AppButton size="sm" variant="secondary" @click="copyCreditCodes">复制全部</AppButton>
          </div>
          <div class="mt-3 space-y-1.5">
            <code v-for="card in latestCreditCodes" :key="card.id" class="block break-all text-sm font-semibold text-success-strong">{{ card.code }}</code>
          </div>
        </div>
        <div v-if="pointLoading && !pointOverview" class="py-8"><AppSpinner /></div>
        <div v-else-if="pointOverview" class="mt-4 divide-y divide-border-subtle border-y border-border-subtle">
          <div v-for="card in pointOverview.cards" :key="card.id" class="flex items-center gap-4 py-3 text-sm">
            <div class="min-w-0 flex-1">
              <p class="font-medium text-ink-primary">{{ card.label || '未命名额度卡' }} · {{ formatPoints(card.amount) }} 积分</p>
              <p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <span
                  class="rounded px-1.5 py-0.5"
                  :class="card.redeemedBy ? 'bg-success-soft text-success-strong' : card.enabled ? 'bg-info-soft text-info-strong' : 'bg-warning-soft text-warning-strong'"
                >
                  {{ card.redeemedBy ? '已兑换' : card.enabled ? '未兑换' : '已停用' }}
                </span>
                <span>· {{ card.expiresAt ? formatDateTime(card.expiresAt) : '长期有效' }}</span>
              </p>
            </div>
            <AppButton
              v-if="!card.redeemedBy"
              size="sm"
              :variant="card.enabled ? 'danger' : 'secondary'"
              @click="changeCreditCode(card)"
            >
              {{ card.enabled ? '停用' : '启用' }}
            </AppButton>
          </div>
        </div>
      </section>

      <section v-if="overview" id="admin-invites" class="scroll-mt-28">
        <div class="mb-4 flex items-end justify-between gap-4 border-b border-border-subtle pb-3">
          <div><h2 class="text-lg font-semibold text-ink-primary">邀请码</h2><p class="mt-1 text-sm text-ink-muted">使用有效邀请码注册将自动通过审核。</p></div>
        </div>
        <form class="space-y-4" @submit.prevent="makeInvite">
          <AppCard padding="md">
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <AppFormField label="备注"><AppInput v-model="inviteForm.label" placeholder="朋友昵称" /></AppFormField>
              <AppFormField label="可用次数"><AppInput v-model="inviteForm.maxUses" type="number" min="1" max="100" /></AppFormField>
              <AppFormField label="过期时间" class="sm:col-span-2"><AppInput v-model="inviteForm.expiresAt" type="datetime-local" /></AppFormField>
            </div>
            <div class="mt-4 flex justify-end">
              <AppButton type="submit" :loading="creating" :disabled="creating">生成邀请码</AppButton>
            </div>
          </AppCard>
        </form>
        <div v-if="latestInvite?.code" class="mt-4 flex flex-col gap-3 rounded-xl border border-success/30 bg-success-soft p-4 sm:flex-row sm:items-center">
          <code class="min-w-0 flex-1 break-all text-sm font-semibold text-success-strong">{{ latestInvite.code }}</code>
          <AppButton size="sm" variant="secondary" @click="copyCode">复制</AppButton>
        </div>
        <div class="mt-4 divide-y divide-border-subtle border-y border-border-subtle">
          <div v-for="invite in overview.invites" :key="invite.id" class="flex items-center gap-4 py-3 text-sm">
            <div class="min-w-0 flex-1">
              <p class="font-medium text-ink-primary">{{ invite.label || '未命名邀请码' }}</p>
              <p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <span class="rounded px-1.5 py-0.5"
                  :class="invite.enabled ? 'bg-success-soft text-success-strong' : 'bg-warning-soft text-warning-strong'"
                >
                  {{ invite.enabled ? '有效' : '已停用' }}
                </span>
                <span>· 已用 {{ invite.useCount }}/{{ invite.maxUses }} · {{ invite.expiresAt ? formatDateTime(invite.expiresAt) : '长期有效' }}</span>
              </p>
            </div>
            <AppButton size="sm" :variant="invite.enabled ? 'danger' : 'secondary'" @click="changeInvite(invite)">{{ invite.enabled ? '停用' : '启用' }}</AppButton>
          </div>
        </div>
      </section>

      <section v-if="overview" id="admin-users" class="scroll-mt-28">
        <div class="mb-4 flex items-end justify-between gap-4 border-b border-border-subtle pb-3"><h2 class="text-lg font-semibold text-ink-primary">用户账号</h2></div>
        <div class="divide-y divide-border-subtle">
          <div v-for="user in overview.users" :key="user.handle" class="flex items-center gap-4 py-3 text-sm">
            <div class="min-w-0 flex-1">
              <p class="font-medium text-ink-primary">{{ user.name }} <span class="font-normal text-ink-muted">@{{ user.handle }}</span></p>
              <p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <span v-if="user.admin" class="rounded bg-info-soft px-1.5 py-0.5 text-info-strong">管理员</span>
                <span v-else class="rounded bg-surface-sunken px-1.5 py-0.5 text-ink-secondary">普通用户</span>
                <span
                  class="rounded px-1.5 py-0.5"
                  :class="user.enabled ? 'bg-success-soft text-success-strong' : 'bg-danger-soft text-danger-strong'"
                >
                  {{ user.enabled ? '正常' : '已停用' }}
                </span>
                <template v-if="accountAvailable(user.handle) !== null"> · 可用 {{ formatPoints(accountAvailable(user.handle) || 0) }} 积分</template>
              </p>
            </div>
            <AppButton v-if="user.handle !== session.user?.handle" size="sm" :variant="user.enabled ? 'danger' : 'secondary'" @click="changeUser(user.handle, !user.enabled)">{{ user.enabled ? '停用' : '启用' }}</AppButton>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
