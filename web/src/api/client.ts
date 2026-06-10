let csrfToken = ''

export async function bootCsrf(): Promise<string> {
  const r = await fetch('/csrf-token', { credentials: 'same-origin' })
  const data = await r.json()
  csrfToken = data.token
  return csrfToken
}

export function getCsrfToken(): string {
  return csrfToken
}

export class ApiError extends Error {
  status: number
  body: string

  constructor(status: number, body: string) {
    super(`API ${status}: ${body}`)
    this.status = status
    this.body = body
  }
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    ...extra,
    'X-CSRF-Token': csrfToken,
  }
}

async function doFetch(url: string, init: RequestInit): Promise<Response> {
  const r = await fetch(url, { credentials: 'same-origin', ...init })
  if (!r.ok) throw new ApiError(r.status, await r.text())
  return r
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

export async function apiPost<T = unknown>(url: string, body: unknown = {}): Promise<T> {
  return parseByContentType<T>(await postJson(url, body))
}

export async function apiPostText(url: string, body: unknown = {}): Promise<string> {
  return (await postJson(url, body)).text()
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

export async function* apiStream(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  const r = await postJson(
    url,
    { ...(body as Record<string, unknown>), stream: true },
    { accept: 'text/event-stream', signal },
  )
  if (!r.body) throw new ApiError(r.status, 'Empty stream response body')

  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    const events = buf.split('\n\n')
    buf = events.pop() || ''
    for (const event of events) {
      const lines = event.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') return
        try {
          yield JSON.parse(data)
        } catch {
          console.warn('Skipped malformed SSE frame:', data.slice(0, 200))
        }
      }
    }
  }
}
