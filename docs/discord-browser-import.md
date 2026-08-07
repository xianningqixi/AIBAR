# Discord 浏览器协作导入契约

实际同步、下载、重试和验收步骤见 [`discord-hot-import-runbook.md`](./discord-hot-import-runbook.md)。本文只定义数据与安全契约。

本文定义本机 Discord 编排服务与浏览器 worker 通过用户已登录的 Chrome 协作同步并公开发布角色卡的版本 1 契约。热门清单、勾选、发布授权和逐项结果由 `discord-import-service` 本地控制台持有；AIBAR 主项目不再展示 manifest 或热门榜，只保留手动 Discord 卡体公共发布入口（支持 PNG / JSON / CHARX / BYAF / YAML）。浏览器 worker 取得用户授权后逐项把短期卡体链接和帖子来源交给该入口，由远端服务器解析并发布为公共社区作品。

## 固定来源

- Discord guild：`1380075940285124724`
- Discord sources：
  - 纯文字：`1478601254312874024`
  - 轻前端·美化：`1478601664838766723`
  - 重前端·独立前端：`1478612237869519021`
- 日期时区：`Asia/Shanghai`

浏览器助手只能从上述固定 guild/sources 构建此流程的 manifest。catalog/pass 必须声明来源栏目；manifest 中出现其他 guild/channel 时，本地服务必须拒绝。

## 双阶段流程

### 阶段一：同步候选列表

1. 用户在本地控制台点击“开始同步”，创建一条手动任务。本地服务不会定时创建任务，Worker heartbeat 和 `/discord-import` 也不得创建任务。
2. 浏览器助手使用用户已经登录的 Chrome 依次打开固定 guild 下的三个来源栏目，按每个栏目的 Discord 原生标签按钮和标签匹配方式筛选，读取候选帖子及其公开可见的标题、作者、时间、热度、标签、预览和资源提示，并区分角色卡与网页应用。
3. 浏览器助手把观察结果按 `sourceChannelId` 逐 pass 上报本地服务；三个栏目及其标签覆盖全部完成后，本地服务按来源生成本文 schema 的 manifest。
4. worker 逐批确认 manifest 后，本地控制台把三个来源合并为一个热门榜，并显示每项来源栏目。此阶段不下载角色卡。

`period: "today"` 表示 `Asia/Shanghai` 当前自然日，手动服务使用触发当日 00:00 到触发时刻的快照；`period: "previous-day"` 和 `rolling-24h` 仅为旧清单兼容值。`sort: "reactions"` 按反应数排序，`sort: "activity"` 按最近活跃度排序。

`filters.tags` 记录本次结果必须满足的 Discord 标签；空数组表示不限制标签。`filters.tagMatch: "any"` 对应 Discord 的“匹配部分”，`"all"` 对应“全部匹配”。筛选按钮只用于可见页面采集，manifest 仍必须逐项保存帖子实际展示的全部标签；声明了标签条件时，每个 `cards[]` 项都必须满足该条件。

### 阶段二：发布已选资源

1. 用户在本地控制台勾选需要的角色卡。
2. 用户点击本地控制台的“发布已选”。该点击写入持久化请求，并明确授权浏览器 worker 执行后续浏览器操作。
3. 本地服务为该点击启动新的单次浏览器助手；它读取其中仍被勾选且尚未成功导入的项目，不要求用户再回对话发送命令。
4. 浏览器助手使用已登录的 Chrome 打开这些项目的 `sourceUrl`，按 PNG > JSON > CHARX > BYAF > YAML 优先级选择卡体并取得短期 Discord CDN 链接。
5. worker 把每项的短期链接与来源信息（url/cardId/threadId/channelId/sourceUrl/title/authorName/tags）组装成 JSON 数组，一次性粘贴进已部署 AIBAR 服务器的批量发布入口；单项手动入口保留为回退路径（来源信息经 hash 查询参数传递）。
6. 远端 AIBAR 的 `/api/aibar/works/publish-discord-batch` 在服务器端直接抓取附件（并发 3、单批最多 10 项、逐项失败隔离），由 SillyTavern 解析后导入；私人角色文件只是解析暂存。服务器从 PNG 计算 SHA-256，按哈希关联公共区重复作品，或把同 thread 的新内容发布成公共作品版本，逐项返回 `published`/`duplicate`/`failed`。
7. 页面只有在公共发布返回 `published` 或 `duplicate` 并给出作品入口时才显示成功。worker 随后把每项 `imported`、`failed` 或 `skipped` 结果写回本地服务；单项失败不得回滚已成功项目。

网页应用、压缩包和无卡体附件的帖子不进入阶段二，也不在本地角色卡选择表中提供自动导入。

