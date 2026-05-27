import { ref } from 'vue'

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

export async function apiPost<T = unknown>(url: string, body: unknown = {}): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new ApiError(r.status, await r.text())
  const ct = r.headers.get('content-type') || ''
  return ct.includes('json') ? r.json() : (await r.text()) as T
}

export async function apiPostText(url: string, body: unknown = {}): Promise<string> {
  const r = await fetch(url, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new ApiError(r.status, await r.text())
  return r.text()
}

export async function apiPostBlob(url: string, body: unknown = {}): Promise<Blob> {
  const r = await fetch(url, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new ApiError(r.status, await r.text())
  return r.blob()
}

export async function apiPostForm<T = unknown>(url: string, formData: FormData): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: headers(),
    credentials: 'same-origin',
    body: formData,
    cache: 'no-cache',
  })
  if (!r.ok) throw new ApiError(r.status, await r.text())
  const ct = r.headers.get('content-type') || ''
  return ct.includes('json') ? r.json() : (await r.text()) as T
}

export async function* apiStream(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  const r = await fetch(url, {
    method: 'POST',
    headers: headers({
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    }),
    credentials: 'same-origin',
    body: JSON.stringify({ ...(body as Record<string, unknown>), stream: true }),
    signal,
  })
  if (!r.ok) throw new ApiError(r.status, await r.text())

  const reader = r.body!.pipeThrough(new TextDecoderStream()).getReader()
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
          //
        }
      }
    }
  }
}
