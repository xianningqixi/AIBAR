# AIBAR 新前端实施方案

> **⚠️ 历史文档，前提已失效**：本文写作时的前提是「本机单用户使用，不考虑远程/多用户部署」（见下文 Context），该前提**已不再成立**。项目现为多用户生产部署：共享社区数据使用 SQLite（`community.sqlite`）、注册需邀请码审核、并已部署到生产域名对外服务。本文仅作为历史设计动机与旧 `simple-ui.js` 对照基线的参考保留，**请勿据此做任何架构决策**；当前架构以根目录 `README.md` 和 `AGENTS.md` 为准。

## Context

最初基线:用户在 SillyTavern fork(`xianningqixi/SillyTavern.git`,旧分支 `codex-aibar-simple-ui`)上,做过一个简版 UI(`public/simple.html` + `public/scripts/simple-ui.js`,4485 行)。但原生 SillyTavern 前端太重(主 `script.js` 12537 行,总前端源码约 8.7MB),旧简版 UI 仍然是单文件巨型 vanilla JS,可维护性差。

目标:在 `/Users/wangdaxi/Documents/AIBAR/web/` 新建一个独立的 Vue 3 现代前端,复用 SillyTavern 后端 API(经过完整探查,所有路由可用),做成 aifuck.cc / character.ai 风格的「卡片浏览 + 进入聊天」体验。本机单用户使用,不考虑远程/多用户部署。

当前状态(2026-05-26):`web/` 已落地 Vue 3 版本。已修复聊天保存写错文件、续写污染记录、swipe 不持久化、聊天 rename/delete 参数不匹配、模型配置全局误改等问题。模型配置现在在设置页维护,聊天页只选择已保存的 Profile;聊天文件、模型 Profile 绑定写入 ST JSONL metadata,避免浏览器刷新后丢失。

旧 simple 对照基线:最终版在 SillyTavern reflog commit `b29b06a`(`Add simple UI mod management`),包含 `public/simple.html`、`public/scripts/simple-ui.js`、`public/css/simple-ui.css`。旧 simple 分支和远端分支已删除,但该提交仍可用作功能参考。当前 Vue 版还没有完全追平旧 simple 的工作流,下面的追平清单按旧 simple 的实际功能补齐。

---

## 1. 技术栈(已决定)

- **Vue 3.5 + `<script setup>` + TypeScript** — `simple-ui.js` 的 imperative 状态模型几乎 1:1 对应 Vue reactivity,迁移直觉低,中文社区好。
- **Vite 6** — dev server + 构建。
- **Pinia 2** — 状态管理,一个 store 一个领域。
- **Vue Router 4** — Hash 模式路由(避免部署到子路径时的 history fallback)。
- **Tailwind CSS 3.4** + 少量自定义 CSS(滚动条、动画)。
- **@vueuse/core** — `useLocalStorage`、`useDropZone` 等。
- **marked + DOMPurify** — 消息 Markdown 渲染。
- 不引入 UI 组件库,所有组件自己用 Tailwind 写。

---

## 2. 项目结构

