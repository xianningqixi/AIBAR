import { Marked } from 'marked'
import DOMPurify from 'dompurify'

let _renderer: Marked | null = null
let _hookReady = false

function getRenderer(): Marked {
  if (!_renderer) {
    _renderer = new Marked({
      breaks: true,
      gfm: true,
    })
  }
  return _renderer
}

function isAllowedImageSrc(raw: string): boolean {
  try {
    const url = new URL(raw, window.location.href)
    return url.origin === window.location.origin || url.protocol === 'data:'
  } catch {
    return false
  }
}

function ensureHook() {
  if (_hookReady) return
  // 外链统一新标签打开,避免在 SPA 内跳走,并补安全 rel
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
    if (node.nodeName === 'IMG') {
      const element = node as HTMLImageElement
      if (!isAllowedImageSrc(element.getAttribute('src') || '')) element.remove()
    }
  })
  _hookReady = true
}

export function useMarkdown() {
  function render(text: string): string {
    ensureHook()
    const marked = getRenderer()
    const html = marked.parse(text) as string
    return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] })
  }

  return { render }
}
