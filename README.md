# AIBAR

AIBAR 是一个基于 **SillyTavern 多用户后端**的 Vue 3 + TypeScript 单页应用，提供 character.ai / aifuck.cc 风格的「浏览公共作品 -> 复制到私库 -> 进入私人聊天」体验。账号、角色、故事和聊天由 SillyTavern 隔离，共享作品、版本、收藏、评分、评论和邀请码审核由 AIBAR 的后端扩展提供。

> 设计初衷：原生 SillyTavern 前端过重（主 `script.js` 一万两千行，前端源码约 8.7MB），早期的单文件简版 UI（`simple-ui.js`，4485 行 vanilla JS）又难以维护。AIBAR 用现代化的 Vue 3 组件架构重写这层 UI，只保留日常聊天与角色/故事管理的核心工作流。完整背景与设计取舍见 [`docs/PLAN.md`](./docs/PLAN.md)（中文）。

## 仓库结构

核心应用由前后端两部分耦合而成，另带一个可选的 Telegram companion：

| 目录 | 说明 |
|---|---|
| `web/` | **AIBAR** 本体——独立的 Vue 3 SPA。日常开发几乎都在这里。 |
| `SillyTavern/` | git **submodule**（fork `xianningqixi/SillyTavern`，分支 `main`），提供后端 HTTP API。 |
| `telegram-bot/` | 可选 companion；使用专用 AIBAR 账号把 Telegram 私聊接入共享模型和同一套 JSONL 聊天。 |
| `docs/` | 跨组件契约、部署方案和历史资料，索引见 [`docs/README.md`](./docs/README.md)。 |
| `CONTRIBUTING.md` | 团队协作规范：分支/PR、子模块两步提交、质量门禁、代码约定。 |
| `AGENTS.md` | AI 编码代理（Claude Code、Codex 等）的统一工作指引；`CLAUDE.md` 只是它的引用。 |