```
/Users/wangdaxi/Documents/AIBAR/web/
├── index.html
├── package.json
├── vite.config.ts                 # /api、/csrf-token、/thumbnail、/characters 代理到 :8001
├── tailwind.config.ts
├── tsconfig.json
├── .env.development               # VITE_ST_BACKEND=http://localhost:8001
└── src/
    ├── main.ts                    # createApp + boot CSRF + 挂载
    ├── App.vue                    # RouterView + 全局 toast/dialog 容器
    ├── router/index.ts
    ├── api/
    │   ├── client.ts              # apiPost / apiPostForm / apiStream(SSE) / bootCsrf
    │   ├── characters.ts          # 角色 CRUD + 导入导出
    │   ├── chats.ts               # 聊天 get/save/rename/delete/recent
    │   ├── generate.ts            # 生成 + 流式
    │   ├── secrets.ts             # API key state/read/write/rotate/delete(secrets endpoint)
    │   ├── worldinfo.ts           # 世界书 CRUD
    │   └── types.ts
    ├── stores/
    │   ├── session.ts             # csrfToken、online、ping 心跳
    │   ├── characters.ts          # list + current
    │   ├── chat.ts                # 当前会话 messages、streaming、swipes
    │   ├── modelProfiles.ts       # 模型 profile + ST secrets 状态
    │   └── ui.ts                  # 主题、toast、模态栈
    ├── pages/
    │   ├── BrowsePage.vue         # 顶部 tab 切换:角色卡 / 故事卡
    │   ├── ChatPage.vue
    │   ├── SettingsPage.vue       # 内部 tab: Model / World / About
    │   ├── CharacterManagerPage.vue
    │   ├── CharacterEditorPage.vue
    │   └── NotFoundPage.vue
    ├── components/
    │   ├── browse/                # CharacterCard / StoryCard / CardGrid / BrowseFilters
    │   ├── chat/                  # ChatTopBar / MessageList / MessageBubble / ChatInput
    │   └── ui/                    # AppButton / AppDialog / AppDropdown / AppInput / AppToast / AppSpinner
    ├── composables/
    │   ├── useStreamingChat.ts
    │   ├── useCharacterImport.ts
    │   └── useMarkdown.ts
    └── lib/
        ├── providers.ts           # 镜像 simple-ui.js providerConfigs(第29–49行)
        ├── chatJsonl.ts           # ST JSONL ↔ 内部 Message[]
        ├── buildPayload.ts        # 生成请求 payload 组装
        └── format.ts
```

**架构原则:** 页面组件只读 store + 派发 action,绝不直接 `fetch()`;stores 唯一持有可变状态;`api/` 是纯 fetch 包装。无全局事件总线。

---

## 3. 路由

| 路径 | 组件 | 说明 |
|---|---|---|
| `/` | redirect → `/browse` | |
| `/browse` | `BrowsePage` | 顶部 tab:**角色卡 / 故事卡 / 聊天记录**。Query 参数:`?tab=characters\|stories\|chats&q=&sort=&tag=&fav=1` |
| `/character/:avatar` | `CharacterDetailPage` | 角色详情页,展示角色 hero、简介、标签、聊天记录、关联故事、快捷管理 |
| `/chat/:avatar` | `ChatPage` | 角色聊天。Query `?chat=<filename>` 打开指定存档 |
| `/story/new` | `StoryNewPage` | 写故事卡模板,保存到 AIBAR stories JSON |
| `/story/:id` | `StoryDetailPage` | 故事卡详情;开始故事时创建新的 ST chat JSONL |
| `/characters` | `CharacterManagerPage` | 角色列表管理:对话 / 编辑 / 导入 / 导出 / 删除 |
| `/character/new` | `CharacterEditorPage` | 新建角色 |
| `/character/:avatar/edit` | `CharacterEditorPage` | 编辑 |
| `/mods` | `SettingsPage` | 直接进入设置页 MOD tab,用于提示词 MOD 管理 |
| `/settings` | `SettingsPage` | 模型配置 / 世界书 / 关于 |
| `/:pathMatch(.*)*` | `NotFoundPage` | |

`router.beforeEach`:首次进入任意路由前 `await sessionStore.boot()`(拉 CSRF token)。

---

## 4. 浏览页:角色卡 / 故事卡 / 聊天记录

顶部 tab 切换,各自走不同后端接口:

**角色卡 tab**:
- 数据源:`POST /api/characters/all`(`SillyTavern/src/endpoints/characters.js`)
- 卡片字段:`/thumbnail?type=avatar&file=<avatar>`(2:3 占位)、`name`、`description` 截断 2 行、`tags` 取 3 个、最近聊天日期、右上角收藏心形(`merge-attributes` 写 `fav: 'true'|'false'`)
- 筛选:搜索(name/tags/description 客户端过滤)、排序(最近聊天/最近添加/名称/聊天最多)、收藏 toggle
- 点击 → `router.push('/chat/' + avatar)`
- 「新建角色」→ `/character/new`;「导入」→ `POST /api/characters/import`
- 待追平旧 simple:首页指标(角色/故事/消息统计)、热门标签条、左侧/顶部筛选(全部/最近/收藏/有聊天)、随机按钮、无图模式 toggle、角色详情页入口和详情侧栏。

