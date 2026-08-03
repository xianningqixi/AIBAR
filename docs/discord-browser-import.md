# Discord 浏览器协作导入契约

实际同步、下载、重试和验收步骤见 [`discord-hot-import-runbook.md`](./discord-hot-import-runbook.md)。本文只定义数据与安全契约。

本文定义 AIBAR 与“浏览器助手”通过用户已登录的 Chrome 协作同步 Discord 角色卡与网页应用的版本 1 契约。浏览器助手指任何能在用户已登录的 Chrome 中执行可见页面操作的协作方：可以是 AI 编码代理（如 Claude Code，通过 `/discord-import` 命令执行；历史上也用过 Codex），也可以是用户本人手动操作——契约不绑定任何特定工具。管理员载入清单后，候选项同步到服务端导入批次；角色卡经服务端下载、校验和原文件归档后，先进入管理员私人资料库供 SillyTavern 解析，再自动发布为社区作品。普通用户仍只走私人资料库导入。网页应用只进入隔离启动流程，不会被当成角色卡下载或导入。这不是后台爬虫，也不是 AIBAR 对浏览器助手或浏览器的远程控制接口。

## 固定来源

- Discord guild：`1380075940285124724`
- Discord channel：`1478612237869519021`
- 日期时区：`Asia/Shanghai`

浏览器助手只能从上述固定 guild/channel 构建此流程的 manifest。manifest 中出现其他 guild/channel 时，AIBAR 必须拒绝载入。

## 双阶段流程

### 阶段一：同步候选列表

1. 用户向浏览器助手主动发起同步，例如在 Claude Code 中执行 `/discord-import` 或直接说：`同步 Discord 今日热门`。
2. 浏览器助手使用用户已经登录的 Chrome 打开固定 guild/channel，读取当日候选帖子及其公开可见的标题、作者、时间、热度、标签、预览和资源提示，并区分角色卡与网页应用。
3. 浏览器助手按本文 schema 生成 manifest，并通过 AIBAR 的 Discord 导入面板将 manifest 载入 AIBAR。用户手动操作时，可自行整理 manifest JSON 并粘贴到面板。
4. AIBAR 校验 manifest、展示候选资源并保存角色卡勾选状态。管理员载入的清单同时登记到服务端导入批次；此阶段不下载角色卡或运行网页应用。

`period: "today"` 表示 `Asia/Shanghai` 自然日；`period: "rolling-24h"` 表示同步时刻之前连续 24 小时。`sort: "reactions"` 按反应数排序，`sort: "activity"` 按最近活跃度排序。

### 阶段二：导入已选资源

1. 用户在 AIBAR 面板勾选需要的角色卡。
2. 用户点击面板中的“导入已选”。该点击写入持久化导入请求，并明确授权当前仍在运行的浏览器助手任务执行后续浏览器操作。
3. 浏览器助手保持同步任务运行并等待该请求；观察到请求后，读取其中仍被勾选且尚未成功导入的项目，不要求用户再回对话发送命令。
4. 浏览器助手使用已登录的 Chrome 打开这些项目的 `sourceUrl`，只下载本文列出的受支持文件。用户手动操作时，可逐项把短期 CDN 链接粘贴进对应行的“接收链接”，或使用本地文件上传。
5. AIBAR 服务端接收短期 CDN URL 或上传文件，按原始字节计算 SHA-256，并以内容寻址方式归档原文件；浏览器不作为可信哈希来源。
6. SillyTavern 解析角色卡并写入管理员私人资料库，随后把规范化角色快照发布为社区作品。相同 thread 的新内容生成新版本，全局相同原文件哈希关联已有作品而不重复发布。
7. AIBAR 显示每项结果和入库作品入口。单项失败不得回滚已经成功的其他项目，也不得把已成功导入角色但后续社区发布或故事生成失败的项目重新当作未导入角色卡；失败项可复用已导入角色继续重试发布。

网页应用不进入阶段二。用户点击网页应用条目的“启动应用”后，会先看到来源、运行方式与权限确认，再进入 AIBAR 的隔离运行页。`standalone` 应用不获得任何 AIBAR 权限；`aibar-bridge` 应用只能调用清单中声明且用户确认过的桥接能力。

阶段一由用户向浏览器助手主动发起，阶段二由用户点击“导入已选”主动确认。仅打开页面、刷新列表或勾选项目不构成执行浏览器操作的授权；点击该按钮才构成授权。

## 能力边界

AIBAR 不能唤起已经结束的浏览器助手任务，也不能自行打开或控制 Chrome。一次完整流程中，浏览器助手必须在同步列表后保持同一任务运行并等待“导入已选”请求；如果该任务已经结束，网页按钮无法重新唤醒它，用户需要重新发起同步（或改为手动逐项提交）。AIBAR 负责载入 manifest、保存勾选和导入请求、登记管理员服务端批次、接收卡体、归档原文件并展示结果。

