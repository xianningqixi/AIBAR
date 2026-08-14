<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { createCharacter, editCharacter, editCharacterAvatar, fetchCharacter } from '@/api/characters'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useImageGenStore } from '@/stores/imageGen'
import { useWorldInfoStore } from '@/stores/worldInfo'
import { generateReply } from '@/api/generate'
import { apiGetBlob, getApiErrorMessage } from '@/api/client'
import { confirmDialog } from '@/composables/useDialog'
import { buildGeneratePayload } from '@/lib/buildPayload'
import { getMatchedWorldInfo } from '@/lib/worldInfoMatch'
import type { Character, ImageAsset } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import ImageGenerateBox from '@/components/image/ImageGenerateBox.vue'
import { useSessionStore } from '@/stores/session'
import {
  buildCharacterDraftPayload,
  buildCharacterDraftQuestionsPayload,
  parseCharacterDraft,
  type CharacterDraft,
} from '@/lib/aiDraft'
import { useAiDraft } from '@/composables/useAiDraft'
import { buildCharacterImagePrompt } from '@/lib/imagePrompts'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const chars = useCharactersStore()
const ui = useUiStore()
const models = useModelProfilesStore()
const imageGen = useImageGenStore()

const avatar = computed(() => decodeURIComponent((route.params.avatar as string) || ''))
const isEdit = computed(() => Boolean(avatar.value))
const createMode = computed(() => route.query.mode === 'advanced' ? 'advanced' : 'simple')
const isAdvancedCreate = computed(() => !isEdit.value && createMode.value === 'advanced')
const pageTitle = computed(() => {
  if (isEdit.value) return '编辑角色'
  return isAdvancedCreate.value ? '高级创建角色' : '简易创建角色'
})
const backTo = computed(() => isEdit.value ? '/characters' : '/create?kind=character')
const loading = ref(false)
const original = ref<Character | null>(null)
const worldInfoStore = useWorldInfoStore()
const worlds = computed(() => worldInfoStore.worlds)
const generatedAvatar = ref<ImageAsset | null>(null)
const uploadedAvatarFile = ref<File | null>(null)
const applyingAvatar = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)

const uploadedAvatarUrl = computed(() => uploadedAvatarFile.value ? URL.createObjectURL(uploadedAvatarFile.value) : '')

const editorSections = [
  { id: 'draft-card', label: 'AI 起草' },
  { id: 'basic-card', label: '人物设定' },
  { id: 'image-card', label: '角色图片' },
  { id: 'chat-card', label: '对话样本' },
  { id: 'advanced-card', label: '高级字段' },
  { id: 'test-card', label: '试聊检查' },
]
const activeSection = ref('basic-card')
function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
let sectionObserver: IntersectionObserver | null = null

const form = reactive({
  ch_name: '',
  description: '',
  personality: '',
  scenario: '',
  first_mes: '',
  mes_example: '',
  creator_notes: '',
  tags: '',
  creator: '',
  character_version: '',
  system_prompt: '',
  post_history_instructions: '',
  alternate_greetings: '',
  world: '',
})

const test = reactive({
  profileId: '',
  world: '',
  prompt: '',
  loading: false,
  result: '',
  error: '',
})

const {
  draft,
  getDraftProfile,
  defaultDraftProfileId,
  selectDraftOption,
  useCustomDraftAnswer,
  isDraftOptionSelected,
  isCustomDraftAnswer,
  askDraftQuestions,
  draftWithAi,
} = useAiDraft<CharacterDraft>({
  ideaRequiredMessage: '先写一句你想要的角色方向',
  draftReadyMessage: 'AI 初稿已填入表单，可以继续手改',
  buildQuestionsPayload: (profile, idea) => buildCharacterDraftQuestionsPayload(profile, idea, { ...form }),
  buildDraftPayload: (profile, idea, guidance) => buildCharacterDraftPayload(profile, idea, { ...form }, guidance),
  parseDraft: parseCharacterDraft,
  applyDraft: (result) => {
    if (result.ch_name) form.ch_name = result.ch_name
    if (result.description) form.description = result.description
    if (result.personality) form.personality = result.personality
    if (result.scenario) form.scenario = result.scenario
    if (result.first_mes) form.first_mes = result.first_mes
    if (result.mes_example) form.mes_example = result.mes_example
    if (result.creator_notes) form.creator_notes = result.creator_notes
    if (result.tags.length) form.tags = result.tags.join(', ')
    if (result.system_prompt) form.system_prompt = result.system_prompt
    if (result.post_history_instructions) {
      form.post_history_instructions = result.post_history_instructions
    }
    if (result.alternate_greetings.length) {
      form.alternate_greetings = result.alternate_greetings.join('\n')
    }
  },
})

