# AIBAR

AIBAR 是一个 **SillyTavern 的简化版前端**：一个独立的 Vue 3 + TypeScript 单页应用，提供 character.ai / aifuck.cc 风格的「卡片浏览 → 进入聊天」体验。它本身没有后端，完全复用 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 的 HTTP API，面向本机单用户使用。

> 设计初衷：原生 SillyTavern 前端过重（主 `script.js` 一万两千行，前端源码约 8.7MB），早期的单文件简版 UI（`simple-ui.js`，4485 行 vanilla JS）又难以维护。AIBAR 用现代化的 Vue 3 组件架构重写这层 UI，只保留日常聊天与角色/故事管理的核心工作流。完整背景与设计取舍见 [`PLAN.md`](./PLAN.md)（中文）。

## 仓库结构

这是一个由两部分耦合而成的仓库：

| 目录 | 说明 |
|---|---|
| `web/` | **AIBAR** 本体——独立的 Vue 3 SPA。日常开发几乎都在这里。 |
| `SillyTavern/` | git **submodule**（fork `xianningqixi/SillyTavern`，分支 `codex/aibar-local-deploy`），提供后端 HTTP API。 |
| `PLAN.md` | 原始实施/对照计划（中文），解释「为什么这样做」以及与旧 `simple-ui.js` 基线的差异。 |
| `CLAUDE.md` | 给 Claude Code 的工作指引。 |

