<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { createCharacter, editCharacter, editCharacterAvatar, fetchCharacter } from '@/api/characters'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useImageGenStore } from '@/stores/imageGen'
import { useWorldInfoStore } from '@/stores/worldInfo'
import { generateReply } from '@/api/generate'
import { getApiErrorMessage } from '@/api/client'
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
const applyingAvatar = ref(false)

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
  if (generatedAvatar.value?.url) return generatedAvatar.value.url
  if (original.value?.avatar && original.value.avatar !== 'none') {
    return `/characters/${encodeURIComponent(original.value.avatar)}`
  }
  return ''
})

async function blobFromAsset(asset: ImageAsset): Promise<Blob> {
  const response = await fetch(asset.url, { credentials: 'same-origin' })
  if (!response.ok) throw new Error('读取生成图片失败')
  return response.blob()
}

async function applyGeneratedAvatar(asset: ImageAsset) {
  generatedAvatar.value = asset
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
        <AppButton variant="gradient" :disabled="loading" @click="save">
          {{ loading ? '保存中…' : '保存' }}
        </AppButton>
      </template>
    </AppPageHeader>

    <main class="mx-auto max-w-4xl space-y-6 px-5 py-6 animate-fade-in-up md:px-8 lg:px-10">
      <AppCard v-if="!isEdit" padding="md" tone="glow" class="space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <span class="w-1 h-4 rounded-full bg-brand-gradient" />
              AI 快速起草
            </h3>
            <p class="mt-1 text-xs text-ink-muted">一句话描述想法，模型会把名称、设定、开场白和示例对话填成初稿。</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <AppButton
              size="sm"
              variant="secondary"
              :disabled="draft.asking || draft.loading"
              @click="askDraftQuestions"
            >
              {{ draft.asking ? '追问中…' : '让 AI 追问' }}
            </AppButton>
            <AppButton
              size="sm"
              variant="gradient"
              :disabled="draft.asking || draft.loading"
              @click="draftWithAi"
            >
              {{ draft.loading ? '起草中…' : '生成并填入' }}
            </AppButton>
          </div>
        </div>

        <div class="grid md:grid-cols-[1fr_260px] gap-3">
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
            <div>
              <p class="text-sm font-medium text-ink-secondary">
                {{ index + 1 }}. {{ question.question }}
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

        <div v-if="draft.error" class="text-xs whitespace-pre-wrap bg-red-500/10 text-red-600 ring-1 ring-red-500/20 p-3 rounded-md">
          {{ draft.error }}
        </div>
      </AppCard>

      <!-- 单列表单：正文以长文本域为主，两列会把每个输入压得过窄 -->
      <div class="space-y-4">
        <AppCard padding="md" class="space-y-4">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
            <span class="w-1 h-4 rounded-full bg-brand-gradient" />
            人物设定
          </h3>
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
        </AppCard>

        <!-- 配图 prompt 取自上面的人物设定，因此排在人物设定之后 -->
        <AppCard padding="md" class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <span class="w-1 h-4 rounded-full bg-brand-gradient" />
              角色图片
            </h3>
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
          </div>
        </AppCard>

        <AppCard padding="md" class="space-y-4">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
            <span class="w-1 h-4 rounded-full bg-brand-gradient" />
            对话样本
          </h3>
          <AppFormField label="开场白" hint="角色发出的第一条消息。">
            <AppTextarea v-model="form.first_mes" :rows="5" auto-grow />
          </AppFormField>
          <AppFormField label="示例对话" hint="给模型示范这个角色的说话方式。">
            <AppTextarea v-model="form.mes_example" :rows="5" auto-grow />
          </AppFormField>
          <AppFormField label="备用开场白" hint="一行一个,可在聊天中切换。">
            <AppTextarea v-model="form.alternate_greetings" :rows="4" auto-grow />
          </AppFormField>
        </AppCard>

        <AppCard collapsible title="高级字段" :default-open="isEdit || isAdvancedCreate">
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
            <AppFormField label="系统提示" class="md:col-span-2">
              <AppTextarea v-model="form.system_prompt" :rows="3" auto-grow />
            </AppFormField>
            <AppFormField label="后历史指令" class="md:col-span-2">
              <AppTextarea v-model="form.post_history_instructions" :rows="3" auto-grow />
            </AppFormField>
            <AppFormField label="创作者备注" class="md:col-span-2">
              <AppTextarea v-model="form.creator_notes" :rows="4" auto-grow />
            </AppFormField>
          </div>
        </AppCard>

        <AppCard collapsible title="试聊检查" :default-open="false">
          <template #summary>保存前可选，不会写入聊天记录</template>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <p class="text-xs text-ink-muted">用当前表单 + 选定 Profile 做一次单轮试跑。</p>
              <AppButton size="sm" variant="gradient" :disabled="test.loading" @click="runTest">
                {{ test.loading ? '生成中…' : '运行测试' }}
              </AppButton>
            </div>
            <div class="grid md:grid-cols-2 gap-3">
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
                class="text-xs whitespace-pre-wrap bg-red-500/10 text-red-600 ring-1 ring-red-500/20 p-3 rounded-md"
              >
                {{ test.error }}
              </div>
              <div
                v-else
                class="text-sm whitespace-pre-wrap text-ink-primary bg-surface-sunken ring-1 ring-border-subtle p-3 rounded-md leading-relaxed max-h-72 overflow-y-auto"
              >
                {{ test.result }}
              </div>
            </div>
          </div>
        </AppCard>
      </div>

      <!-- 长表单末尾再放一次保存，滚到底不用回到顶栏 -->
      <div class="flex items-center justify-end gap-3">
        <AppButton variant="secondary" @click="router.push(backTo)">取消</AppButton>
        <AppButton variant="gradient" :disabled="loading" @click="save">
          {{ loading ? '保存中…' : '保存' }}
        </AppButton>
      </div>
    </main>
  </div>
</template>
