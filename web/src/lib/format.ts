// 通用格式化工具：文本、日期与标签解析。
// 日期/标签函数之前散落在 5+ 个页面里各自实现，行为略有差异；此处为唯一事实源。

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

/** 解析「逗号 / 中文逗号 / 顿号 / 换行」分隔的标签字符串 */
export function parseTags(value: string): string[] {
  return value
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = new Date(value as string | number)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 「06/12 14:30」式的短日期时间，列表时间戳用 */
export function formatDateTime(value: unknown, fallback = '未更新'): string {
  const date = toDate(value)
  if (!date) return fallback
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** 「2026/06/12」式的纯日期，发布日期等场景用 */
export function formatDate(value: unknown, fallback = '未更新'): string {
  const date = toDate(value)
  if (!date) return fallback
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function toTimestamp(value: unknown): number {
  if (typeof value === 'number') return value
  const date = toDate(value)
  return date ? date.getTime() : Number.NaN
}

/** 「刚刚 / N 分钟前 / N 天前」相对时间，超过 7 天回落到短日期 */
export function formatRelative(value: unknown, fallback = '未更新'): string {
  const t = toTimestamp(value)
  if (!Number.isFinite(t)) return fallback
  const diff = Date.now() - t
  if (diff < 0) return formatDateTime(value, fallback)
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return formatDateTime(value, fallback)
}
