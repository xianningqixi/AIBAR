<script setup lang="ts">
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import ModsTab from '@/components/settings/ModsTab.vue'
</script>

<template>
  <div class="min-h-screen flex flex-col bg-bg">
    <AppPageHeader title="提示词 MOD" subtitle="可复用的提示词插件，按位置注入生成请求" back-to="/browse" mobile-only-back />

    <div class="max-w-6xl mx-auto w-full px-5 py-6 flex-1 animate-fade-in-up">
      <ModsTab />
    </div>
  </div>
</template>
