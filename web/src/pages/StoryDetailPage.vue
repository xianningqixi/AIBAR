<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { useModsStore } from '@/stores/mods'
import { deleteStory, getStory, saveStory } from '@/api/stories'
import { createChatFromStory } from '@/lib/storyStart'
import { generateReply } from '@/api/generate'
import { getApiErrorMessage } from '@/api/client'
import { buildGeneratePayload } from '@/lib/buildPayload'
import { getMatchedWorldInfo } from '@/lib/worldInfoMatch'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { listWorldInfo } from '@/api/worldinfo'
import type { Character, StoryCard, WorldInfoSummary } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import ModPicker from '@/components/mods/ModPicker.vue'

const route = useRoute()
const router = useRouter()
const chars = useCharactersStore()
const ui = useUiStore()
const mods = useModsStore()
const models = useModelProfilesStore()

const storyId = computed(() => decodeURIComponent((route.params.id as string) || ''))
const story = ref<StoryCard | null>(null)
const character = ref<Character | null>(null)
const loading = ref(false)
const starting = ref(false)
const startModIds = ref<string[]>([])
const worlds = ref<WorldInfoSummary[]>([])

const testModel = reactive({
  profileId: '',
  world: '',
  prompt: '',
  loading: false,
  result: '',
  error: '',
})

const tags = computed(() => story.value?.tags || [])
const storyHeroImage = computed(() => {
  if (story.value?.coverImage) return story.value.coverImage
  if (character.value?.avatar && character.value.avatar !== 'none') {
    return `/characters/${encodeURIComponent(character.value.avatar)}`
  }
  return ''
})
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
      models.loadSecrets(),
    ])
    story.value = await getStory(storyId.value)
    character.value = chars.findCharacter(story.value.characterAvatar) || null
    startModIds.value = [...(story.value.modIds || [])]
    worlds.value = await listWorldInfo().catch(() => [])
    testModel.profileId = story.value.modelProfileId || models.activeProfileId
    testModel.world = story.value.world || ''
  } catch (e: unknown) {
    ui.addToast(`加载失败：${getApiErrorMessage(e)}`, 'error')
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
  } catch (e: unknown) {
    ui.addToast(`开始故事失败：${getApiErrorMessage(e)}`, 'error')
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
  } catch (e: unknown) {
    ui.addToast(`保存失败：${getApiErrorMessage(e)}`, 'error')
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
  } catch (e: unknown) {
    ui.addToast(`保存失败：${getApiErrorMessage(e)}`, 'error')
  }
}

async function runStoryTest() {
  if (!story.value || !character.value) {
    ui.addToast('故事或角色数据不完整', 'warning')
    return
  }
  if (!testModel.prompt.trim()) {
    ui.addToast('请输入测试输入', 'warning')
    return
  }
  const profile = models.getProfile(testModel.profileId) || models.activeProfile
  if (!profile) {
    ui.addToast('未配置可用模型', 'warning')
    return
  }
  testModel.loading = true
  testModel.result = ''
  testModel.error = ''
  try {
    const worldName = testModel.world || story.value?.world || ''
    const draftCharacter: Character = {
      ...character.value,
      scenario: story.value.scenario || character.value.scenario || '',
      data: {
        ...character.value.data,
        name: character.value.name,
        scenario: story.value.scenario || character.value.data?.scenario || '',
        system_prompt: [character.value.data?.system_prompt || '', story.value.systemAppend || ''].filter(Boolean).join('\n\n'),
      },
    }
    const worldInfoText = await getMatchedWorldInfo(worldName, draftCharacter, [
      { role: 'user', content: testModel.prompt },
    ])
    const payload = buildGeneratePayload(
      profile,
      draftCharacter,
      [{ role: 'user', content: testModel.prompt }],
      worldInfoText,
      [],
    )
    const reply = await generateReply(payload)
    testModel.result = reply || '(模型返回了空响应)'
  } catch (e: unknown) {
    testModel.error = getApiErrorMessage(e, '生成失败')
  } finally {
    testModel.loading = false
  }
}

function exportStoryJSON() {
  if (!story.value) return
  const blob = new Blob([JSON.stringify(story.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${story.value.title || 'story'}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  ui.addToast('故事卡已导出', 'success')
}

async function importStoryJSON() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text) as Partial<StoryCard>
      if (!data.title) {
        ui.addToast('JSON 缺少 title 字段', 'warning')
        return
      }
      const saved = await saveStory({
        ...data,
        id: undefined,
      })
      ui.addToast('故事卡已导入', 'success')
      router.push(`/story/${encodeURIComponent(saved.id)}`)
    } catch (e: unknown) {
      ui.addToast(`导入失败：${getApiErrorMessage(e)}`, 'error')
    }
  }
  input.click()
}

async function duplicateStory() {
  if (!story.value) return
  const newTitle = window.prompt('副本标题', `${story.value.title} 副本`)
  if (!newTitle?.trim()) return
  try {
    const saved = await saveStory({
      ...story.value,
      id: undefined,
      title: newTitle.trim(),
    })
    ui.addToast('故事卡已复制', 'success')
    router.push(`/story/${encodeURIComponent(saved.id)}`)
  } catch (e: unknown) {
    ui.addToast(`复制失败：${getApiErrorMessage(e)}`, 'error')
  }
}