function fillForm(character: Character) {
  const data = character.data
  form.ch_name = character.name || data?.name || ''
  form.description = character.description || data?.description || ''
  form.personality = character.personality || data?.personality || ''
  form.scenario = character.scenario || data?.scenario || ''
  form.first_mes = data?.first_mes || ''
  form.mes_example = data?.mes_example || ''
  form.creator_notes = data?.creator_notes || ''
  form.tags = (character.tags || data?.tags || []).join(', ')
  form.creator = data?.creator || ''
  form.character_version = data?.character_version || ''
  form.system_prompt = data?.system_prompt || ''
  form.post_history_instructions = data?.post_history_instructions || ''
  form.alternate_greetings = (data?.alternate_greetings || []).join('\n')
  form.world =
    (typeof data?.world === 'string' && data.world) ||
    (typeof data?.extensions?.world === 'string' ? data.extensions.world : '') ||
    ''
}

function payload() {
  return {
    ...form,
    alternate_greetings: form.alternate_greetings
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean),
    // Start from the exact embedded Tavern Card JSON so V3 extensions and
    // unknown vendor fields survive edits made through the simplified form.
    json_data: original.value?.json_data,
    chat: original.value?.chat,
    create_date: original.value?.create_date,
  }
}

// 未保存离开保护：表单与最近一次保存/载入的快照不一致时拦一次确认。
let savedFormSnapshot = JSON.stringify(form)
function markFormSaved() {
  savedFormSnapshot = JSON.stringify(form)
}
onBeforeRouteLeave(async () => {
  if (JSON.stringify(form) === savedFormSnapshot) return true
  return confirmDialog({ title: '离开页面？', message: '有未保存的修改，确定离开吗？AI 生成的草稿也会一并丢失。' })
})

async function save() {
  if (!form.ch_name.trim()) {
    ui.addToast('角色名不能为空', 'warning')
    return
  }
  loading.value = true
  try {
    if (isEdit.value) {
      await editCharacter(avatar.value, payload())
      markFormSaved()
      ui.addToast('角色已保存', 'success')
    } else {
      const result = await createCharacter(payload())
      markFormSaved()
      ui.addToast('角色已创建', 'success')
      if (typeof result === 'string') {
        if (generatedAvatar.value) {
          await editCharacterAvatar(result, await blobFromAsset(generatedAvatar.value), generatedAvatar.value.fileName)
        } else if (uploadedAvatarFile.value) {
          await editCharacterAvatar(result, uploadedAvatarFile.value, uploadedAvatarFile.value.name)
        }
        router.push(`/character/${encodeURIComponent(result)}/edit`)
      }
    }
    await chars.load()
    if (isEdit.value) {
      router.push('/characters')
    }
  } catch (e: unknown) {
    ui.addToast(`保存失败：${getApiErrorMessage(e)}`, 'error')
  } finally {
    loading.value = false
  }
}

const draftCharacter = computed<Character>(() => ({
  name: form.ch_name || 'Character',
  avatar: avatar.value || 'preview',
  description: form.description,
  personality: form.personality,
  scenario: form.scenario,
  tags: form.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
  data: {
    name: form.ch_name || 'Character',
    description: form.description,
    personality: form.personality,
    scenario: form.scenario,
    first_mes: form.first_mes,
    mes_example: form.mes_example,
    system_prompt: form.system_prompt,
    post_history_instructions: form.post_history_instructions,
    creator: form.creator,
    character_version: form.character_version,
    tags: form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    world: form.world,
  },
}))

