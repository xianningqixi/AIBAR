import type { Character, WorldInfoEntry } from '@/api/types'

export type CharacterBookCompatibilityReason =
  | 'probability'
  | 'grouping'
  | 'depth-injection'
  | 'unsupported-position'

export interface CharacterBookAnalysis {
  entries: WorldInfoEntry[]
  entryCount: number
  requiresCompatibility: boolean
  reasons: CharacterBookCompatibilityReason[]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item))
    : []
}

function asFiniteNumber(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function sourceEntries(character: Character | null): Record<string, unknown>[] {
  const book = asRecord(character?.data?.character_book)
  const entries = book.entries
  if (Array.isArray(entries)) return entries.map(asRecord)
  return Object.values(asRecord(entries)).map(asRecord)
}

export function normalizeCharacterBookEntry(entry: Record<string, unknown>): WorldInfoEntry {
  const extensions = asRecord(entry.extensions)
  const order = asFiniteNumber(entry.insertion_order ?? entry.order)
  const selectiveLogic = asFiniteNumber(extensions.selectiveLogic ?? entry.selectiveLogic)

  return {
    ...entry,
    uid: asFiniteNumber(entry.id ?? entry.uid),
    key: asStringList(entry.keys ?? entry.key),
    keysecondary: asStringList(entry.secondary_keys ?? entry.keysecondary),
    comment: typeof entry.comment === 'string' ? entry.comment : '',
    content: typeof entry.content === 'string' ? entry.content : '',
    constant: entry.constant === true,
    disable: entry.disable === true || entry.enabled === false,
    selective: entry.selective === true,
    selectiveLogic,
    ignoreBudget: extensions.ignore_budget === true || entry.ignoreBudget === true,
    order,
  }
}

export function analyzeCharacterBook(character: Character | null): CharacterBookAnalysis {
  const rawEntries = sourceEntries(character)
  const reasons = new Set<CharacterBookCompatibilityReason>()

  for (const entry of rawEntries) {
    const extensions = asRecord(entry.extensions)
    const probability = asFiniteNumber(extensions.probability)
    if (extensions.useProbability === true && probability !== undefined && probability < 100) {
      reasons.add('probability')
    }

    if (
      (typeof extensions.group === 'string' && Boolean(extensions.group.trim()))
      || extensions.group_override === true
    ) {
      reasons.add('grouping')
    }

    const extensionPosition = asFiniteNumber(extensions.position)
    const depth = asFiniteNumber(extensions.depth)
    if (extensionPosition !== undefined && ![0, 1].includes(extensionPosition)) {
      reasons.add(extensionPosition === 4 ? 'depth-injection' : 'unsupported-position')
    }
    if (depth !== undefined && depth !== 4) reasons.add('depth-injection')

    const position = entry.position
    if (
      position !== undefined
      && position !== null
      && ![0, 1, 'before_char', 'after_char'].includes(position as number | string)
    ) {
      reasons.add(position === 'at_depth' ? 'depth-injection' : 'unsupported-position')
    }
  }

  return {
    entries: rawEntries.map(normalizeCharacterBookEntry),
    entryCount: rawEntries.length,
    requiresCompatibility: reasons.size > 0,
    reasons: [...reasons],
  }
}
