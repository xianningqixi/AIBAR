export function normalizeText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function trimText(value: unknown): string {
  return String(value || '').trim()
}

export function stripJsonlName(filename: string): string {
  return filename.replace(/\.jsonl$/i, '')
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}