**故事卡 tab**:
- 数据源:`POST /api/aibar/stories/list`,后端保存到 `data/<user>/aibar/stories/*.json`。
- 卡片字段:故事标题、简介/剧本摘要、绑定角色头像、标签、世界书、更新时间。
- 点击 → `/story/:id` 进入故事模板详情;「开始故事」才创建新的 ST chat JSONL。
- 管理:模板保存/读取/删除走 `POST /api/aibar/stories/save|get|delete`;已经创建出来的聊天记录仍走 `/api/chats/*`。
- 设计边界:故事卡是可复用开局模板,不是聊天记录;聊天记录 metadata 写 `aibar.kind='chat_session'`、`sourceStoryId`、`storyTitle/storyScenario/storySystemAppend` 以追踪来源。
- 待补:故事卡编辑页、故事模板导入/导出、从已有聊天反向保存为故事模板。

**聊天记录 tab**:
- 数据源:`POST /api/chats/recent`,复用 ST 本地聊天 JSONL,不复制不迁移。
- 卡片字段:聊天文件名、角色头像/名称、最后一条消息、消息数、文件大小、最后更新时间。
- 点击 → `/chat/:avatar?chat=<filename>` 继续同一条聊天存档。
- 设计边界:聊天记录是真实会话;故事卡只是模板。旧 ST 聊天不会出现在故事卡 tab,但会出现在聊天记录 tab 和角色详情页。

三个 tab 共享同一栅格容器:`grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4`,悬停轻微 scale + shadow ring。

---

## 5. 聊天页

`grid grid-rows-[auto_1fr_auto] h-screen`,顶 / 中 / 底三段。

- **ChatTopBar**:返回 + 头像/名字 + 当前模型 Profile badge + 左侧聊天管理 toggle + 右侧模型选择 toggle。
- **MessageList**:`v-for` 即可(消息数 ≥300 再考虑虚拟滚动);用户右、AI 左;Markdown 通过 `useMarkdown` 渲染。
- **MessageBubble** hover 操作行:编辑 / 删除 / 重生成(仅 AI)/ 继续 / 复制 / Swipe ◀▶。Swipes 直接存在消息对象 `message.swipes` 和 `message.swipe_id`,保存时写回 ST JSONL 原生字段。
- **流式消息**:由 `chat.streaming.partial` 驱动,reactive 自动渲染;流式中发送按钮变停止(`AbortController.abort()`)。
- **ChatInput**:auto-grow textarea,Enter 发送 / Shift+Enter 换行。
- **左侧聊天管理抽屉**:当前角色聊天列表、打开指定存档、新建聊天、设默认、重命名、删除。
- **右侧模型抽屉**:只选择设置页已保存的 Model Profile,不允许在聊天页改渠道/API Key/端点,避免误改全局配置;同一抽屉内可为当前聊天加载/移除额外 MOD。
- 待追平旧 simple:当前聊天导入/导出(JSON/JSONL)、清空当前聊天消息但保留文件、聊天管理抽屉里保留重生成/续写快捷按钮。
- 待追平旧 simple:聊天级世界书选择,写入 ST chat metadata `world_info`;留空时回退角色卡绑定世界书。

---

## 6. 设置页(单 `/settings`,内部 tab)

