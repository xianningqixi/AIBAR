<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { changePassword } from '@/api/auth'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useBillingStore } from '@/stores/billing'
import { formatPoints } from '@/lib/points'
import { formatDateTime } from '@/lib/format'
import AppButton from '@/components/ui/AppButton.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'

const router = useRouter()
const session = useSessionStore()
const ui = useUiStore()
const billing = useBillingStore()
const redeemCode = ref('')
const password = reactive({ current: '', next: '', confirm: '' })

async function logout() {
  await session.logout()
  router.replace('/login')
}

// loading/try/catch/toast 骨架统一交给 useAsyncAction，页面只保留业务分支
const { loading: saving, run: savePassword } = useAsyncAction(async () => {
  if (!session.user) return
  if (password.next.length < 8) {
    ui.addToast('新密码至少需要 8 位', 'warning')
    return
  }
  if (password.next !== password.confirm) {
    ui.addToast('两次输入的新密码不一致', 'warning')
    return
  }
  await changePassword(session.user.handle, password.current, password.next)
  password.current = ''
  password.next = ''
  password.confirm = ''
  await session.refreshUser()
  ui.addToast('密码已更新', 'success')
}, { errorPrefix: '密码更新失败' })

function ledgerLabel(kind: string): string {
  if (kind === 'signup_bonus') return '新用户赠送'
  if (kind === 'redemption') return '额度卡兑换'
  if (kind === 'generation') return '模型生成'
  return kind
}

const { run: redeem } = useAsyncAction(async () => {
  const code = redeemCode.value.trim()
  if (!code) {
    ui.addToast('请输入额度卡兑换码', 'warning')
    return
  }
  await billing.redeem(code)
  redeemCode.value = ''
  ui.addToast('积分已到账', 'success')
}, { errorPrefix: '兑换失败' })

const { run: loadBilling } = useAsyncAction(() => billing.load(), { errorPrefix: '积分加载失败' })
onMounted(loadBilling)
</script>

<template>
  <div class="min-h-[100dvh] bg-bg">
    <AppPageHeader title="我的账号" :show-back="false" width="4xl" />
    <main class="mx-auto max-w-4xl px-5 py-6 md:px-8 lg:px-10 space-y-8">
      <section class="flex items-center gap-4 border-b border-border pb-6">
        <div class="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-gradient text-xl font-semibold text-white">{{ session.user?.name?.slice(0, 1) || 'A' }}</div>
        <div class="min-w-0"><h1 class="truncate text-xl font-semibold text-ink-primary">{{ session.user?.name }}</h1><p class="mt-1 text-sm text-ink-muted">@{{ session.user?.handle }} · {{ session.isAdmin ? '管理员' : '普通用户' }}</p></div>
      </section>
      <p v-if="session.user && !session.user.password" class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        当前账号没有密码。开放给其他人访问前，请先设置密码。
      </p>
      <section class="border-t border-border pt-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p class="text-xs font-medium text-ink-muted">可用积分</p>
            <p class="mt-1 text-3xl font-semibold tabular-nums text-ink-primary">{{ formatPoints(billing.available) }}</p>
          </div>
          <div class="text-right text-xs text-ink-muted">
            <p>总余额 {{ formatPoints(billing.balance) }}</p>
            <p v-if="billing.hasHeldPoints" class="mt-1">生成中冻结 {{ formatPoints(billing.held) }}</p>
          </div>
        </div>
        <!-- 兑换码是一行短表单，限制在舒适宽度内 -->
        <form class="mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center" @submit.prevent="redeem">
          <AppInput v-model="redeemCode" class="min-w-0 flex-1" autocomplete="off" placeholder="输入管理员发放的额度卡兑换码" />
          <AppButton type="submit" class="sm:shrink-0" :disabled="billing.redeeming">
            {{ billing.redeeming ? '兑换中…' : '兑换积分' }}
          </AppButton>
        </form>
        <div class="mt-6">
          <h2 class="mb-3 text-sm font-semibold text-ink-primary">最近积分明细</h2>
          <div v-if="billing.ledger.length" class="divide-y divide-border-subtle border-y border-border-subtle">
            <div v-for="entry in billing.ledger" :key="entry.id" class="flex items-center gap-4 py-3 text-sm">
              <div class="min-w-0 flex-1">
                <p class="font-medium text-ink-primary">{{ ledgerLabel(entry.kind) }}</p>
                <p class="mt-1 text-xs text-ink-muted">{{ formatDateTime(entry.createdAt) }} · 余额 {{ formatPoints(entry.balanceAfter) }}</p>
              </div>
              <span class="shrink-0 font-semibold tabular-nums" :class="entry.delta >= 0 ? 'text-emerald-600' : 'text-ink-primary'">
                {{ entry.delta >= 0 ? '+' : '' }}{{ formatPoints(entry.delta) }}
              </span>
            </div>
          </div>
          <p v-else class="py-5 text-sm text-ink-muted">暂无积分变动。</p>
        </div>
      </section>
      <section class="border-t border-border pt-6">
        <h2 class="mb-3 text-base font-semibold text-ink-primary">修改密码</h2>
        <form class="max-w-2xl space-y-4" @submit.prevent="savePassword">
          <AppFormField v-if="session.user?.password" label="当前密码" required>
            <AppInput v-model="password.current" type="password" autocomplete="current-password" />
          </AppFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <AppFormField label="新密码" required><AppInput v-model="password.next" type="password" autocomplete="new-password" /></AppFormField>
            <AppFormField label="确认新密码" required><AppInput v-model="password.confirm" type="password" autocomplete="new-password" /></AppFormField>
          </div>
          <div class="flex items-center justify-end gap-3">
            <AppButton type="submit" :disabled="saving">{{ saving ? '保存中…' : '更新密码' }}</AppButton>
          </div>
        </form>
      </section>
      <div class="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-6">
        <AppButton v-if="session.isAdmin" variant="secondary" @click="router.push('/admin')">管理后台</AppButton>
        <AppButton variant="danger" @click="logout">退出登录</AppButton>
      </div>
    </main>
  </div>
</template>
