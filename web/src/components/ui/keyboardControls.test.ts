// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import AppTabs from './AppTabs.vue'
import AppSegmentedControl from './AppSegmentedControl.vue'
import AppInput from './AppInput.vue'
import AppSelect from './AppSelect.vue'
import SearchInput from './SearchInput.vue'
enableAutoUnmount(afterEach)

describe('键盘导航', () => {
  it('设置标签跨分组移动焦点，并支持首尾循环和 Home/End', async () => {
    const wrapper = mount(AppTabs, { attachTo: document.body, props: { modelValue: 'a', tabs: [
      { key: 'a', label: '模型', group: '账号' }, { key: 'b', label: '主题', group: '外观' }, { key: 'c', label: '身份', group: '外观' },
    ] } })
    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['b'])
    expect(document.activeElement).toBe(buttons[1].element)
    await buttons[0].trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(buttons[2].element)
    await buttons[2].trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(buttons[0].element)
    await buttons[0].trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(buttons[2].element)
  })

  it('筛选单选组仅一个 Tab 入口，禁用后不可选择', async () => {
    const wrapper = mount(AppSegmentedControl, { attachTo: document.body, props: { modelValue: 'all', options: [{ value: 'all', label: '全部' }, { value: 'favorites', label: '收藏' }] } })
    expect(wrapper.findAll('[tabindex="0"]')).toHaveLength(1)
    await wrapper.findAll('button')[0].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['favorites']])
    await wrapper.setProps({ disabled: true })
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    expect(wrapper.findAll('button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
  })

  it('清除搜索后焦点仍留在输入框，便于继续输入', async () => {
    const wrapper = mount(SearchInput, { attachTo: document.body, props: { modelValue: '角色' } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
    expect(document.activeElement).toBe(wrapper.get('input').element)
  })

  it.each([{ component: AppInput, tag: 'input' }, { component: AppSelect, tag: 'select' }])('表单属性传给真正的 $tag 控件', ({ component, tag }) => {
    const wrapper = mount(component, { props: { modelValue: '' }, attrs: { id: 'control', 'aria-label': '选择内容', required: true } })
    expect(wrapper.get(tag).attributes('id')).toBe('control')
    expect(wrapper.get(tag).attributes('aria-label')).toBe('选择内容')
    expect(wrapper.get(tag).attributes('required')).toBeDefined()
    expect(wrapper.attributes('id')).toBeUndefined()
  })
})