- **6a. 模型配置**:左侧 Profile 列表浏览已有配置,右侧编辑选中项;支持新建、删除、写入示例配置。Provider 下拉来自 `SillyTavern/src/constants.js` 的 `CHAT_COMPLETION_SOURCES`(line 187);`providerConfigs` 覆盖 OpenAI、Claude、OpenRouter、Gemini、DeepSeek、Mistral、Groq、xAI、Moonshot、SiliconFlow、Cohere、Perplexity、Chutes、ElectronHub、NanoGPT、AI/ML API、Fireworks、CometAPI、Azure OpenAI、Z.AI、Pollinations、MiniMax、Workers AI。
- API Key 写入走 `POST /api/secrets/write { key: provider.secretKey, value, label }`,返回的 `id` 作为 `profile.secretId`;Profile 本身(非密钥)存 localStorage。Secrets 状态用 `POST /api/secrets/read` 读取 masked state,不依赖 `/api/secrets/view` 和 `allowKeysExposure`。
- 每个 Profile 表达「一个渠道 + 一个模型 + 可选 secretId + 可选 endpoint + 参数」。聊天页只选择 Profile,生成时带 `secret_id`、`chat_completion_source`、`model`、`custom_url/reverse_proxy`、`temperature/top_p/max_tokens/presence_penalty/frequency_penalty`。
- **6b. 世界书**:左列从 `POST /api/worldinfo/list`;新建空世界书 / 写入示例 / 导入 → `POST /api/worldinfo/import`(multipart);读取 → `POST /api/worldinfo/get`;编辑保存 → `POST /api/worldinfo/edit`;删除 → `POST /api/worldinfo/delete`;导出为前端下载 JSON。默认提供条目编辑器,可切换原始 JSON。
- **6c. MOD 管理**:复用 `POST /api/settings/get/save`,字段为 `simple_ui_mods`。左侧 MOD 列表浏览已有配置,右侧编辑选中项;支持内置公用 MOD、我的 MOD、新建/编辑/删除、写入示例、全局启用;生成时把全局 MOD 和聊天级 MOD 追加进 system prompt。`ModPicker` 复用于故事卡详情、角色详情和聊天抽屉,选择写入 chat metadata `aibar.mods`。
- **6d. 后续再补**:生成预设和 Persona 管理尚未实现。当前参数在 Model Profile 上维护,角色编辑器支持世界书绑定字段。
- 待追平旧 simple:模型连接测试,调用 `POST /api/backends/chat-completions/status`,测试结果必须在 Profile 卡片或表单顶部明显展示。
- 待优化:Model Profile 目前存 localStorage。旧 simple 存在 ST settings 的 `simple_ui_model_profiles`,更适合本地服务器持久化和跨浏览器复用;后续把 Profile 持久化迁到 `POST /api/settings/save`,localStorage 只做临时缓存。

---

## 7. 角色编辑器

字段对应 `POST /api/characters/create`(`SillyTavern/src/endpoints/characters.js` line 1024+,可参考 `simple-ui.js` 第 2203–2224 行的请求体构造):
`ch_name`、`description`、`personality`、`scenario`、`first_mes`、`mes_example`、`creator_notes`、`tags`、`creator`、`character_version`、`talkativeness`、`system_prompt`、`post_history_instructions`、`alternate_greetings[]`、世界书绑定。

- **角色管理页**:`/characters` 提供对话 / 编辑 / 导入 / 导出 PNG / 导出 JSON / 删除。
- **导入 PNG/JSON/YAML/CHARX/BYAF**:点导入按钮 → `POST /api/characters/import`(multipart,`file_type` 来自扩展名)。
- **编辑**:`POST /api/characters/get` 拉 → 同表单 → `POST /api/characters/edit`,头像换了再 `POST /api/characters/edit-avatar`。
- **删除**:确认后 `POST /api/characters/delete { avatar_url, delete_chats: true }`。
- 待追平旧 simple:复制角色(`POST /api/characters/duplicate`)、角色标签快速编辑(`POST /api/characters/merge-attributes`)、设为当前角色(`POST /api/settings/save`)、角色详情页展示关联故事。
- 待追平旧 simple:写角色表单增加测试功能,选择已保存 Model Profile + 世界书 + 测试输入,调用 `POST /api/backends/chat-completions/generate`;测试不保存角色卡或聊天记录。

---

## 8. 生成流程(端到端)

`ChatInput` 点发送 → `chat.sendMessage(text)`:

