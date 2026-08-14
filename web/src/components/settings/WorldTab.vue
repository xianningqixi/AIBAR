<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { promptDialog } from '@/composables/useDialog'
import AppButton from '@/components/ui/AppButton.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppDialog from '@/components/ui/AppDialog.vue'
import type { WorldInfoEntry, WorldInfoFile } from '@/api/types'
import {
  deleteWorldInfo,
  getWorldInfo,
  importWorldInfo,
  saveWorldInfo,
} from '@/api/worldInfo'
import { getApiErrorMessage } from '@/api/client'
import WorldInfoEditor from '@/components/world/WorldInfoEditor.vue'
import { useWorldInfoStore } from '@/stores/worldInfo'

const ui = useUiStore()
const router = useRouter()
const worldInfo = useWorldInfoStore()
const worlds = computed(() => worldInfo.worlds)

const selectedWorld = ref('')
const worldFile = ref<WorldInfoFile | null>(null)
const worldLoading = ref(false)
const worldMode = ref<'entry' | 'json'>('entry')
const worldJson = ref('')
const deleteDialogOpen = ref(false)

const worldJsonValid = computed(() => {
  if (!worldJson.value.trim()) return true
  try {
    JSON.parse(worldJson.value)
    return true
  } catch {
    return false
  }
})

function worldEntries(file: WorldInfoFile | null): WorldInfoEntry[] {
  if (!file) return []
  if (Array.isArray(file.entries)) return file.entries
  if (file.entries && typeof file.entries === 'object') {
    return Object.values(file.entries) as WorldInfoEntry[]
  }
  return []
}

const selectedWorldStats = computed(() => {
  const entries = worldEntries(worldFile.value)
  const enabled = entries.filter((entry) => !entry.disable)
  const constant = enabled.filter((entry) => entry.constant)
  const keyword = enabled.filter((entry) => Array.isArray(entry.key) && entry.key.length > 0)
  const sampleKeywords = keyword
    .flatMap((entry) => Array.isArray(entry.key) ? entry.key : [])
    .filter(Boolean)
    .slice(0, 6)
  return {
    entries: entries.length,
    enabled: enabled.length,
    constant: constant.length,
    keyword: keyword.length,
    sampleKeywords,
  }
})

async function loadWorlds(force = true) {
  worldLoading.value = true
  try {
    // 增删改后强制刷新；标签页初次挂载复用 store 缓存
    await worldInfo.load(force)
    if (!selectedWorld.value && worlds.value[0]) {
      await selectWorld(worlds.value[0].file_id)
    }
  } catch (e: unknown) {
    ui.addToast(`世界书加载失败：${getApiErrorMessage(e)}`, 'error')
  } finally {
    worldLoading.value = false
  }
}

async function selectWorld(name: string) {
  selectedWorld.value = name
  try {
    const data = await getWorldInfo(name)
    worldFile.value = data
    worldJson.value = JSON.stringify(data, null, 2)
  } catch (e: unknown) {
    ui.addToast(`读取失败：${getApiErrorMessage(e)}`, 'error')
  }
}

async function saveCurrentWorld(payload?: WorldInfoFile) {
  if (!selectedWorld.value) {
    ui.addToast('未选择世界书', 'warning')
    return
  }
  let data: WorldInfoFile | null
  if (payload) {
    data = payload
    worldFile.value = payload
    worldJson.value = JSON.stringify(payload, null, 2)
  } else if (worldMode.value === 'json') {
    if (!worldJsonValid.value) {
      ui.addToast('JSON 格式无效', 'warning')
      return
    }
    data = JSON.parse(worldJson.value) as WorldInfoFile
    worldFile.value = data
  } else {
    data = worldFile.value
  }
  if (!data) {
    ui.addToast('没有可保存的内容', 'warning')
    return
  }
  try {
    await saveWorldInfo(selectedWorld.value, data)
    ui.addToast('世界书已保存', 'success')
    await loadWorlds()
  } catch (e: unknown) {
    ui.addToast(`保存失败：${getApiErrorMessage(e)}`, 'error')
  }
}

function requestDeleteWorld() {
  if (!selectedWorld.value) return
  deleteDialogOpen.value = true
}

async function deleteWorld() {
  if (!selectedWorld.value) return
  deleteDialogOpen.value = false
  try {
    await deleteWorldInfo(selectedWorld.value)
    ui.addToast('世界书已删除', 'success')
    selectedWorld.value = ''
    worldFile.value = null
    worldJson.value = ''
    await loadWorlds()
  } catch (e: unknown) {
    ui.addToast(`删除失败：${getApiErrorMessage(e)}`, 'error')
  }
}

async function importWorldClick() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const result = await importWorldInfo(file)
      ui.addToast(`已导入世界书：${result.name}`, 'success')
      await loadWorlds()
      await selectWorld(result.name)
    } catch (e: unknown) {
      ui.addToast(`导入失败：${getApiErrorMessage(e)}`, 'error')
    }
  }
  input.click()
}

