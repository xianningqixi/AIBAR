# AIBAR 网页应用桥接协议

本文定义 Discord 网页应用在 AIBAR 隔离运行页中可使用的版本 1 桥接协议。只有 manifest 明确声明 `runtime: "aibar-bridge"`、`bridgeVersion: 1`，且用户在启动前确认权限的应用可以调用本协议。

## 安全边界

- 应用运行在不含 `allow-same-origin` 的 sandbox iframe 中，因此不能读取 AIBAR DOM、Cookie、CSRF token、localStorage 或模型密钥。
- AIBAR 只接受当前运行 iframe 的 `postMessage`，忽略其他窗口和页面的消息。
- 每个方法还要通过 manifest 权限检查。`generation` 控制模型调用，`storage` 控制存档调用。
- `standalone` 应用不能调用桥接协议，也不能在 manifest 中申请权限。
- 应用可以按自身代码访问外部网络。AIBAR 不代理其网络请求，也不为第三方页面附加 AIBAR 凭据。
- 停止、重新载入或离开运行页会取消活动生成，并丢弃上一运行实例的迟到响应。

## 消息封装

应用向父页面发送请求：

```js
parent.postMessage({
  type: 'aibar.web-app.request',
  version: 1,
  requestId: 'request-1',
  method: 'bridge.handshake',
  params: {},
}, '*')
```

应用只应接收 `event.source === parent` 且 `version === 1` 的消息。AIBAR 可能发送三类消息：

```js
// iframe 加载完成
{
  type: 'aibar.web-app.ready',
  version: 1,
  permissions: ['generation', 'storage']
}

// 单次结果或流式终态
{
  type: 'aibar.web-app.response',
  version: 1,
  requestId: 'request-1',
  ok: true,
  result: {}
}

// 失败结果
{
  type: 'aibar.web-app.response',
  version: 1,
  requestId: 'request-1',
  ok: false,
  error: '错误说明'
}

// 流式增量，可出现 content、reasoning 或两者
{
  type: 'aibar.web-app.stream',
  version: 1,
  requestId: 'request-2',
  delta: { content: '新增文本' }
}
```

`requestId` 必须是 1 到 80 个字符，只能包含字母、数字、点、下划线、冒号和短横线。请求对象不接受未定义字段。一个运行实例最多处理 500 次桥接请求，同时最多运行一个模型请求。

## 握手

`bridge.handshake` 不需要业务权限，`params` 省略或使用空对象。成功结果包含应用公开信息、已授权权限、存档容量和当前模型可用状态：

```js
{
  bridgeVersion: 1,
  app: { id: 'Discord post id', title: '应用标题', authorName: '作者' },
  permissions: ['generation', 'storage'],
  limits: { storageBytes: 524288 },
  modelAvailable: true
}
```

## 模型调用

`llm.generate` 和 `llm.stream` 需要 `generation` 权限。两者使用相同参数：

```js
{
  messages: [
    { role: 'system', content: '你是一个叙事助手。' },
    { role: 'user', content: '开始故事。' }
  ],
  options: {
    temperature: 0.8,
    maxTokens: 1200,
    topP: 0.95
  }
}
```

`role` 只允许 `system`、`user`、`assistant`。消息最多 120 条，单条最多 48000 字符，总计最多 160000 字符。`temperature` 范围为 0 到 2，`topP` 范围为 0 到 1，`maxTokens` 为 1 到 32768 的整数，并且不会超过当前 AIBAR 模型配置的上限。

`llm.generate` 在完成后返回 `{ content }`。`llm.stream` 先发送任意数量的 `aibar.web-app.stream` 增量，最后用 `aibar.web-app.response` 返回完整 `{ content, reasoning? }`。

`llm.cancel` 需要 `generation` 权限，`params` 省略或使用空对象。它取消当前活动生成，并返回 `{ cancelled: boolean }`。被取消的生成请求会收到失败终态；应用应同时按自己的 `requestId` 结束对应的等待状态。

模型调用复用当前登录用户在 AIBAR 中已启用的模型配置和计费链路。桥接不会向应用返回上游地址、Cookie、CSRF token 或 API Key。

## 应用存档

所有存档方法需要 `storage` 权限。数据按当前 AIBAR 账号和 Discord thread 隔离，仅接受可 JSON 序列化的值。键长为 1 到 80 个字符，字符规则与 `requestId` 相同；`__proto__`、`constructor` 和 `prototype` 是保留键。单项最多 256 KB，每个应用总计最多 512 KB。

| 方法 | `params` | 成功结果 |
| --- | --- | --- |
| `storage.get` | `{ key }` | `{ value }`，不存在时为 `null` |
| `storage.set` | `{ key, value }` | `{ saved: true }` |
| `storage.remove` | `{ key }` | `{ removed: boolean }` |
| `storage.list` | 省略或 `{}` | `{ keys: string[] }` |
| `storage.clear` | 省略或 `{}` | `{ cleared: true }` |

## 最小客户端封装

```js
const pending = new Map()

window.addEventListener('message', (event) => {
  if (event.source !== parent) return
  const message = event.data
  if (!message || message.version !== 1) return

  if (message.type === 'aibar.web-app.stream') {
    pending.get(message.requestId)?.onDelta?.(message.delta)
    return
  }
  if (message.type !== 'aibar.web-app.response') return

  const request = pending.get(message.requestId)
  if (!request) return
  pending.delete(message.requestId)
  if (message.ok) request.resolve(message.result)
  else request.reject(new Error(message.error || 'AIBAR bridge request failed'))
})

function callAibar(method, params, onDelta) {
  const requestId = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject, onDelta })
    parent.postMessage({
      type: 'aibar.web-app.request',
      version: 1,
      requestId,
      method,
      ...(params === undefined ? {} : { params }),
    }, '*')
  })
}

await callAibar('bridge.handshake', {})
const result = await callAibar('llm.generate', {
  messages: [{ role: 'user', content: '你好' }],
})
```

第三方应用应把 bridge 不可用、权限被拒绝和模型失败作为正常错误状态处理，不应假定自己总是在 AIBAR 中运行。
