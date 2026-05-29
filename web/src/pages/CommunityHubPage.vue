<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { downloadCommunityContent } from '@/api/community'
import { importCharacter } from '@/api/characters'
import AppButton from '@/components/ui/AppButton.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'

interface ImportResult {
  title: string
  detail: string
}

const router = useRouter()
const chars = useCharactersStore()
const ui = useUiStore()

const url = ref('')
const importing = ref(false)
const lastResult = ref<ImportResult | null>(null)
const normalizedFromPreview = ref(false)

function ensureFileName(name: string, fallback: string): string {
  return name.trim() || fallback
}

function normalizeDiscordAttachmentUrl(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('链接格式不正确')
  }

  const isDiscordAttachment =
    (parsed.hostname === 'cdn.discordapp.com' || parsed.hostname === 'media.discordapp.net') &&
    parsed.pathname.includes('/attachments/')

  if (!isDiscordAttachment) {
    throw new Error('请粘贴类脑 Discord 附件里的 PNG 卡体链接')
  }

  if (!parsed.pathname.toLowerCase().endsWith('.png')) {
    throw new Error('这个链接看起来不是 PNG 角色卡，请不要使用 JPG/WebP 预览图')
  }

  if (parsed.hostname === 'media.discordapp.net') {
    parsed.hostname = 'cdn.discordapp.com'
  }

  for (const key of ['format', 'quality', 'width', 'height']) {
    parsed.searchParams.delete(key)
  }

  return parsed.toString()
}

async function importFromUrl() {
  const rawLink = url.value.trim()
  if (!rawLink) {
    ui.addToast('先粘贴类脑 Discord 的 PNG 卡体链接', 'warning')
    return
  }

  importing.value = true
  try {
    const link = normalizeDiscordAttachmentUrl(rawLink)
    normalizedFromPreview.value = link !== rawLink
    url.value = link

    const content = await downloadCommunityContent(link)
    if (content.type !== 'character') {
      throw new Error('ST 没有把这个链接识别成角色卡，请确认链接是卡体 PNG')
    }

    const file = new File([content.blob], ensureFileName(content.fileName, 'discord-character.png'), {
      type: content.mimeType || content.blob.type || 'image/png',
    })
    await importCharacter(file)
    await chars.load()
    lastResult.value = {
      title: file.name,
      detail: '已写入 ST 角色库，可以直接进入角色管理或开始聊天。',
    }
    ui.addToast(`已导入角色卡：${file.name}`, 'success')
  } catch (e: any) {
    normalizedFromPreview.value = false
    ui.addToast(`导入失败：${e.message || '请检查链接或网络'}`, 'error')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-bg">
    <AppPageHeader title="社区 Hub" subtitle="类脑 Discord 角色卡导入" back-to="/browse">
      <template #actions>
        <AppButton variant="secondary" size="sm" @click="router.push('/characters')">角色库</AppButton>
      </template>
    </AppPageHeader>

    <main class="mx-auto max-w-5xl space-y-5 px-5 py-6 animate-fade-in-up">
      <section class="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div class="rounded-xl border border-border bg-surface p-5">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">Discord Import</p>
            <h2 class="mt-2 text-xl font-semibold text-ink-primary">导入类脑角色卡 PNG</h2>
            <p class="mt-1 text-sm text-ink-muted">粘贴最新版本楼层里的卡体 PNG 附件链接。</p>
          </div>

          <div class="mt-5 flex flex-col gap-3 sm:flex-row">
            <input
              v-model="url"
              type="url"
              placeholder="粘贴 Discord PNG 卡体链接"
              class="min-h-[42px] flex-1 rounded-lg border border-border bg-surface-sunken px-3 text-sm text-ink-primary transition-all placeholder:text-ink-muted focus:border-brand-500/70 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              @keydown.enter.prevent="importFromUrl"
            />
            <AppButton variant="gradient" size="md" :disabled="importing" @click="importFromUrl">
              {{ importing ? '导入中…' : '导入角色卡' }}
            </AppButton>
          </div>

          <div class="mt-4 grid gap-2 text-sm text-ink-secondary sm:grid-cols-3">
            <div class="rounded-lg border border-border-subtle bg-surface-sunken px-3 py-2">Discord 附件</div>
            <div class="rounded-lg border border-border-subtle bg-surface-sunken px-3 py-2">PNG 卡体</div>
            <div class="rounded-lg border border-border-subtle bg-surface-sunken px-3 py-2">写入 ST 角色库</div>
          </div>

          <p v-if="normalizedFromPreview" class="mt-3 text-xs text-ink-muted">
            已自动转换为 Discord 原图链接。
          </p>
        </div>

        <div class="rounded-xl border border-border bg-surface p-5">
          <div v-if="lastResult" class="flex h-full flex-col justify-between gap-5">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-accent-300">Last Import</p>
              <h3 class="mt-2 text-lg font-semibold text-ink-primary">{{ lastResult.title }}</h3>
              <p class="mt-2 text-sm leading-relaxed text-ink-secondary">{{ lastResult.detail }}</p>
            </div>
            <AppButton size="md" variant="secondary" class="self-start" @click="router.push('/characters')">
              查看角色库
            </AppButton>
          </div>
          <div v-else class="flex h-full min-h-[170px] flex-col justify-center">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Ready</p>
            <h3 class="mt-2 text-lg font-semibold text-ink-primary">等待 Discord 卡体链接</h3>
            <p class="mt-2 text-sm leading-relaxed text-ink-secondary">
              JPG 和 WebP 通常是预览图；角色卡本体一般是 Discord 附件里的 PNG。
            </p>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
