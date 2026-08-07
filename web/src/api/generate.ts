import { ApiError, apiPost, apiStream } from './client'
import type { ModelProfile } from './types'

// api 层不允许依赖 Pinia store：结算通知通过回调注入（billing store 在创建时注册），
// 这里只负责在每次生成结束后触发一次。
let generationSettledListener: (() => void) | null = null

export function setGenerationSettledListener(listener: (() => void) | null): void {
  generationSettledListener = listener
}

function refreshPointBalance() {
  try {
    generationSettledListener?.()
  } catch (error) {
    console.warn('Generation settled listener failed', error)
  }
}

function explainGenerateError(error: unknown, payload?: Record<string, unknown>): string {
  const raw = error instanceof ApiError
    ? error.body
    : error instanceof Error
      ? error.message
      : String(error || '')

  let message = raw
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string }
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

type ChatCompletionResponse = {
  type?: unknown
  choices?: Array<{
    message?: { content?: unknown }
    text?: unknown
    delta?: { content?: unknown; reasoning?: unknown; reasoning_content?: unknown }
  }>
  delta?: {
    type?: unknown
    text?: unknown
    thinking?: unknown
    content?: unknown
    reasoning?: unknown
    reasoning_content?: unknown
  }
  content_block?: { type?: unknown; text?: unknown }
  content?: unknown
  response?: unknown
  error?: unknown
  message?: unknown
}

function responseError(data: ChatCompletionResponse): string {
  if (!data?.error) return ''
  if (typeof data.error === 'string') return data.error
  if (typeof data.error === 'object' && data.error) {
    const message = (data.error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return typeof data.message === 'string' ? data.message : '模型接口返回错误'
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map((part) => {
      if (typeof part === 'string') return part
      if (!part || typeof part !== 'object') return ''
      const text = (part as { text?: unknown; content?: unknown }).text
        ?? (part as { content?: unknown }).content
      return typeof text === 'string' ? text : ''
    })
    .join('')
}

export function parseStreamChunk(data: ChatCompletionResponse): { content?: string; reasoning?: string } {
  const choice = data?.choices?.[0]
  const choiceDelta = choice?.delta
  const anthropicDelta = data?.delta
  const anthropicBlockText = data?.type === 'content_block_start'
    && data.content_block?.type === 'text'
    ? data.content_block.text
    : undefined
  const content = contentText(
    choiceDelta?.content
    ?? choice?.message?.content
    ?? choice?.text
    ?? anthropicDelta?.text
    ?? anthropicDelta?.content
    ?? anthropicBlockText
    ?? data?.content
    ?? data?.response,
  )
  const reasoning = contentText(
    choiceDelta?.reasoning
    ?? choiceDelta?.reasoning_content
    ?? anthropicDelta?.thinking
    ?? anthropicDelta?.reasoning
    ?? anthropicDelta?.reasoning_content,
  )
  return {
    content: content || undefined,
    reasoning: reasoning || undefined,
  }
}

export async function generateReply(payload: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  try {
    const data = await apiPost<ChatCompletionResponse>(
      '/api/aibar/models/generate',
      payload,
      { signal },
    )
    const apiError = responseError(data)
    if (apiError) throw new Error(apiError)
    return contentText(
      data?.choices?.[0]?.message?.content
      ?? data?.choices?.[0]?.text
      ?? data?.content
      ?? data?.response,
    )
  } catch (error) {
    throw new Error(explainGenerateError(error, payload), { cause: error })
  } finally {
    refreshPointBalance()
  }
}

export async function testConnection(
  profile: ModelProfile,
): Promise<{ ok: boolean; message: string; models?: number }> {
  try {
    const r = await apiPost<{ data?: unknown[]; error?: unknown; message?: unknown }>(
      '/api/aibar/admin/models/test',
      { id: profile.id },
    )
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
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '连接失败' }
  }
}

export async function* generateReplyStream(
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): AsyncGenerator<{ content?: string; reasoning?: string }> {
  try {
    for await (const evt of apiStream(
      '/api/aibar/models/generate',
      payload,
      signal,
    )) {
      const data = evt as ChatCompletionResponse
      const apiError = responseError(data)
      if (apiError) {
        throw new Error(explainGenerateError(new Error(apiError), payload))
      }

      const chunk = parseStreamChunk(data)
      if (chunk.content || chunk.reasoning) yield chunk
    }
  } finally {
    refreshPointBalance()
  }
}