1. 把用户消息 push 到 `chat.messages`,立即 `POST /api/chats/save`(防崩溃丢失)。
2. `lib/buildPayload.ts` 组装 payload:
   - 当前聊天使用的 `ModelProfile` 来自 chat metadata 里的 `aibar.profileId`;无 metadata 时回退到默认 activeProfile
   - 系统消息 = 角色描述/性格/场景块 + 可选 worldInfoText(世界书命中扫描后续再接)
   - `messages` = 系统消息 + `chat.messages` 最近 N=24 条
   - 来自当前聊天选中的 `ModelProfile`:`chat_completion_source` / `model` / `secret_id` / `reverse_proxy` 或 `custom_url`
   - 来自当前聊天选中的 `ModelProfile`:`temperature` / `top_p` / `max_tokens` / `presence_penalty` / `frequency_penalty`
   - `stream: true`
3. 设置 `chat.streaming = { active: true, controller: new AbortController(), partial: {...} }`。
4. `for await (const evt of apiStream('/api/backends/chat-completions/generate', payload))`:取 `evt.choices?.[0]?.delta?.content` 累加到 `partial.content`。
5. `data: [DONE]` 或流结束:把 partial 推入 `chat.messages`,清流式状态,`POST /api/chats/save`。
6. 异常或用户停止:abort + 保留已流出的文本(末尾加 `[中断]` 标记)并保存。

**重生成** = 弹出最后一条 AI 消息 + 把旧回复合入 `message.swipes` + 保存 + 重跑 2–5,新回复作为同一条 AI 消息的新 swipe 版本保存。
**Swipe** = UI 左右切换 `message.swipes[swipe_id]`,切换后立即保存,刷新仍保留。
**继续** = 不插入假用户消息到真实聊天记录;只在生成 payload 中临时追加续写指令,生成完成后把内容 append 到上一条 AI 消息。

参考 `SillyTavern/public/scripts/sse-stream.js`(第 113 行 `parseStreamData`)了解各 provider delta 归一化方式 — ST 后端已经统一成 chat-completions 格式,客户端无需再分流派。

---

## 9. API 客户端核心(`src/api/client.ts`)

```ts
let csrfToken = '';

export async function bootCsrf() {
  const r = await fetch('/csrf-token', { credentials: 'same-origin' });
  csrfToken = (await r.json()).token;
}

export async function apiPost<T>(url: string, body: unknown = {}): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new ApiError(r.status, await r.text());
  return r.headers.get('content-type')?.includes('json') ? r.json() : (await r.text()) as any;
}

export async function* apiStream(url: string, body: unknown): AsyncGenerator<any> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, Accept: 'text/event-stream' },
    credentials: 'same-origin',
    body: JSON.stringify({ ...body, stream: true }),
  });
  const reader = r.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += value;
    // 按 \n\n 切 SSE 事件,行首 'data: ' 后 JSON.parse;遇 'data: [DONE]' return
  }
}
```

`apiPostForm` 同理但 body 是 FormData(不要手设 `Content-Type`,让浏览器写 boundary)。
`session` store 起 5 分钟周期 `POST /api/ping?extend=true` 保活。

---

## 10. Vite 代理

```ts
// vite.config.ts(关键片段)
const ST = process.env.VITE_ST_BACKEND || 'http://localhost:8001';
server: {
  port: 5173,
  proxy: {
    '/api':          { target: ST, changeOrigin: false },
    '/csrf-token':   { target: ST, changeOrigin: false },
    '/thumbnail':    { target: ST, changeOrigin: false },
    '/characters':   { target: ST, changeOrigin: false },
    '/User Avatars': { target: ST, changeOrigin: false },
  },
},
build: { outDir: 'dist', emptyOutDir: true },
base: process.env.NODE_ENV === 'production' ? '/aibar/' : '/',
```

`changeOrigin: false` 保持 Host 一致,Cookie 默认 same-site 不被拦。SSE 一般无需额外配置;若 dev 中出现 buffering,改用 `configure: (proxy) => proxy.on('proxyRes', pr => { pr.headers['x-accel-buffering'] = 'no'; })`。