阶段一由用户向浏览器助手主动发起，阶段二由用户点击“发布已选”主动确认。仅打开页面、刷新列表或勾选项目不构成执行浏览器操作的授权；点击该按钮才构成授权。

## 能力边界

部署端 AIBAR 本身不能唤起浏览器 worker，也不能自行打开或控制 Chrome。本机控制台在用户点击“开始同步”或“发布已选”时，使用本机 Codex CLI 启动一条 `--ephemeral` 单次 Worker；进程完成或阻塞后退出，不存在 heartbeat 轮询。若 Codex CLI、桌面认证或 Chrome 扩展不可用，请求保留在本地服务并显示失败/阻塞状态，等待用户再次明确操作。AIBAR 负责接受短期卡体链接、服务器端解析、可信哈希去重和公共作品发布。

同步阶段不向 AIBAR 传输 manifest。第二阶段把 Discord 页面返回的短期卡体附件链接交给 AIBAR 手动入口，使用现有 CSRF 和管理员会话完成导入；链接使用后立即丢弃，不写入本地任务状态、仓库或聊天。

浏览器助手只能使用 Chrome 中现有的登录会话进行可见页面操作。禁止读取、复制、记录、上传或转交 Discord 用户 token、Cookie、Authorization 请求头或其他会话凭据；禁止使用用户 token 调 Discord API；禁止 self-bot；禁止通过开发者工具或脚本提取浏览器认证信息。Discord 凭据不得进入 manifest、AIBAR 设置、日志或聊天内容。

## 支持的资源

当前自动发布支持 `.png`、`.json`、`.yaml`/`.yml`、`.charx`、`.byaf`，匹配时不区分大小写。压缩包、APK 与普通图片仍不进入自动发布请求。

以下资源标记为不支持，不得尝试安装或执行：

- 通用 `.zip` 压缩包
- `.app` 应用
- 浏览器扩展、SillyTavern 扩展或其他扩展包
- 可执行文件、安装器以及无法确认类型的附件

`.charx` 和 `.byaf` 虽可能使用容器格式，但它们是 SillyTavern 已明确支持的角色卡格式；只有缺少明确 `.charx` 或 `.byaf` 扩展名的通用压缩包才归入不支持。

网页应用必须提供公网 HTTPS 入口，禁止 URL 凭据、自定义端口、localhost、`.local`、环回、链路本地和 RFC 1918 私网地址。网页应用不会获得 AIBAR Cookie、CSRF token 或模型密钥。具体桥接协议见 [`aibar-web-app-bridge.md`](./aibar-web-app-bridge.md)。

## Manifest schema

manifest 是 UTF-8 JSON 对象。版本 1 的固定字段如下：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `version` | number | 必须为整数 `1` |
| `guildId` | string | 必须为 `1380075940285124724` |
| `channelId` | string | 必须为三个固定来源栏目之一 |
| `channelName` | string | 必须是对应来源栏目显示名 |
| `syncedAt` | string | ISO 8601 时间戳 |
| `timezone` | string | 必须为 `Asia/Shanghai` |
| `period` | string | `today`、`previous-day` 或 `rolling-24h` |
| `sort` | string | `reactions` 或 `activity` |
| `filters` | object，可选 | Discord 标签条件；旧清单省略时按 `{ "tags": [], "tagMatch": "any" }` |
| `cards` | array | 候选卡数组 |

`filters` 字段如下：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `tags` | string[] | 最多 64 个 Discord 可见标签；空数组表示全部标签 |
| `tagMatch` | string | `any`（匹配部分）或 `all`（全部匹配） |

每个 `cards[]` 对象包含：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | Discord snowflake；本次候选的稳定 ID |
| `threadId` | string | Discord thread snowflake |
| `title` | string | 帖子标题 |
| `authorName` | string | 页面显示的作者名，不包含登录凭据 |
| `sourceUrl` | string | `https://discord.com/channels/<guild>/<thread>[/<message>]` |
| `previewUrl` | string，可选 | 只能是 Discord CDN 的 `/attachments/` URL |
| `tags` | string[] | 标签；没有标签时为空数组 |
| `publishedAt` | string，可选 | ISO 8601 时间戳 |
| `lastActiveAt` | string，可选 | ISO 8601 时间戳 |
| `reactionCount` | number | 非负整数 |
| `replyCount` | number | 非负整数 |
| `resource` | object | 资源状态，结构见下表 |

`resource` 固定字段如下：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `availability` | string | `ready`、`browser` 或 `unsupported` |
| `kind` | string，可选 | `character-card` 或 `web-app`；省略时按 `character-card` 兼容旧清单 |
| `fileName` | string，可选 | 页面中识别到的原始文件名 |
| `note` | string，可选 | 缺失、需浏览器定位或不支持的原因 |
| `launchUrl` | string，可选 | `web-app` 必填；公网 HTTPS 应用入口 |
| `runtime` | string，可选 | `standalone` 或 `aibar-bridge`；网页应用默认 `standalone` |
| `bridgeVersion` | number，可选 | `aibar-bridge` 必须为整数 `1` |
| `permissions` | string[]，可选 | `generation`、`storage`；`standalone` 必须为空 |

