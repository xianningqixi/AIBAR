<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { useModsStore } from '@/stores/mods'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { saveStory } from '@/api/stories'
import { listWorldInfo } from '@/api/worldinfo'
import type { Character, WorldInfoSummary } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import ModPicker from '@/components/mods/ModPicker.vue'

const route = useRoute()
const router = useRouter()
const chars = useCharactersStore()
const ui = useUiStore()
const mods = useModsStore()
const models = useModelProfilesStore()

const characterAvatar = ref<string>((route.query.avatar as string) || '')
const title = ref('')
const summary = ref('')
const scenario = ref('')
const openingUserMessage = ref('')
const useCharGreeting = ref(true)
const customAssistantOpening = ref('')
const tags = ref('')
const world = ref('')
const systemAppend = ref('')
const modelProfileId = ref('')
const modIds = ref<string[]>([])
const worlds = ref<WorldInfoSummary[]>([])
const submitting = ref(false)

const selectedCharacter = computed<Character | null>(() => {
  return chars.findCharacter(characterAvatar.value) || null
})

const assistantOpening = computed(() => {
  if (!useCharGreeting.value) return customAssistantOpening.value.trim()
  const data = selectedCharacter.value?.data
  return (data?.first_mes || '').trim()
})

const defaultTitle = computed(() => {
  return selectedCharacter.value ? `${selectedCharacter.value.name} 的新故事` : ''
})

function parseTags(value: string): string[] {
  return value
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

async function createStory() {
  if (!selectedCharacter.value) {
    ui.addToast('请先选择角色', 'warning')
    return
  }
  const storyTitle = title.value.trim() || defaultTitle.value
  if (!storyTitle) {
    ui.addToast('故事标题不能为空', 'warning')
    return
  }

  submitting.value = true
  try {
    const story = await saveStory({
      title: storyTitle,
      summary: summary.value.trim(),
      characterAvatar: selectedCharacter.value.avatar,
      tags: parseTags(tags.value),
      world: world.value,
      scenario: scenario.value.trim(),
      openingUserMessage: openingUserMessage.value.trim(),
      openingAssistantMessage: assistantOpening.value,
      systemAppend: systemAppend.value.trim(),
      modelProfileId: modelProfileId.value,
      modIds: modIds.value,
    })
    ui.addToast('故事卡已保存', 'success')
    router.push(`/story/${encodeURIComponent(story.id)}`)
  } catch (e: any) {
    ui.addToast(`保存失败：${e.message}`, 'error')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    chars.characters.length ? Promise.resolve() : chars.load(),
    mods.load(),
    models.loadSecrets(),
  ])
  worlds.value = await listWorldInfo().catch(() => [])
  if (!characterAvatar.value && chars.characters.length) {
    characterAvatar.value = chars.characters[0].avatar
  }
})
</script>

