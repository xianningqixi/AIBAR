# AIBAR Discord Public Publishing Service

本机手动触发的 Discord 热门角色卡编排服务。它只在管理员电脑运行，不部署到 AIBAR/SillyTavern 服务器，也不持有 Discord 或 AIBAR 登录凭据。

## 工作方式

只有在本地控制台点击“开始同步”才会创建独立任务并启动一次性 Codex Worker。任务语义是热度榜 Top N：目标数量默认 100（控制台可设 10–300），不限帖子发布日期，worker 在三个栏目按“最近活跃”收集候选，服务端全局按回应数排序截取前 N 张。服务启动、SSE 状态连接和 Worker heartbeat 都不建单、不启动 Worker，也不做定时调度。

服务负责：

- 保存三个固定 Discord 栏目的采集覆盖与 Worker 进度心跳。
- 校验帖子来源、标签条件和资源类型；按回应数全局排序并截取目标数量。
- 按 `threadId` 合并重复帖子，按真实来源生成 `period: "today"` manifest，并在控制台合并为一个热门榜。
- 超过 200 项时拆成多批交接，总量上限 1000。
- 使用稳定 `batchId` 确认交接；重复确认不会跳过下一批。
- 在本地控制台展示热门角色卡、保存用户勾选和逐项发布结果。
- 发布受阻或 Worker 中途退出后，“继续发布”按钮用已持久化的请求重启一次性发布 Worker，重试剩余项。

服务通过 `codex exec --ephemeral` 启动临时浏览器 Worker，但自身不接触 Chrome 会话、不调用 Discord 私有 API，也不下载角色卡。同步 Worker 负责读取 Discord 后退出；用户点击“发布已选”时再启动一条发布 Worker，取得临时卡体文件链接（支持 PNG/JSON/CHARX/BYAF/YAML），通过 `AIBAR_DISCORD_AIBAR_URL` 指定的已部署 AIBAR 服务器解析卡体并发布为公共社区作品。默认目标是 `https://172.86.116.166/aibar/#/hub?source=discord`，不是本地 Vite 或本地 SillyTavern；本机只保存任务编排状态。远端私人角色写入只是 SillyTavern 解析所需的内部暂存，不能作为成功结果。

完整架构与 API 见 [`../docs/local-discord-import-service.md`](../docs/local-discord-import-service.md)。

## 启动

需要 Node.js 20 或更高版本，无第三方 npm 依赖。

```bash
cd discord-import-service
npm start
```

默认监听 `http://127.0.0.1:4317`，状态写入 `discord-import-service/data/state.json`。首次启动会生成权限为 `0600` 的 `data/service-token`；`npm run client` 会自动读取。

浏览器打开 `http://127.0.0.1:4317/` 即可使用本地控制台。点击“开始同步”会创建一条覆盖三个栏目的今日快照任务并启动一次性 Worker；控制台通过 SSE 接收 Worker、候选、栏目/标签覆盖和批次状态，不做定时轮询。

可选环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `AIBAR_DISCORD_SERVICE_HOST` | `127.0.0.1` | 只接受 `127.0.0.1` 或 `::1` |
| `AIBAR_DISCORD_SERVICE_PORT` | `4317` | 本地 HTTP 端口 |
| `AIBAR_DISCORD_SERVICE_DATA` | `./data` | 状态目录 |
| `AIBAR_DISCORD_SERVICE_TOKEN` | 自动生成 | 覆盖本地 token，至少 32 字符 |
| `AIBAR_DISCORD_CODEX_BIN` | 自动发现 ChatGPT.app 内置 Codex | 覆盖一次性 Worker 使用的 Codex CLI 路径 |
| `AIBAR_DISCORD_AIBAR_URL` | 正式 AIBAR Discord 页面 | 浏览器 worker 的目标页面 |

## 本地操作

```bash
npm run client -- latest
npm run client -- get <jobId>
npm run client -- heartbeat codex-browser idle
npm run client -- claim <jobId> codex-browser
npm run client -- catalog <jobId> ./catalog.json
npm run client -- pass <jobId> ./pass-original.json
npm run client -- complete <jobId>
npm run client -- manifest <jobId>
npm run client -- delivered <jobId> <batchId>
npm run client -- workflow <jobId> waiting-selection
npm run client -- workflow <jobId> importing
npm run client -- workflow <jobId> complete
npm run client -- import-item <jobId> <cardId> <importing|imported|failed|skipped> [message]
npm run client -- heartbeat codex-browser waiting-selection <jobId>
```

`manifest` 返回 `{ batchId, batchIndex, batchCount, manifest }`。worker 读取每个批次并使用同一个 `batchId` 确认本地榜单已就绪；最后一批确认后任务进入 `workflowStatus: "waiting-selection"`，候选卡显示在本地控制台。用户点击“发布已选”后，worker 依次记录任务和每张卡的处理状态；只有远端公共作品已发布或已按服务器 SHA-256 关联到现有公共作品才写 `imported`。明确需要人工处理时可标记 `blocked`。

catalog 与 pass JSON 都必须包含三个固定来源之一的 `sourceChannelId`。这些短期浏览器 worker 交接文件应放在系统临时目录；不得包含下载 URL、密码、Cookie 或 token。

## 验证

```bash
npm run check
```
