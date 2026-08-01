<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { listStories } from '@/api/stories'
import type { Character, StoryCard } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'

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
    key: 'simple' as const,
    title: '简易创作',
    description: '一句想法开始，AI 追问几个选项，再生成可手改的初稿。',
  },
  {
    key: 'advanced' as const,
    title: '高级创作',
    description: '直接进入完整表单，自己控制全部字段、世界书、模型和 MOD。',
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
  <div class="min-h-[100dvh] bg-bg">
    <AppPageHeader
      title="创作"
      subtitle="从一句想法开始，做成角色卡或故事开局"
      back-to="/browse"
      mobile-only-back
    >
      <template #actions>
        <AppButton size="sm" variant="secondary" @click="router.push('/hub')">导入资源</AppButton>
      </template>
    </AppPageHeader>

    <main class="w-full flex-1 px-5 py-6 md:px-8 lg:px-10">
      <div class="mx-auto max-w-6xl space-y-6 animate-fade-in-up">
        <!-- 创建向导：类型 + 方式 + 说明 + 主操作集中在一张卡里 -->
        <section class="rounded-2xl bg-surface p-5 ring-1 ring-border-subtle md:p-6">
          <div class="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div class="min-w-0 space-y-4">
              <div class="flex flex-wrap gap-x-8 gap-y-4">
                <div>
                  <p class="mb-1.5 text-[11px] font-semibold text-ink-muted">创作什么</p>
                  <div class="inline-flex rounded-xl bg-surface-sunken p-1 ring-1 ring-border-subtle">
                    <button
                      v-for="kind in kindTabs"
                      :key="kind.key"
                      class="rounded-lg px-4 py-1.5 text-sm font-semibold transition-all"
                      :class="activeKind === kind.key
                        ? 'bg-brand-gradient text-white shadow-glow'
                        : 'text-ink-secondary hover:text-ink-primary'"
                      @click="activeKind = kind.key"
                    >
                      {{ kind.label }}
                    </button>
                  </div>
                </div>
                <div>
                  <p class="mb-1.5 text-[11px] font-semibold text-ink-muted">怎么开始</p>
                  <div class="inline-flex rounded-xl bg-surface-sunken p-1 ring-1 ring-border-subtle">
                    <button
                      v-for="mode in modeCards"
                      :key="mode.key"
                      class="rounded-lg px-4 py-1.5 text-sm font-semibold transition-all"
                      :class="activeMode === mode.key
                        ? 'bg-brand-gradient text-white shadow-glow'
                        : 'text-ink-secondary hover:text-ink-primary'"
                      :title="mode.description"
                      @click="activeMode = mode.key"
                    >
                      {{ mode.title }}
                    </button>
                  </div>
                </div>
              </div>
              <p class="text-sm leading-relaxed text-ink-secondary">{{ activePlan.description }}</p>
            </div>
            <AppButton class="shrink-0" size="lg" variant="gradient" @click="createTarget">
              {{ activePlan.actionLabel }}
            </AppButton>
          </div>
        </section>

        <section class="space-y-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <span class="h-1.5 w-1.5 rounded-full bg-brand-gradient" />
              已有{{ activeKind === 'story' ? '故事开局' : '角色卡' }}
              <span class="text-xs font-normal text-ink-muted">
                {{ activeKind === 'story' ? sortedStories.length : sortedCharacters.length }}
              </span>
            </h3>
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
                class="flex h-full flex-col rounded-2xl bg-surface p-5 text-left ring-1 ring-border-subtle transition-all duration-200 hover:-translate-y-0.5 hover:ring-brand-500/40 hover:shadow-glow"
                @click="openStory(story)"
              >
                <div class="flex flex-1 gap-4">
                  <img
                    v-if="storyThumbnail(story)"
                    :src="storyThumbnail(story)"
                    class="h-20 w-14 shrink-0 rounded-lg object-cover ring-1 ring-border-subtle"
                    loading="lazy"
                  />
                  <div v-else class="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-lg font-semibold text-brand-300 ring-1 ring-border-subtle">
                    S
                  </div>
                  <div class="flex min-w-0 flex-1 flex-col">
                    <h4 class="truncate text-base font-semibold text-ink-primary">{{ story.title }}</h4>
                    <p class="mt-1 truncate text-sm text-ink-muted">{{ getStoryCharacter(story)?.name || '角色已缺失' }}</p>
                    <p class="mt-auto line-clamp-2 min-h-[2.75rem] pt-2 text-sm leading-relaxed text-ink-secondary">
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
                class="flex h-full flex-col rounded-2xl bg-surface p-5 text-left ring-1 ring-border-subtle transition-all duration-200 hover:-translate-y-0.5 hover:ring-brand-500/40 hover:shadow-glow"
                @click="openCharacter(character)"
              >
                <div class="flex flex-1 gap-4">
                  <img
                    v-if="character.avatar && character.avatar !== 'none'"
                    :src="`/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}`"
                    class="h-20 w-14 shrink-0 rounded-lg object-cover ring-1 ring-border-subtle"
                    loading="lazy"
                  />
                  <div v-else class="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-lg font-semibold text-brand-300 ring-1 ring-border-subtle">
                    C
                  </div>
                  <div class="flex min-w-0 flex-1 flex-col">
                    <h4 class="truncate text-base font-semibold text-ink-primary">{{ character.name }}</h4>
                    <p class="mt-1 text-sm text-ink-muted">{{ character.chat_size ? `${character.chat_size} 条聊天` : '未开始' }}</p>
                    <p class="mt-auto line-clamp-2 min-h-[2.75rem] pt-2 text-sm leading-relaxed text-ink-secondary">
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