---

## 11. 构建与部署

推荐:`vite build` 输出 `dist/`,然后 `cp -r dist ../SillyTavern/public/aibar/`(或 symlink),Express 同源静态服务,生产入口按实际 ST 端口访问,本项目默认 `http://localhost:8001/aibar/`。脚本:

```json
"scripts": {
  "dev": "vite",
  "build": "vue-tsc -b && vite build",
  "build:install": "npm run build && rm -rf ../SillyTavern/public/aibar && cp -r dist ../SillyTavern/public/aibar"
}
```

零 CORS、零额外进程、cookie/CSRF 天然工作。开发时 dev server 走 :5173 配代理。

---

## 12. 分阶段交付

**已完成**
- 脚手架 + Tailwind + Pinia + Hash Router + Vite 代理
- `api/client.ts` / `characters.ts` / `chats.ts` / `generate.ts` / `secrets.ts` / `worldinfo.ts`
- Stores:`session` / `characters` / `chat` / `modelProfiles` / `ui`
- 页面:`BrowsePage` 角色卡/故事卡/聊天记录三 tab,`ChatPage` 流式聊天,`SettingsPage` 模型配置/世界书,`CharacterManagerPage`,`CharacterEditorPage`
- 后端:`/api/aibar/stories/list|get|save|delete`,故事卡独立存储为模板 JSON,不再混用 ST chat recent。
- 故事卡:新建模板、详情页、开始故事时复制模板创建新的 ST chat 存档,聊天 metadata 记录来源故事。
- 消息操作:编辑 / 删除 / 重生成 / 继续 / 复制 / Swipe,且保存到 ST JSONL
- 聊天管理:首页聊天记录 tab / 角色详情聊天记录 / 新建聊天 / 打开存档 / 设默认 / 重命名 / 删除
- 模型配置:左侧列表浏览 + 多 Profile + ST secrets 写入 + 聊天级 Profile 选择
- 角色管理:导入 / 导出 / 新建 / 编辑 / 删除
- 世界书:列表 / 新建 / 示例写入 / 导入 / 条目或 JSON 编辑保存 / 删除 / 导出
- MOD:设置页管理 / 首页导航入口 `/mods` / 故事卡开始前选择 / 角色互动开始前选择 / 聊天中临时加载
- `.gitignore` 已忽略 `node_modules/`、`dist/`、`*.tsbuildinfo`

**旧 simple 追平优先级(P0,先补工作流断点)**
1. **世界书真正进入生成**:实现 `getMatchedWorldInfo` 关键词扫描,读取聊天 metadata `world_info` 或角色卡 `extensions.world/world`,把命中的 lorebook 内容传给 `buildPayload`。聊天模型抽屉增加世界书选择和“恢复默认”。
2. **故事卡编辑增强 + 测试故事**:`/story/new` 已能保存模板并开始新聊天;后续补编辑已有模板、测试模型、测试输入。测试走 `/api/backends/chat-completions/generate`,不保存数据。
3. **写角色测试**:角色新建/编辑页增加测试区,选择 Model Profile + 世界书 + 测试输入;调用 generate 后把结果放在表单附近的明显区域,不写入角色或聊天。
4. **聊天导入/导出/清空**:聊天管理抽屉补当前聊天导出(`/api/chats/export`)、导入 JSON/JSONL(`/api/chats/import`)、清空消息但保留文件(`saveChat([])`),并保留重生成/续写快捷按钮。
5. **模型连接测试和持久化**:每个 Model Profile 增加“测试”按钮,调用 `/api/backends/chat-completions/status`;测试结果显示在卡片顶部。Profile 持久化从 localStorage 迁到 ST settings `simple_ui_model_profiles`,保留 `secret_id` 指向 ST secrets。