const characterImagePrompt = computed(() => buildCharacterImagePrompt(draftCharacter.value))
const characterImageContextId = computed(() => avatar.value || form.ch_name.trim() || 'new-character')
const avatarPreview = computed(() => {
  if (uploadedAvatarUrl.value) return uploadedAvatarUrl.value
  if (generatedAvatar.value?.url) return generatedAvatar.value.url
  if (original.value?.avatar && original.value.avatar !== 'none') {
    return `/characters/${encodeURIComponent(original.value.avatar)}`
  }
  return ''
})

function blobFromAsset(asset: ImageAsset): Promise<Blob> {
  // 走 api/client 统一封装（凭据 + ApiError），失败信息由调用方的 getApiErrorMessage 兜底展示
  return apiGetBlob(asset.url)
}

async function applyGeneratedAvatar(asset: ImageAsset) {
  generatedAvatar.value = asset
  uploadedAvatarFile.value = null
  if (!isEdit.value) {
    ui.addToast('头像已暂存，保存角色后会写入角色卡', 'success')
    return
  }
  applyingAvatar.value = true
  try {
    await editCharacterAvatar(avatar.value, await blobFromAsset(asset), asset.fileName)
    ui.addToast('头像已写入角色卡', 'success')
    await chars.load()
  } catch (e: unknown) {
    ui.addToast(`头像写入失败：${getApiErrorMessage(e)}`, 'error')
  } finally {
    applyingAvatar.value = false
  }
}

function openAvatarFilePicker() {
  avatarInput.value?.click()
}

function onAvatarFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ui.addToast('请选择图片文件', 'warning')
    target.value = ''
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    ui.addToast('图片大小不能超过 10MB', 'warning')
    target.value = ''
    return
  }
  uploadedAvatarFile.value = file
  generatedAvatar.value = null
  if (isEdit.value) {
    void applyUploadedAvatar(file)
  } else {
    ui.addToast('头像已暂存，保存角色后会写入角色卡', 'success')
  }
  target.value = ''
}

async function applyUploadedAvatar(file: File) {
  applyingAvatar.value = true
  try {
    await editCharacterAvatar(avatar.value, file, file.name)
    ui.addToast('头像已写入角色卡', 'success')
    await chars.load()
  } catch (e: unknown) {
    ui.addToast(`头像写入失败：${getApiErrorMessage(e)}`, 'error')
  } finally {
    applyingAvatar.value = false
  }
}

async function runTest() {
  if (!test.prompt.trim()) {
    ui.addToast('请输入测试输入', 'warning')
    return
  }
  const profile = models.getProfile(test.profileId) || models.activeProfile
  if (!profile) {
    ui.addToast('未配置可用模型', 'warning')
    return
  }
  test.loading = true
  test.result = ''
  test.error = ''
  try {
    const worldName = test.world || form.world
    const worldInfoText = await getMatchedWorldInfo(worldName, draftCharacter.value, [
      { role: 'user', content: test.prompt },
    ])
    const payload = buildGeneratePayload(
      profile,
      draftCharacter.value,
      [{ role: 'user', content: test.prompt }],
      worldInfoText,
      [],
    )
    const reply = await generateReply(payload)
    test.result = reply || '(模型返回了空响应)'
  } catch (e: unknown) {
    test.error = getApiErrorMessage(e, '生成失败')
  } finally {
    test.loading = false
  }
}

onMounted(async () => {
  await worldInfoStore.load().catch(() => undefined)
  await models.loadSecrets()
  await imageGen.load()
  draft.profileId = defaultDraftProfileId()
  test.profileId = defaultDraftProfileId()
  if (isEdit.value) {
    loading.value = true
    try {
      original.value = await fetchCharacter(avatar.value)
      fillForm(original.value)
      markFormSaved()
      test.world = form.world
    } catch (e: unknown) {
      ui.addToast(`角色读取失败：${getApiErrorMessage(e)}`, 'error')
      router.push('/characters')
    } finally {
      loading.value = false
    }
  }
  sectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) activeSection.value = entry.target.id
    }
  }, { rootMargin: '-20% 0px -60% 0px', threshold: 0 })
  editorSections.forEach((s) => {
    const el = document.getElementById(s.id)
    if (el) sectionObserver?.observe(el)
  })
})

onBeforeUnmount(() => {
  sectionObserver?.disconnect()
  sectionObserver = null
})
</script>

