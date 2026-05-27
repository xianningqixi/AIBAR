<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppToast from './components/ui/AppToast.vue'
</script>

<template>
  <div class="min-h-screen bg-bg text-ink-primary">
    <RouterView />
  </div>
  <AppToast />
</template>
