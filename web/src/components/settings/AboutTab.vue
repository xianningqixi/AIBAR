<script setup lang="ts">
import AppCard from '@/components/ui/AppCard.vue'
</script>

<template>
  <AppCard padding="lg" tone="glow">
    <div class="flex items-start gap-4">
      <div class="w-12 h-12 rounded-xl bg-brand-gradient shadow-glow flex items-center justify-center shrink-0">
        <span class="text-xl font-bold text-white">A</span>
      </div>
      <div class="space-y-2">
        <h2 class="text-base font-semibold text-ink-primary">AIBAR Web</h2>
        <p class="text-sm text-ink-secondary leading-relaxed">v0.1.0 · 基于 SillyTavern 后端 API 的简化前端。</p>
        <p class="text-ink-muted text-xs">所有角色卡、聊天记录、世界书、MOD 都写入 ST 原生目录 / settings,可与原生 UI 并存。</p>
      </div>
    </div>
  </AppCard>
</template>
