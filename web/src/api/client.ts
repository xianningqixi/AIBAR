let csrfToken = ''
let csrfBootPromise: Promise<string> | null = null
let csrfGeneration = 0

export async function bootCsrf(): Promise<string> {
  if (csrfBootPromise) return csrfBootPromise
  const generation = csrfGeneration
  const promise = (async () => {
    const r = await fetch('/csrf-token', { credentials: 'same-origin' })
    if (!r.ok) throw new ApiError(r.status, await r.text())
    const data = await r.json() as { token?: unknown }
    if (typeof data.token !== 'string' || !data.token) {
      throw new ApiError(r.status, 'Missing CSRF token')
    }
    if (generation !== csrfGeneration) {
      throw new ApiError(409, 'CSRF bootstrap was invalidated')
    }
    csrfToken = data.token
    return csrfToken
  })()
  csrfBootPromise = promise
  try {
    return await promise
  } finally {
    if (csrfBootPromise === promise) csrfBootPromise = null
  }
}

export function getCsrfToken(): string {
  return csrfToken
}

export function resetCsrfToken(): void {
  csrfGeneration += 1
  csrfToken = ''
  csrfBootPromise = null
}

function apiErrorBodyMessage(body: string, fallback: string): string {
  try {
    const parsed: unknown = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback

    const envelope = parsed as Record<string, unknown>
    const envelopeError = envelope.error
    if (typeof envelopeError === 'string' && envelopeError) return envelopeError
    if (envelopeError && typeof envelopeError === 'object' && !Array.isArray(envelopeError)) {
      const nestedMessage = (envelopeError as Record<string, unknown>).message
      if (typeof nestedMessage === 'string' && nestedMessage) return nestedMessage
    }
    if (typeof envelope.message === 'string' && envelope.message) return envelope.message
  } catch {
    if (body.trim()) return body.trim()
  }
  return fallback
}

export class ApiError extends Error {
  status: number
  body: string

  constructor(status: number, body: string) {
    super(apiErrorBodyMessage(body, `请求失败 (HTTP ${status})`))
    this.status = status
    this.body = body
  }
}

export function getApiErrorMessage(error: unknown, fallback = '请求失败'): string {
  if (error instanceof ApiError) {
    return error.message || fallback
  }
  return error instanceof Error && error.message ? error.message : fallback
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    ...extra,
    'X-CSRF-Token': csrfToken,
  }
}

// 403 通常意味着 CSRF token 已随会话轮换：重新引导一次 token 后只重试一次，绝不循环
async function doFetch(url: string, init: RequestInit, allowCsrfRetry = true): Promise<Response> {
  if (!csrfToken) await bootCsrf()
  const usedToken = csrfToken
  const usedGeneration = csrfGeneration
  const requestHeaders = new Headers(init.headers)
  requestHeaders.set('X-CSRF-Token', csrfToken)
  const r = await fetch(url, { credentials: 'same-origin', ...init, headers: requestHeaders })
  if (r.ok) return r

  const body = await r.text()
  if (r.status !== 403 || !allowCsrfRetry) throw new ApiError(r.status, body)

  // 其他请求可能已经刷新过 token，这时直接用新 token 重试，不再重复引导
  const alreadyRefreshed = csrfGeneration !== usedGeneration || (!!csrfToken && csrfToken !== usedToken)
  if (!alreadyRefreshed) resetCsrfToken()
  if (!csrfToken) {
    try {
      await bootCsrf()
    } catch {
      throw new ApiError(403, body)
    }
  }
  return doFetch(url, init, false)
}

function postJson(
  url: string,
  body: unknown,
  init?: { accept?: string; signal?: AbortSignal },
): Promise<Response> {
  return doFetch(url, {
    method: 'POST',
    headers: headers({
      'Content-Type': 'application/json',
      ...(init?.accept ? { Accept: init.accept } : {}),
    }),
    body: JSON.stringify(body),
    signal: init?.signal,
  })
}

async function parseByContentType<T>(r: Response): Promise<T> {
  const ct = r.headers.get('content-type') || ''
  return ct.includes('json') ? r.json() : ((await r.text()) as T)
}