资源状态含义：

- `ready`：已确认存在受支持的附件，第二阶段可由 Chrome 下载并提交。
- `browser`：同步阶段只能确认帖子，第二阶段需要在已登录 Chrome 中进一步定位受支持附件。
- `unsupported`：只找到不支持的资源，AIBAR 必须禁用勾选和导入。

资源类型含义：

- `character-card`：沿用角色卡导入流程，支持 `ready`、`browser`、`unsupported`。
- `web-app`：只允许 `availability: "ready"`，不显示角色卡复选框，也不会进入导入请求。
- `runtime: "standalone"`：在跨域 sandbox 中独立运行，不连接 AIBAR 模型或存档。
- `runtime: "aibar-bridge"`：在无同源权限的 sandbox 中运行，通过版本化 `postMessage` 协议使用已授权能力。

第一阶段不要求下载文件，因此 manifest 不包含可信的 SHA-256。哈希必须在第二阶段下载完成后从文件原始字节计算，不能根据文件名、URL、预览图或 Discord 元数据推测。

### 示例

```json
{
  "version": 1,
  "guildId": "1380075940285124724",
  "channelId": "1478612237869519021",
  "channelName": "今日热门角色卡",
  "syncedAt": "2026-07-31T15:19:04Z",
    "timezone": "Asia/Shanghai",
    "period": "today",
    "sort": "reactions",
    "filters": {
      "tags": [],
      "tagMatch": "any"
    },
  "cards": [
    {
      "id": "1479000000000000001",
      "threadId": "1479000000000000001",
      "title": "示例角色卡",
      "authorName": "ExampleAuthor",
      "sourceUrl": "https://discord.com/channels/1380075940285124724/1479000000000000001",
      "previewUrl": "https://cdn.discordapp.com/attachments/1479000000000000001/1479000000000000002/preview.png",
      "tags": ["中文", "剧情"],
      "publishedAt": "2026-07-31T03:20:00Z",
      "lastActiveAt": "2026-07-31T12:45:00Z",
      "reactionCount": 42,
      "replyCount": 8,
      "resource": {
        "availability": "ready",
        "kind": "character-card",
        "fileName": "example-character.charx",
        "note": "第二阶段从帖子附件下载"
      }
    },
    {
      "id": "1479000000000000010",
      "threadId": "1479000000000000010",
      "title": "仅提供扩展包的示例",
      "authorName": "ExampleAuthor2",
      "sourceUrl": "https://discord.com/channels/1380075940285124724/1479000000000000010",
      "tags": [],
      "reactionCount": 7,
      "replyCount": 1,
      "resource": {
        "availability": "unsupported",
        "kind": "character-card",
        "fileName": "example-extension.zip",
        "note": "通用 ZIP 或扩展包不支持导入"
      }
    },
    {
      "id": "1479000000000000020",
      "threadId": "1479000000000000020",
      "title": "示例独立网页应用",
      "authorName": "ExampleAppAuthor",
      "sourceUrl": "https://discord.com/channels/1380075940285124724/1479000000000000020",
      "tags": ["网页应用"],
      "publishedAt": "2026-07-31T05:10:00Z",
      "lastActiveAt": "2026-07-31T13:20:00Z",
      "reactionCount": 18,
      "replyCount": 3,
      "resource": {
        "availability": "ready",
        "kind": "web-app",
        "launchUrl": "https://example-app.example/",
        "runtime": "standalone",
        "permissions": [],
        "note": "隔离运行，不连接 AIBAR 模型或存档"
      }
    }
  ]
}
```

## 本地选择与结果状态

manifest 只描述同步结果。用户选择和导入结果保存在 `discord-import-service/data/state.json` 的对应 job 中，不写入浏览器 `localStorage`：

- `importRequest.cardIds`：用户点击“发布已选”时确认的卡 ID。
- `pending`：请求已保存，等待 worker。
- `importing`：worker 正在取得卡体链接并调用 AIBAR 公共发布入口。
- `imported`：兼容状态名；表示角色卡已发布为公共作品或已关联公共区重复作品。
- `failed`：本次下载、解析或公共发布失败，记录明确原因。
- `skipped`：没有任何受支持卡体、资源不支持或存在不可继续的外部条件。

任务只有在所有请求项都进入 `imported`、`failed` 或 `skipped` 后才能标记 `workflowStatus: complete`。短期 CDN URL、帖子密码和浏览器凭据不得写入任何这些字段。
