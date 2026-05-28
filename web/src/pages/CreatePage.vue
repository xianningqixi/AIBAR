<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { listStories } from '@/api/stories'
import type { Character, StoryCard } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'

type CreateMode = 'simple' | 'advanced'
type CreateKind = 'story' | 'character'

const route = useRoute()
const router = useRouter()
const chars = useCharactersStore()
const ui = useUiStore()

const stories = ref<StoryCard[]>([])

function normalizeMode(value: unknown): CreateMode {
  return value === 'advanced' ? 'advanced' : 'simple'
}

function normalizeKind(value: unknown): CreateKind {
  return value === 'character' ? 'character' : 'story'
}

const activeMode = ref<CreateMode>(normalizeMode(route.query.mode))
const activeKind = ref<CreateKind>(normalizeKind(route.query.kind))

const modeCards = [
  {
    key: 'advanced' as const,
    title: '高级创作',
    description: '直接进入完整表单，自己控制全部字段、世界书、模型和 MOD。',
  },
  {
    key: 'simple' as const,
    title: '简易创作',
    description: '一句想法开始，AI 追问几个选项，再生成可手改的初稿。',
  },
]

const kindTabs = [
  { key: 'story' as const, label: '故事开局' },
  { key: 'character' as const, label: '角色卡' },
]

watch([activeMode, activeKind], ([mode, kind]) => {
  router.replace({ query: { ...route.query, mode, kind } })
})

const sortedStories = computed(() =>
  [...stories.value].sort((a, b) =>
    new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime(),
  ),
)

const sortedCharacters = computed(() =>
  [...chars.characters].sort((a, b) => {
    const favDiff = (b.fav === 'true' ? 1 : 0) - (a.fav === 'true' ? 1 : 0)
    if (favDiff !== 0) return favDiff
    return a.name.localeCompare(b.name)
  }),
)

const activePlan = computed(() => {
  const modeLabel = activeMode.value === 'simple' ? '简易' : '高级'
  if (activeKind.value === 'character') {
    return {
      title: `${modeLabel}创建角色卡`,
      description: activeMode.value === 'simple'
        ? '适合先把灵感变成能聊天的角色，再慢慢补设定。'
        : '适合已有完整设定时，一次填好角色卡字段。',
      actionLabel: '开始创建角色',
    }
  }
  return {
    title: `${modeLabel}创建故事开局`,
    description: activeMode.value === 'simple'
      ? '适合把一个场景、事件或开局变成可复用的聊天模板。'
      : '适合已有剧本结构时，完整配置场景、开场、世界书和 MOD。',
    actionLabel: '开始创建故事',
  }
})

function createTarget() {
  if (activeKind.value === 'story' && !chars.characters.length) {
    ui.addToast('故事开局需要先有角色卡', 'warning')
    activeKind.value = 'character'
    return
  }
  const query = { mode: activeMode.value }
  if (activeKind.value === 'character') {
    router.push({ path: '/character/new', query })
  } else {
    router.push({ path: '/story/new', query })
  }
}

function getCharacterDescription(character: Character): string {
  return character.description || character.data?.description || '还没有简介'
}

function openCharacter(character: Character) {
  router.push(`/character/${encodeURIComponent(character.avatar)}`)
}

function getStoryCharacter(story: StoryCard): Character | undefined {
  return chars.findCharacter(story.characterAvatar)
}

function storyThumbnail(story: StoryCard): string {
  const character = getStoryCharacter(story)
  if (!character?.avatar || character.avatar === 'none') return ''
  return `/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}`
}

function openStory(story: StoryCard) {
  router.push(`/story/${encodeURIComponent(story.id)}`)
}

onMounted(async () => {
  await Promise.all([
    chars.characters.length ? Promise.resolve() : chars.load(),
    listStories()
      .then((res) => (stories.value = res))
      .catch(() => undefined),
  ])
})
</script>

