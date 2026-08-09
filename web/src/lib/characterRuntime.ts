import type { Character } from '@/api/types'
import { analyzeCharacterBook } from './characterBook'

export type CharacterRuntimeRisk = 'content' | 'local-scripts' | 'remote-code'

export interface CharacterRuntimeCapability {
  id: 'world-book' | 'regex' | 'tavern-helper' | 'depth-prompt' | 'interactive-html' | 'template' | 'mvu'
  label: string
  count?: number
}

export interface CharacterRuntimeAnalysis {
  runtime: 'aibar' | 'st-compat'
  requiresCompatibility: boolean
  risk: CharacterRuntimeRisk
  capabilities: CharacterRuntimeCapability[]
  worldBookEntries: number
  regexScripts: number
  helperScripts: number
  usesRemoteCode: boolean
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function countCollection(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return Object.keys(value).length
  return 0
}

function serializeForDetection(value: unknown): string {
  try {
    return JSON.stringify(value) || ''
  } catch {
    return ''
  }
}

/**
 * AIBAR deliberately keeps its native runtime text-only. Cards that depend on
 * SillyTavern lifecycle hooks are handed to the existing ST runtime instead of
 * partially emulating those hooks and silently producing incorrect state.
 */
export function analyzeCharacterRuntime(character: Character): CharacterRuntimeAnalysis {
  const data = asRecord(character.data)
  const extensions = asRecord(data.extensions)
  const characterBook = analyzeCharacterBook(character)
  const worldBookEntries = characterBook.entryCount
  const regexScripts = countCollection(extensions.regex_scripts)
  const tavernHelper = asRecord(extensions.tavern_helper)
  const helperScripts = countCollection(tavernHelper.scripts)
  const depthPrompt = asRecord(extensions.depth_prompt)
  const depthPromptText = typeof depthPrompt.prompt === 'string' ? depthPrompt.prompt.trim() : ''

  const fullText = serializeForDetection(data)
  const executableText = [
    serializeForDetection(extensions.regex_scripts),
    serializeForDetection(tavernHelper),
  ].join('\n')
  const hasInteractiveHtml = /<(?:iframe|script|button|form|input|select|textarea|style)\b/i.test(fullText)
  const hasAdvancedTemplate = /<%[=-]?[\s\S]*?%>/.test(fullText)
  const usesMvu = /(?:^|[^a-z])mvu(?:[^a-z]|$)|stat_data|message_variables/i.test(executableText)
  const usesRemoteCode = (
    /(?:import\s*\(|<script\b[^>]*\bsrc\s*=|https?:\/\/[^\s"']+\.(?:m?js|ts)(?:[?#][^\s"']*)?)/i
      .test(executableText)
  )

  const capabilities: CharacterRuntimeCapability[] = []
  if (worldBookEntries) {
    capabilities.push({
      id: 'world-book',
      label: characterBook.requiresCompatibility ? '高级内嵌世界书' : '内嵌世界书',
      count: worldBookEntries,
    })
  }
  if (regexScripts) capabilities.push({ id: 'regex', label: '角色正则', count: regexScripts })
  if (helperScripts) capabilities.push({ id: 'tavern-helper', label: 'TavernHelper 脚本', count: helperScripts })
  if (depthPromptText) capabilities.push({ id: 'depth-prompt', label: '深度提示词' })
  if (hasInteractiveHtml) capabilities.push({ id: 'interactive-html', label: '交互式 HTML / iframe' })
  if (hasAdvancedTemplate) capabilities.push({ id: 'template', label: 'ST 模板表达式' })
  if (usesMvu) capabilities.push({ id: 'mvu', label: 'MVU 变量运行时' })

  const requiresCompatibility = Boolean(
    characterBook.requiresCompatibility
    || regexScripts
    || helperScripts
    || depthPromptText
    || hasInteractiveHtml
    || hasAdvancedTemplate,
  )

  return {
    runtime: requiresCompatibility ? 'st-compat' : 'aibar',
    requiresCompatibility,
    risk: usesRemoteCode ? 'remote-code' : helperScripts ? 'local-scripts' : 'content',
    capabilities,
    worldBookEntries,
    regexScripts,
    helperScripts,
    usesRemoteCode,
  }
}
