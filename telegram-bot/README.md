# AIBAR Telegram Bot

独立 Telegram Bot companion service，不修改 SillyTavern 后端。它通过 ST HTTP API 读取角色、保存 JSONL 聊天，并调用 AIBAR 当前模型配置生成回复。

## 使用

1. 从 `@BotFather` 创建 bot，拿到 token。
2. 启动 companion 服务：

```bash
cd telegram-bot
cp .env.example .env
npm start
```

3. 打开 AIBAR 前端设置页的 `Telegram Bot` 标签，保存 Bot Token、白名单和 ST 后端地址。也可以直接编辑 `.env`：

```bash
TELEGRAM_BOT_TOKEN=123456:xxx
TELEGRAM_ALLOWED_USER_IDS=你的 Telegram 数字 ID
ST_BASE_URL=http://127.0.0.1:8001
AIBAR_MAX_COMPLETION_TOKENS=4096
```

4. 确保 ST 后端已启动。保存配置后，companion 会自动重启 Telegram 轮询。

默认本地管理接口是 `http://127.0.0.1:8787`。如果 `.env` 设置了 `ADMIN_TOKEN`，前端设置页也需要填写同一个 Admin Token 才能保存和调试。

## 调试接口

前端设置页会调用这些本地接口：

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
- 推荐始终设置 `TELEGRAM_ALLOWED_USER_IDS`。
- Bot token 不要提交到 Git，也不要放到前端。
