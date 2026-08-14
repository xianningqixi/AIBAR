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
import AppSegmentedControl from '@/components/ui/AppSegmentedControl.vue'
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
const helpDialogOpen = ref(false)

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
    <AppCard padding="md" tone="glow" collapsible title="世界书使用向导" :default-open="true" class="space-y-4">
      <template #summary>
        <span class="inline-flex items-center gap-2">
          把长期设定做成会自动命中的资料库
          <AppButton size="sm" variant="ghost" @click.stop="helpDialogOpen = true">帮助</AppButton>
        </span>
      </template>

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
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <AppButton size="sm" @click="createWorld">+ 新建</AppButton>
        <AppButton size="sm" variant="secondary" @click="importWorldClick">导入</AppButton>
        <details class="relative">
          <summary class="list-none">
            <AppButton size="sm" variant="ghost" type="button">更多</AppButton>
          </summary>
          <div class="absolute left-0 mt-1 w-28 rounded-xl border border-border-subtle bg-surface-elevated p-1 shadow-elevated z-10">
            <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink-primary" @click="() => loadWorlds(true)">刷新</button>
            <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink-primary" @click="router.push('/hub')">社区导入</button>
            <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink-primary" @click="writeSampleWorld">写入示例</button>
          </div>
        </details>
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
        <div class="flex flex-wrap items-center gap-2">
          <AppSegmentedControl
            :model-value="worldMode"
            :options="[
              { value: 'entry', label: '条目' },
              { value: 'json', label: 'JSON' },
            ]"
            size="sm"
            @update:model-value="switchWorldMode($event as 'entry' | 'json')"
          />
          <AppButton size="sm" @click="() => saveCurrentWorld()">保存</AppButton>
          <details class="relative">
            <summary class="list-none">
              <AppButton size="sm" variant="ghost" type="button">更多</AppButton>
            </summary>
            <div class="absolute right-0 mt-1 w-24 rounded-xl border border-border-subtle bg-surface-elevated p-1 shadow-elevated z-10">
              <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink-primary" @click="exportWorld">导出</button>
              <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:text-danger-strong transition-colors hover:bg-danger/10" @click="requestDeleteWorld">删除</button>
            </div>
          </details>
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
        <p v-if="worldMode === 'json' && worldJson && !worldJsonValid" class="mt-2 text-xs text-danger">JSON 格式无效</p>
      </template>
    </AppCard>
    </div>

    <AppDialog v-model="deleteDialogOpen" title="删除世界书" size="sm">
      <div class="flex gap-4 rounded-xl bg-danger/10 p-4 ring-1 ring-danger/25">
        <svg class="h-6 w-6 shrink-0 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.054 0 1.918-.816 1.995-1.85L21 12V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6l.107 3.15c.077 1.034.941 1.85 1.995 1.85z" />
        </svg>
        <div class="space-y-1">
          <p class="text-sm font-semibold text-danger-strong">确认删除世界书「{{ selectedWorld }}」？</p>
          <p class="text-sm leading-relaxed text-ink-secondary">此操作不可撤销，条目、关键词和绑定关系都会从服务端移除。</p>
        </div>
      </div>
      <template #footer>
        <AppButton size="sm" variant="secondary" @click="deleteDialogOpen = false">取消</AppButton>
        <AppButton size="sm" variant="danger" @click="deleteWorld">确认删除</AppButton>
      </template>
    </AppDialog>

    <AppDialog v-model="helpDialogOpen" title="世界书使用帮助" size="md">
      <div class="space-y-3 text-sm text-ink-secondary">
        <p>世界书适合存放长期设定：地点、组织、术语、规则、历史和暗线。</p>
        <ul class="list-disc space-y-1 pl-5">
          <li><strong class="text-ink-primary">条目：</strong>每条只写一个知识点，保持原子化。</li>
          <li><strong class="text-ink-primary">关键词：</strong>玩家或角色提到时才会注入提示词。</li>
          <li><strong class="text-ink-primary">常驻：</strong>不依赖关键词，每次生成都会注入，适合全局基调。</li>
          <li><strong class="text-ink-primary">绑定：</strong>可在角色、故事或聊天中绑定，随时切换。</li>
        </ul>
      </div>
    </AppDialog>
  </div>
</template>
