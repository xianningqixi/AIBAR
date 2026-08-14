<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useModsStore, type ModItem } from '@/stores/mods'
import { confirmDialog } from '@/composables/useDialog'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'

const ui = useUiStore()
const mods = useModsStore()
const route = useRoute()
const router = useRouter()

const selectedModId = ref('')

const positionLabels: Record<string, string> = {
  system_prepend: '系统前缀',
  system_append: '系统后缀',
  user_suffix: '用户后缀',
}

const selectedMod = computed<ModItem | null>(() => {
  return mods.mods.find((mod) => mod.id === selectedModId.value) || mods.mods[0] || null
})

function addMod() {
  const mod = mods.createMod()
  selectedModId.value = mod.id
}

async function deleteSelectedMod(mod: ModItem) {
  // 内置 MOD 的“删除”只是停用，无需拦截
  if (!mod.builtin && !await confirmDialog({ title: '删除 MOD', message: `删除 MOD「${mod.name || '未命名'}」？此操作不可恢复。`, danger: true, confirmText: '删除' })) return
  mods.deleteMod(mod.id)
  selectedModId.value = mods.mods[0]?.id || ''
}

function publishSelectedMod(mod: ModItem) {
  if (!mod.content.trim()) {
    ui.addToast('请先填写提示词内容', 'warning')
    return
  }
  router.push({ path: '/publish', query: { type: 'mod', sourceId: mod.id } })
}

function writeSampleMods() {
  const pacing =
    mods.mods.find((mod) => mod.name === '示例 · 慢节奏推进') ||
    mods.createMod()
  mods.updateMod(pacing.id, {
    name: '示例 · 慢节奏推进',
    description: '降低剧情推进速度,每次回复聚焦当前场景。',
    content: '叙事保持慢节奏,不要跳过关键动作和情绪变化。每次回复只推进一个主要动作或一个明确信息点。',
    position: 'system_append',
    enabled: false,
  })

  const userSuffix =
    mods.mods.find((mod) => mod.name === '示例 · 要求可操作') ||
    mods.createMod()
  mods.updateMod(userSuffix.id, {
    name: '示例 · 要求可操作',
    description: '把玩家输入补充为需要明确后果和可操作反馈。',
    content: '请在回复中给出清晰的即时反馈,并让场景保留可继续互动的选择空间。',
    position: 'user_suffix',
    enabled: false,
  })

  selectedModId.value = pacing.id
  ui.addToast('已写入 2 个示例 MOD', 'success')
}

onMounted(async () => {
  await mods.load()
  const requestedId = typeof route.query.modId === 'string' ? route.query.modId : ''
  selectedModId.value = mods.getMod(requestedId)?.id || mods.mods[0]?.id || ''
})

watch(
  () => mods.mods.map((mod) => mod.id).join('|'),
  () => {
    if (!selectedModId.value || !mods.getMod(selectedModId.value)) {
      selectedModId.value = mods.mods[0]?.id || ''
    }
  },
)
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[300px_1fr]">
    <AppCard padding="md">
      <div class="flex flex-wrap gap-2 mb-3">
        <AppButton size="sm" @click="addMod">+ 新建</AppButton>
        <AppButton size="sm" variant="secondary" @click="writeSampleMods">写入示例</AppButton>
      </div>
      <div class="space-y-1">
        <button
          v-for="mod in mods.mods"
          :key="mod.id"
          :class="[
            'relative w-full text-left px-3 py-2.5 rounded-lg transition-colors',
            selectedModId === mod.id
              ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30'
              : 'text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary',
          ]"
          @click="selectedModId = mod.id"
        >
          <span
            v-if="selectedModId === mod.id"
            class="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-gradient"
          />
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium truncate">{{ mod.name }}</span>
            <span v-if="mod.enabled" class="text-[11px] text-emerald-600 shrink-0">全局</span>
          </div>
          <div class="mt-1 text-[11px] text-ink-muted truncate">
            {{ mod.builtin ? '公用Mod' : '我的Mod' }} · {{ positionLabels[mod.position] }} · {{ mod.content.length }} 字
          </div>
        </button>
        <AppEmpty v-if="!mods.mods.length" icon="box" title="暂无 MOD" description="点击上方新建或写入示例。" />
      </div>
    </AppCard>

    <AppCard v-if="selectedMod" padding="md" class="space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-ink-primary">MOD 详情</h2>
          <p class="text-xs text-ink-muted mt-1">左侧浏览已有 MOD,右侧编辑当前选中项。</p>
        </div>
        <div class="flex items-center gap-2">
          <span v-if="selectedMod.builtin" class="text-[11px] text-ink-muted bg-surface-sunken px-1.5 py-0.5 rounded">内置</span>
          <AppButton v-if="!selectedMod.builtin" size="sm" variant="secondary" @click="publishSelectedMod(selectedMod)">发布到社区</AppButton>
          <label class="flex items-center gap-1.5 text-xs text-ink-secondary cursor-pointer">
            <input
              type="checkbox"
              :checked="selectedMod.enabled"
              class="accent-brand-500"
              @change="(e) => mods.updateMod(selectedMod!.id, { enabled: (e.target as HTMLInputElement).checked })"
            />
            全局启用
          </label>
          <button
            v-if="!selectedMod.builtin"
            class="text-xs text-red-500 hover:text-red-600 transition-colors"
            @click="deleteSelectedMod(selectedMod)"
          >
            删除
          </button>
        </div>
      </div>

      <AppFormField label="名称">
        <AppInput
          :model-value="selectedMod.name"
          @update:model-value="(v) => mods.updateMod(selectedMod!.id, { name: v as string })"
        />
      </AppFormField>

      <div class="grid gap-4 md:grid-cols-2">
        <AppFormField label="位置">
          <AppSelect
            :model-value="selectedMod.position"
            @update:model-value="(v) => mods.updateMod(selectedMod!.id, { position: v as any })"
          >
            <option value="system_prepend">系统前缀(放在所有角色描述之前)</option>
            <option value="system_append">系统后缀(放在角色提示末尾)</option>
            <option value="user_suffix">用户后缀(拼到最后一条用户消息)</option>
          </AppSelect>
        </AppFormField>
        <AppFormField label="简介">
          <AppInput
            :model-value="selectedMod.description"
            placeholder="给自己看的备注"
            @update:model-value="(v) => mods.updateMod(selectedMod!.id, { description: v as string })"
          />
        </AppFormField>
      </div>

      <AppFormField label="内容" hint="这段文本会按位置注入生成请求。">
        <AppTextarea
          :model-value="selectedMod.content"
          :rows="10"
          auto-grow
          :placeholder="positionLabels[selectedMod.position]"
          @update:model-value="(v) => mods.updateMod(selectedMod!.id, { content: v })"
        />
      </AppFormField>
    </AppCard>
  </div>
</template>
