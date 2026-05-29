import { ApiError, apiPost, apiStream } from './client'
import { providerConfigs } from '@/lib/providers'
import type { ModelProfile } from './types'

function explainGenerateError(error: unknown, payload?: Record<string, unknown>): string {
  const raw = error instanceof ApiError
    ? error.body
    : error instanceof Error
      ? error.message
      : String(error || '')

  let message = raw
  try {
    const parsed = JSON.parse(raw) as any
    message = parsed?.error?.message || parsed?.message || raw
  } catch {
    // Plain text errors are common for network failures.
  }

  const endpoint = String(payload?.custom_url || payload?.reverse_proxy || '').trim()
  const refused = /ECONNREFUSED|Connection refused/i.test(message)
  if (refused) {
    const matched = message.match(/request to\s+(\S+)\s+failed/i)?.[1] || endpoint
    const target = matched || '当前模型端点'
    if (/127\.0\.0\.1:11434|localhost:11434/i.test(target)) {
      return `优化提示词使用的是本地 Ollama 模型，但 ${target} 没有服务在运行。请启动 Ollama，或在模型下拉里切到已配置的 DS/OpenAI/Gemini。`
    }
    return `优化提示词连接模型端点失败：${target}。请检查模型连接配置或切换到可用渠道。`
  }

  if (/502|Bad Gateway/i.test(message)) {
    return `模型服务返回 502：${message}`
  }
  return message || '模型生成失败，请检查模型连接配置'
}

export async function generateReply(payload: Record<string, unknown>): Promise<string> {
  let data: Record<string, unknown>
  try {
    data = await apiPost<Record<string, unknown>>(
      '/api/backends/chat-completions/generate',
      payload,
    )
  } catch (error) {
    throw new Error(explainGenerateError(error, payload))
  }
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
      const message =
        typeof r.message === 'string'
          ? r.message
          : typeof r.error === 'string'
            ? r.error
            : '服务可达，但模型列表请求失败。请确认 API Key 已保存，且端点支持 /models。'
      return { ok: false, message }
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
