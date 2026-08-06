# AIBAR Discord Import Service

本地 T+1 编排子服务。它运行在管理员自己的电脑上，不部署到 AIBAR/SillyTavern 服务器，也不持有 Discord 或 AIBAR 登录凭据。

## 它负责什么

- 每天 `09:00 Asia/Shanghai` 创建前一自然日的扫描任务；休眠/停机跨天后自动回补漏掉的日期（最多 7 天）。
- 保存 Discord 当前标签目录，以及每个原生标签按钮和无标签视图的扫描覆盖。
- 严格校验帖子来源、自然日边界、标签条件和资源类型。
- 按 `threadId` 合并跨筛选视图的重复帖子。
- 生成 AIBAR manifest v1；超过 200 张时按热度拆成多批逐批交接（总量上限 1000）；空任务不会生成可交接 manifest。

它不控制 Chrome、不调用 Discord 私有 API、不下载角色卡，也不把 manifest 直接提交给部署端 AIBAR。可见浏览器 worker 负责 Discord 页面操作和 AIBAR 页面交接。

完整架构与 API 见 [`../docs/local-discord-import-service.md`](../docs/local-discord-import-service.md)。

## 启动

需要 Node.js 20 或更高版本，无第三方 npm 依赖。

```bash
cd discord-import-service
npm start
```

默认监听 `http://127.0.0.1:4317`，状态写入 `discord-import-service/data/state.json`。`data/` 已忽略，不得提交。

首次启动会在 `data/service-token` 生成本地 API 的 bearer token（权限 0600）。除 `/health` 外的所有接口都要求 `Authorization: Bearer <token>`；`npm run client` 会自动读取该文件，无需手动配置。

可选环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `AIBAR_DISCORD_SERVICE_HOST` | `127.0.0.1` | 只接受 `127.0.0.1` 或 `::1` |
| `AIBAR_DISCORD_SERVICE_PORT` | `4317` | 本地 HTTP 端口 |
| `AIBAR_DISCORD_SERVICE_DATA` | `./data` | 状态目录 |
| `AIBAR_DISCORD_SERVICE_RUN_HOUR` | `9` | 上海时区建单小时 |
| `AIBAR_DISCORD_SERVICE_RUN_MINUTE` | `0` | 建单分钟 |
| `AIBAR_DISCORD_SERVICE_TOKEN` | 自动生成 | 覆盖 `data/service-token`，至少 32 字符 |
| `AIBAR_DISCORD_AIBAR_URL` | 正式 AIBAR Discord 页面 | 浏览器 worker 的目标页面 |

## 本地操作

```bash
npm run client -- latest
npm run client -- trigger
npm run client -- trigger 2026-08-05 ./filters.json
npm run client -- claim t1-2026-08-05 codex-browser
npm run client -- catalog t1-2026-08-05 ./catalog.json
npm run client -- pass t1-2026-08-05 ./pass-original.json
npm run client -- complete t1-2026-08-05
npm run client -- manifest t1-2026-08-05
npm run client -- delivered t1-2026-08-05
```

`filters.json` 的结构是 `{ "tags": ["原创", "多路线"], "tagMatch": "all" }`。`catalog.json`、filters JSON 和 pass JSON 是短期浏览器 worker 交接文件，应该放在系统临时目录，不要提交到仓库。它们不得包含下载 URL、密码、Cookie 或 token。

## 验证

```bash
npm run check
```
