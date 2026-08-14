import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Character, ChatEntry, StoryCard } from '@/api/types'
import { getApiErrorMessage } from '@/api/client'
import { deleteChat, exportChat, importChat, renameChat } from '@/api/chats'
import { fetchCharacterChats, setCharacterChat } from '@/api/characters'
import { saveStory } from '@/api/stories'
import { downloadTextFile } from '@/lib/download'
import { getMetadataAibar } from '@/lib/chatMetadata'
import { useCharactersStore } from './characters'
import { useChatStore } from './chat'
import { useStoriesStore } from './stories'
import { useUiStore } from './ui'

// 某个角色的聊天文件管理（列表/默认/重命名/删除/导入导出/存为故事）。
// 对话框与路由跳转属于页面层：这里的动作只接收已确认的输入，返回是否成功。
export const useChatFilesStore = defineStore('chatFiles', () => {
  const entries = ref<ChatEntry[]>([])
  const loading = ref(false)
  const importing = ref(false)
  // 角色/账号切换后，迟到的列表响应不允许覆盖新状态
  let listVersion = 0

  async function loadList(character: Character) {
    const version = ++listVersion
    loading.value = true
    try {
      const list = await fetchCharacterChats(character.avatar)
      if (version !== listVersion) return
      entries.value = list
    } catch (e: unknown) {
      if (version !== listVersion) return
      useUiStore().addToast(`聊天列表加载失败：${getApiErrorMessage(e)}`, 'error')
    } finally {
      if (version === listVersion) loading.value = false
    }
  }

  async function makeDefault(character: Character, entry: ChatEntry): Promise<boolean> {
    if (!entry.file_name) return false
    const ui = useUiStore()
    try {
      await setCharacterChat(character.avatar, entry.file_name)
      ui.addToast('已设为默认聊天', 'success')
      await useCharactersStore().load()
      return true
    } catch (e: unknown) {
      ui.addToast(`设置失败：${getApiErrorMessage(e)}`, 'error')
      return false
    }
  }

  async function rename(character: Character, entry: ChatEntry, nextName: string): Promise<boolean> {
    if (!entry.file_name || !nextName.trim()) return false
    const ui = useUiStore()
    try {
      await renameChat(character.name, entry.file_name, nextName.trim(), character.avatar)
      ui.addToast('聊天已重命名', 'success')
      await loadList(character)
      return true
    } catch (e: unknown) {
      ui.addToast(`重命名失败：${getApiErrorMessage(e)}`, 'error')
      return false
    }
  }

  async function remove(character: Character, entry: ChatEntry): Promise<boolean> {
    if (!entry.file_name) return false
    const ui = useUiStore()
    try {
      await deleteChat(character.name, entry.file_name, character.avatar)
      ui.addToast('聊天已删除', 'success')
      await loadList(character)
      return true
    } catch (e: unknown) {
      ui.addToast(`删除失败：${getApiErrorMessage(e)}`, 'error')
      return false
    }
  }

  async function exportChatFile(character: Character, chatFile: string): Promise<boolean> {
    const ui = useUiStore()
    if (!chatFile) {
      ui.addToast('没有当前聊天可导出', 'warning')
      return false
    }
    try {
      const { filename, content } = await exportChat(character.avatar, chatFile)
      downloadTextFile(filename, content, 'application/jsonl')
      ui.addToast('已导出当前聊天', 'success')
      return true
    } catch (e: unknown) {
      ui.addToast(`导出失败：${getApiErrorMessage(e)}`, 'error')
      return false
    }
  }

  async function importFile(character: Character, file: File): Promise<boolean> {
    const ui = useUiStore()
    importing.value = true
    try {
      await importChat(character.avatar, character.name, file)
      ui.addToast(`已导入 ${file.name}`, 'success')
      await loadList(character)
      return true
    } catch (e: unknown) {
      ui.addToast(`导入失败：${getApiErrorMessage(e)}`, 'error')
      return false
    } finally {
      importing.value = false
    }
  }

  /** 把当前聊天反向保存为故事模板；成功返回故事对象，调用方决定是否跳转。 */
  async function saveCurrentChatAsStory(title: string): Promise<StoryCard | null> {
    const chat = useChatStore()
    const ui = useUiStore()
    const character = chat.character
    if (!character || !title.trim()) return null
    try {
      const aibar = getMetadataAibar(chat.metadata)
      const summary = typeof aibar.storySummary === 'string' ? aibar.storySummary : ''
      const userMsg = chat.messages.find((m) => m.role === 'user')
      const firstAssistantMsg = chat.messages.find((m) => m.role === 'assistant')

      const story = await saveStory({
        title: title.trim(),
        summary: summary || (chat.messages.length > 0 ? `从聊天「${chat.currentChatFile}」反向保存` : ''),
        characterAvatar: character.avatar,
        world: typeof aibar.world === 'string' ? aibar.world : '',
        scenario: typeof aibar.storyScenario === 'string' ? aibar.storyScenario : '',
        openingUserMessage: userMsg?.content || '',
        openingAssistantMessage: firstAssistantMsg?.content || '',
        systemAppend: typeof aibar.storySystemAppend === 'string' ? aibar.storySystemAppend : '',
        modelProfileId: chat.selectedProfileId,
        modIds: chat.selectedModIds,
      })
      useStoriesStore().invalidate()
      ui.addToast('已保存为故事模板', 'success')
      return story
    } catch (e: unknown) {
      ui.addToast(`保存失败：${getApiErrorMessage(e)}`, 'error')
      return null
    }
  }

  function reset() {
    listVersion += 1
    entries.value = []
    loading.value = false
    importing.value = false
  }

  return {
    entries,
    loading,
    importing,
    loadList,
    makeDefault,
    rename,
    remove,
    exportChatFile,
    importFile,
    saveCurrentChatAsStory,
    reset,
  }
})
