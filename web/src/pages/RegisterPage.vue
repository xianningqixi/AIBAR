<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  getRegistrationStatus,
  registerUser,
  type RegistrationRequest,
} from '@/api/auth'
import AppButton from '@/components/ui/AppButton.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppInput from '@/components/ui/AppInput.vue'
import { getApiErrorMessage } from '@/api/client'

const router = useRouter()
const inviteCode = ref('')
const handle = ref('')
const name = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const checking = ref(false)
const error = ref('')
const request = ref<RegistrationRequest | null>(null)

const statusMeta = computed(() => {
  if (request.value?.status === 'approved') return { label: '注册成功', color: 'success' as const }
  if (request.value?.status === 'rejected') return { label: '申请未通过', color: 'danger' as const }
  return { label: '等待管理员审核', color: 'warning' as const }
})

const statusLabel = computed(() => statusMeta.value.label)

const statusCardClass = computed(() => {
  const map = {
    success: 'border-success bg-success-soft text-success-strong',
    danger: 'border-danger bg-danger-soft text-danger-strong',
    warning: 'border-warning bg-warning-soft text-warning-strong',
  }
  return map[statusMeta.value.color]
})

async function submit() {
  error.value = ''
  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  if (password.value.length < 8) {
    error.value = '密码至少需要 8 位'
    return
  }
  loading.value = true
  try {
    request.value = await registerUser({
      inviteCode: inviteCode.value,
      handle: handle.value,
      name: name.value,
      password: password.value,
    })
    sessionStorage.setItem('aibar_registration_id', request.value.id)
  } catch (e: unknown) {
    error.value = getApiErrorMessage(e, '提交申请失败')
  } finally {
    loading.value = false
  }
}

async function refreshStatus() {
  const id = request.value?.id || sessionStorage.getItem('aibar_registration_id')
  if (!id) return
  checking.value = true
  error.value = ''
  try {
    request.value = await getRegistrationStatus(id)
  } catch {
    error.value = '没有找到申请记录'
  } finally {
    checking.value = false
  }
}

function resetRequest() {
  request.value = null
  sessionStorage.removeItem('aibar_registration_id')
}

void refreshStatus()
</script>

<template>
  <main class="flex min-h-[100dvh] items-center bg-bg px-6 py-10 sm:px-10">
    <div class="mx-auto w-full max-w-md">
      <button class="mb-8 flex items-center gap-3" @click="router.push('/login')">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-lg font-bold text-white">A</span>
        <span class="text-xl font-semibold text-ink-primary">AIBAR</span>
      </button>

      <section class="rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <template v-if="request">
          <p class="text-xs font-semibold text-brand-300">注册申请</p>
          <div class="rounded-xl border-l-4 p-4" :class="statusCardClass">
            <div class="flex items-center gap-2">
              <svg class="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path v-if="request.status === 'approved'" fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clip-rule="evenodd" />
                <path v-else-if="request.status === 'rejected'" fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clip-rule="evenodd" />
                <path v-else fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1-12a1 1 0 1 0-2 0v4a1 1 0 0 0 .293.707l2.828 2.829a1 1 0 1 0 1.415-1.415L11 9.586V6Z" clip-rule="evenodd" />
              </svg>
              <span class="font-semibold">{{ statusLabel }}</span>
            </div>
          </div>
          <dl class="mt-6 divide-y divide-border-subtle rounded-lg border border-border-subtle">
            <div class="flex justify-between gap-4 px-4 py-3 text-sm">
              <dt class="text-ink-muted">账号</dt><dd class="font-medium text-ink-primary">{{ request.handle }}</dd>
            </div>
            <div class="flex justify-between gap-4 px-4 py-3 text-sm">
              <dt class="text-ink-muted">申请编号</dt><dd class="max-w-[15rem] truncate font-mono text-xs text-ink-secondary">{{ request.id }}</dd>
            </div>
          </dl>
          <p v-if="request.reviewNote" class="mt-4 rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink-secondary">{{ request.reviewNote }}</p>
          <div class="mt-6 flex gap-3">
            <AppButton v-if="request.status === 'approved'" class="flex-1" @click="router.push('/login')">去登录</AppButton>
            <AppButton v-else variant="secondary" class="flex-1" :loading="checking" @click="refreshStatus">
              刷新状态
            </AppButton>
            <AppButton variant="ghost" @click="resetRequest">重新申请</AppButton>
          </div>
        </template>

        <template v-else>
          <p class="text-xs font-semibold text-brand-300">创建账号</p>
          <h1 class="mt-2 text-2xl font-semibold text-ink-primary">注册 AIBAR</h1>
          <form class="mt-8 space-y-4" @submit.prevent="submit">
            <AppFormField label="邀请码（选填）" hint="填写有效邀请码可直接注册；留空则由管理员审核">
              <AppInput v-model="inviteCode" autocomplete="off" placeholder="AIBAR-XXXXXXXXXXXX" />
            </AppFormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <AppFormField label="账号" hint="英文、数字或短横线" required>
                <AppInput v-model="handle" autocomplete="username" placeholder="your-handle" />
              </AppFormField>
              <AppFormField label="昵称" required>
                <AppInput v-model="name" placeholder="显示名称" />
              </AppFormField>
            </div>
            <AppFormField label="密码" required>
              <AppInput v-model="password" type="password" autocomplete="new-password" placeholder="至少 8 位" />
            </AppFormField>
            <AppFormField label="确认密码" required>
              <AppInput v-model="confirmPassword" type="password" autocomplete="new-password" placeholder="再次输入密码" />
            </AppFormField>
            <p v-if="error" class="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger-strong">
              <svg class="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1-9a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1Z" clip-rule="evenodd" />
              </svg>
              {{ error }}
            </p>
            <AppButton class="w-full" type="submit" size="lg" :loading="loading">
              {{ inviteCode.trim() ? '使用邀请码注册' : '提交审核' }}
            </AppButton>
          </form>
        </template>
      </section>
    </div>
  </main>
</template>
