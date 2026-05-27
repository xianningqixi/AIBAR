<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createCharacter, editCharacter, fetchCharacter } from '@/api/characters'
import { listWorldInfo } from '@/api/worldinfo'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { generateReply } from '@/api/generate'
import { buildGeneratePayload } from '@/lib/buildPayload'
import { getMatchedWorldInfo } from '@/lib/worldInfoMatch'
import type { Character, WorldInfoSummary } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'

const route = useRoute()
const router = useRouter()
const chars = useCharactersStore()
const ui = useUiStore()
const models = useModelProfilesStore()

const avatar = computed(() => decodeURIComponent((route.params.avatar as string) || ''))
const isEdit = computed(() => Boolean(avatar.value))
const loading = ref(false)
const original = ref<Character | null>(null)
const worlds = ref<WorldInfoSummary[]>([])

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
    json_data: original.value ? JSON.stringify(original.value) : undefined,
    chat: original.value?.chat,
    create_date: original.value?.create_date,
  }
}

async function save() {
  if (!form.ch_name.trim()) {
    ui.addToast('角色名不能为空', 'warning')
    return
  }
  loading.value = true
  try {
    if (isEdit.value) {
      await editCharacter(avatar.value, payload())
      ui.addToast('角色已保存', 'success')
    } else {
      const result = await createCharacter(payload())
      ui.addToast('角色已创建', 'success')
      if (typeof result === 'string') {
        router.push(`/character/${encodeURIComponent(result)}/edit`)
      }
    }
    await chars.load()
    if (isEdit.value) {
      router.push('/characters')
    }
  } catch (e: any) {
    ui.addToast(`保存失败：${e.message}`, 'error')
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
  } catch (e: any) {
    test.error = e?.message || '生成失败'
  } finally {
    test.loading = false
  }
}

onMounted(async () => {
  worlds.value = await listWorldInfo().catch(() => [])
  await models.loadSecrets()
  test.profileId = models.activeProfileId
  if (isEdit.value) {
    loading.value = true
    try {
      original.value = await fetchCharacter(avatar.value)
      fillForm(original.value)
      test.world = form.world
    } catch (e: any) {
      ui.addToast(`角色读取失败：${e.message}`, 'error')
      router.push('/characters')
    } finally {
      loading.value = false
    }
  }
})
</script>

<template>
  <div class="min-h-screen bg-bg">
    <AppPageHeader
      :title="isEdit ? '编辑角色' : '新建角色'"
      back-to="/characters"
    >
      <template #actions>
        <AppButton variant="gradient" :disabled="loading" @click="save">
          {{ loading ? '保存中…' : '保存' }}
        </AppButton>
      </template>
    </AppPageHeader>

    <main class="max-w-5xl mx-auto px-5 py-6">
      <div class="grid lg:grid-cols-2 gap-4">
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

        <AppCard padding="md" class="lg:col-span-2 space-y-4">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
            <span class="w-1 h-4 rounded-full bg-brand-gradient" />
            元数据与扩展
          </h3>
          <div class="grid md:grid-cols-2 gap-4">
            <AppFormField label="标签" hint="逗号分隔。">
              <AppInput v-model="form.tags" placeholder="温柔, 学院" />
            </AppFormField>
            <AppFormField label="世界书绑定">
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

        <AppCard padding="md" class="lg:col-span-2 space-y-4" tone="glow">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
                <span class="w-1 h-4 rounded-full bg-brand-gradient" />
                测试区
              </h3>
              <p class="text-xs text-ink-muted mt-1">不写入任何聊天记录,只用当前表单 + 选定的 Profile + 世界书做一次单轮试跑。</p>
            </div>
            <AppButton size="sm" variant="gradient" :disabled="test.loading" @click="runTest">
              {{ test.loading ? '生成中…' : '▶ 运行测试' }}
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
            <h4 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">输出</h4>
            <div
              v-if="test.error"
              class="text-xs whitespace-pre-wrap bg-red-500/10 text-red-300 ring-1 ring-red-500/20 p-3 rounded-md"
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
        </AppCard>
      </div>
    </main>
  </div>
</template>