同步阶段可由浏览器助手直接把 JSON 填入面板，不依赖本地文件权限。第二阶段优先把 Discord 页面返回的短期 CDN 附件链接交给 AIBAR；服务端只接受通过固定 Discord CDN 校验且扩展名受支持的链接，以无凭据请求获取卡体，并执行统一的大小、哈希、归档和导入校验。Discord 卡体大小上限为 64 MB，足以覆盖带大量内嵌资源的真实角色卡，同时保留服务端的显式内存预算。若改用本地文件输入框且助手通过浏览器扩展操作 Chrome，该扩展必须在 `chrome://extensions` 的扩展详情中开启“允许访问文件网址（Allow access to file URLs）”。两种方式都不需要用户逐项选择文件，也不得读取 Cookie、用户 token 或其他认证信息。

浏览器助手只能使用 Chrome 中现有的登录会话进行可见页面操作。禁止读取、复制、记录、上传或转交 Discord 用户 token、Cookie、Authorization 请求头或其他会话凭据；禁止使用用户 token 调 Discord API；禁止 self-bot；禁止通过开发者工具或脚本提取浏览器认证信息。Discord 凭据不得进入 manifest、AIBAR 设置、日志或聊天内容。

## 支持的资源

支持直接导入的扩展名如下，匹配时不区分大小写：

- `.png`
- `.json`
- `.yaml`
- `.yml`
- `.charx`
- `.byaf`

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
| `channelId` | string | 必须为 `1478612237869519021` |
| `channelName` | string | Discord 栏目显示名 |
| `syncedAt` | string | ISO 8601 时间戳 |
| `timezone` | string | 必须为 `Asia/Shanghai` |
| `period` | string | `today` 或 `rolling-24h` |
| `sort` | string | `reactions` 或 `activity` |
| `cards` | array | 候选卡数组 |

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

## 服务端存储

管理员清单及处理状态写入 `DATA_ROOT/_aibar/community.sqlite`：

- `discord_import_batches` 保存原始 manifest、同步时间、请求管理员和批次状态。
- `discord_import_items` 保存每项 Discord 来源、处理状态、服务端 SHA-256、原文件路径以及关联的社区作品/版本。
- 原始卡体按 SHA-256 存入 `DATA_ROOT/_aibar/imports/discord/sha256/<前两位>/<sha256>.<ext>`，落盘后设为只读。
- 社区规范化快照继续使用 `DATA_ROOT/_aibar/works/`；数据库事务把作品版本和导入项状态一并提交。

只有管理员能调用服务端 Discord 导入接口。manifest、来源字段和服务端哈希是发布时的权威依据，浏览器提交的标题、作者或哈希不能覆盖它们。

## 选择队列与状态

manifest 只描述同步结果，不保存用户选择和导入结果。AIBAR 在本地队列中维护这些运行状态：

- `ready`：可以勾选并等待第二阶段。
- `importing`：浏览器助手正通过面板处理该项。
- `imported`：角色卡已经成功导入。
- `unsupported`：资源类型不支持。
- `failed`：本次下载或导入失败，可在用户再次点击“导入已选”后重试。

载入更新后的 manifest 时，AIBAR 应保留同一 `id` 的 `selected`、`imported`、`failed` 和已导入去重记录；遗留的 `importing` 必须恢复为 `ready` 或 `unsupported`，不得假定中断前已经成功。

### 账号隔离与存储键

浏览器交互队列保存在当前浏览器的 `localStorage`，并按当前登录的 AIBAR 账号隔离。管理员另有服务端批次作为可恢复的权威处理记录；重新打开页面时会合并最新批次状态，但选择和浏览器授权请求仍只留在本地。Discord 导入面板根节点通过 `data-discord-import-queue-storage-key` 暴露本次会话应使用的完整键；协作中的浏览器助手必须读取这个属性，不能使用固定的全局键，也不能读写其他账号的队列。

键格式为 `aibar.discord-import.<guildId>.<channelId>.v1.<encodedHandle>`，其中账号部分使用 `encodeURIComponent`。旧版本不带账号后缀的键归属无法确认，AIBAR 会直接删除且不会迁移到当前账号。退出登录或切换账号后，原账号队列不会显示在新账号中。

## 去重规则

第二阶段对每个实际下载的受支持文件计算小写十六进制 SHA-256，并构造：

```text
dedupeKey = threadId + ":" + sha256
```

AIBAR 在成功导入后保存该 `dedupeKey`。后续出现相同 `threadId` 和相同文件 SHA-256 时必须跳过私人库重复写入，并显示“已导入”。只有下载或导入全部成功后才能登记本地去重键；失败、取消和不支持项目不能登记。

服务端以原始文件 SHA-256 做全局去重：同一 thread 的内容变化发布到该 thread 已关联作品的新版本；不同 thread 出现完全相同的文件时，导入项标记为 `duplicate` 并关联已有作品，不再复制社区版本。哈希基于下载文件原始字节，任何预览转换、解压或内容重写都必须发生在计算原始哈希之后。