<template>
  <div class="min-h-screen bg-bg">
    <AppPageHeader title="新建故事卡" back-to="/browse?tab=stories">
      <template #actions>
        <AppButton variant="gradient" :disabled="submitting" @click="createStory">
          {{ submitting ? '保存中…' : '保存故事卡' }}
        </AppButton>
      </template>
    </AppPageHeader>

    <main class="max-w-4xl mx-auto px-5 py-6 space-y-4">
      <section class="relative overflow-hidden rounded-2xl ring-1 ring-border-subtle bg-hero-radial">
        <div class="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-accent-500/20 blur-3xl pointer-events-none" />
        <div class="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-brand-500/15 blur-3xl pointer-events-none" />
        <div class="relative p-5 md:p-7 max-w-2xl">
          <p class="text-[11px] uppercase tracking-[0.2em] text-accent-300/80 mb-2">故事模板</p>
          <h2 class="text-xl md:text-2xl font-semibold text-ink-primary">
            把一段 <span class="text-brand-300">设定</span> 保存成可复用的故事卡
          </h2>
          <p class="mt-1.5 text-xs md:text-sm text-ink-secondary">
            标题 / 场景 / 开场消息 / 默认 MOD,都会写入故事卡。下次进入聊天前可以快速基于它开新存档。
          </p>
        </div>
      </section>

      <AppCard padding="md" class="space-y-4">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          <span class="w-1 h-4 rounded-full bg-brand-gradient" />
          基本信息
        </h3>
        <AppFormField label="选择角色" required>
          <AppSelect v-model="characterAvatar">
            <option value="" disabled>请选择…</option>
            <option v-for="c in chars.characters" :key="c.avatar" :value="c.avatar">
              {{ c.name }}
            </option>
          </AppSelect>
        </AppFormField>

        <div v-if="selectedCharacter" class="flex items-center gap-3 p-3 bg-surface-sunken rounded-lg ring-1 ring-border-subtle">
          <img
            v-if="selectedCharacter.avatar && selectedCharacter.avatar !== 'none'"
            :src="`/thumbnail?type=avatar&file=${encodeURIComponent(selectedCharacter.avatar)}`"
            class="w-12 h-12 rounded-lg object-cover ring-1 ring-border-subtle"
          />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-ink-primary truncate">{{ selectedCharacter.name }}</p>
            <p class="text-xs text-ink-muted truncate">
              {{ selectedCharacter.description || selectedCharacter.data?.description || '无描述' }}
            </p>
          </div>
        </div>

        <AppFormField label="故事标题" required>
          <AppInput v-model="title" :placeholder="defaultTitle" />
        </AppFormField>

        <AppFormField label="简介" hint="展示在故事卡列表,不会直接作为聊天消息。">
          <AppTextarea v-model="summary" :rows="3" auto-grow placeholder="这个故事的看点、目标或背景。" />
        </AppFormField>

        <AppFormField label="标签" hint="逗号或换行分隔。">
          <AppInput v-model="tags" placeholder="悬疑, 学院, 长线" />
        </AppFormField>
      </AppCard>

      <AppCard padding="md" class="space-y-4">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          <span class="w-1 h-4 rounded-full bg-brand-gradient" />
          剧本模板
        </h3>
        <AppFormField label="故事场景" hint="开始聊天后会注入 system prompt,不会变成聊天记录。">
          <AppTextarea v-model="scenario" :rows="6" auto-grow placeholder="地点、当前局面、目标、关系、限制条件。" />
        </AppFormField>

        <AppFormField label="玩家开场" hint="可选。开始故事时作为第一条用户消息写入新聊天。">
          <AppTextarea v-model="openingUserMessage" :rows="3" auto-grow placeholder="我推开门,走进雨夜里的酒馆。" />
        </AppFormField>

        <div class="space-y-3">
          <label class="flex items-center gap-2 text-xs text-ink-secondary cursor-pointer">
            <input v-model="useCharGreeting" type="checkbox" class="accent-brand-500" />
            使用角色卡自带开场白作为 AI 开场
          </label>
          <div v-if="useCharGreeting" class="text-xs text-ink-muted whitespace-pre-wrap bg-surface-sunken p-3 rounded-md ring-1 ring-border-subtle max-h-48 overflow-y-auto">
            {{ assistantOpening || '(角色卡没有开场白)' }}
          </div>
          <AppFormField v-else label="AI 开场">
            <AppTextarea
              v-model="customAssistantOpening"
              :rows="5"
              auto-grow
              placeholder="角色或旁白对玩家开场的回应。"
            />
          </AppFormField>
        </div>

        <AppFormField label="额外系统规则" hint="可选。比如叙事节奏、禁忌、玩法规则。">
          <AppTextarea v-model="systemAppend" :rows="4" auto-grow />
        </AppFormField>
      </AppCard>

      <AppCard padding="md" class="space-y-4">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          <span class="w-1 h-4 rounded-full bg-brand-gradient" />
          默认配置
        </h3>
        <AppFormField label="世界书">
          <AppSelect v-model="world">
            <option value="">不绑定</option>
            <option v-for="w in worlds" :key="w.file_id" :value="w.file_id">
              {{ w.name || w.file_id }}
            </option>
          </AppSelect>
        </AppFormField>

        <AppFormField label="模型配置">
          <AppSelect v-model="modelProfileId">
            <option value="">使用默认模型</option>
            <option v-for="profile in models.profiles" :key="profile.id" :value="profile.id">
              {{ profile.name }} · {{ profile.model }}
            </option>
          </AppSelect>
        </AppFormField>

        <ModPicker
          v-model="modIds"
          :mods="mods.mods"
          title="默认加载 MOD"
          description="保存到故事卡模板里。每次开始故事时会默认勾选这些 MOD,也可以临时调整。"
        />
      </AppCard>

      <p class="text-xs text-ink-muted">
        故事卡是可复用模板。点击开始故事时才会创建新的 ST 聊天记录,同一个故事可以开多条不同存档。
      </p>
    </main>
  </div>
</template>
