<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { ApiError } from '@/api/client'
import AppButton from '@/components/ui/AppButton.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppInput from '@/components/ui/AppInput.vue'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const handle = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  if (!handle.value.trim()) {
    error.value = '请输入账号'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await session.login(handle.value.trim(), password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/browse'
    await router.replace(redirect)
  } catch (e: unknown) {
    error.value = e instanceof ApiError && e.status === 429 ? '尝试次数过多，请稍后再试' : '账号或密码不正确，或账号尚未通过审核'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="grid min-h-[100dvh] bg-bg lg:grid-cols-[minmax(0,1fr)_28rem]">
    <section class="relative hidden overflow-hidden border-r border-border bg-surface-sunken lg:block">
      <div class="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(139,92,246,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,.07)_1px,transparent_1px)] [background-size:40px_40px]" />
      <div class="relative flex h-full flex-col justify-between p-12 text-ink-primary">
        <div class="flex items-center gap-3">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-lg font-bold text-white">A</span>
          <span class="text-xl font-semibold">AIBAR</span>
        </div>
        <div class="max-w-xl">
          <p class="text-sm font-semibold text-brand-300">PRIVATE PLAYSPACE</p>
          <h1 class="mt-4 text-4xl font-semibold leading-tight">你的角色、故事与聊天记录，只属于当前账号。</h1>
          <p class="mt-4 max-w-lg text-base leading-relaxed text-ink-secondary">社区作品只在开始时复制一份私人副本，之后的剧情不会修改公共版本。</p>
        </div>
        <p class="text-xs text-ink-muted">AIBAR · SillyTavern</p>
      </div>
    </section>

    <section class="flex items-center px-6 py-10 sm:px-10">
      <div class="mx-auto w-full max-w-md">
        <div class="mb-8 flex items-center gap-3 lg:hidden">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-lg font-bold text-white">A</span>
          <span class="text-xl font-semibold text-ink-primary">AIBAR</span>
        </div>
        <p class="text-xs font-semibold text-brand-300">账号登录</p>
        <h2 class="mt-2 text-2xl font-semibold text-ink-primary">继续上次的故事</h2>

        <form class="mt-8 space-y-4" @submit.prevent="submit">
          <AppFormField label="账号" required>
            <AppInput v-model="handle" autocomplete="username" placeholder="your-handle" />
          </AppFormField>
          <AppFormField label="密码" required>
            <AppInput v-model="password" type="password" autocomplete="current-password" placeholder="输入密码" />
          </AppFormField>
          <p v-if="error" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
          <AppButton class="w-full" type="submit" size="lg" :disabled="loading">
            {{ loading ? '登录中…' : '登录' }}
          </AppButton>
        </form>

        <div class="mt-6 border-t border-border-subtle pt-5 text-sm text-ink-muted">
          还没有账号？
          <button class="font-medium text-brand-300 hover:text-brand-200" @click="router.push('/register')">注册账号</button>
        </div>
      </div>
    </section>
  </main>
</template>