async function removeStory() {
  if (!story.value) return
  if (!window.confirm(`删除故事卡「${story.value.title}」？已创建的聊天存档不会删除。`)) return
  try {
    await deleteStory(story.value.id)
    ui.addToast('故事卡已删除', 'success')
    router.push({ path: '/browse', query: { tab: 'stories' } })
  } catch (e: unknown) {
    ui.addToast(`删除失败：${getApiErrorMessage(e)}`, 'error')
  }
}

onMounted(loadData)
</script>

<template>
  <div class="min-h-[100dvh] bg-bg">
    <!-- 开始故事只保留 hero 中的主按钮，避免与标题栏重复 -->
    <AppPageHeader title="故事卡详情" back-to="/browse?tab=stories" width="4xl">
      <template #actions>
        <AppButton v-if="story" size="sm" variant="secondary" @click="router.push(`/story/${encodeURIComponent(story.id)}/edit`)">编辑</AppButton>
        <AppButton v-if="story" size="sm" variant="secondary" @click="router.push({ path: '/publish', query: { type: 'story', sourceId: story.id } })">发布</AppButton>
      </template>
    </AppPageHeader>

    <div v-if="loading" class="flex justify-center py-16">
      <AppSpinner size="lg" />
    </div>

    <main v-else-if="story" class="max-w-4xl mx-auto px-5 py-6 md:px-8 lg:px-10 space-y-4 animate-fade-in-up">
      <section class="relative overflow-hidden rounded-2xl ring-1 ring-border-subtle bg-hero-radial">
        <div
          v-if="storyHeroImage"
          class="absolute inset-0 bg-cover bg-center opacity-15 blur-2xl pointer-events-none"
          :style="{ backgroundImage: `url(${storyHeroImage})` }"
        />
        <div class="absolute -top-16 -right-12 w-72 h-72 rounded-full bg-accent-500/25 blur-3xl pointer-events-none" />
        <div class="absolute -bottom-20 -left-8 w-72 h-72 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />
        <div class="relative p-5 md:p-7 flex flex-wrap items-start gap-6">
          <div class="relative shrink-0">
            <img
              v-if="storyHeroImage"
              :src="storyHeroImage"
              class="w-40 aspect-[3/4] rounded-2xl object-cover ring-2 ring-accent-500/40 shadow-glow-accent"
            />
            <div
              v-else
              class="w-40 aspect-[3/4] rounded-2xl bg-brand-soft ring-2 ring-accent-500/40 flex items-center justify-center text-accent-300 shadow-glow-accent"
            >
              <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span class="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-brand-gradient text-white text-[11px] font-medium shadow-glow">
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
              <span v-else class="inline-flex items-center gap-1.5 text-sm text-red-600">
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
        <dl class="grid gap-4 sm:grid-cols-2 text-sm">
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

      <AppCard padding="md" class="space-y-4" tone="glow">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <span class="w-1 h-4 rounded-full bg-brand-gradient" />
              测试区
            </h3>
            <p class="text-xs text-ink-muted mt-1">使用当前故事设定和选定模型做一次单轮测试，不写入任何聊天记录。</p>
          </div>
          <AppButton size="sm" variant="gradient" :disabled="testModel.loading" @click="runStoryTest">
            {{ testModel.loading ? '生成中…' : '▶ 运行测试' }}
          </AppButton>
        </div>
        <div class="grid md:grid-cols-2 gap-4">
          <AppFormField label="使用 Profile">
            <AppSelect v-model="testModel.profileId">
              <option v-for="p in models.profiles" :key="p.id" :value="p.id">
                {{ p.name }} · {{ p.model }}
              </option>
            </AppSelect>
          </AppFormField>
          <AppFormField label="世界书">
            <AppSelect v-model="testModel.world">
              <option value="">不绑定</option>
              <option v-for="w in worlds" :key="w.file_id" :value="w.file_id">
                {{ w.name || w.file_id }}
              </option>
            </AppSelect>
          </AppFormField>
        </div>
        <AppFormField label="测试输入">
          <AppTextarea v-model="testModel.prompt" :rows="3" auto-grow placeholder="例如：你收到了一封匿名信…" />
        </AppFormField>
        <div v-if="testModel.result || testModel.error" class="space-y-2">
          <h4 class="text-xs font-semibold text-ink-muted">输出</h4>
          <div
            v-if="testModel.error"
            class="text-xs whitespace-pre-wrap bg-red-500/10 text-red-600 ring-1 ring-red-500/20 p-3 rounded-lg"
          >
            {{ testModel.error }}
          </div>
          <div
            v-else
            class="text-sm whitespace-pre-wrap text-ink-primary bg-surface-sunken ring-1 ring-border-subtle p-3 rounded-lg leading-relaxed max-h-72 overflow-y-auto"
          >
            {{ testModel.result }}
          </div>
        </div>
      </AppCard>

      <AppCard padding="md">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary mb-3">
          <span class="w-1 h-4 rounded-full bg-brand-gradient" />
          管理
        </h3>
        <div class="flex flex-wrap gap-2">
          <AppButton variant="secondary" @click="exportStoryJSON">导出 JSON</AppButton>
          <AppButton variant="secondary" @click="importStoryJSON">导入 JSON</AppButton>
          <AppButton variant="secondary" @click="duplicateStory">复制副本</AppButton>
          <AppButton variant="danger" @click="removeStory">删除故事卡</AppButton>
        </div>
        <p class="mt-3 text-xs text-ink-muted">
          删除故事卡只删除模板,不会删除已经从它开始的聊天记录。
        </p>
      </AppCard>
    </main>
  </div>
</template>
