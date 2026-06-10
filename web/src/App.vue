<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppToast from './components/ui/AppToast.vue'
import AppSideNav from './components/layout/AppSideNav.vue'
import MobileTabBar from './components/layout/MobileTabBar.vue'

const route = useRoute()
// 聊天页全屏沉浸：不显示侧栏和底部导航
const isChat = computed(() => route.name === 'chat')
</script>

<template>
  <div class="min-h-screen bg-bg text-ink-primary md:flex" :class="isChat ? '' : 'pb-16 md:pb-0'">
    <AppSideNav v-if="!isChat" />
    <div class="min-w-0 w-full flex-1">
      <RouterView />
    </div>
  </div>
  <MobileTabBar v-if="!isChat" />
  <AppToast />
</template>
