import { describe, expect, it } from 'vitest'
import { createStCompatibilityApproval, ST_COMPAT_APPROVAL_TTL_MS } from './stCompatibility'

describe('createStCompatibilityApproval', () => {
  it('creates a short-lived same-origin handoff without embedding card data', () => {
    const approval = createStCompatibilityApproval(
      { name: 'Complex', avatar: 'complex.png' },
      'Complex - 20260809.jsonl',
      '/aibar/#/character/complex.png',
      1000,
    )

    expect(approval).toEqual({
      version: 1,
      avatar: 'complex.png',
      chat: 'Complex - 20260809',
      returnTo: '/aibar/#/character/complex.png',
      expiresAt: 1000 + ST_COMPAT_APPROVAL_TTL_MS,
    })
    expect(JSON.stringify(approval)).not.toContain('data')
  })

  it('rejects protocol-relative return paths', () => {
    const approval = createStCompatibilityApproval(
      { name: 'Complex', avatar: 'complex.png' },
      'chat',
      '//external.invalid/path',
      0,
    )

    expect(approval.returnTo).toBe('/aibar/')
  })
})
