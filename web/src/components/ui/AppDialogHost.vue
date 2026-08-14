<script setup lang="ts">
// useDialog 的渲染宿主：全局唯一，挂载在 App.vue。
import { computed } from 'vue'
import { dialogState, settleDialog } from '@/composables/useDialog'
import AppButton from './AppButton.vue'
import AppDialog from './AppDialog.vue'
import AppInput from './AppInput.vue'

const active = computed(() => dialogState.active)

// AppDialog 的 Esc / 背景点击 / 关闭按钮都会把 v-model 置 false，统一走取消语义
const visible = computed({
  get: () => dialogState.active !== null,
  set: (value: boolean) => {
    if (!value) settleDialog(false)
  },
})

function updateValue(value: string | number) {
  if (dialogState.active) dialogState.active.value = String(value)
}
</script>

<template>
  <AppDialog v-model="visible" :title="active?.options.title" size="sm">
    <p v-if="active?.options.message" class="text-sm leading-relaxed text-ink-secondary whitespace-pre-line">
      {{ active.options.message }}
    </p>
    <div v-if="active?.kind === 'prompt'" :class="active.options.message ? 'mt-3' : ''">
      <AppInput
        :model-value="active.value"
        :placeholder="active.options.placeholder"
        @update:model-value="updateValue"
        @keydown.enter.prevent="settleDialog(true)"
      />
    </div>
    <template #footer>
      <AppButton variant="ghost" @click="settleDialog(false)">
        {{ active?.options.cancelText || '取消' }}
      </AppButton>
      <AppButton :variant="active?.options.danger ? 'danger' : 'primary'" @click="settleDialog(true)">
        {{ active?.options.confirmText || '确定' }}
      </AppButton>
    </template>
  </AppDialog>
</template>
