<script setup lang="ts">
import type { Character } from '@/api/types'
import type { CharacterRuntimeAnalysis } from '@/lib/characterRuntime'
import AppButton from '@/components/ui/AppButton.vue'
import AppDialog from '@/components/ui/AppDialog.vue'

defineProps<{
  modelValue: boolean
  character: Character | null
  analysis: CharacterRuntimeAnalysis | null
  busy?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    title="使用 ST 兼容模式"
    size="lg"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="character && analysis" class="space-y-4">
      <div class="rounded-md border border-amber-300/60 bg-amber-500/10 px-4 py-3">
        <p class="text-sm font-medium text-ink-primary">「{{ character.name }}」依赖完整的 SillyTavern 运行时</p>
        <p class="mt-1 text-xs leading-5 text-ink-secondary">
          AIBAR 会保留这张卡的扩展数据，并交给 ST 处理世界书、正则、变量、消息事件和交互界面。
        </p>
      </div>

      <div>
        <h4 class="text-xs font-semibold text-ink-muted">检测到的能力</h4>
        <div class="mt-2 flex flex-wrap gap-2">
          <span
            v-for="capability in analysis.capabilities"
            :key="capability.id"
            class="rounded bg-surface-sunken px-2.5 py-1 text-xs text-ink-secondary ring-1 ring-border-subtle"
          >
            {{ capability.label }}<template v-if="capability.count"> · {{ capability.count }}</template>
          </span>
        </div>
      </div>

      <div
        v-if="analysis.risk !== 'content'"
        class="rounded-md border border-red-300/60 bg-red-500/10 px-4 py-3 text-xs leading-5 text-red-700"
      >
        这张卡包含可执行脚本<template v-if="analysis.usesRemoteCode">，并可能加载远程代码</template>。脚本会在你的 ST 账号环境中运行，只在你信任卡片来源时继续。
      </div>

      <p class="text-xs leading-5 text-ink-muted">
        进入后将离开简版聊天页面；可用顶部的“返回 AIBAR”回到这里。普通角色卡仍继续使用 AIBAR 原生聊天。
      </p>
    </div>

    <template #footer>
      <AppButton variant="secondary" :disabled="busy" @click="emit('update:modelValue', false)">取消</AppButton>
      <AppButton :disabled="busy" @click="emit('confirm')">
        {{ busy ? '正在交接…' : '确认并进入' }}
      </AppButton>
    </template>
  </AppDialog>
</template>
