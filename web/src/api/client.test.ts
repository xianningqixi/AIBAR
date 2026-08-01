import { describe, expect, it } from 'vitest'
import { ApiError, getApiErrorMessage } from './client'

describe('ApiError', () => {
  it('exposes structured backend errors without leaking the raw response envelope', () => {
    const error = new ApiError(500, JSON.stringify({ error: { message: '模型暂时不可用' } }))

    expect(error.message).toBe('模型暂时不可用')
    expect(getApiErrorMessage(error)).toBe('模型暂时不可用')
    expect(error.message).not.toContain('API 500')
  })

  it('uses plain responses and a status fallback when no message exists', () => {
    expect(new ApiError(403, '没有权限').message).toBe('没有权限')
    expect(new ApiError(503, '').message).toBe('请求失败 (HTTP 503)')
  })
})
