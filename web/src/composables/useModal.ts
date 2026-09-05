import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

// 弹窗与抽屉共享一套栈和滚动锁，嵌套打开时只由最上层处理键盘。
const stack: symbol[] = []
let previousOverflow = ''

export function useModal(open: () => boolean, panel: Ref<HTMLElement | undefined>, close: () => void) {
  const id = Symbol('modal')
  let previousFocus: HTMLElement | null = null
  const isTop = () => stack[stack.length - 1] === id

  function focusable() {
    return [...(panel.value?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) || [])].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
  }
  function onKey(event: KeyboardEvent) {
    if (!open() || !isTop() || event.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
    } else if (event.key === 'Tab') {
      const elements = focusable()
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (!first || !panel.value?.contains(document.activeElement) ||
        (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) ||
        (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault()
        ;(event.shiftKey ? last || panel.value : first || panel.value)?.focus()
      }
    }
  }
  function release() {
    const index = stack.indexOf(id)
    if (index < 0) return
    const restoreFocus = isTop()
    stack.splice(index, 1)
    window.removeEventListener('keydown', onKey, true)
    if (!stack.length) document.body.style.overflow = previousOverflow
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus()
    previousFocus = null
  }
  watch(open, async value => {
    if (!value) { release(); return }
    if (!stack.length) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    if (!stack.includes(id)) stack.push(id)
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    window.addEventListener('keydown', onKey, true)
    await nextTick()
    if (open() && isTop()) (focusable()[0] || panel.value)?.focus()
  }, { immediate: true })
  onBeforeUnmount(release)
}
