# AIBAR Telegram Bot

独立 Telegram Bot companion service。它通过专用 AIBAR 账号读取角色、保存 JSONL 聊天，并调用管理员启用的共享模型生成回复和结算积分；管理页面通过 SillyTavern 的管理员会话代理访问 companion，不由浏览器直连本地端口。

## 使用

1. 从 `@BotFather` 创建 bot，拿到 token。
2. 复制配置文件，先填写 Bot Token、专用 AIBAR 账号和至少 24 位的随机 Admin Token：

```bash
cd telegram-bot
cp .env.example .env
```

`.env` 至少需要这些值：

```bash
TELEGRAM_BOT_TOKEN=123456:xxx
TELEGRAM_ALLOWED_USER_IDS=你的 Telegram 数字 ID
ST_BASE_URL=http://127.0.0.1:8001
ST_USER_HANDLE=telegram-bot
ST_USER_PASSWORD=请填写该账号的密码
AIBAR_MAX_COMPLETION_TOKENS=4096
ADMIN_TOKEN=请填写一段足够长的随机字符串
```

过短的值和示例占位值不会被接受为有效 Admin Token。`ST_USER_HANDLE`、`ST_USER_PASSWORD` 或 `TELEGRAM_ALLOWED_USER_IDS` 未配置时 companion 不会启动轮询，也不会拉取或确认 Telegram 消息；白名单为空始终按默认拒绝处理。

3. 确保 ST 后端已启动，再启动 companion：

```bash
npm start
```

4. 管理员可打开 AIBAR 设置页的 `Telegram Bot` 标签继续修改 Bot Token、白名单、共享模型 ID 和服务账号。保存配置后，companion 会先处理完已经收到的消息，再切换配置并重启轮询。`ST_BASE_URL` 只能在 companion 的 `.env` 中修改。

默认本地管理接口是 `http://127.0.0.1:8787`，只监听 loopback 且不开放浏览器 CORS。`ADMIN_TOKEN` 为必填项；首次在 AIBAR 设置页验证成功后，它保存到当前 SillyTavern 管理员的 secrets 中，浏览器存储不保留 Token。后续请求由同源 `/api/aibar/telegram/*` 代理到 companion。`ST_USER_HANDLE` 对应一个已通过审核且有积分的 AIBAR 专用账号；Bot 的角色、聊天和积分都归属该账号。

管理接口写回 `.env` 后会把文件权限强制设为 `0600`。首次手工创建 `.env` 时也建议先执行 `chmod 600 .env`。

轮询 offset、尚未连续提交的 update 和 Telegram 会话绑定按「Bot Token 指纹 + ST 账号 handle」隔离保存。Token 原文不会写入状态文件；更换 Bot 或服务账号时不会复用旧身份的 offset、待处理消息和聊天绑定，旧版未分区的 `data/state.json` 也不会自动迁移。

单条 update 最多重试 5 次（指数退避，1s 起、上限 30s）。仍然失败就记录错误日志、给对应用户回一条"已跳过"提示，并把这条 update 标记为已处理并提交 offset，避免一条毒消息永远堵住该用户的队列。轮询循环本身由 supervisor 托管：只要轮询仍处于开启状态，循环崩溃或意外退出都会在退避后用全新的 update pipeline 自动重启，不会出现「配置为开启但实际已停摆」的状态。

修改后可运行 `npm run check`，它会执行所有源码语法检查和 Node 回归测试。

## 调试接口

SillyTavern 代理会调用 companion 的这些本地接口；浏览器只调用同源的 `/api/aibar/telegram/*`：

- `GET /api/status`：查看配置脱敏信息、轮询状态、会话数和最近错误
- `POST /api/config`：写入 `.env` 并重启轮询
- `POST /api/debug/telegram`：调用 Telegram `getMe` 验证 Token
- `POST /api/debug/st`：检查 ST `/csrf-token`、角色列表和 AIBAR 模型配置
- `POST /api/debug/full`：同时运行 Telegram 和 ST 检查

## 命令

- `/start` 或 `/help`：显示帮助
- `/characters`：列出角色
- `/use 1`：选择最近角色列表里的第 1 个角色，并接续该角色最近一条聊天
- `/chats`：列出当前角色的聊天记录
- `/recent`：列出所有角色最近聊天记录
- `/resume 1`：接续 `/chats` 或 `/recent` 列表里的第 1 条聊天
- `/history`：查看当前聊天最近 8 条消息；也支持 `/history 20`
- `/retry`：重试当前聊天最后一条用户消息
- `/current`：查看当前角色/聊天
- `/new`：为当前角色新开一段聊天
- `/reset`：清空 Telegram 会话绑定

普通文本会发送给当前角色并生成回复。

TG 和 Web 共用 SillyTavern JSONL 聊天文件：Web 端聊过的记录可以通过 `/recent` 或 `/chats` 在 TG 接续，TG 产生的新消息也会出现在 Web 的“继续聊天”和角色聊天记录里。

## 安全

- `.env` 和 `data/` 不会提交。
- 必须设置唯一且至少 24 位的随机 `ADMIN_TOKEN`；未设置、过短或仍为常见示例值时，除健康检查外的管理接口会保持锁定。
- 必须设置非空 `TELEGRAM_ALLOWED_USER_IDS`；为空时轮询保持关闭。
- `ST_BASE_URL` 只能从 companion `.env` 修改，调试请求不能将 ST 凭据重定向到其他地址。
- companion 写回 `.env` 时强制使用 `0600` 权限。
- Bot token 不要提交到 Git，也不要放到前端。
