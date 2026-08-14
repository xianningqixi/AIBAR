import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatRelative, parseTags } from './format'

describe('parseTags', () => {
  it('splits on comma, Chinese comma, 顿号 and newline', () => {
    expect(parseTags('a, b，c、d\ne')).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('trims and drops empties', () => {
    expect(parseTags('  a , , b  ')).toEqual(['a', 'b'])
    expect(parseTags('')).toEqual([])
  })
})

describe('formatDateTime', () => {
  it('formats month/day/hour/minute', () => {
    const result = formatDateTime('2026-06-12T14:30:00')
    expect(result).toContain('06')
    expect(result).toContain('12')
    expect(result).toMatch(/14:30|下午2:30|14/)
  })

  it('returns fallback for missing or invalid values', () => {
    expect(formatDateTime(undefined)).toBe('未更新')
    expect(formatDateTime('not-a-date')).toBe('未更新')
    expect(formatDateTime(null, '长期有效')).toBe('长期有效')
  })
})

describe('formatDate', () => {
  it('formats year/month/day', () => {
    expect(formatDate('2026-06-12T14:30:00')).toBe('2026/06/12')
  })

  it('returns fallback for invalid values', () => {
    expect(formatDate(undefined)).toBe('未更新')
  })
})

describe('formatRelative', () => {
  it('describes recent timestamps', () => {
    const now = Date.now()
    expect(formatRelative(now - 10 * 1000)).toBe('刚刚')
    expect(formatRelative(now - 5 * 60 * 1000)).toBe('5 分钟前')
    expect(formatRelative(now - 3 * 3600 * 1000)).toBe('3 小时前')
    expect(formatRelative(now - 2 * 86400 * 1000)).toBe('2 天前')
  })

  it('falls back to date for old or invalid timestamps', () => {
    const old = Date.now() - 30 * 86400 * 1000
    expect(formatRelative(old)).toContain('/')
    expect(formatRelative('garbage')).toBe('未更新')
  })
})