**旧 simple 追平优先级(P1,补浏览和管理体验)**
1. **角色详情页**:`/character/:avatar` 展示 hero、简介、标签、关联故事、开始互动、设为当前角色、收藏、复制、导出、删除;首页卡片提供详情入口和互动入口。
2. **故事详情页增强**:`/story/:id` 已展示模板详情并可开始新聊天;后续补编辑完整模板、复制模板、导入/导出模板、从已有聊天反向保存为故事模板。
3. **首页筛选体验**:补全部/最近/收藏/有聊天筛选、热门标签条、指标统计、随机按钮、无图模式;角色卡和故事卡各自有匹配的排序文案。
4. **角色管理增强**:补复制角色、标签快速编辑、可选是否删除聊天、设为当前角色;导入成功后跳转到新角色详情。
5. **世界书简易条目编辑**:替代纯 JSON 作为默认体验;保留 JSON 高级编辑入口。支持新建空世界书、条目标题/关键词/内容/常驻、条目预览、编辑/删除单条、导入/导出。

**后续优先级(P2,不阻断旧 simple 追平)**
1. 生成预设(Preset)独立 CRUD,并允许聊天级选择。
2. Persona 管理和注入。
3. 设计打磨:更完整的空状态、移动端、快捷键、角色/故事卡视觉层次。
4. 群组聊天正式互动、扩展系统、图像生成、TTS/STT、reasoning 「thinking」面板、`{{macros}}` 提示词模板引擎、登录页仍不属于当前 MVP。

---

## 13. 验证方法

每阶段统一基线:
1. `cd /Users/wangdaxi/Documents/AIBAR/SillyTavern && npm start` 启动后端(本项目默认代理到 :8001;如果 ST 实际端口不同,改 `web/.env.development`)
2. `cd /Users/wangdaxi/Documents/AIBAR/web && npm run dev` 启动前端(:5173)
3. 浏览器开 `http://localhost:5173/`

**Phase 1 检查清单**:
- DevTools Network:`GET /csrf-token` 200;后续 POST 都带 `X-CSRF-Token`
- 浏览页列出 `SillyTavern/data/default-user/characters/` 下的卡
- 点卡进聊天页,历史(若有)从 `data/default-user/chats/<avatar>/<chat>.jsonl` 渲染
- 发消息 → 用户气泡立刻出现 → AI 气泡 token 流式出现 → 完成后 JSONL 文件新增条目
- 刷新页面会话仍在

**Phase 2 检查清单**:
- 表单创建角色 → `data/default-user/characters/` 多出 PNG,浏览页可见
- 拖 PNG → 导入成功
- 编辑保存 → 原生 ST UI 能读到改动
- 保存新模型 profile + key → `/api/secrets/read` 确认 masked state 存在 → 聊天页选择该 Profile → 生成实际走该 model/secret_id
- 重生成、Swipe 反映在 JSONL `swipes` 字段
- 故事卡 tab 显示 `/api/aibar/stories/list` 返回的模板;点击开始故事会创建新的 ST chat JSONL,原故事卡不被聊天内容污染
- 聊天记录 tab 显示 `/api/chats/recent` 返回的旧 ST chat JSONL;点击继续聊天会打开同一个文件名
- 从角色详情勾选 MOD 开新聊天后,JSONL header 的 `chat_metadata.aibar.mods` 写入选中的 MOD id;测试后清理临时聊天
- 打开 `/chat/:avatar?chat=<filename>` 后发送/编辑/删除/重生成,必须写回同一个 filename,不能落到角色默认 chat

**Phase 3 检查清单**:
- 导入世界书 → `data/default-user/worlds/<name>.json`
- 角色绑定后,触发关键词的消息中,临时 log payload 能看到 lorebook 内容进入 system 消息(后续待接)
- `npm run build:install` → 从 `http://localhost:8001/aibar/` 跑完已完成用例
- 跑完所有用例后,从原生 ST UI 能正确读到所有数据,确认没有数据分裂

