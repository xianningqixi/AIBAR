// Promise 化的确认 / 输入对话框，替代 window.confirm / window.prompt。
// 状态是模块级单例，由 App.vue 里挂载的 AppDialogHost 渲染；
// 同时多个请求会排队依次呈现（原生对话框的阻塞语义在此变成串行队列）。

import { reactive } from 'vue'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  /** 删除等破坏性操作置 true，确认按钮变红 */
  danger?: boolean
}

export interface PromptOptions extends ConfirmOptions {
  defaultValue?: string
  placeholder?: string
}

interface ConfirmRequest {
  kind: 'confirm'
  options: ConfirmOptions
  resolve: (value: boolean) => void
}

interface PromptRequest {
  kind: 'prompt'
  options: PromptOptions
  resolve: (value: string | null) => void
}

export type DialogRequest = ConfirmRequest | PromptRequest

/** 正在展示的对话框：请求 + prompt 输入框当前值 */
export type ActiveDialog = DialogRequest & { value: string }

export const dialogState = reactive<{ active: ActiveDialog | null; queue: DialogRequest[] }>({
  active: null,
  queue: [],
})

function pump() {
  if (dialogState.active || !dialogState.queue.length) return
  const next = dialogState.queue.shift()!
  dialogState.active = {
    ...next,
    value: next.kind === 'prompt' ? next.options.defaultValue ?? '' : '',
  }
}

/** 弹出确认框，用户确认 resolve true，取消 / Esc / 点背景 resolve false */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    dialogState.queue.push({ kind: 'confirm', options, resolve })
    pump()
  })
}

/** 弹出输入框，确认 resolve 输入的字符串，取消 resolve null（与 window.prompt 语义一致） */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    dialogState.queue.push({ kind: 'prompt', options, resolve })
    pump()
  })
}

/** 仅供 AppDialogHost 调用：结束当前对话框并出队下一个 */
export function settleDialog(confirmed: boolean) {
  const active = dialogState.active
  if (!active) return
  dialogState.active = null
  if (active.kind === 'confirm') {
    active.resolve(confirmed)
  } else {
    active.resolve(confirmed ? active.value : null)
  }
  pump()
}
