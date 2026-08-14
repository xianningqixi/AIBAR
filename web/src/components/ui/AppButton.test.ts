// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppButton from './AppButton.vue'

// 组件测试样板：文件头的 @vitest-environment 注释切换到 jsdom，
// 其余测试保持 node 环境零开销。
describe('AppButton', () => {
  it('renders the slot content as a real button with a safe default type', () => {
    const wrapper = mount(AppButton, { slots: { default: '保存' } })
    const button = wrapper.get('button')
    expect(button.text()).toBe('保存')
    // 未显式指定时必须是 type=button：否则放进 <form> 会意外触发提交
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('honors the disabled prop and forwards native clicks otherwise', async () => {
    const disabled = mount(AppButton, { props: { disabled: true } })
    expect(disabled.get('button').attributes('disabled')).toBeDefined()

    let clicks = 0
    const enabled = mount(AppButton, { attrs: { onClick: () => { clicks += 1 } } })
    await enabled.get('button').trigger('click')
    expect(clicks).toBe(1)
  })

  it('applies the requested variant and submit type', () => {
    const wrapper = mount(AppButton, { props: { variant: 'danger', type: 'submit' } })
    const button = wrapper.get('button')
    expect(button.attributes('type')).toBe('submit')
    expect(button.classes().join(' ')).toContain('text-danger')
  })

  it('disables itself and shows a spinner while loading', () => {
    const wrapper = mount(AppButton, { props: { loading: true }, slots: { default: '保存' } })
    const button = wrapper.get('button')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-busy')).toBe('true')
    expect(wrapper.find('svg.animate-spin').exists()).toBe(true)
  })
})