当前已跑验证:
- `npm run build` 通过。
- Vite dev server 在 `127.0.0.1:5173` 启动后,`curl -I http://127.0.0.1:5173/` 返回 200。
- Codex 内置 Browser 已验证 `/browse?tab=chats` 显示旧聊天记录,点击「继续聊天」能打开对应 `/chat/:avatar?chat=<filename>`。
- Codex 内置 Browser 已验证设置页模型/MOD/世界书三处左侧列表浏览;写入示例模型、示例 MOD、示例世界书后,列表和右侧编辑区均可见。

---

## 14. 关键文件(实现时反复参考)

当前核心文件:
- `/Users/wangdaxi/Documents/AIBAR/web/src/api/client.ts`
- `/Users/wangdaxi/Documents/AIBAR/web/src/api/generate.ts`
- `/Users/wangdaxi/Documents/AIBAR/web/src/api/secrets.ts`
- `/Users/wangdaxi/Documents/AIBAR/web/src/api/worldinfo.ts`
- `/Users/wangdaxi/Documents/AIBAR/web/src/lib/buildPayload.ts`
- `/Users/wangdaxi/Documents/AIBAR/web/src/lib/providers.ts`
- `/Users/wangdaxi/Documents/AIBAR/web/src/stores/chat.ts`
- `/Users/wangdaxi/Documents/AIBAR/web/src/stores/modelProfiles.ts`
- `/Users/wangdaxi/Documents/AIBAR/web/vite.config.ts`

后端参考(优先级排序):
- `SillyTavern/public/scripts/simple-ui.js` — 现成的 ST API 客户端 + payload 构造,4485 行,是最佳参考样本
- `SillyTavern/src/endpoints/backends/chat-completions.js` — line 2157+ 是各 provider 的 `/generate` body 形态
- `SillyTavern/src/constants.js` — `CHAT_COMPLETION_SOURCES`(line 187)是 provider 枚举权威源
- `SillyTavern/src/endpoints/characters.js` — line 1024+ 角色 CRUD 请求体
- `SillyTavern/public/scripts/sse-stream.js` — line 113+ `parseStreamData` 各 provider delta 归一化逻辑

---

## 15. 已知风险 / 后续话题

1. **`fav` 字段是字符串 `'true'/'false'`**(非 boolean),收藏 toggle 时要按字符串处理。
2. **聊天文件名必须贯穿 load/save**:`/chat/:avatar?chat=<filename>` 打开的指定存档,后续 send/edit/delete/regenerate 都必须保存到同一个 `currentChatFile`,不能重新从角色默认 `character.chat` 推导。
3. **聊天页不能改 Profile 配置**:聊天页只选择 Profile;渠道、模型、endpoint、API Key 只能在设置页维护,否则会回到“某个聊天误改全局配置”的旧问题。
4. **ST secrets 多 key 依赖 `secret_id`**:保存 API Key 后必须把返回 id 写入对应 Profile;生成 payload 必须带 `secret_id`,否则同 provider 多 key 时无法区分。
5. **SSE 流式经 Vite 代理**:大多数环境正常;若 dev 中出现缓冲,加 `x-accel-buffering: no` 响应头透传。
6. **reasoning / thinking 模型**(o1、Claude extended thinking、DeepSeek-R1)的 `delta.reasoning` 字段 MVP 直接丢弃,后续再加可折叠思考面板。
7. **提示词模板 / `{{macros}}`**:MVP 用平铺 system prompt + 最近 24 条历史,对 chat-completions 类供应商够用;本地 text-completion 模型要完整 instruct 模板,后续单独立项。
8. **世界书命中扫描尚未接入生成**:当前能导入/编辑/删除/角色绑定,但 `buildPayload` 仍未扫描关键词并注入 lorebook 内容。
9. **旧 simple 只作为参考**:旧分支已删除,当前 release 分支没有 `public/simple.html`/`public/scripts/simple-ui.js`;如需对照,用 reflog commit `b29b06a` 的文件内容。新前端目标路径仍是 `/aibar/`。
10. **多用户 / 登录**:本机单用户场景,无登录页;若以后要开放,api 层 `403 → /login` 重定向 + `GET /api/users/me` 读用户信息约 2 小时改造量。
