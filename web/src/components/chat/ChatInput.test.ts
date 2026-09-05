// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatInput from './ChatInput.vue'

describe('聊天输入', () => {
  it('中文输入法确认候选词时不发送，结束组词后 Enter 正常发送', async () => {
    const wrapper = mount(ChatInput)
    const input = wrapper.get('textarea')
    await input.setValue('你好')
    await input.trigger('compositionstart')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('send')).toBeUndefined()
    await input.trigger('compositionend')
    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    await input.trigger('keydown', { key: 'Enter', keyCode: 229 })
    expect(wrapper.emitted('send')).toBeUndefined()
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('send')).toEqual([['你好']])
    expect(input.element.value).toBe('')
  })

  it('Shift+Enter 保留换行，不发送消息', async () => {
    const wrapper = mount(ChatInput, { props: { modelValue: '第一行' } })
    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true, bubbles: true })
    wrapper.get('textarea').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(wrapper.emitted('send')).toBeUndefined()
  })

  it.each([false, true])('空输入且 disabled=%s 时仍可停止生成', async disabled => {
    const wrapper = mount(ChatInput, { props: { isStreaming: true, disabled } })
    await wrapper.get('[aria-label="停止生成"]').trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
  })

  it('生成期间 Enter 不会丢弃下一条草稿或误停止', async () => {
    const wrapper = mount(ChatInput, { props: { isStreaming: true, modelValue: '下一条草稿' } })
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('send')).toBeUndefined()
    expect(wrapper.emitted('stop')).toBeUndefined()
    expect(wrapper.get('textarea').element.value).toBe('下一条草稿')
  })
})
