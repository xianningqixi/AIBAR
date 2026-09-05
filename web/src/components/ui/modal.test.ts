// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import AppDialog from './AppDialog.vue'
import AppDrawer from './AppDrawer.vue'
enableAutoUnmount(afterEach)
afterEach(() => { vi.restoreAllMocks(); document.body.style.overflow = '' })

it('嵌套弹窗只关闭最上层；最后关闭后恢复滚动及原焦点', async () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  document.body.style.overflow = 'auto'
  const wrapper = mount(defineComponent({
    components: { AppDialog, AppDrawer },
    setup() { return { outer: ref(false), inner: ref(false) } },
    template: `<button id="open" @click="outer = true">打开</button><AppDrawer v-model="outer" title="抽屉"><button id="nested" @click="inner = true">嵌套</button></AppDrawer><AppDialog v-model="inner" title="弹窗"><button>内容</button></AppDialog>`,
  }), { attachTo: document.body })
  const opener = wrapper.get('#open').element as HTMLButtonElement
  opener.focus()
  await wrapper.get('#open').trigger('click'); await flushPromises()
  expect(document.body.style.overflow).toBe('hidden')
  const nested = document.querySelector<HTMLButtonElement>('#nested')!
  nested.focus(); nested.click(); await flushPromises()
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  expect(document.body.style.overflow).toBe('hidden')
  expect(document.activeElement).toBe(nested)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0)
  expect(document.body.style.overflow).toBe('auto')
  expect(document.activeElement).toBe(opener)
})

it('初始即打开的弹窗也锁定滚动，卸载后释放', async () => {
  const wrapper = mount(AppDialog, { props: { modelValue: true, title: '初始弹窗' } })
  await flushPromises()
  expect(document.body.style.overflow).toBe('hidden')
  wrapper.unmount()
  expect(document.body.style.overflow).toBe('')
})
