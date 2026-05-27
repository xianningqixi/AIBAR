<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { useModsStore } from '@/stores/mods'
import { deleteStory, getStory, saveStory } from '@/api/stories'
import { createChatFromStory } from '@/lib/storyStart'
import type { Character, StoryCard } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import ModPicker from '@/components/mods/ModPicker.vue'

const route = useRoute()
const router = useRouter()
const chars = useCharactersStore()
const ui = useUiStore()
const mods = useModsStore()

const storyId = computed(() => decodeURIComponent((route.params.id as string) || ''))
const story = ref<StoryCard | null>(null)
const character = ref<Character | null>(null)
const loading = ref(false)
const starting = ref(false)
const startModIds = ref<string[]>([])

const tags = computed(() => story.value?.tags || [])
const modCount = computed(() => startModIds.value.length)
const selectedModNames = computed(() =>
  startModIds.value
    .map((id) => mods.getMod(id)?.name)
    .filter(Boolean)
    .join('、'),
)

async function loadData() {
  loading.value = true
  try {
    await Promise.all([
      chars.characters.length ? Promise.resolve() : chars.load(),
      mods.load(),
    ])
    story.value = await getStory(storyId.value)
    character.value = chars.findCharacter(story.value.characterAvatar) || null
    startModIds.value = [...(story.value.modIds || [])]
  } catch (e: any) {
    ui.addToast(`加载失败：${e.message}`, 'error')
    router.push({ path: '/browse', query: { tab: 'stories' } })
  } finally {
    loading.value = false
  }
}

async function startStory() {
  if (!story.value || !character.value) {
    ui.addToast('故事绑定的角色不存在', 'error')
    return
  }
  starting.value = true
  try {
    const fileName = await createChatFromStory(
      { ...story.value, modIds: startModIds.value },
      character.value,
    )
    ui.addToast('已创建新的聊天存档', 'success')
    router.push({
      path: `/chat/${encodeURIComponent(character.value.avatar)}`,
      query: { chat: fileName },
    })
  } catch (e: any) {
    ui.addToast(`开始故事失败：${e.message}`, 'error')
  } finally {
    starting.value = false
  }
}

async function renameStory() {
  if (!story.value) return
  const next = window.prompt('新的故事标题', story.value.title)
  if (!next?.trim()) return
  try {
    story.value = await saveStory({ ...story.value, title: next.trim() })
    ui.addToast('故事标题已更新', 'success')
  } catch (e: any) {
    ui.addToast(`保存失败：${e.message}`, 'error')
  }
}

async function quickTagEdit() {
  if (!story.value) return
  const next = window.prompt('编辑故事标签 (逗号分隔)', tags.value.join(', '))
  if (next === null) return
  const arr = next
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  try {
    story.value = await saveStory({ ...story.value, tags: arr })
    ui.addToast('标签已更新', 'success')
  } catch (e: any) {
    ui.addToast(`保存失败：${e.message}`, 'error')
  }
}

async function removeStory() {
  if (!story.value) return
  if (!window.confirm(`删除故事卡「${story.value.title}」？已创建的聊天存档不会删除。`)) return
  try {
    await deleteStory(story.value.id)
    ui.addToast('故事卡已删除', 'success')
    router.push({ path: '/browse', query: { tab: 'stories' } })
  } catch (e: any) {
    ui.addToast(`删除失败：${e.message}`, 'error')
  }
}

onMounted(loadData)
</script>

