import { ref } from 'vue'
import type { Character } from '@/api/types'
import { getApiErrorMessage } from '@/api/client'
import { useUiStore } from '@/stores/ui'
import { analyzeCharacterRuntime, type CharacterRuntimeAnalysis } from '@/lib/characterRuntime'
import { launchStCompatibility } from '@/lib/stCompatibility'

/**
 * ST 兼容模式守卫：进入聊天前检测角色是否需要 SillyTavern 兼容运行时。
 * BrowsePage（从浏览卡片进入）与 ChatPage（直接进入路由）共用同一套
 * 检测、对话框状态与启动逻辑，避免两份实现漂移。
 */
export function useStCompatibilityGate() {
  const ui = useUiStore()
  const dialogOpen = ref(false)
  const launching = ref(false)
  const character = ref<Character | null>(null)
  const analysis = ref<CharacterRuntimeAnalysis | null>(null)
  const pendingChat = ref('')

  function reset() {
    dialogOpen.value = false
    launching.value = false
    character.value = null
    analysis.value = null
    pendingChat.value = ''
  }

  /** 已拿到分析结果时直接进入兼容对话框 */
  function setGate(nextCharacter: Character, result: CharacterRuntimeAnalysis, chat = '') {
    character.value = nextCharacter
    analysis.value = result
    pendingChat.value = chat.replace(/\.jsonl$/i, '')
    dialogOpen.value = true
  }

  /** 返回 true 表示需要兼容模式（对话框已打开），调用方应中止常规进入流程 */
  function gate(nextCharacter: Character, chat = ''): boolean {
    const result = analyzeCharacterRuntime(nextCharacter)
    if (!result.requiresCompatibility) return false
    setGate(nextCharacter, result, chat)
    return true
  }

  async function confirmLaunch() {
    if (!character.value || launching.value) return
    launching.value = true
    try {
      await launchStCompatibility(character.value, {
        chat: pendingChat.value || undefined,
      })
    } catch (e: unknown) {
      launching.value = false
      ui.addToast(`进入兼容模式失败：${getApiErrorMessage(e)}`, 'error')
    }
  }

  return { dialogOpen, launching, character, analysis, reset, setGate, gate, confirmLaunch }
}
