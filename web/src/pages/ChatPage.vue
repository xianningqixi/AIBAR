<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useModsStore } from '@/stores/mods'
import { usePresetsStore } from '@/stores/presets'
import { usePersonasStore } from '@/stores/personas'
import ChatTopBar from '@/components/chat/ChatTopBar.vue'
import MessageList from '@/components/chat/MessageList.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import AppDrawer from '@/components/ui/AppDrawer.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppCard from '@/components/ui/AppCard.vue'
import ModPicker from '@/components/mods/ModPicker.vue'
import { deleteChat, exportChat, importChat, renameChat } from '@/api/chats'
import { fetchCharacterChats, setCharacterChat } from '@/api/characters'
import { listWorldInfo } from '@/api/worldinfo'
import { saveStory } from '@/api/stories'
import type { ChatEntry, Character, WorldInfoSummary } from '@/api/types'

const route = useRoute()
const router = useRouter()
const chat = useChatStore()
const chars = useCharactersStore()
const ui = useUiStore()
const models = useModelProfilesStore()
const modsStore = useModsStore()
const presets = usePresetsStore()
const personas = usePersonasStore()

const character = ref<Character | null>(null)
const chatList = ref<ChatEntry[]>([])
const loadingChats = ref(false)
const importing = ref(false)
const importInput = ref<HTMLInputElement>()
const worlds = ref<WorldInfoSummary[]>([])

const routeAvatar = computed(() => decodeURIComponent((route.params.avatar as string) || ''))
const routeChatFile = computed(() => (route.query.chat as string) || '')

async function initChat() {
  const avatar = routeAvatar.value
  character.value = chars.findCharacter(avatar) || null
  if (!character.value) {
    await chars.load()
    character.value = chars.findCharacter(avatar) || null
  }
  if (!character.value) {
    ui.addToast('角色未找到', 'error')
    router.push('/browse')
    return
  }
  await chat.loadChat(character.value, routeChatFile.value)
  await loadChatList()
}

async function loadChatList() {
  if (!character.value) return
  loadingChats.value = true
  try {
    chatList.value = await fetchCharacterChats(character.value.avatar)
  } catch (e: any) {
    ui.addToast(`聊天列表加载失败：${e.message}`, 'error')
  } finally {
    loadingChats.value = false
  }
}

function openChat(fileName: string) {
  if (!character.value) return
  router.push({
    path: `/chat/${encodeURIComponent(character.value.avatar)}`,
    query: { chat: fileName.replace(/\.jsonl$/i, '') },
  })
}

function createNewChat() {
  if (!character.value) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  router.push({
    path: `/chat/${encodeURIComponent(character.value.avatar)}`,
    query: { chat: `${character.value.name} - ${stamp}` },
  })
}

async function makeDefault(entry: ChatEntry) {
  if (!character.value || !entry.file_name) return
  try {
    await setCharacterChat(character.value.avatar, entry.file_name)
    ui.addToast('已设为默认聊天', 'success')
    await chars.load()
  } catch (e: any) {
    ui.addToast(`设置失败：${e.message}`, 'error')
  }
}

async function renameEntry(entry: ChatEntry) {
  if (!character.value || !entry.file_name) return
  const next = window.prompt('新的聊天名称', entry.file_id || entry.file_name.replace(/\.jsonl$/i, ''))
  if (!next?.trim()) return
  try {
    await renameChat(character.value.name, entry.file_name, next.trim(), character.value.avatar)
    ui.addToast('聊天已重命名', 'success')
    await loadChatList()
    if (chat.currentChatFile === entry.file_name.replace(/\.jsonl$/i, '')) {
      openChat(next.trim())
    }
  } catch (e: any) {
    ui.addToast(`重命名失败：${e.message}`, 'error')
  }
}