async function createWorld() {
  const name = await promptDialog({ title: '新世界书名称', defaultValue: 'AIBAR 示例世界书' })
  const trimmed = name?.trim()
  if (!trimmed) return
  try {
    const data: WorldInfoFile = {
      name: trimmed,
      entries: {},
    }
    await saveWorldInfo(trimmed, data)
    ui.addToast('世界书已创建', 'success')
    selectedWorld.value = trimmed
    worldFile.value = data
    worldJson.value = JSON.stringify(data, null, 2)
    await loadWorlds()
    await selectWorld(trimmed)
  } catch (e: unknown) {
    ui.addToast(`创建失败：${getApiErrorMessage(e)}`, 'error')
  }
}

async function writeSampleWorld() {
  const name = 'AIBAR 示例世界书'
  const data: WorldInfoFile = {
    name,
    entries: {
      '0': {
        uid: 0,
        key: ['月港', '银潮城'],
        keysecondary: [],
        comment: '月港',
        content: '月港是一座建在潮汐断崖上的港城,夜晚会被蓝白色潮光照亮。这里的居民相信潮声能带来旧日记忆。',
        constant: false,
        disable: false,
        order: 100,
      },
      '1': {
        uid: 1,
        key: [],
        keysecondary: [],
        comment: '叙事基调',
        content: '世界整体基调偏神秘、克制、细腻。重要信息应通过场景细节和角色行动逐步显露。',
        constant: true,
        disable: false,
        order: 80,
      },
    },
  }
  try {
    await saveWorldInfo(name, data)
    ui.addToast('已写入示例世界书', 'success')
    await loadWorlds()
    await selectWorld(name)
  } catch (e: unknown) {
    ui.addToast(`写入失败：${getApiErrorMessage(e)}`, 'error')
  }
}

