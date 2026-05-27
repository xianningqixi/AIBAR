import { apiPost, apiStream } from './client'
import { providerConfigs } from '@/lib/providers'
import type { ModelProfile } from './types'

export async function generateReply(payload: Record<string, unknown>): Promise<string> {
  const data = await apiPost<Record<string, unknown>>(
    '/api/backends/chat-completions/generate',
    payload,
  )
  const reply =
    (data?.choices as any)?.[0]?.message?.content ||
    (data?.choices as any)?.[0]?.text ||
    (data as any)?.content ||
    (data as any)?.response ||
    ''
  return String(reply || '')
}

export async function testConnection(
  profile: ModelProfile,
): Promise<{ ok: boolean; message: string; models?: number }> {
  const body: Record<string, unknown> = {
    chat_completion_source: profile.source,
    model: profile.model,
  }
  if (profile.secretId) body.secret_id = profile.secretId
  const cfg = providerConfigs[profile.source]
  if (profile.source === 'custom') {
    body.custom_url = profile.endpoint
  } else if (cfg?.endpointKey === 'reverse_proxy' && profile.endpoint) {
    body.reverse_proxy = profile.endpoint
  }
  try {
    const r = await apiPost<any>('/api/backends/chat-completions/status', body)
    const models = Array.isArray(r?.data) ? r.data.length : undefined
    if (r?.error) {
      return { ok: false, message: String(r.error) || '连接失败' }
    }
    return { ok: true, message: '连接正常', models }
  } catch (e: any) {
    return { ok: false, message: e?.message || '连接失败' }
  }
}

export async function* generateReplyStream(
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): AsyncGenerator<{ content?: string; reasoning?: string }> {
  for await (const evt of apiStream(
    '/api/backends/chat-completions/generate',
    payload,
    signal,
  )) {
    const delta = (evt as any)?.choices?.[0]?.delta
    if (delta) {
      yield {
        content: delta.content || undefined,
        reasoning: delta.reasoning || delta.reasoning_content || undefined,
      }
    }
  }
}
