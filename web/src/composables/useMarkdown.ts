import { Marked } from 'marked'
import DOMPurify from 'dompurify'

let _renderer: Marked | null = null

function getRenderer(): Marked {
  if (!_renderer) {
    _renderer = new Marked({
      breaks: true,
      gfm: true,
    })
  }
  return _renderer
}

export function useMarkdown() {
  function render(text: string): string {
    const marked = getRenderer()
    const html = marked.parse(text) as string
    return DOMPurify.sanitize(html)
  }

  return { render }
}
