// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { useMarkdown } from './useMarkdown'

describe('useMarkdown render', () => {
  const { render } = useMarkdown()

  it('保留同源与 /api/ 路径的图片', () => {
    const sameOrigin = `${window.location.origin}/thumbnail/x.png`
    const html = render(`![本地图](/api/aibar/images/file/a.png)\n\n![同源](${sameOrigin})`)
    expect(html).toContain('/api/aibar/images/file/a.png')
    expect(html).toContain('/thumbnail/x.png')
  })

  it('移除外链图片，防止模型输出泄露用户 IP', () => {
    const html = render('![追踪](https://tracker.example.com/pixel.png)')
    expect(html).not.toContain('tracker.example.com')
    // 节点被移除而非只去掉 src
    expect(html).not.toContain('<img')
  })

  it('保留 data URI 图片', () => {
    const html = render('![内联](data:image/png;base64,AAAA)')
    expect(html).toContain('data:image/png;base64,AAAA')
  })

  it('外链 a 标签保持新窗口打开并补安全 rel', () => {
    const html = render('[链接](https://example.com/page)')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('移除脚本与事件属性', () => {
    const html = render('<img src="x" onerror="alert(1)">text<script>alert(1)</script>')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<script')
  })
})