AIBAR 的私人数据沿用 SillyTavern 用户目录，共享社区数据使用 SQLite WAL（详见 [持久化模型](#持久化模型)）。

## 技术栈

- **Vue 3.5**（`<script setup>`）+ **TypeScript**
- **Vite 6** — dev server + 构建
- **Pinia** — 状态管理，一个领域一个 store
- **Vue Router 4** — Hash 模式路由（`createWebHashHistory`），以便部署到 `/aibar/` 子路径时无需 server 端 history fallback
- **Tailwind CSS 3.4**（不引入 UI 组件库，组件全部自写）
- **marked + DOMPurify** — 消息 Markdown 渲染
- **@vueuse/core**
- **SQLite WAL（better-sqlite3）** — 共享作品、互动和邀请码审核

## 参与开发

分支与 PR 约定、SillyTavern 子模块的两步提交、CI 质量门禁和代码命名约定统一见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。

## 快速开始

需要 **Node >= 20**。

生产服务器的目录、systemd、HTTPS、备份和回滚方案见 [`docs/server-deployment-plan.md`](./docs/server-deployment-plan.md)。

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
# .npmrc 默认 ignore-scripts=true（不执行依赖的安装脚本），
# 首次安装后需定向编译 SQLite 原生模块，否则社区功能会报 bindings 错误：
npm rebuild better-sqlite3 --ignore-scripts=false
npm start          # node server.js
```

`SillyTavern/config.yaml` 是本机配置并被 SillyTavern 的 `.gitignore` 排除。首次启动前，从 `default/config.yaml` 复制一份并确认以下配置：

```yaml
port: 8001
enableUserAccounts: true
```

首次启动会创建 `default-user` 管理员。该账号默认可能没有密码，请登录 AIBAR 后立即在「我的账号」中设置密码，再开放 AIBAR 用户入口。

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
| `npm run lint` | ESLint 检查 TypeScript 与 Vue 模板，零 warning 门禁 |
| `npm run test` | Vitest 纯函数回归测试 |
| `npm run build` | `vue-tsc -b && vite build` —— **先类型检查再打包** 到 `dist/` |
| `npm run check` | 依次运行 lint、测试和生产构建；CI 使用同一入口 |
| `npm run build:install` | 构建后把 `dist/` 部署进 `SillyTavern/public/aibar/`，供生产环境同源访问 |
| `npm run preview` | 本地预览构建产物 |

### SillyTavern 常用命令

| 命令 | 作用 |
|---|---|
| `npm start` | `node server.js` |
| `npm run lint` / `npm run lint:fix` | ESLint |

### Telegram companion（可选）

Telegram 服务必须使用独立、已通过审核且有积分的 AIBAR 账号。启动前先设置 `ST_USER_HANDLE`、账号密码、非空 Telegram 用户白名单和随机 `ADMIN_TOKEN`；白名单为空时轮询不会启动。管理页面通过同源 ST 管理员代理连接 companion，Admin Token 不写入浏览器存储，完整步骤见 [`telegram-bot/README.md`](./telegram-bot/README.md)。

```bash
cd telegram-bot
cp .env.example .env
# 填写 .env 后
npm start
```

`npm run check` 会执行 companion 的语法检查和 Node 回归测试。

## 前端如何连到后端

- **开发模式**：`web/vite.config.ts` 把 `/api`、`/csrf-token`、`/thumbnail`、`/characters`、`/User Avatars` 代理到 `VITE_ST_BACKEND`（见 `web/.env.development`，默认 `http://localhost:8001`）。`changeOrigin: false` 保持 Host 一致，cookie/CSRF 天然工作；`/api` 代理透传 `x-accel-buffering: no` 以避免 SSE 缓冲。
- **生产模式**：`npm run build:install` 把产物拷到 `SillyTavern/public/aibar/`，由 Express 同源服务于 `/aibar/`。`vite.config.ts` 仅在生产构建时设置 `base: '/aibar/'`。默认访问入口为 `http://localhost:8001/aibar/`。
- **对外边界**：普通用户只使用 AIBAR 的 `/aibar/` 入口。原生 SillyTavern 前端不作为用户入口，应在反向代理或访问控制层保持管理员私有；AIBAR 所需的同源 API、CSRF、角色和媒体路径仍需正常转发。
- **CSRF / 会话**：`src/api/client.ts` 的 `bootCsrf()` 在启动时（`router/index.ts` 的全局导航守卫）拉取 `/csrf-token`，之后每个请求都带 `X-CSRF-Token`。`stores/session.ts` 每 5 分钟 ping `/api/ping?extend=true` 保活；登录、退出或会话失效时会清空账号级缓存和运行状态。

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
│   ├── auth.ts          # 登录、注册审核与账号管理
│   ├── billing.ts       # 共享模型与积分额度
│   ├── community.ts     # 社区作品发布、互动与启动
│   ├── stories.ts       # 故事卡模板（自定义 /api/aibar 端点）
│   ├── imageGen.ts      # 图像生成
│   ├── discordImport.ts # Discord 导入批次管理（管理员）
│   ├── telegramBot.ts   # Telegram companion 管理接口
│   ├── tts.ts           # 文本转语音
│   └── worldInfo.ts     # 世界书 CRUD
├── stores/     # 每个领域一个 Pinia store
│   # chat / characters / modelProfiles / presets / personas /
│   # mods / imageGen / tts / session / billing / ui
├── pages/      # 路由懒加载的页面组件（PascalCase，*Page.vue）
├── components/ # chat / community / image / layout / mods / settings / ui / world
├── composables/
├── lib/        # 纯逻辑：buildPayload / providers / worldInfoMatch / storyStart 等
├── router/
└── main.ts
```

**架构原则**：页面组件只读 store + 派发 action，绝不直接 `fetch()`；store 唯一持有可变状态；`api/` 是纯 fetch 包装；无全局事件总线。

### 关键库文件

- `lib/buildPayload.ts` — 组装 chat-completion 请求。`getSystemPrompt()` 用角色字段 + 世界书 + MOD + 预设 + persona 拼出 system message；`buildGeneratePayload()` 在约 48,000 字符、最多 120 条的预算内选择最近历史，按位置注入 MOD 文本并映射 provider 参数。
- `lib/providers.ts` — provider 元数据、可用渠道和管理员密钥类型映射；普通用户的生成请求不携带端点或密钥。
- `stores/chat.ts` — 持有当前会话、流式状态和 swipes。

### 路由

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` → `/browse` | — | 重定向 |
| `/login`、`/register` | LoginPage / RegisterPage | 登录、邀请码注册与审核状态 |
| `/browse` | BrowsePage | 角色卡 / 故事卡 / 聊天记录 三个 tab |
| `/hub`、`/work/:id` | CommunityHubPage / CommunityWorkPage | 公共作品、榜单、评分、评论和私人启动 |
| `/publish` | PublishPage | 发布作品或创建不可变的新版本 |
| `/account`、`/admin` | AccountPage / AdminPage | 密码与账号管理、邀请码和注册审核 |
| `/chat/:avatar` | ChatPage | 角色聊天，`?chat=<filename>` 打开指定存档 |
| `/character/:avatar` | CharacterDetailPage | 角色详情 |
| `/character/new`、`/character/:avatar/edit` | CharacterEditorPage | 新建 / 编辑角色 |
| `/characters` | CharacterManagerPage | 角色列表管理 |
| `/story/new`、`/story/:id/edit` | StoryNewPage | 新建 / 编辑故事卡模板 |
| `/story/:id` | StoryDetailPage | 故事卡详情，「开始故事」时创建新的 ST chat |
| `/create` | CreatePage | 创建入口 |
| `/settings` | SettingsPage | 提示词预设 / 身份 / 关于；共享模型、图像、TTS、Telegram 仅管理员可见 |
| `/worlds`、`/mods` | WorldsPage / ModsPage | 世界书与提示词 MOD 管理 |

`router.beforeEach` 在首次进入任意路由前拉取 CSRF token 和当前用户；未登录用户会跳转到 `/login`，管理员路由还会校验 `session.isAdmin`。

## 持久化模型（重要）

AIBAR 状态分散在四处：

1. **账号级应用设置**（预设、身份、MOD、图像和 TTS 等）：存在该账号 SillyTavern settings JSON 的 `aibar` key 下，经 `/api/settings/get|save`（`api/settings.ts`，`loadAibarSettings` / `saveAibarSettings`）。共享模型不存放在这里。
2. **聊天**：以 SillyTavern 的 JSONL 聊天文件持久化。当前选中的模型 profile、预设、世界书、MOD 会写进该聊天 JSONL 的 **metadata**，刷新浏览器后不丢。
3. **故事卡 & 生成的图像**：由 **ST fork 新增的自定义端点** 提供——`SillyTavern/src/endpoints/aibar.js`（挂载于 `/api/aibar`，见 `src/server-startup.js`）。故事存于用户目录 `aibar/stories`，图像存于 `aibar/images`。
4. **共享社区数据**：`SillyTavern/src/aibar-community-db.js` 在 `DATA_ROOT/_aibar/community.sqlite` 创建 SQLite WAL 数据库，保存作品、不可变版本、标签、收藏、评分、评论、启动事件、邀请码、注册申请和 Discord 导入批次。作品快照资源位于同级 `works/` 目录，Discord 原始卡体按 SHA-256 归档到 `_aibar/imports/discord/sha256/`。

公共作品不直接引用作者私库。发布时会复制角色卡、故事和依赖资源形成不可变版本；开始聊天时再把指定公共版本复制到当前账号的角色/故事目录，并创建该账号自己的 JSONL 会话。私人模型 Profile 不随作品复制。

> 这些自定义路由在上游 SillyTavern 中不存在。私人故事/媒体位于 `src/endpoints/aibar.js`，社区与审核位于 `src/endpoints/aibar-community.js` 和 `src/endpoints/aibar-public.js`。

### 自定义后端端点（`/api/aibar`）

| 路由 | 作用 |
|---|---|
| `POST /stories/list\|get\|save\|delete` | 故事卡模板的增删查 |
| `POST /images/list\|save\|delete` | 生成图像的索引管理 |
| `GET /images/file/:fileName` | 读取单张图像文件 |
| `POST /works/list\|get\|publish\|launch` | 公共作品浏览、发布版本和复制到私库 |
| `POST /works/favorite\|rate\|comments/*` | 收藏、评分和评论 |
| `POST /admin/invites/*` | 管理邀请码 |
| `POST /admin/registrations/review` | 审核注册申请并创建 ST 账号 |

公开注册接口在登录中间件之前挂载于 `/api/aibar/public/register` 和 `/api/aibar/public/registration-status`。

### 共享模型边界

共享模型只能由管理员在 AIBAR 中显式创建；系统不会扫描、迁移或自动公开任何账号原有的私有模型 Profile。共享模型引用的 API Key 仍保存在创建它的管理员 SillyTavern 用户目录中，端点与 `secret_id` 只返回给凭据所属管理员，普通用户和其他管理员都拿不到这些字段。

普通用户通过 `/api/aibar/models/generate` 调用已启用的共享模型。后端会按配置的输入/输出积分单价先预占本次请求的最大费用，再根据供应商返回的实际 token 用量结算并释放剩余额度；供应商未返回 usage 时使用本地 token 估算，但不会把保守的预占字节上界直接当成实际用量。余额不足时不会向模型供应商发起请求。`user_budgets` 表仍只为未来接入 LiteLLM 虚拟密钥预留，当前计费链路不依赖 LiteLLM。

## 端到端涉及两侧的改动

当修改任何「故事 / 图像 / 媒体 / 社区发布」相关的端到端功能时，预期会同时改动：

- 前端：`web/src/api/{stories,imageGen}.ts`
- 后端：`SillyTavern/src/endpoints/aibar.js`、`aibar-community.js` 或 `aibar-public.js`

submodule 位于自己的分支，需单独提交。

## 已知约定 / 注意事项

- `fav` 字段是字符串 `'true'/'false'`（非 boolean），收藏 toggle 时按字符串处理。
- **聊天文件名必须贯穿 load/save**：`/chat/:avatar?chat=<filename>` 打开的存档，后续 send/edit/delete/regenerate 都要写回同一个文件，不能回退到角色默认 chat。
- **聊天页不能改共享模型配置**：聊天页只选择管理员已启用的共享模型；渠道、模型、endpoint、API Key 和积分单价只在管理员设置页维护。
- **多 key 依赖 `secret_id`**：管理员保存 API Key 后，要把返回的 id 绑定到共享模型。普通用户只提交共享模型 id，后端再从所属管理员目录解析并注入对应密钥，密钥信息不会进入浏览器生成 payload。
- UI、代码注释、LLM 提示词均为中文。

## License

继承各组成部分的许可：AIBAR 前端代码见本仓库，SillyTavern submodule 遵循其上游许可（AGPL-3.0）。
