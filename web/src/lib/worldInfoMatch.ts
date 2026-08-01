import type { Character, ChatMessage, WorldInfoEntry, WorldInfoFile } from '@/api/types'
import { getWorldInfo } from '@/api/worldinfo'

const cache = new Map<string, WorldInfoFile>()
let cacheGeneration = 0
const WORLD_INFO_CHAR_BUDGET = 12_000

function entryList(file: WorldInfoFile): WorldInfoEntry[] {
  if (Array.isArray(file.entries)) return file.entries
  if (file.entries && typeof file.entries === 'object') {
    return Object.values(file.entries) as WorldInfoEntry[]
  }
  return []
}

export async function loadWorldInfoFile(name: string): Promise<WorldInfoFile | null> {
  if (!name) return null
  if (cache.has(name)) return cache.get(name) || null
  const generation = cacheGeneration
  try {
    const data = await getWorldInfo(name)
    if (generation !== cacheGeneration) return null
    cache.set(name, data)
    return data
  } catch (e) {
    console.warn(`World info "${name}" load failed:`, e)
    return null
  }
}

export function clearWorldInfoCache() {
  cacheGeneration += 1
  cache.clear()
}

function matchKey(text: string, key: string, caseSensitive = false): boolean {
  if (!key) return false
  const haystack = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? key : key.toLowerCase()
  if (/^\/.+\/[a-z]*$/.test(key)) {
    try {
      const m = key.match(/^\/(.+)\/([a-z]*)$/)
      if (m) {
        const re = new RegExp(m[1], m[2] || (caseSensitive ? '' : 'i'))
        return re.test(text)
      }
    } catch {
      /* fallthrough */
    }
  }
  return haystack.includes(needle)
}

function entryActive(entry: WorldInfoEntry, text: string): boolean {
  if (entry.disable) return false
  if (entry.constant) return true
  const keys = Array.isArray(entry.key) ? entry.key : []
  if (!keys.length) return false
  const primaryMatched = keys.some((k) => typeof k === 'string' && matchKey(text, k))
  if (!primaryMatched) return false

  const secondary = Array.isArray(entry.keysecondary)
    ? entry.keysecondary.filter((key): key is string => typeof key === 'string' && Boolean(key))
    : []
  if (!secondary.length) return true
  const matches = secondary.map((key) => matchKey(text, key))
  switch (Number(entry.selectiveLogic) || 0) {
    case 1: // NOT ALL
      return !matches.every(Boolean)
    case 2: // NOT ANY
      return !matches.some(Boolean)
    case 3: // AND ALL
      return matches.every(Boolean)
    default: // AND ANY
      return matches.some(Boolean)
  }
}

export function buildScanText(character: Character | null, messages: ChatMessage[], scanDepth = 4): string {
  const parts: string[] = []
  if (character) {
    parts.push(character.name || '')
    parts.push(character.description || character.data?.description || '')
    parts.push(character.personality || character.data?.personality || '')
    parts.push(character.scenario || character.data?.scenario || '')
  }
  const recent = messages.slice(-scanDepth)
  for (const m of recent) {
    parts.push(m.content || '')
  }
  return parts.filter(Boolean).join('\n')
}

export function renderMatchedWorldInfo(
  entries: WorldInfoEntry[],
  scanText: string,
  charBudget = WORLD_INFO_CHAR_BUDGET,
): string {
  const matched = entries
    .filter((entry) => entryActive(entry, scanText))
    .sort((a, b) => (Number(b.order) || 0) - (Number(a.order) || 0))

  const included: string[] = []
  let used = 0
  for (const entry of matched) {
    const content = String(entry.content || '').trim()
    if (!content) continue
    const cost = content.length + (included.length ? 2 : 0)
    if (!entry.ignoreBudget && used + cost > charBudget) continue
    included.push(content)
    if (!entry.ignoreBudget) used += cost
  }
  return included.join('\n\n')
}

export async function getMatchedWorldInfo(
  worldName: string | undefined,
  character: Character | null,
  messages: ChatMessage[],
): Promise<string> {
  if (!worldName) return ''
  const file = await loadWorldInfoFile(worldName)
  if (!file) return ''
  const entries = entryList(file)
  if (!entries.length) return ''
  const scan = buildScanText(character, messages)

  return renderMatchedWorldInfo(entries, scan)
}

export function entryListOf(file: WorldInfoFile): WorldInfoEntry[] {
  return entryList(file)
}

export function setEntries(file: WorldInfoFile, entries: WorldInfoEntry[]): WorldInfoFile {
  return { ...file, entries }
}
