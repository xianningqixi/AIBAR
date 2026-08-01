<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharactersStore } from '@/stores/characters'
import { useModsStore, type ModItem } from '@/stores/mods'
import { useUiStore } from '@/stores/ui'
import { listStories } from '@/api/stories'
import { publishCommunityWork, type CommunityWorkType } from '@/api/community'
import type { StoryCard } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppCard from '@/components/ui/AppCard.vue'
import { getApiErrorMessage } from '@/api/client'

const route = useRoute()
const router = useRouter()
const chars = useCharactersStore()
const mods = useModsStore()
const ui = useUiStore()
const stories = ref<StoryCard[]>([])
const loading = ref(false)
const publishing = ref(false)

function initialSourceType(): CommunityWorkType {
  return route.query.type === 'story' || route.query.type === 'mod' ? route.query.type : 'character'
}

const form = reactive({
  sourceType: initialSourceType(),
  sourceId: typeof route.query.sourceId === 'string' ? route.query.sourceId : '',
  title: '',
  summary: '',
  tags: '',
  versionNote: '',
})

const workId = computed(() => typeof route.query.workId === 'string' ? route.query.workId : '')
const selectedMod = computed(() => form.sourceType === 'mod' ? mods.getMod(form.sourceId) : undefined)
const modPositionLabels: Record<ModItem['position'], string> = {
  system_prepend: '系统前缀',
  system_append: '系统后缀',
  user_suffix: '用户后缀',
}
const sourceOptions = computed(() => {
  if (form.sourceType === 'character') {
    return chars.characters.map(item => ({ id: item.avatar, title: item.name }))
  }
  if (form.sourceType === 'story') {
    return stories.value.map(item => ({ id: item.id, title: item.title }))
  }
  return mods.mods
    .filter(item => !item.builtin)
    .map(item => ({ id: item.id, title: item.name }))
})

function applySourceDefaults() {
  if (form.sourceType === 'character') {
    const source = chars.findCharacter(form.sourceId)
    if (!source) return
    form.title = source.name
    form.summary = source.description || source.data?.description || ''
    form.tags = (source.tags || source.data?.tags || []).join(', ')
  } else if (form.sourceType === 'story') {
    const source = stories.value.find(item => item.id === form.sourceId)
    if (!source) return
    form.title = source.title
    form.summary = source.summary || source.scenario || ''
    form.tags = (source.tags || []).join(', ')
  } else {
    const source = mods.getMod(form.sourceId)
    if (!source || source.builtin) return
    form.title = source.name
    form.summary = source.description
    form.tags = ''
  }
}

watch(() => form.sourceType, () => {
  form.sourceId = ''
  form.title = ''
  form.summary = ''
  form.tags = ''
})
watch(() => form.sourceId, applySourceDefaults)

async function load() {
  loading.value = true
  try {
    const [, loadedStories] = await Promise.all([chars.load(), listStories(), mods.load()])
    stories.value = loadedStories
    if (form.sourceId) applySourceDefaults()
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (!form.sourceId || !form.title.trim()) {
    ui.addToast('请选择私人来源并填写标题', 'warning')
    return
  }
  publishing.value = true
  try {
    if (form.sourceType === 'mod') await mods.flushPersist()
    const work = await publishCommunityWork({
      sourceType: form.sourceType,
      sourceId: form.sourceId,
      workId: workId.value || undefined,
      title: form.title.trim(),
      summary: form.summary.trim(),
      tags: form.tags.split(/[,，、\n]/).map(item => item.trim()).filter(Boolean),
      versionNote: form.versionNote.trim(),
    })
    ui.addToast(workId.value ? `已发布 v${work.versionNumber}` : '作品已发布', 'success')
    router.replace(`/work/${encodeURIComponent(work.id)}`)
  } catch (e: unknown) {
    ui.addToast(`发布失败：${getApiErrorMessage(e)}`, 'error')
  } finally {
    publishing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="min-h-[100dvh] bg-bg">
    <AppPageHeader :title="workId ? '发布新版本' : '发布作品'" back-to="/hub" width="4xl" />
    <main class="mx-auto max-w-4xl px-5 py-6 md:px-8 lg:px-10">
      <form class="space-y-6" @submit.prevent="submit">
        <AppCard padding="lg">
          <h2 class="mb-3 text-base font-semibold text-ink-primary">选择私人来源</h2>
          <div class="grid gap-4 sm:grid-cols-2">
            <AppFormField label="作品类型" required>
              <AppSelect v-model="form.sourceType" :disabled="Boolean(workId)">
                <option value="character">角色卡</option>
                <option value="story">故事卡</option>
                <option value="mod">提示词</option>
              </AppSelect>
            </AppFormField>
            <AppFormField :label="form.sourceType === 'mod' ? '私人提示词' : '私人作品'" required>
              <AppSelect v-model="form.sourceId" :disabled="loading">
                <option value="">请选择</option>
                <option v-for="item in sourceOptions" :key="item.id" :value="item.id">{{ item.title }}</option>
              </AppSelect>
            </AppFormField>
          </div>
        </AppCard>

        <AppCard v-if="selectedMod" padding="lg">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-base font-semibold text-ink-primary">发布内容预览</h2>
            <span class="rounded bg-surface-sunken px-2 py-1 text-xs text-ink-secondary">{{ modPositionLabels[selectedMod.position] }}</span>
          </div>
          <pre class="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-sunken p-4 font-sans text-sm leading-7 text-ink-secondary">{{ selectedMod.content }}</pre>
        </AppCard>

        <AppCard padding="lg">
          <h2 class="mb-3 text-base font-semibold text-ink-primary">公开版本信息</h2>
          <div class="space-y-4">
            <AppFormField label="标题" required><AppInput v-model="form.title" :disabled="loading" /></AppFormField>
            <AppFormField label="简介"><AppTextarea v-model="form.summary" :rows="5" /></AppFormField>
            <AppFormField label="标签" hint="最多 8 个，用逗号分隔"><AppInput v-model="form.tags" placeholder="剧情, 角色扮演" /></AppFormField>
            <AppFormField label="版本说明"><AppInput v-model="form.versionNote" placeholder="本次更新内容" /></AppFormField>
          </div>
        </AppCard>

        <div class="flex items-center justify-end gap-3">
          <AppButton variant="secondary" @click="router.back()">取消</AppButton>
          <AppButton type="submit" :disabled="publishing || loading">{{ publishing ? '发布中…' : '发布不可变版本' }}</AppButton>
        </div>
      </form>
    </main>
  </div>
</template>