function exportWorld() {
  if (!selectedWorld.value || !worldFile.value) return
  const blob = new Blob([JSON.stringify(worldFile.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${selectedWorld.value}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function switchWorldMode(mode: 'entry' | 'json') {
  if (worldMode.value === mode) return
  if (worldMode.value === 'json' && mode === 'entry') {
    if (!worldJsonValid.value) {
      ui.addToast('JSON 格式无效,无法切换到条目视图', 'warning')
      return
    }
    if (worldJson.value.trim()) {
      worldFile.value = JSON.parse(worldJson.value) as WorldInfoFile
    }
  } else if (worldMode.value === 'entry' && mode === 'json' && worldFile.value) {
    worldJson.value = JSON.stringify(worldFile.value, null, 2)
  }
  worldMode.value = mode
}

onMounted(async () => {
  await loadWorlds(false)
})
</script>

<template>
  <div class="space-y-4">
    <AppCard padding="md" tone="glow" class="space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs text-brand-300 font-semibold">世界书使用向导</p>
          <h2 class="mt-2 text-xl font-semibold text-ink-primary">把长期设定做成会自动命中的资料库。</h2>
          <p class="mt-1 text-sm text-ink-secondary max-w-2xl leading-relaxed">
            世界书适合放地点、组织、术语、规则、历史和暗线。绑定到角色、故事或当前聊天后，每次生成会扫描最近对话和角色设定，命中关键词才把对应条目注入提示词。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <AppButton size="sm" variant="secondary" @click="writeSampleWorld">写入示例</AppButton>
          <AppButton size="sm" @click="createWorld">新建世界书</AppButton>
        </div>
      </div>

      <div class="grid md:grid-cols-3 gap-3">
        <div class="rounded-xl bg-surface-elevated p-4 ring-1 ring-border-subtle">
          <p class="text-sm font-semibold text-ink-primary">1. 写资料</p>
          <p class="mt-1 text-xs leading-relaxed text-ink-muted">每条只写一个知识点。比如“月港是什么”“银潮城有哪些禁忌”。</p>
        </div>
        <div class="rounded-xl bg-surface-elevated p-4 ring-1 ring-border-subtle">
          <p class="text-sm font-semibold text-ink-primary">2. 填关键词</p>
          <p class="mt-1 text-xs leading-relaxed text-ink-muted">玩家或角色提到关键词时才会注入。常驻条目适合放全局基调。</p>
        </div>
        <div class="rounded-xl bg-surface-elevated p-4 ring-1 ring-border-subtle">
          <p class="text-sm font-semibold text-ink-primary">3. 绑定使用</p>
          <p class="mt-1 text-xs leading-relaxed text-ink-muted">角色绑定适合长期世界观；故事绑定适合某段开局；聊天绑定适合临时切换。</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-sunken p-3 ring-1 ring-border-subtle">
        <div class="text-xs text-ink-secondary">
          <template v-if="selectedWorld">
            当前「{{ selectedWorld }}」：{{ selectedWorldStats.enabled }} 条启用，{{ selectedWorldStats.keyword }} 条关键词触发，{{ selectedWorldStats.constant }} 条常驻。
            <span v-if="selectedWorldStats.sampleKeywords.length" class="text-ink-muted">
              关键词：{{ selectedWorldStats.sampleKeywords.join('、') }}
            </span>
          </template>
          <template v-else>
            先写入示例或新建一本世界书，再在下方编辑条目。
          </template>
        </div>
        <div class="flex flex-wrap gap-2">
          <AppButton size="sm" variant="secondary" @click="router.push('/character/new')">去角色绑定</AppButton>
          <AppButton size="sm" variant="secondary" @click="router.push('/story/new')">去故事绑定</AppButton>
        </div>
      </div>
    </AppCard>

    <div class="grid gap-4 lg:grid-cols-[300px_1fr]">
    <AppCard padding="md">
      <div class="flex flex-wrap gap-2 mb-3">
        <AppButton size="sm" @click="createWorld">+ 新建</AppButton>
        <AppButton size="sm" @click="importWorldClick">导入</AppButton>
        <AppButton size="sm" variant="secondary" @click="router.push('/hub')">社区导入</AppButton>
        <AppButton size="sm" variant="secondary" @click="loadWorlds">刷新</AppButton>
        <AppButton size="sm" variant="secondary" @click="writeSampleWorld">写入示例</AppButton>
      </div>
      <div v-if="worldLoading" class="text-xs text-ink-muted">加载中…</div>
      <div v-else class="space-y-1">
        <button
          v-for="world in worlds"
          :key="world.file_id"
          :class="[
            'relative w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors',
            selectedWorld === world.file_id
              ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30'
              : 'text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary',
          ]"
          @click="selectWorld(world.file_id)"
        >
          <span
            v-if="selectedWorld === world.file_id"
            class="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-gradient"
          />
          {{ world.name || world.file_id }}
        </button>
        <AppEmpty
          v-if="worlds.length === 0"
          icon="book"
          title="暂无世界书"
          description="从原生 ST 或外部 JSON 导入。"
        />
      </div>
    </AppCard>

    <AppCard padding="md" class="min-h-[520px] flex flex-col">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 class="text-sm font-semibold text-ink-primary">{{ selectedWorld || '选择世界书' }}</h2>
          <p class="text-xs text-ink-muted mt-0.5">条目编辑器 / 原始 JSON 双视图,保存后写回原文件。</p>
        </div>
        <div class="flex gap-2">
          <div class="inline-flex rounded-lg border border-border-subtle overflow-hidden text-xs">
            <button
              :class="['px-2.5 py-1', worldMode === 'entry' ? 'bg-brand-500/20 text-brand-300' : 'text-ink-secondary hover:bg-ink-primary/5']"
              @click="switchWorldMode('entry')"
            >条目</button>
            <button
              :class="['px-2.5 py-1 border-l border-border-subtle', worldMode === 'json' ? 'bg-brand-500/20 text-brand-300' : 'text-ink-secondary hover:bg-ink-primary/5']"
              @click="switchWorldMode('json')"
            >JSON</button>
          </div>
          <AppButton size="sm" variant="secondary" @click="exportWorld">导出</AppButton>
          <AppButton size="sm" variant="danger" @click="requestDeleteWorld">删除</AppButton>
          <AppButton size="sm" @click="() => saveCurrentWorld()">保存</AppButton>
        </div>
      </div>
      <div v-if="!selectedWorld" class="flex-1 flex items-center justify-center text-xs text-ink-muted">
        从左侧选择一本世界书。
      </div>
      <template v-else>
        <WorldInfoEditor
          v-if="worldMode === 'entry' && worldFile"
          :file="worldFile"
          class="flex-1"
          @update="(f) => { worldFile = f; worldJson = JSON.stringify(f, null, 2) }"
        />
        <AppTextarea
          v-else
          v-model="worldJson"
          class="flex-1"
          :rows="22"
          placeholder="选择左侧世界书后,JSON 会显示在此处。"
        />
        <p v-if="worldMode === 'json' && worldJson && !worldJsonValid" class="mt-2 text-xs text-red-500">JSON 格式无效</p>
      </template>
    </AppCard>
    </div>

    <AppDialog v-model="deleteDialogOpen" title="删除世界书" size="sm">
      <p class="text-sm leading-relaxed text-ink-secondary">
        确认删除世界书「{{ selectedWorld }}」？此操作不可撤销。
      </p>
      <template #footer>
        <AppButton size="sm" variant="secondary" @click="deleteDialogOpen = false">取消</AppButton>
        <AppButton size="sm" variant="danger" @click="deleteWorld">确认删除</AppButton>
      </template>
    </AppDialog>
  </div>
</template>