<template>
  <div class="min-h-screen bg-bg">
    <AppPageHeader title="故事卡详情" back-to="/browse?tab=stories">
      <template #actions>
        <AppButton v-if="story" size="sm" variant="gradient" :disabled="starting" @click="startStory">
          {{ starting ? '创建中…' : '▶ 开始故事' }}
        </AppButton>
      </template>
    </AppPageHeader>

    <div v-if="loading" class="flex justify-center py-16">
      <AppSpinner size="lg" />
    </div>

    <main v-else-if="story" class="max-w-4xl mx-auto px-5 py-6 space-y-4">
      <section class="relative overflow-hidden rounded-2xl ring-1 ring-border-subtle bg-hero-radial">
        <div
          v-if="character?.avatar && character.avatar !== 'none'"
          class="absolute inset-0 bg-cover bg-center opacity-15 blur-2xl pointer-events-none"
          :style="{ backgroundImage: `url(/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)})` }"
        />
        <div class="absolute -top-16 -right-12 w-72 h-72 rounded-full bg-accent-500/25 blur-3xl pointer-events-none" />
        <div class="absolute -bottom-20 -left-8 w-72 h-72 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />
        <div class="relative p-5 md:p-7 flex flex-wrap items-start gap-5">
          <div class="relative shrink-0">
            <img
              v-if="character?.avatar && character.avatar !== 'none'"
              :src="`/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}`"
              class="w-24 h-32 sm:w-28 sm:h-36 rounded-2xl object-cover ring-2 ring-accent-500/40 shadow-glow-accent"
            />
            <div
              v-else
              class="w-24 h-32 sm:w-28 sm:h-36 rounded-2xl bg-brand-soft ring-2 ring-accent-500/40 flex items-center justify-center text-accent-300 shadow-glow-accent"
            >
              <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span class="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-brand-gradient text-white text-[10px] font-medium uppercase tracking-wider shadow-glow">
              故事卡
            </span>
          </div>
          <div class="min-w-0 flex-1 space-y-2.5">
            <h1 class="text-2xl md:text-3xl font-semibold text-ink-primary">{{ story.title }}</h1>
            <div class="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
              <button
                v-if="character"
                class="inline-flex items-center gap-1.5 text-sm text-brand-300 hover:text-brand-200 transition-colors"
                @click="router.push(`/character/${encodeURIComponent(character.avatar)}`)"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-brand-gradient" />
                {{ character.name }}
              </button>
              <span v-else class="inline-flex items-center gap-1.5 text-sm text-red-300">
                <span class="w-1.5 h-1.5 rounded-full bg-red-400" />
                绑定角色不存在
              </span>
              <span v-if="story.world">世界书 · {{ story.world }}</span>
              <span v-if="modCount">{{ modCount }} 个 MOD</span>
            </div>
            <p class="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap max-w-2xl">
              {{ story.summary || '这个故事卡还没有简介。' }}
            </p>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="tag in tags"
                :key="tag"
                class="text-[11px] px-2 py-0.5 rounded-full bg-accent-500/10 text-accent-300 ring-1 ring-accent-500/20"
              >{{ tag }}</span>
              <button class="text-[11px] px-2 py-0.5 rounded-full ring-1 ring-border-subtle text-ink-secondary hover:text-ink-primary" @click="quickTagEdit">
                {{ tags.length ? '+ 编辑' : '+ 添加标签' }}
              </button>
            </div>
            <div class="flex flex-wrap gap-2 pt-1">
              <AppButton variant="gradient" :disabled="starting || !character" @click="startStory">
                {{ starting ? '创建中…' : '▶ 开始故事' }}
              </AppButton>
              <AppButton variant="secondary" @click="renameStory">重命名</AppButton>
              <AppButton variant="secondary" @click="router.push({ path: '/story/new', query: { avatar: story.characterAvatar } })">用同角色新建</AppButton>
            </div>
          </div>
        </div>
      </section>

      <AppCard padding="md">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary mb-3">
          <span class="w-1 h-4 rounded-full bg-brand-gradient" />
          剧本设定
        </h3>
        <p v-if="story.scenario" class="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">
          {{ story.scenario }}
        </p>
        <AppEmpty v-else icon="book" title="没有剧本设定" description="这个故事只会使用角色卡和开场消息。" />
      </AppCard>

      <div class="grid md:grid-cols-2 gap-4">
        <AppCard padding="md">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary mb-3">
            <span class="w-1 h-4 rounded-full bg-brand-gradient" />
            玩家开场
          </h3>
          <p v-if="story.openingUserMessage" class="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">
            {{ story.openingUserMessage }}
          </p>
          <p v-else class="text-sm text-ink-muted">未设置。</p>
        </AppCard>
        <AppCard padding="md">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary mb-3">
            <span class="w-1 h-4 rounded-full bg-brand-gradient" />
            AI 开场
          </h3>
          <p v-if="story.openingAssistantMessage" class="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">
            {{ story.openingAssistantMessage }}
          </p>
          <p v-else class="text-sm text-ink-muted">未设置。</p>
        </AppCard>
      </div>

      <AppCard padding="md">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary mb-3">
          <span class="w-1 h-4 rounded-full bg-brand-gradient" />
          默认配置
        </h3>
        <dl class="grid sm:grid-cols-2 gap-3 text-sm">
          <div class="rounded-lg bg-surface-sunken p-3 ring-1 ring-border-subtle">
            <dt class="text-xs text-ink-muted">世界书</dt>
            <dd class="mt-1 text-ink-primary">{{ story.world || '不绑定' }}</dd>
          </div>
          <div class="rounded-lg bg-surface-sunken p-3 ring-1 ring-border-subtle">
            <dt class="text-xs text-ink-muted">模型配置</dt>
            <dd class="mt-1 text-ink-primary">{{ story.modelProfileId || '使用默认模型' }}</dd>
          </div>
          <div class="rounded-lg bg-surface-sunken p-3 ring-1 ring-border-subtle">
            <dt class="text-xs text-ink-muted">默认 MOD</dt>
            <dd class="mt-1 text-ink-primary">
              {{ modCount ? `${modCount} 个` : '不加载' }}
              <span v-if="selectedModNames" class="block mt-1 text-xs text-ink-muted line-clamp-2">{{ selectedModNames }}</span>
            </dd>
          </div>
          <div class="rounded-lg bg-surface-sunken p-3 ring-1 ring-border-subtle">
            <dt class="text-xs text-ink-muted">模板 ID</dt>
            <dd class="mt-1 text-ink-primary truncate">{{ story.id }}</dd>
          </div>
        </dl>
      </AppCard>

      <AppCard v-if="story.systemAppend" padding="md">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary mb-3">
          <span class="w-1 h-4 rounded-full bg-brand-gradient" />
          额外系统规则
        </h3>
        <p class="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">{{ story.systemAppend }}</p>
      </AppCard>

      <AppCard padding="md">
        <ModPicker
          v-model="startModIds"
          :mods="mods.mods"
          title="本次加载 MOD"
          description="这里的选择只影响即将创建的聊天存档,不会改动故事卡模板。进入聊天后仍可在右侧抽屉调整。"
        />
      </AppCard>

      <AppCard padding="md">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary mb-3">
          <span class="w-1 h-4 rounded-full bg-brand-gradient" />
          管理
        </h3>
        <div class="flex flex-wrap gap-2">
          <AppButton variant="danger" @click="removeStory">删除故事卡</AppButton>
        </div>
        <p class="mt-3 text-xs text-ink-muted">
          删除故事卡只删除模板,不会删除已经从它开始的聊天记录。
        </p>
      </AppCard>
    </main>
  </div>
</template>