<template>
  <div class="min-h-[100dvh] bg-bg">
    <AppPageHeader
      :title="pageTitle"
      :back-to="backTo"
      width="4xl"
    >
      <template #actions>
        <AppButton variant="gradient" :loading="loading" @click="save">
          保存
        </AppButton>
      </template>
    </AppPageHeader>

    <main class="mx-auto max-w-4xl space-y-6 px-5 py-6 animate-fade-in-up md:px-8 lg:px-10 lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
      <!-- 桌面端章节导航 -->
      <nav class="hidden lg:block">
        <div class="sticky top-24 space-y-1">
          <button
            v-for="section in editorSections"
            :key="section.id"
            type="button"
            class="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors"
            :class="activeSection === section.id ? 'bg-brand-500/15 text-brand-300' : 'text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary'"
            @click="scrollToSection(section.id)"
          >
            {{ section.label }}
          </button>
        </div>
      </nav>

      <div class="space-y-4">
        <AppCard
          v-if="!isEdit"
          id="draft-card"
          padding="md"
          tone="glow"
          collapsible
          title="AI 快速起草"
          :default-open="true"
        >
          <template #summary>一句话描述想法，模型会把名称、设定、开场白和示例对话填成初稿</template>
          <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex flex-wrap gap-2">
            <AppButton
              size="sm"
              variant="secondary"
              :loading="draft.asking"
              :disabled="draft.asking || draft.loading"
              @click="askDraftQuestions"
            >
              让 AI 追问
            </AppButton>
            <AppButton
              size="sm"
              variant="gradient"
              :loading="draft.loading"
              :disabled="draft.asking || draft.loading"
              @click="draftWithAi"
            >
              生成并填入
            </AppButton>
          </div>
        </div>

        <div class="grid gap-3 md:grid-cols-[1fr_260px]">
          <AppFormField label="角色想法">
            <AppTextarea
              v-model="draft.idea"
              :rows="3"
              auto-grow
              placeholder="例如：住在旧图书馆里的温柔占星师，知道玩家遗忘的秘密。"
            />
          </AppFormField>
          <AppFormField label="使用 Profile">
            <AppSelect v-model="draft.profileId">
              <option v-for="p in models.profiles" :key="p.id" :value="p.id">
                {{ p.name }} · {{ p.model }}
              </option>
            </AppSelect>
          </AppFormField>
        </div>

        <div v-if="draft.questions.length" class="space-y-3 rounded-lg bg-surface-sunken p-3 ring-1 ring-border-subtle">
          <h4 class="text-xs font-semibold text-ink-muted">关键问题</h4>
          <div
            v-for="(question, index) in draft.questions"
            :key="question.id"
            class="space-y-2"
          >
            <div class="border-l-2 border-brand-500/40 bg-surface pl-3 pr-2 py-2 rounded-r-lg">
              <p class="text-sm font-medium text-ink-secondary">
                <span class="text-brand-300">Q{{ index + 1 }}.</span> {{ question.question }}
              </p>
              <p v-if="question.hint" class="mt-1 text-xs text-ink-muted">
                {{ question.hint }}
              </p>
            </div>
            <div v-if="question.options.length" class="flex flex-wrap gap-2">
              <button
                v-for="option in question.options"
                :key="option"
                type="button"
                class="max-w-full whitespace-normal break-words rounded-full px-3 py-1.5 text-left text-xs leading-relaxed ring-1 transition"
                :class="isDraftOptionSelected(question, option)
                  ? 'bg-brand-500/20 text-brand-100 ring-brand-400/70'
                  : 'bg-surface text-ink-secondary ring-border-subtle hover:text-ink-primary hover:ring-brand-400/40'"
                @click="selectDraftOption(question, option)"
              >
                {{ option }}
              </button>
              <button
                type="button"
                class="max-w-full whitespace-normal break-words rounded-full px-3 py-1.5 text-left text-xs leading-relaxed ring-1 transition"
                :class="isCustomDraftAnswer(question)
                  ? 'bg-accent-500/15 text-accent-200 ring-accent-300/60'
                  : 'bg-surface text-ink-secondary ring-border-subtle hover:text-ink-primary hover:ring-accent-300/40'"
                @click="useCustomDraftAnswer(question)"
              >
                其他
              </button>
            </div>
            <AppTextarea
              v-model="draft.answers[question.id]"
              :rows="2"
              auto-grow
              placeholder="也可以自己写：偏好、禁忌、灵感碎片或选项之外的方向。"
            />
          </div>
        </div>

        <div v-if="draft.error" class="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft p-3 text-xs text-danger-strong">
          <svg class="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1-9a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1Z" clip-rule="evenodd" />
          </svg>
          <span class="whitespace-pre-wrap">{{ draft.error }}</span>
        </div>
      </AppCard>

      <!-- 单列表单：正文以长文本域为主，两列会把每个输入压得过窄 -->
      <div class="space-y-4">
        <AppCard id="basic-card" collapsible title="人物设定" :default-open="true">
          <template #summary>名称、描述、性格、场景</template>
          <div class="space-y-4">
            <AppFormField label="名称" required>
              <AppInput v-model="form.ch_name" placeholder="角色名" />
            </AppFormField>
            <AppFormField label="描述" hint="完整介绍这个角色,语气、外貌、背景、设定。">
              <AppTextarea v-model="form.description" :rows="7" auto-grow />
            </AppFormField>
            <AppFormField label="性格">
              <AppTextarea v-model="form.personality" :rows="4" auto-grow />
            </AppFormField>
            <AppFormField label="场景" hint="当前所处的情境。">
              <AppTextarea v-model="form.scenario" :rows="4" auto-grow />
            </AppFormField>
          </div>
        </AppCard>

        <AppCard id="image-card" collapsible title="角色图片" :default-open="true">
          <template #summary>头像预览、AI 生成或本地上传</template>
          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-xs text-ink-muted">支持 PNG、JPG，最大 10MB。</p>
              <span v-if="applyingAvatar" class="text-xs text-ink-muted">写入头像中…</span>
            </div>
            <div class="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
              <div class="aspect-[3/4] overflow-hidden rounded-xl bg-surface-sunken ring-1 ring-border-subtle">
                <img
                  v-if="avatarPreview"
                  :src="avatarPreview"
                  class="h-full w-full object-cover"
                  alt=""
                />
                <div v-else class="flex h-full items-center justify-center px-4 text-center text-xs text-ink-muted">
                  角色头像
                </div>
              </div>
              <div class="space-y-3">
                <ImageGenerateBox
                  v-if="session.isAdmin"
                  title="生成人物图"
                  description="根据当前表单里的外貌、性格、场景生成角色图。新角色会在保存时写入头像；编辑已有角色会生成后立即写入。"
                  :prompt="characterImagePrompt"
                  context-type="character"
                  :context-id="characterImageContextId"
                  action-label="生成并作为头像"
                  :draft-profile="getDraftProfile()"
                  @generated="applyGeneratedAvatar"
                />
                <div class="rounded-xl border border-border-subtle bg-surface/45 p-4">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="min-w-0">
                      <h4 class="text-sm font-semibold text-ink-primary">本地上传头像</h4>
                      <p class="mt-1 text-xs text-ink-muted">选择一张本地图片作为角色头像。</p>
                    </div>
                    <AppButton size="sm" variant="secondary" @click="openAvatarFilePicker">
                      选择图片
                    </AppButton>
                    <input
                      ref="avatarInput"
                      type="file"
                      accept="image/*"
                      class="hidden"
                      @change="onAvatarFileSelected"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </AppCard>

        <AppCard id="chat-card" collapsible title="对话样本" :default-open="true">
          <template #summary>开场白、示例对话、备用开场白</template>
          <div class="space-y-4">
            <AppFormField label="开场白" hint="角色发出的第一条消息。">
              <AppTextarea v-model="form.first_mes" :rows="5" auto-grow />
            </AppFormField>
            <AppFormField label="示例对话" hint="给模型示范这个角色的说话方式。">
              <AppTextarea v-model="form.mes_example" :rows="5" auto-grow />
            </AppFormField>
            <AppFormField label="备用开场白" hint="一行一个,可在聊天中切换。">
              <AppTextarea v-model="form.alternate_greetings" :rows="4" auto-grow />
            </AppFormField>
          </div>
        </AppCard>

        <AppCard id="advanced-card" collapsible title="高级字段" :default-open="isEdit || isAdvancedCreate">
          <template #summary>标签、世界书(长期设定资料库)、系统提示、作者信息</template>
          <div class="grid gap-4 md:grid-cols-2">
            <AppFormField label="标签" hint="逗号分隔。">
              <AppInput v-model="form.tags" placeholder="温柔, 学院" />
            </AppFormField>
            <AppFormField label="世界书绑定" hint="当这个角色长期属于某个世界观时再选；生成时会按关键词命中条目，没命中就不会注入。">
              <AppSelect v-model="form.world">
                <option value="">不绑定</option>
                <option v-for="world in worlds" :key="world.file_id" :value="world.file_id">
                  {{ world.name || world.file_id }}
                </option>
              </AppSelect>
            </AppFormField>
            <AppFormField label="作者">
              <AppInput v-model="form.creator" />
            </AppFormField>
            <AppFormField label="版本">
              <AppInput v-model="form.character_version" />
            </AppFormField>
            <AppFormField label="系统提示" hint="追加在对话最前面的全局规则，优先级高于角色描述。" class="md:col-span-2">
              <AppTextarea v-model="form.system_prompt" :rows="3" auto-grow />
            </AppFormField>
            <AppFormField label="后历史指令" hint="每次生成前追加在历史记录之后的额外指令。" class="md:col-span-2">
              <AppTextarea v-model="form.post_history_instructions" :rows="3" auto-grow />
            </AppFormField>
            <AppFormField label="创作者备注" hint="仅创作者可见的备注，不会进入模型上下文。" class="md:col-span-2">
              <AppTextarea v-model="form.creator_notes" :rows="4" auto-grow />
            </AppFormField>
          </div>
        </AppCard>

        <AppCard id="test-card" collapsible title="试聊检查" :default-open="false">
          <template #summary>保存前可选，不会写入聊天记录</template>
          <div class="space-y-4">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-sm font-medium text-ink-secondary">用当前表单 + 选定 Profile 做一次单轮试跑。</p>
                <p class="text-xs text-ink-muted">试聊结果仅用于预览，不会保存到任何聊天记录。</p>
              </div>
              <AppButton size="sm" variant="gradient" :loading="test.loading" @click="runTest">
                运行测试
              </AppButton>
            </div>
            <div class="grid gap-3 md:grid-cols-2">
              <AppFormField label="使用 Profile">
                <AppSelect v-model="test.profileId">
                  <option v-for="p in models.profiles" :key="p.id" :value="p.id">
                    {{ p.name }} · {{ p.model }}
                  </option>
                </AppSelect>
              </AppFormField>
              <AppFormField label="世界书 (留空=用上面绑定)">
                <AppSelect v-model="test.world">
                  <option value="">使用角色绑定</option>
                  <option v-for="w in worlds" :key="w.file_id" :value="w.file_id">
                    {{ w.name || w.file_id }}
                  </option>
                </AppSelect>
              </AppFormField>
            </div>
            <AppFormField label="测试输入">
              <AppTextarea v-model="test.prompt" :rows="3" auto-grow placeholder="例如:你今天怎么样?" />
            </AppFormField>
            <div v-if="test.result || test.error" class="space-y-2">
              <h4 class="text-xs font-semibold text-ink-muted">输出</h4>
              <div
                v-if="test.error"
                class="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft p-3 text-xs text-danger-strong"
              >
                <svg class="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1-9a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1Z" clip-rule="evenodd" />
                </svg>
                <span class="whitespace-pre-wrap">{{ test.error }}</span>
              </div>
              <div
                v-else
                class="max-h-72 overflow-y-auto rounded-md bg-surface-sunken p-3 text-sm leading-relaxed whitespace-pre-wrap text-ink-primary ring-1 ring-border-subtle"
              >
                {{ test.result }}
              </div>
            </div>
          </div>
        </AppCard>
      </div>

      <!-- 长表单末尾再放一次保存，滚到底不用回到顶栏 -->
      <div class="flex items-center justify-end gap-3">
        <AppButton variant="ghost" @click="router.push(backTo)">取消</AppButton>
        <AppButton variant="gradient" :loading="loading" @click="save">
          保存
        </AppButton>
      </div>
      </div>
    </main>
  </div>
</template>