<template>
  <div class="min-h-screen bg-bg md:flex">
    <aside class="hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-border-subtle bg-surface/70 px-5 py-6 md:flex sticky top-0">
      <button class="flex items-center gap-3 text-left" @click="router.push('/browse')">
        <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-lg font-bold text-white shadow-glow">
          A
        </div>
        <div class="leading-tight">
          <h1 class="text-xl font-semibold tracking-tight text-ink-primary">AIBAR</h1>
          <p class="text-xs text-ink-muted">选角色，开聊</p>
        </div>
      </button>

      <nav class="mt-10 space-y-1">
        <button
          class="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-ink-secondary transition-all hover:bg-white/5 hover:text-ink-primary"
          @click="router.push('/browse')"
        >
          探索
        </button>
        <button
          class="w-full rounded-xl bg-brand-500/15 px-4 py-3 text-left text-sm font-semibold text-brand-200 ring-1 ring-brand-500/35"
          @click="router.push('/create')"
        >
          创作
        </button>
      </nav>

      <div class="mt-auto border-t border-border-subtle pt-4">
        <p class="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">资料库</p>
        <div class="mt-2 space-y-1">
          <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-ink-primary" @click="router.push('/characters')">
            角色库
          </button>
          <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-ink-primary" @click="router.push({ path: '/settings', query: { tab: 'world' } })">
            世界书
          </button>
          <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-ink-primary" @click="router.push({ path: '/settings', query: { tab: 'mods' } })">
            提示词 MOD
          </button>
        </div>

        <p class="mt-4 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">设置</p>
        <div class="mt-2 space-y-1">
          <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-ink-primary" @click="router.push({ path: '/settings', query: { tab: 'model' } })">
            模型连接
          </button>
          <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-ink-primary" @click="router.push({ path: '/settings', query: { tab: 'presets' } })">
            生成参数
          </button>
          <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-ink-primary" @click="router.push({ path: '/settings', query: { tab: 'personas' } })">
            我的身份
          </button>
        </div>
      </div>
    </aside>

    <header class="sticky top-0 z-20 border-b border-border-subtle bg-bg/85 backdrop-blur md:hidden">
      <div class="flex items-center justify-between gap-3 px-5 py-4">
        <button class="flex items-center gap-3 text-left" @click="router.push('/browse')">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient font-bold text-white shadow-glow">
            A
          </div>
          <div>
            <h1 class="text-lg font-semibold text-ink-primary">AIBAR</h1>
            <p class="text-xs text-ink-muted">创作</p>
          </div>
        </button>
        <AppButton size="sm" variant="ghost" @click="router.push('/browse')">探索</AppButton>
      </div>
    </header>

    <main class="w-full flex-1 px-5 py-5 md:px-8 lg:px-10">
      <div class="mx-auto max-w-6xl space-y-6">
        <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 class="text-2xl font-semibold tracking-tight text-ink-primary">创作</h2>
            <p class="mt-1 text-sm text-ink-muted">{{ activePlan.description }}</p>
          </div>
          <div class="flex items-center gap-2">
            <AppButton size="md" variant="secondary" @click="router.push('/characters')">导入角色</AppButton>
            <AppButton size="md" variant="gradient" @click="createTarget">
              {{ activePlan.actionLabel }}
            </AppButton>
          </div>
        </header>

        <section class="grid gap-4 lg:grid-cols-2">
          <button
            v-for="mode in modeCards"
            :key="mode.key"
            class="min-h-[150px] rounded-2xl p-6 text-left ring-1 transition-all"
            :class="activeMode === mode.key
              ? 'bg-brand-500/15 ring-brand-500/40 shadow-glow'
              : 'bg-surface ring-border-subtle hover:ring-brand-500/35'"
            @click="activeMode = mode.key"
          >
            <span
              class="inline-flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold"
              :class="activeMode === mode.key ? 'bg-brand-gradient text-white' : 'bg-surface-sunken text-brand-300 ring-1 ring-border-subtle'"
            >
              +
            </span>
            <h3 class="mt-5 text-xl font-semibold text-ink-primary">{{ mode.title }}</h3>
            <p class="mt-2 max-w-xl text-sm leading-relaxed text-ink-secondary">{{ mode.description }}</p>
          </button>
        </section>

        <section class="space-y-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <button
                v-for="kind in kindTabs"
                :key="kind.key"
                class="rounded-lg px-4 py-2 text-sm font-semibold transition-all"
                :class="activeKind === kind.key
                  ? 'bg-brand-500/20 text-brand-200 ring-1 ring-brand-500/40'
                  : 'text-ink-secondary hover:bg-white/5 hover:text-ink-primary'"
                @click="activeKind = kind.key"
              >
                {{ kind.label }}
              </button>
            </div>
            <p class="text-sm font-medium text-ink-muted">{{ activePlan.title }}</p>
          </div>

          <div v-if="activeKind === 'story'">
            <div v-if="!sortedStories.length" class="rounded-2xl bg-surface p-10 text-center ring-1 ring-border-subtle">
              <p class="text-lg font-semibold text-ink-primary">还没有故事开局</p>
              <p class="mt-2 text-sm text-ink-muted">先从一个角色和场景开始。</p>
              <AppButton class="mt-5" size="md" @click="createTarget">开始创建故事</AppButton>
            </div>
            <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <button
                v-for="story in sortedStories"
                :key="story.id"
                class="rounded-2xl bg-surface p-5 text-left ring-1 ring-border-subtle transition-all hover:ring-brand-500/40 hover:shadow-glow"
                @click="openStory(story)"
              >
                <div class="flex gap-4">
                  <img
                    v-if="storyThumbnail(story)"
                    :src="storyThumbnail(story)"
                    class="h-20 w-14 shrink-0 rounded-lg object-cover ring-1 ring-border-subtle"
                  />
                  <div v-else class="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-lg font-semibold text-brand-300 ring-1 ring-border-subtle">
                    S
                  </div>
                  <div class="min-w-0 flex-1">
                    <h4 class="truncate text-base font-semibold text-ink-primary">{{ story.title }}</h4>
                    <p class="mt-1 truncate text-sm text-ink-muted">{{ getStoryCharacter(story)?.name || '角色已缺失' }}</p>
                    <p class="mt-2 line-clamp-2 min-h-[2.75rem] text-sm leading-relaxed text-ink-secondary">
                      {{ story.summary || story.scenario || '这个故事开局还没有简介。' }}
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div v-else>
            <div v-if="!sortedCharacters.length" class="rounded-2xl bg-surface p-10 text-center ring-1 ring-border-subtle">
              <p class="text-lg font-semibold text-ink-primary">还没有角色卡</p>
              <p class="mt-2 text-sm text-ink-muted">先创建一个能聊天的角色。</p>
              <AppButton class="mt-5" size="md" @click="createTarget">开始创建角色</AppButton>
            </div>
            <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <button
                v-for="character in sortedCharacters"
                :key="character.avatar"
                class="rounded-2xl bg-surface p-5 text-left ring-1 ring-border-subtle transition-all hover:ring-brand-500/40 hover:shadow-glow"
                @click="openCharacter(character)"
              >
                <div class="flex gap-4">
                  <img
                    v-if="character.avatar && character.avatar !== 'none'"
                    :src="`/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}`"
                    class="h-20 w-14 shrink-0 rounded-lg object-cover ring-1 ring-border-subtle"
                  />
                  <div v-else class="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-lg font-semibold text-brand-300 ring-1 ring-border-subtle">
                    C
                  </div>
                  <div class="min-w-0 flex-1">
                    <h4 class="truncate text-base font-semibold text-ink-primary">{{ character.name }}</h4>
                    <p class="mt-1 text-sm text-ink-muted">{{ character.chat_size ? `${character.chat_size} 条聊天` : '未开始' }}</p>
                    <p class="mt-2 line-clamp-2 min-h-[2.75rem] text-sm leading-relaxed text-ink-secondary">
                      {{ getCharacterDescription(character) }}
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
