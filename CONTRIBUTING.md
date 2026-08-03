# 贡献指南

面向加入 AIBAR 开发的团队成员。项目背景和架构见 [`README.md`](./README.md)，历史设计取舍见 [`docs/PLAN.md`](./docs/PLAN.md)。

## 上手

1. `git clone --recurse-submodules <repo-url>`（已 clone 过则 `git submodule update --init --recursive`）。
2. 按 README「快速开始」启动后端（`SillyTavern/`，端口 8001）和前端（`web/`，端口 5173）。
3. 日常开发几乎都发生在 `web/`；后端改动集中在 `SillyTavern/src/endpoints/aibar*.js` 和 `src/aibar-community-db.js`。

## 分支与提交

- 主仓库主分支为 `main`，SillyTavern 子模块也使用 `main` 分支（见 `.gitmodules`）。
- 功能开发从主分支拉 `feat/<主题>`、修复用 `fix/<主题>`，通过 PR 合回；不直接向主分支推送。
- 提交信息沿用现有风格：`feat: ...` / `fix: ...` / `docs: ...`，一句话说清改了什么。
- **禁止入库**：`SillyTavern/config.yaml`、任何 API Key、账号密码、Discord 凭据或短期 CDN 链接、`.claude/settings.local.json`（已在 `.gitignore`）。

### 子模块两步提交（重要）

`SillyTavern/` 是独立仓库。凡是同时改了前后端的功能：

1. 先在 `SillyTavern/` 内提交并推送到它自己的分支。
2. 再回到主仓库提交前端改动 **和新的子模块指针**（`git add SillyTavern`）。

Review 时先看子模块 PR，再看主仓库 PR；合并顺序同上，避免主仓库指向一个未推送的子模块 commit。

## 质量门禁

合并前必须全绿，CI（`.github/workflows/ci.yml`）对 push 和 PR 跑同样的内容：

| 位置 | 命令 | 内容 |
|---|---|---|
| `web/` | `npm run check` | ESLint（零 warning）→ Vitest → `vue-tsc` 类型检查 + 生产构建 |
| `SillyTavern/` | `npm run test:aibar` + `npm run lint` | AIBAR 后端扩展回归测试 + ESLint |
| `telegram-bot/` | `npm run check` | 语法检查 + Node 回归测试 |

新的纯逻辑（`web/src/lib/`）应带 Vitest 用例，测试文件与源码同目录（`*.test.ts`）。

## 代码约定

- **命名**：`api/`、`lib/`、`stores/` 内文件用 camelCase（如 `worldInfo.ts`、`buildPayload.ts`）；页面组件用 PascalCase 且以 `Page.vue` 结尾；通用组件按领域放进 `components/<domain>/`。
- **架构**：页面只读 store + 派发 action，不直接 `fetch()`；可变状态只存在于 store；`api/` 只做纯 fetch 包装；不引入全局事件总线；不引入 UI 组件库（Tailwind 自写组件）。
- **语言**：UI 文案、代码注释、LLM 提示词一律中文；文档中文为主，agent 指引（`AGENTS.md`）为英文。
- **AI 协作**：无论用 Claude Code 还是其他 agent，指引统一维护在 `AGENTS.md`（`CLAUDE.md` 只是引用）。仓库内置 `/discord-import` 命令（`.claude/commands/`）。

## 文档地图

| 文档 | 内容 |
|---|---|
| [`README.md`](./README.md) | 架构、快速开始、持久化模型、路由 |
| [`docs/README.md`](./docs/README.md) | docs 目录索引 |
| [`docs/server-deployment-plan.md`](./docs/server-deployment-plan.md) | 生产部署方案（目录、systemd、HTTPS、备份回滚） |
| [`docs/discord-hot-import-runbook.md`](./docs/discord-hot-import-runbook.md) | Discord 热门资源同步/导入操作手册 |
| [`docs/discord-browser-import.md`](./docs/discord-browser-import.md) | Discord 浏览器协作导入的 manifest 与安全契约 |
| [`docs/aibar-web-app-bridge.md`](./docs/aibar-web-app-bridge.md) | 第三方网页应用桥接协议 |
| [`docs/PLAN.md`](./docs/PLAN.md) | 原始实施/对照计划（历史背景） |
| [`telegram-bot/README.md`](./telegram-bot/README.md) | Telegram companion 部署与账号要求 |