async function deleteEntry(entry: ChatEntry) {
  if (!character.value || !entry.file_name) return
  if (!window.confirm(`删除聊天「${entry.file_id || entry.file_name}」？`)) return
  try {
    await deleteChat(character.value.name, entry.file_name, character.value.avatar)
    ui.addToast('聊天已删除', 'success')
    await loadChatList()
    if (chat.currentChatFile === entry.file_name.replace(/\.jsonl$/i, '')) {
      router.push(`/chat/${encodeURIComponent(character.value.avatar)}`)
    }
  } catch (e: any) {
    ui.addToast(`删除失败：${e.message}`, 'error')
  }
}

async function exportCurrent() {
  if (!character.value || !chat.currentChatFile) {
    ui.addToast('没有当前聊天可导出', 'warning')
    return
  }
  try {
    const { filename, content } = await exportChat(character.value.avatar, chat.currentChatFile)
    const blob = new Blob([content], { type: 'application/jsonl' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    ui.addToast('已导出当前聊天', 'success')
  } catch (e: any) {
    ui.addToast(`导出失败：${e.message}`, 'error')
  }
}

function triggerImport() {
  importInput.value?.click()
}

async function onImportFile(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file || !character.value) return
  importing.value = true
  try {
    await importChat(character.value.avatar, character.value.name, file)
    ui.addToast(`已导入 ${file.name}`, 'success')
    await loadChatList()
  } catch (e: any) {
    ui.addToast(`导入失败：${e.message}`, 'error')
  } finally {
    importing.value = false
  }
}

async function clearCurrent() {
  if (!character.value) return
  if (!window.confirm('清空当前聊天的所有消息？文件会保留,但内容会全部删除。')) return
  try {
    await chat.clearCurrentChat()
    ui.addToast('已清空当前聊天', 'success')
    await loadChatList()
  } catch (e: any) {
    ui.addToast(`清空失败：${e.message}`, 'error')
  }
}

async function saveChatAsStory() {
  if (!character.value) {
    ui.addToast('没有当前角色', 'warning')
    return
  }
  const msgs = chat.messages
  if (!msgs.length) {
    ui.addToast('当前聊天没有任何消息，无法保存为故事', 'warning')
    return
  }
  const title = window.prompt('故事标题', `${character.value.name} - 故事`)
  if (!title?.trim()) return
  try {
    const aibar = chat.metadata?.aibar && typeof chat.metadata.aibar === 'object'
      ? (chat.metadata.aibar as Record<string, unknown>)
      : {}
    const summary = typeof aibar.storySummary === 'string' ? aibar.storySummary : ''
    const scenario = typeof aibar.storyScenario === 'string' ? aibar.storyScenario : ''
    const systemAppend = typeof aibar.storySystemAppend === 'string' ? aibar.storySystemAppend : ''
    const world = typeof aibar.world === 'string' ? aibar.world : ''

    const userMsg = msgs.find((m) => m.role === 'user')
    const firstAssistantMsg = msgs.find((m) => m.role === 'assistant')

    const story = await saveStory({
      title: title.trim(),
      summary: summary || (msgs.length > 0 ? `从聊天「${chat.currentChatFile}」反向保存` : ''),
      characterAvatar: character.value.avatar,
      world,
      scenario,
      openingUserMessage: userMsg?.content || '',
      openingAssistantMessage: firstAssistantMsg?.content || '',
      systemAppend,
      modelProfileId: chat.selectedProfileId,
      modIds: chat.selectedModIds,
    })
    ui.addToast('已保存为故事模板', 'success')
    router.push(`/story/${encodeURIComponent(story.id)}`)
  } catch (e: any) {
    ui.addToast(`保存失败：${e.message}`, 'error')
  }
}

function handleSend(text: string) { chat.sendMessage(text) }
function handleStop() { chat.stopGeneration() }
function handleRegenerate() { chat.regenerateLast() }
function handleContinue() { chat.continueLastReply() }
function handleEdit(index: number, content: string) { chat.editMessage(index, content) }
function handleDelete(index: number) { chat.deleteMessage(index) }
function handleSwipe(index: number, direction: -1 | 1) { chat.applySwipe(index, direction) }

async function handleProfileSelect(profileId: string) {
  await chat.setSelectedProfileId(profileId)
  ui.addToast('本聊天的模型配置已更新', 'success')
}

async function handlePresetSelect(presetId: string) {
  await chat.setSelectedPresetId(presetId)
  ui.addToast(presetId ? '已应用预设参数' : '已取消预设', 'success')
}

async function handleWorldSelect(value: string) {
  await chat.setSelectedWorld(value)
  ui.addToast(value ? '已绑定本聊天的世界书' : '已解除世界书绑定', 'success')
}

const globalModIds = computed(() =>
  modsStore.mods.filter((m) => m.enabled).map((m) => m.id),
)

function handleModIdsUpdate(ids: string[]) {
  const global = new Set(globalModIds.value)
  void chat.setSelectedModIds(ids.filter((id) => !global.has(id)))
}

onMounted(async () => {
  await Promise.all([
    models.loadSecrets(),
    modsStore.load(),
    presets.load(),
    personas.load(),
  ])
  try {
    worlds.value = await listWorldInfo()
  } catch {
    /* noop */
  }
  await initChat()
})

watch(() => route.fullPath, initChat)
</script>

<template>
  <div v-if="chat.character" class="h-screen flex flex-col bg-bg">
    <ChatTopBar
      :character="chat.character"
      :profile="chat.selectedProfile"
      @back="router.push('/browse')"
      @toggle-sidebar="ui.toggleSidePanel()"
      @toggle-model-drawer="ui.toggleModelDrawer()"
    />

    <MessageList
      :messages="chat.messages"
      :loading="chat.loading"
      :streaming="chat.streamingContent"
      :is-streaming="chat.isStreaming"
      @edit="handleEdit"
      @delete="handleDelete"
      @regenerate="handleRegenerate"
      @continue="handleContinue"
      @swipe="handleSwipe"
    />

    <div class="border-t border-border-subtle bg-bg/85 backdrop-blur">
      <div class="max-w-3xl mx-auto px-5 py-1.5 flex items-center gap-3 text-[10px] text-ink-muted/60 flex-wrap">
        <span>Enter 发送</span><span class="text-ink-muted/30">|</span>
        <span>Shift+Enter 换行</span><span class="text-ink-muted/30">|</span>
        <span>Esc 停止</span>
        <span class="flex-1" />
        <span class="hidden sm:inline">⌨ 快捷键</span>
      </div>
      <ChatInput
        :disabled="chat.loading"
        :is-streaming="chat.isStreaming"
        @send="handleSend"
        @stop="handleStop"
      />
    </div>

    <input
      ref="importInput"
      type="file"
      accept=".json,.jsonl"
      class="hidden"
      @change="onImportFile"
    />

    <AppDrawer
      :model-value="ui.sidePanelOpen"
      side="left"
      title="聊天管理"
      @update:model-value="ui.sidePanelOpen = $event"
    >
      <div class="p-4 space-y-5">
        <div class="grid grid-cols-2 gap-2">
          <AppButton size="sm" variant="gradient" class="col-span-2" @click="createNewChat">
            + 新聊天
          </AppButton>
          <AppButton size="sm" variant="secondary" @click="loadChatList">刷新</AppButton>
          <AppButton size="sm" variant="secondary" :disabled="importing" @click="triggerImport">
            {{ importing ? '导入中…' : '导入聊天' }}
          </AppButton>
          <AppButton size="sm" variant="secondary" @click="exportCurrent">导出当前</AppButton>
          <AppButton size="sm" variant="secondary" @click="saveChatAsStory">存为故事</AppButton>
          <AppButton size="sm" variant="danger" @click="clearCurrent">清空消息</AppButton>
        </div>

        <div>
          <h4 class="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
            历史聊天
          </h4>
          <div v-if="loadingChats" class="text-xs text-ink-muted py-3 text-center">加载中…</div>
          <div v-else class="space-y-2">
            <AppCard
              v-for="entry in chatList"
              :key="entry.file_name"
              padding="none"
              hover
            >
              <div class="p-3">
                <button
                  class="block w-full text-left text-sm text-ink-primary hover:text-brand-400 truncate transition-colors"
                  @click="openChat(entry.file_name)"
                >
                  {{ entry.file_id || entry.file_name }}
                </button>
                <p class="mt-1 text-xs text-ink-muted line-clamp-2 leading-relaxed">
                  {{ entry.mes || '（暂无消息）' }}
                </p>
                <div class="mt-2.5 flex flex-wrap gap-3 text-xs">
                  <button class="text-ink-secondary hover:text-ink-primary transition-colors" @click="makeDefault(entry)">设默认</button>
                  <button class="text-ink-secondary hover:text-ink-primary transition-colors" @click="renameEntry(entry)">重命名</button>
                  <button class="text-red-400 hover:text-red-300 transition-colors" @click="deleteEntry(entry)">删除</button>
                </div>
              </div>
            </AppCard>
            <p v-if="chatList.length === 0" class="text-xs text-ink-muted py-2 text-center">暂无聊天记录</p>
          </div>
        </div>
      </div>
    </AppDrawer>

    <AppDrawer
      :model-value="ui.modelDrawerOpen"
      side="right"
      title="模型 / 世界 / MOD"
      width="22rem"
      @update:model-value="ui.modelDrawerOpen = $event"
    >
      <div class="p-4 space-y-5">
        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
            当前聊天使用模型
          </label>
          <AppSelect
            :model-value="chat.selectedProfileId"
            @update:model-value="handleProfileSelect"
          >
            <option v-for="profile in models.profiles" :key="profile.id" :value="profile.id">
              {{ profile.name }} · {{ profile.model }}
            </option>
          </AppSelect>
        </div>

        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
            生成预设
          </label>
          <AppSelect
            :model-value="chat.selectedPresetId"
            @update:model-value="handlePresetSelect"
          >
            <option value="">不使用预设</option>
            <option v-for="p in presets.presets" :key="p.id" :value="p.id">
              {{ p.name }} · T{{ p.temperature }}
            </option>
          </AppSelect>
          <p class="mt-1.5 text-[11px] text-ink-muted">预设会覆盖模型的温度和长度参数。</p>
        </div>

        <AppCard padding="sm">
          <dl class="space-y-1.5 text-xs">
            <div class="flex justify-between gap-2">
              <dt class="text-ink-muted">渠道</dt>
              <dd class="text-ink-primary truncate">{{ chat.selectedProfile.source }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-ink-muted">模型</dt>
              <dd class="text-ink-primary truncate text-right">{{ chat.selectedProfile.model }}</dd>
            </div>
            <div v-if="chat.selectedProfile.endpoint" class="flex justify-between gap-2">
              <dt class="text-ink-muted">端点</dt>
              <dd class="text-ink-primary truncate text-right">{{ chat.selectedProfile.endpoint }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-ink-muted">温度 / 上限</dt>
              <dd class="text-ink-primary">{{ chat.selectedProfile.temperature }} / {{ chat.selectedProfile.maxTokens }}</dd>
            </div>
          </dl>
        </AppCard>

        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
            世界书绑定 (本聊天)
          </label>
          <AppSelect
            :model-value="chat.selectedWorld"
            @update:model-value="handleWorldSelect"
          >
            <option value="">不绑定</option>
            <option v-for="w in worlds" :key="w.file_id" :value="w.file_id">
              {{ w.name || w.file_id }}
            </option>
          </AppSelect>
          <p class="mt-1.5 text-[11px] text-ink-muted">每次生成会按关键词命中条目并注入到系统提示。</p>
        </div>

        <ModPicker
          :model-value="chat.selectedModIds"
          :mods="modsStore.mods"
          :locked-ids="globalModIds"
          title="本聊天加载 MOD"
          description="全局 MOD 已锁定加载。这里勾选的额外 MOD 会写入当前聊天存档。"
          compact
          @update:model-value="handleModIdsUpdate"
        />

        <AppButton variant="secondary" class="w-full" @click="router.push('/mods')">
          管理 MOD
        </AppButton>
      </div>
    </AppDrawer>
  </div>

  <div v-else class="flex items-center justify-center h-screen">
    <p class="text-ink-muted text-sm">加载中…</p>
  </div>
</template>
