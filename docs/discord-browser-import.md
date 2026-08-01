# Discord 浏览器协作导入契约

本文定义 AIBAR 与 Codex 通过用户已登录的 Chrome 协作导入 Discord 角色卡的版本 1 契约。用户只需在对话中发起一次同步；随后在 AIBAR 点击“导入已选”，即可授权仍在运行的同一个 Codex 任务继续下载和导入。这不是后台同步服务，也不是 AIBAR 对 Codex 或浏览器的远程控制接口。

## 固定来源

- Discord guild：`1380075940285124724`
- Discord channel：`1478612237869519021`
- 日期时区：`Asia/Shanghai`

Codex 只能从上述固定 guild/channel 构建此流程的 manifest。manifest 中出现其他 guild/channel 时，AIBAR 必须拒绝载入。

## 双阶段流程

### 阶段一：同步候选列表

1. 用户在 Codex 对话中主动说：`同步 Discord 今日热门`。
2. Codex 使用用户已经登录的 Chrome 打开固定 guild/channel，读取当日候选帖子及其公开可见的标题、作者、时间、热度、标签、预览和资源提示。
3. Codex 按本文 schema 生成 manifest，并通过 AIBAR 的 Discord 导入面板将 manifest 载入 AIBAR。
4. AIBAR 校验 manifest、展示候选角色卡并保存勾选状态。此阶段不导入角色卡。

`period: "today"` 表示 `Asia/Shanghai` 自然日；`period: "rolling-24h"` 表示同步时刻之前连续 24 小时。`sort: "reactions"` 按反应数排序，`sort: "activity"` 按最近活跃度排序。

### 阶段二：导入已选资源

1. 用户在 AIBAR 面板勾选需要的角色卡。
2. 用户点击面板中的“导入已选”。该点击写入持久化导入请求，并明确授权当前仍在运行的 Codex 任务执行后续浏览器操作。
3. Codex 保持同步任务运行并等待该请求；观察到请求后，读取其中仍被勾选且尚未成功导入的项目，不要求用户再回对话发送命令。
4. Codex 使用已登录的 Chrome 打开这些项目的 `sourceUrl`，只下载本文列出的受支持文件。
5. Codex 计算下载文件原始字节的 SHA-256，通过 AIBAR 面板提交文件并逐项触发角色卡导入。
6. AIBAR 显示每项结果。单项失败不得回滚已经成功的其他项目，也不得把已成功导入角色但后续故事生成失败的项目重新当作未导入角色卡。

阶段一由用户在 Codex 对话中主动发起，阶段二由用户点击“导入已选”主动确认。仅打开页面、刷新列表或勾选项目不构成执行浏览器操作的授权；点击该按钮才构成授权。

## 能力边界

AIBAR 不能唤起已经结束的 Codex 任务，也不能自行打开或控制 Chrome。一次完整流程中，Codex 必须在同步列表后保持同一任务运行并等待“导入已选”请求；如果该任务已经结束，网页按钮无法重新唤醒它，用户需要重新发起同步。AIBAR 负责载入 manifest、保存勾选和导入请求、接收通过面板提交的文件并展示结果。

同步阶段可由 Codex 直接把 JSON 填入面板，不依赖本地文件权限。第二阶段优先把 Discord 页面返回的短期 CDN 附件链接交给 AIBAR；AIBAR 只接受通过固定 Discord CDN 校验且扩展名受支持的链接，并以 `credentials: omit` 获取卡体，再执行同一套大小、哈希和导入校验。若改用本地文件输入框，ChatGPT 浏览器扩展必须在 `chrome://extensions` 的扩展详情中开启“允许访问文件网址（Allow access to file URLs）”。两种方式都不需要用户逐项选择文件，也不得读取 Cookie、用户 token 或其他认证信息。

Codex 只能使用 Chrome 中现有的登录会话进行可见页面操作。禁止读取、复制、记录、上传或转交 Discord 用户 token、Cookie、Authorization 请求头或其他会话凭据；禁止使用用户 token 调 Discord API；禁止 self-bot；禁止通过开发者工具或脚本提取浏览器认证信息。Discord 凭据不得进入 manifest、AIBAR 设置、日志或聊天内容。

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
| `fileName` | string，可选 | 页面中识别到的原始文件名 |
| `note` | string，可选 | 缺失、需浏览器定位或不支持的原因 |

资源状态含义：

- `ready`：已确认存在受支持的附件，第二阶段可由 Chrome 下载并提交。
- `browser`：同步阶段只能确认帖子，第二阶段需要在已登录 Chrome 中进一步定位受支持附件。
- `unsupported`：只找到不支持的资源，AIBAR 必须禁用勾选和导入。

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
        "fileName": "example-extension.zip",
        "note": "通用 ZIP 或扩展包不支持导入"
      }
    }
  ]
}
```

## 选择队列与状态

manifest 只描述同步结果，不保存用户选择和导入结果。AIBAR 在本地队列中维护这些运行状态：

- `ready`：可以勾选并等待第二阶段。
- `importing`：Codex 正通过面板处理该项。
- `imported`：角色卡已经成功导入。
- `unsupported`：资源类型不支持。
- `failed`：本次下载或导入失败，可在用户再次点击“导入已选”后重试。

载入更新后的 manifest 时，AIBAR 应保留同一 `id` 的 `selected`、`imported`、`failed` 和已导入去重记录；遗留的 `importing` 必须恢复为 `ready` 或 `unsupported`，不得假定中断前已经成功。

### 账号隔离与存储键

队列只保存在当前浏览器的 `localStorage`，并按当前登录的 AIBAR 账号隔离。Discord 导入面板根节点通过 `data-discord-import-queue-storage-key` 暴露本次会话应使用的完整键；协作中的 Codex 必须读取这个属性，不能使用固定的全局键，也不能读写其他账号的队列。

键格式为 `aibar.discord-import.<guildId>.<channelId>.v1.<encodedHandle>`，其中账号部分使用 `encodeURIComponent`。旧版本不带账号后缀的键归属无法确认，AIBAR 会直接删除且不会迁移到当前账号。退出登录或切换账号后，原账号队列不会显示在新账号中。

## 去重规则

第二阶段对每个实际下载的受支持文件计算小写十六进制 SHA-256，并构造：

```text
dedupeKey = threadId + ":" + sha256
```

AIBAR 在成功导入后保存该 `dedupeKey`。后续出现相同 `threadId` 和相同文件 SHA-256 时必须跳过导入，并显示“已导入”。只有下载或导入全部成功后才能登记去重键；失败、取消和不支持项目不能登记。

同一 thread 的文件内容变化会产生新的 SHA-256，视为可导入的新版本。同一文件出现在不同 thread 时，因为 `threadId` 不同，不按本契约判为重复。哈希基于下载文件原始字节，任何预览转换、解压或内容重写都必须发生在计算原始哈希之后。
