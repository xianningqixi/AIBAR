import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiPost } from './client'
import { fetchChat, saveChat } from './chats'

vi.mock('./client', () => ({
  apiPost: vi.fn(),
  apiPostForm: vi.fn(),
}))

describe('ST chat round-trip', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retains extension header and message fields when saving', async () => {
    vi.mocked(apiPost)
      .mockResolvedValueOnce([
        {
          chat_metadata: { integrity: 'keep', variables: { floor: 3 } },
          user_name: 'Player',
          character_name: 'Card',
          create_date: 'original',
        },
        {
          name: 'Card',
          is_user: false,
          is_system: false,
          send_date: 'original-date',
          mes: 'hello',
          variables: { hp: 7 },
          variables_initialized: true,
          is_ejs_processed: true,
          swipe_info: [{ send_date: 'swipe-date' }],
          extra: { extension_state: { step: 2 }, aibar: { keep: true } },
        },
      ])
      .mockResolvedValueOnce({})

    const result = await fetchChat('Card', 'chat', 'card.png')
    result.messages[0].content = 'edited'
    await saveChat('Card', 'chat', 'card.png', result.messages, result.metadata, result.serverHeader)

    const saveBody = vi.mocked(apiPost).mock.calls[1]?.[1] as {
      chat: Array<Record<string, unknown>>
    }
    expect(saveBody.chat[0]).toEqual(expect.objectContaining({
      create_date: 'original',
      user_name: 'Player',
      chat_metadata: expect.objectContaining({
        integrity: 'keep',
        variables: { floor: 3 },
      }),
    }))
    expect(saveBody.chat[1]).toEqual(expect.objectContaining({
      mes: 'edited',
      variables: { hp: 7 },
      variables_initialized: true,
      is_ejs_processed: true,
      swipe_info: [{ send_date: 'swipe-date' }],
      extra: expect.objectContaining({
        extension_state: { step: 2 },
        aibar: expect.objectContaining({ keep: true }),
      }),
    }))
  })

  it('loads ST system messages as system messages', async () => {
    vi.mocked(apiPost).mockResolvedValueOnce([
      { chat_metadata: {} },
      { mes: 'state update', is_system: true, variables: { ready: true } },
    ])

    const result = await fetchChat('Card', 'chat', 'card.png')
    expect(result.messages[0]).toEqual(expect.objectContaining({
      role: 'system',
      content: 'state update',
      serverData: expect.objectContaining({ variables: { ready: true } }),
    }))
  })
})