AIBAR 没有自己的数据库；所有数据都存放在 SillyTavern 的用户目录中（详见 [持久化模型](#持久化模型)）。

## 技术栈

- **Vue 3.5**（`<script setup>`）+ **TypeScript**
- **Vite 6** — dev server + 构建
- **Pinia** — 状态管理，一个领域一个 store
- **Vue Router 4** — Hash 模式路由（`createWebHashHistory`），以便部署到 `/aibar/` 子路径时无需 server 端 history fallback
- **Tailwind CSS 3.4**（不引入 UI 组件库，组件全部自写）
- **marked + DOMPurify** — 消息 Markdown 渲染
- **@vueuse/core**

## 快速开始

需要 **Node >= 20**。

### 1. 拉取代码（含 submodule）

```bash
git clone --recurse-submodules <repo-url>
# 已经 clone 过的话：
git submodule update --init --recursive
```

### 2. 启动后端（SillyTavern）

```bash
cd SillyTavern
npm install
npm start          # node server.js
```

本仓库已把 `SillyTavern/config.yaml` 的 `port` 设为 **8001**（避开常被占用的 8000），与前端 dev 代理默认值一致，启动后无需额外配置。

> ⚠️ **端口注意**：AIBAR 的 dev 代理（`web/.env.development` 的 `VITE_ST_BACKEND`）默认指向 **8001**，必须与 ST 实际监听端口一致。若你改了 ST 端口，记得同步改 `VITE_ST_BACKEND`。

### 3. 启动前端（开发模式）

```bash
cd web
npm install
npm run dev        # Vite dev server，端口 5173
```

浏览器打开 `http://localhost:5173/`。

### web 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | Vite dev server（:5173），代理到 ST 后端 |
| `npm run build` | `vue-tsc -b && vite build` —— **先类型检查再打包** 到 `dist/`。这是唯一的类型检查/lint 关卡，项目**没有测试套件**。 |
| `npm run build:install` | 构建后把 `dist/` 部署进 `SillyTavern/public/aibar/`，供生产环境同源访问 |
| `npm run preview` | 本地预览构建产物 |

### SillyTavern 常用命令

| 命令 | 作用 |
|---|---|
| `npm start` | `node server.js` |
| `npm run lint` / `npm run lint:fix` | ESLint |

## 前端如何连到后端

- **开发模式**：`web/vite.config.ts` 把 `/api`、`/csrf-token`、`/thumbnail`、`/characters`、`/User Avatars` 代理到 `VITE_ST_BACKEND`（见 `web/.env.development`，默认 `http://localhost:8001`）。`changeOrigin: false` 保持 Host 一致，cookie/CSRF 天然工作；`/api` 代理透传 `x-accel-buffering: no` 以避免 SSE 缓冲。
- **生产模式**：`npm run build:install` 把产物拷到 `SillyTavern/public/aibar/`，由 Express 同源服务于 `/aibar/`。`vite.config.ts` 仅在生产构建时设置 `base: '/aibar/'`。默认访问入口为 `http://localhost:8001/aibar/`。
- **CSRF / 会话**：`src/api/client.ts` 的 `bootCsrf()` 在启动时（`main.ts` 路由 `beforeEach`）拉取一次 `/csrf-token`，之后每个请求都带 `X-CSRF-Token`。`stores/session.ts` 每 5 分钟 ping `/api/ping?extend=true` 保活。

## 前端架构（`web/src`）

```
src/
├── api/        # 后端端点的薄包装
│   ├── client.ts        # apiPost / apiPostForm / apiPostBlob / apiStream(SSE) / bootCsrf
│   ├── characters.ts    # 角色 CRUD + 导入导出
│   ├── chats.ts         # 聊天 get/save/rename/delete/recent
│   ├── generate.ts      # 生成 + 流式
│   ├── secrets.ts       # API key 状态/读写/轮换/删除
│   ├── settings.ts      # AIBAR 应用设置读写
│   ├── stories.ts       # 故事卡模板（自定义 /api/aibar 端点）
│   ├── imageGen.ts      # 图像生成
│   ├── tts.ts           # 文本转语音
│   └── worldinfo.ts     # 世界书 CRUD
├── stores/     # 每个领域一个 Pinia store
│   # chat / characters / modelProfiles / presets / personas /
│   # mods / imageGen / tts / session / ui
├── pages/      # 路由懒加载的页面组件
├── components/ # browse / chat / image / mods / world / ui
├── composables/
├── lib/        # 纯逻辑：buildPayload / providers / worldInfoMatch / storyStart 等
├── router/
└── main.ts
```

**架构原则**：页面组件只读 store + 派发 action，绝不直接 `fetch()`；store 唯一持有可变状态；`api/` 是纯 fetch 包装；无全局事件总线。

### 关键库文件

- `lib/buildPayload.ts` — 组装 chat-completion 请求。`getSystemPrompt()` 用角色字段 + 世界书 + MOD + 预设 + persona 拼出 system message；`buildGeneratePayload()` 截取最近 24 条历史、按位置注入 MOD 文本、映射到 provider 参数。
- `lib/providers.ts` — provider 专属的端点/密钥处理（OpenAI、Claude、OpenRouter、Gemini、DeepSeek 等 20+ 渠道）。
- `stores/chat.ts` — 持有当前会话、流式状态和 swipes。

### 路由

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` → `/browse` | — | 重定向 |
| `/browse` | BrowsePage | 角色卡 / 故事卡 / 聊天记录 三个 tab |
| `/chat/:avatar` | ChatPage | 角色聊天，`?chat=<filename>` 打开指定存档 |
| `/character/:avatar` | CharacterDetailPage | 角色详情 |
| `/character/new`、`/character/:avatar/edit` | CharacterEditorPage | 新建 / 编辑角色 |
| `/characters` | CharacterManagerPage | 角色列表管理 |
| `/story/new`、`/story/:id/edit` | StoryNewPage | 新建 / 编辑故事卡模板 |
| `/story/:id` | StoryDetailPage | 故事卡详情，「开始故事」时创建新的 ST chat |
| `/create` | CreatePage | 创建入口 |
| `/settings`、`/mods` | SettingsPage | 模型配置 / 世界书 / MOD / 关于（同一页内部 tab） |

`router.beforeEach` 在首次进入任意路由前 `await sessionStore.boot()` 拉取 CSRF token。

## 持久化模型（重要）

AIBAR **没有数据库**，状态分散在三处：

1. **应用设置**（模型 profile 等）：存在 SillyTavern settings JSON 的 `aibar` key 下，经 `/api/settings/get|save`（`api/settings.ts`，`loadAibarSettings` / `saveAibarSettings`）。部分 store 会从旧的 `localStorage` key 迁移。
2. **聊天**：以 SillyTavern 的 JSONL 聊天文件持久化。当前选中的模型 profile、预设、世界书、MOD 会写进该聊天 JSONL 的 **metadata**，刷新浏览器后不丢。
3. **故事卡 & 生成的图像**：由 **ST fork 新增的自定义端点** 提供——`SillyTavern/src/endpoints/aibar.js`（挂载于 `/api/aibar`，见 `src/server-startup.js`）。故事存于用户目录 `aibar/stories`，图像存于 `aibar/images`。

> 这些自定义路由（`/api/aibar/stories/*`、`/api/aibar/images/*`）在上游 SillyTavern 中不存在，因此涉及故事/媒体的后端改动都要落在这个文件里。

### 自定义后端端点（`/api/aibar`）

| 路由 | 作用 |
|---|---|
| `POST /stories/list\|get\|save\|delete` | 故事卡模板的增删查 |
| `POST /images/list\|save\|delete` | 生成图像的索引管理 |
| `GET /images/file/:fileName` | 读取单张图像文件 |

## 端到端涉及两侧的改动

当修改任何「故事 / 图像 / 媒体」相关的端到端功能时，预期会同时改动：

- 前端：`web/src/api/{stories,imageGen}.ts`
- 后端：`SillyTavern/src/endpoints/aibar.js`

submodule 位于自己的分支，需单独提交。

## 已知约定 / 注意事项

- `fav` 字段是字符串 `'true'/'false'`（非 boolean），收藏 toggle 时按字符串处理。
- **聊天文件名必须贯穿 load/save**：`/chat/:avatar?chat=<filename>` 打开的存档，后续 send/edit/delete/regenerate 都要写回同一个文件，不能回退到角色默认 chat。
- **聊天页不能改 Profile 配置**：聊天页只「选择」已保存的 Model Profile；渠道、模型、endpoint、API Key 只在设置页维护，避免误改全局配置。
- **多 key 依赖 `secret_id`**：保存 API Key 后要把返回的 id 写入对应 Profile，生成 payload 必带 `secret_id`，否则同 provider 多 key 无法区分。
- UI、代码注释、LLM 提示词均为中文。

## License

继承各组成部分的许可：AIBAR 前端代码见本仓库，SillyTavern submodule 遵循其上游许可（AGPL-3.0）。
