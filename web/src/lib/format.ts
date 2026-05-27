export function normalizeText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function trimText(value: unknown): string {
  return String(value || '').trim()
}

export function stripJsonlName(filename: string): string {
  return filename.replace(/\.jsonl$/i, '')
}

export function getChatFileName(avatar: string, chat?: string): string {
  const base = chat ? stripJsonlName(chat) : avatar
  return `${base}.jsonl`
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trimEnd() + '...'
}
