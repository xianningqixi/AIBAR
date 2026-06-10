<script setup lang="ts">
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import WorldTab from '@/components/settings/WorldTab.vue'
</script>

<template>
  <div class="min-h-screen flex flex-col bg-bg">
    <AppPageHeader title="世界书" subtitle="长期设定资料库，按关键词自动注入提示词" back-to="/browse" mobile-only-back />

    <div class="max-w-6xl mx-auto w-full px-5 py-6 flex-1 animate-fade-in-up">
      <WorldTab />
    </div>
  </div>
</template>