export async function apiPost<T = unknown>(
  url: string,
  body: unknown = {},
  init?: { signal?: AbortSignal },
): Promise<T> {
  return parseByContentType<T>(await postJson(url, body, init))
}

export async function apiGet<T = unknown>(url: string): Promise<T> {
  return parseByContentType<T>(await doFetch(url, {
    method: 'GET',
    headers: headers(),
  }))
}

export async function apiPostBlob(url: string, body: unknown = {}): Promise<Blob> {
  return (await postJson(url, body)).blob()
}

export async function apiPostForm<T = unknown>(url: string, formData: FormData): Promise<T> {
  const r = await doFetch(url, {
    method: 'POST',
    headers: headers(),
    body: formData,
    cache: 'no-cache',
  })
  return parseByContentType<T>(r)
}

// 流式请求的空闲上限：超过这个时间没有任何新数据就主动断开，避免永远挂着的“生成中”
const STREAM_IDLE_TIMEOUT_MS = 90_000

export async function* apiStream(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  // 内部 controller 同时承载调用方的中断信号和空闲超时
  const streamController = new AbortController()
  const abortFromCaller = () => streamController.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) streamController.abort(signal.reason)
    else signal.addEventListener('abort', abortFromCaller, { once: true })
  }

  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let idleTimedOut = false
  const armIdleTimer = () => {
    if (idleTimer !== undefined) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      idleTimedOut = true
      streamController.abort()
    }, STREAM_IDLE_TIMEOUT_MS)
  }
  const idleError = () =>
    new Error(`流式响应超过 ${Math.round(STREAM_IDLE_TIMEOUT_MS / 1000)} 秒没有新内容，已中断。请稍后重试或更换模型。`)

  let reader: ReadableStreamDefaultReader<string> | null = null
  try {
    armIdleTimer()

    let r: Response
    try {
      r = await postJson(
        url,
        { ...(body as Record<string, unknown>), stream: true },
        { accept: 'text/event-stream', signal: streamController.signal },
      )
    } catch (e) {
      if (idleTimedOut) throw idleError()
      throw e
    }
    if (!r.body) throw new ApiError(r.status, 'Empty stream response body')

    const contentType = r.headers.get('content-type') || ''
    if (contentType.includes('json')) {
      const data = await r.json()
      if (data && typeof data === 'object') {
        yield data as Record<string, unknown>
      }
      return
    }

    reader = r.body.pipeThrough(new TextDecoderStream()).getReader()
    let buf = ''
    while (true) {
      let chunk: ReadableStreamReadResult<string>
      try {
        chunk = await reader.read()
      } catch (e) {
        if (idleTimedOut) throw idleError()
        throw e
      }
      if (chunk.done) break
      armIdleTimer()
      buf += chunk.value
      const events = buf.split(/\r?\n\r?\n/)
      buf = events.pop() || ''
      for (const event of events) {
        const parsed = parseSseFrame(event)
        if (parsed.done) return
        if (parsed.data) yield parsed.data
      }
    }

    if (buf.trim()) {
      const parsed = parseSseFrame(buf)
      if (parsed.done) return
      if (parsed.data) yield parsed.data
    }
  } finally {
    if (idleTimer !== undefined) clearTimeout(idleTimer)
    signal?.removeEventListener('abort', abortFromCaller)
    void reader?.cancel().catch(() => {})
  }
}

function parseSseFrame(frame: string): { done: boolean; data?: Record<string, unknown> } {
  const dataLines = frame
    .split(/\r?\n/)
    .map((line) => line.match(/^data:\s?(.*)$/)?.[1])
    .filter((line): line is string => line !== undefined)
  const raw = (dataLines.length ? dataLines.join('\n') : frame).trim()
  if (!raw || raw.startsWith(':')) return { done: false }
  if (raw === '[DONE]') return { done: true }

  try {
    const data = JSON.parse(raw)
    return data && typeof data === 'object'
      ? { done: false, data: data as Record<string, unknown> }
      : { done: false }
  } catch {
    console.warn('Skipped malformed SSE frame:', raw.slice(0, 200))
    return { done: false }
  }
}
