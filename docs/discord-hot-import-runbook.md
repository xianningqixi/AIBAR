# Discord 热门角色卡同步与公共发布 Runbook

本文是 AIBAR Discord 热门角色卡的可执行操作手册，面向能在用户已登录的 Chrome 中执行可见页面操作的浏览器 worker。热门榜、多选和逐项结果都位于本机 `127.0.0.1:4317` 控制台；远端 AIBAR 手动卡体入口（支持 PNG / JSON / CHARX / BYAF / YAML）负责把所选卡发布为公共社区作品。

## 快速启动

先打开 `http://127.0.0.1:4317/` 并点击“开始同步”。该点击会创建 job 并立即启动一次性 Codex Worker；同步完成后 Worker 退出，不做 heartbeat 轮询。只有需要人工恢复失败 job 时才使用下面的命令：

```text
按 docs/discord-hot-import-runbook.md 消费我刚在本地控制台创建的任务：依次遍历三个固定栏目及各自的 Discord 原生标签筛选，收集 Asia/Shanghai 今日 00:00 到点击时刻的全部角色卡候选并去重；把合并列表发布到本地控制台，等待我勾选并点击“发布已选”后，只通过远端 AIBAR 手动卡体入口逐项发布到公共区，直到每项都有明确结果。
```

如果清单已经存在，只需要继续发布：

```text
按 docs/discord-hot-import-runbook.md 处理本地控制台里刚刚授权的 Discord 公共发布请求，并重试所有失败项。
```

## 固定边界

- 工作目录：AIBAR 仓库根目录。
- Discord guild：`1380075940285124724`。
- Discord forums：
  - 纯文字：`1478601254312874024`
  - 轻前端·美化：`1478601664838766723`
  - 重前端·独立前端：`1478612237869519021`
- AIBAR 页面：本地开发为 `http://127.0.0.1:5173/#/hub?source=discord`；本机控制台的一次性发布 Worker 固定使用 `AIBAR_DISCORD_AIBAR_URL`，当前正式目标为 `https://172.86.116.166/aibar/#/hub?source=discord`，不得回退到本地 Vite 或本地 SillyTavern。
- 前端代理目标（仅本地开发）：`http://127.0.0.1:8001`。
- 手动同步范围：热度榜 Top `limit`（默认 100，控制台可设 10–300），不限帖子发布日期；每个栏目按“最近活跃”收集最多 `limit` 个候选，服务端全局按回应数截取。刷新时重新触发一个新任务。
- 默认标签：不读取标签目录、不逐标签遍历；卡片自带标签随 pass 上报，控制台据此筛选。
- 自动发布支持 `.png`、`.json`、`.yaml`/`.yml`、`.charx`、`.byaf` 卡体文件；压缩包、APK、安装器和普通图片在本地榜单标记为不可自动处理。
- Discord 卡体上限：64 MB。通用 ZIP/RAR、APK、安装器、扩展包和普通图片不属于角色卡。

只使用用户已经登录的 Chrome 可见页面。禁止读取或记录 Cookie、token、Authorization header、浏览器密码、localStorage 或其他会话存储；禁止调用 Discord 私有 API 或使用 self-bot。密码只能从帖子可见内容中临时读取并立即用于对应下载，不得写入仓库、聊天、日志或长期变量文件。

## 1. 启动与预检

目标是已部署的正式环境时，仍在管理员电脑启动第 2 步的本地子服务，只跳过第 3、4 步的本地 AIBAR 后端和前端，直接打开正式入口并以管理员登录；其余预检相同。

1. 检查主仓库和 `SillyTavern/` 子模块的工作树，保留已有本地改动。
2. 启动本地手动编排服务：

   ```bash
   cd discord-import-service
   npm start
   ```

   在独立终端保持进程运行。确认 `http://127.0.0.1:4317/health` 可用。服务启动本身不会创建任务或 Worker；只有用户点击控制台“开始同步”才建单并启动一条临时 Worker。
3. 启动后端：

   ```bash
   cd SillyTavern
   npm start -- --port 8001 --browserLaunchEnabled false
   ```

4. 启动前端：

   ```bash
   cd web
   npm run dev -- --host 127.0.0.1
   ```

5. 使用 Browser/Chrome 能力连接现有登录会话，打开 AIBAR 和三个固定 Discord forum。不要用无登录状态的独立 Playwright 替代用户 Chrome。
6. 确认 AIBAR 能渲染、`/csrf-token` 可用、页面控制台没有相关应用错误。

## 2. 热度榜采集

每次由用户主动触发，目标是全栏目热度 Top `limit`（默认 100，见 `get` 输出）；不限帖子发布日期。

1. 打开三个固定 forum（可在最多 3 个独立标签页并行处理，每栏目固定一个标签页），确认页面不是登录页或成人内容确认页。需要用户本人确认或重新登录时停止本次运行并明确报告，不要绕过。
2. 每个栏目打开“排序 & 查看”，选择“最近活跃”，保持无标签视图。预览可保持列表或图库，但采集不能依赖截图。
3. 不需要读取标签目录，也不需要逐标签遍历：从上往下滚动收集帖子，每个栏目最多收集 `limit` 个、列表见底提前结束。
4. 从真实帖子卡片收集标题、作者、帖子 URL、可见标签、回应数、回复数、发布时间和当前可用预览。排除置顶规则帖和原始消息已删除且无法定位资源的帖子。
5. 每收集 30-50 个帖子上报一次 `pass`（`view` 为 `{"tags":[],"tagMatch":"any","sort":"recent-activity"}`，携带该栏目 `sourceChannelId`，按 `threadId` 去重；同一栏目多次 pass 合法），并紧跟 `progress <jobId> scanning <全局已收集数> <limit> <栏目名>` 上报进度，控制台会渲染进度条。
6. 每项先标记为以下一种资源：
   - `character-card`：帖子可能提供受支持的角色卡体。
   - `web-app`：帖子提供可直接运行的公网 HTTPS 页面。
   - `unsupported`：只有压缩包、客户端、APK、源码、文档、截图或普通图片。
7. 三个栏目全部收集完调用 `complete`：服务端全局按回应数降序排序并截取前 `limit` 张，按来源栏目生成 `period: "hot-top"` 的版本 1 manifest。结构、安全约束和字段定义以 [`discord-browser-import.md`](./discord-browser-import.md) 为准。
8. 逐批读取本地服务的 manifest 信封，并使用每批原 `batchId` 调用 `delivered`。不得把 manifest 载入 AIBAR 主项目。
9. 打开本地控制台，确认榜单数量接近目标值、标签筛选可用、来源帖链接和可选状态正确。

### 手动运行约束

- 只有用户点击“开始同步”才新建手动 job；worker 每次只 claim 已有任务，不得调用 trigger 或复用旧榜单冒充刷新结果。
- 完整榜单发布到本地控制台后，任务进入 `waiting-selection`，同步 Worker 立即退出。下载和公共发布仍需用户点击“发布已选”授权，该点击会启动新的单次发布 Worker。
- Chrome 不在线、Discord 退出登录、成人内容确认未由用户完成、AIBAR 管理员会话失效时，本次任务应失败并通知，不得生成空清单覆盖上一批。

## 3. 等待用户授权

勾选本身不授权浏览器下载。只有用户在本地控制台点击“发布已选”并出现“已提交 N 项”后，才进入下载和公共发布阶段。

关键控件：

- 选择：本地控制台候选表中的角色卡复选框。
- 授权：本地控制台 `import-selected-button`。
- AIBAR 单项卡体输入：`discord-png-import-input`（testid 沿用旧名）；单项发布按钮：`discord-png-import-submit`。
- AIBAR 批量发布（首选）：JSON 输入 `discord-batch-input`、提交按钮 `discord-batch-submit`、总状态 `discord-batch-status`（`data-batch-state=done` 表示全部处理完）、逐项结果 `discord-batch-item`（携带 `data-card-id`/`data-publish-status`/`data-work-id`）。

“发布已选”请求成功保存后，本地服务立即启动一次性发布 Worker。它只对该 job 执行 `get <jobId>`，把 workflow 更新为 `importing`；每项通过 `import-item` 写回结果，全部终态后更新为 `complete` 并退出。异常退出时服务把 job 置为可恢复的 `blocked`，不会在后台持续重试或轮询。用户处理完登录、成人内容确认或资源口令后，点击控制台“继续发布”会用同一份已持久化请求再启动一条一次性发布 Worker，只处理 `pending`、`importing` 和 `failed` 的剩余项。

## 4. Discord 下载流程

对每个已授权角色卡逐项处理，单项失败不能回滚其他成功项。可同时在最多 3 个标签页处理不同帖子的 `/下载`（帖内交互与等待不因并行缩短）；本阶段只收集短期 CDN 链接与来源信息，不逐项打开 AIBAR。

1. 打开帖子的 thread URL，不要为了执行 `/下载` 追加 message ID。
2. 等待消息输入框真实出现。Discord 慢加载时至少再等待 3 秒后重试，不能第一次找不到控件就判为“无资源”。
3. 在消息框输入 `/下载`。
4. 等待 Slash command 列表，点击第一个准确匹配“`/下载 获取本帖资源的下载列表`”的命令。
5. 按 Enter 提交，等待 `Odysseia-protect` 返回“版本选择”。
6. 点击“请选择一个公开/受保护的版本进行下载...”按钮，再读取版本选项。
7. 按 PNG > JSON > CHARX > BYAF > YAML 的优先级选择最新卡体文件。不要机械点击最后一项：最后一项可能是 ZIP/RAR 或安装包；主项目入口只接受这五种卡体格式。
8. 若出现密码表单，从帖子可见正文或剧透中临时读取对应密码，填写并提交。不要输出或保存密码。
9. 获取“点击这里下载”的短期 Discord CDN URL，并立即交给 AIBAR；签名链接会过期。
10. 为每个取得链接的项记录 `url`、`cardId`、`threadId`、`channelId`、`sourceUrl`、`title`、`authorName`、`tags` 八个字段。
11. 全部收集完成后，打开 `AIBAR_DISCORD_AIBAR_URL` 指定的正式服务器地址（不得使用 localhost、127.0.0.1、本地 Vite 或本地 SillyTavern），在“批量发布”卡片把条目组装成 JSON 数组粘贴进 `discord-batch-input`，点击 `discord-batch-submit`。服务器直接从 Discord CDN 抓取附件（内部 3 并发）并逐项导入发布；页面按每批 10 项自动分批。等待 `discord-batch-status` 的 `data-batch-state="done"`，逐项读取 `discord-batch-item` 的 `data-publish-status` 写回结果；随后立即丢弃全部短期 URL。批量入口异常时才退回单项入口（hash 查询参数带来源字段，逐项粘贴）。

### 锁帖或迁移帖

如果原帖已锁定且没有消息输入框：

1. 检查楼主在帖尾提供的可见 Discord 跳转链接和“去这里拿更新”等说明。
2. 点击迁移后的新帖，在新帖执行 `/下载`。
3. 导入结果仍关联原清单项；记录“已追踪迁移帖”，但不要持久化短期下载 URL。

### 慢加载重试

对 `no-textbox`、`command-unavailable`、`no-version-picker`、`no-version-options` 至少执行一次延长等待后的完整重试：

- 页面加载：先等约 3 秒，缺控件再等约 3 秒。
- Slash command：列表未出现时再等约 1 秒。
- Bot 响应：提交后至少等约 2 秒。
- 版本下拉：打开后等待选项渲染，再按扩展名选择。

只有重复重试和帖子直接附件检查都失败后，才能归为不支持。

## 5. 角色卡有效性与公共发布

CDN 返回 `200`、文件名后缀正确或图片能显示，都不能证明它是有效角色卡。

有效性与公开状态由远端 AIBAR/SillyTavern 链路最终确认：

1. 主项目入口只接受 Discord CDN `/attachments/` 下以 `.png`、`.json`、`.yaml`/`.yml`、`.charx` 或 `.byaf` 结尾的链接。
2. SillyTavern 解析角色卡元数据（PNG 支持 tEXt/zTXt/iTXt 内的 chara/ccv3，容忍坏 CRC）。响应体 `{error:true}` 时必须标记失败，不能当成功。
3. 私人角色写入仅用于 SillyTavern 解析，不能作为任务成功；随后必须调用管理员专用公共发布接口。
4. 服务器从解析后的 PNG 原始字节计算 SHA-256；相同哈希关联现有公共作品，同一 Discord thread 的新内容发布为该作品新版本。
5. 只有公共接口返回 `published` 或 `duplicate` 且作品可见时，worker 才用 `import-item <jobId> <cardId> imported <结果>` 写回成功；解析或公共发布失败写 `failed`，没有任何受支持卡体写 `skipped`。

完成一项后，等待按钮退出“发布中”且成功或错误提示稳定，再处理下一项。

## 6. 不支持的资源与网页应用

以下内容不进入自动导入：

- ZIP/RAR、APK、安装器和扩展包（含加密压缩包内的卡体，需要用户手动处理）。
- 普通预览图、封面、截图、说明文本和诊断文件。
- 帖子自带网页应用或源码仓库。

若用户选中的帖子最终没有任何受支持卡体文件，记录 `skipped` 和明确原因，不把其他文件伪装成卡体。

## 7. 归一化最终状态

完成所有请求项后，从 `get <jobId>` 核对 `importItems`：

- 已发布或已关联公共区重复作品的角色卡为 `imported`。
- 没有任何受支持卡体或明确不支持的资源为 `skipped`。
- 已执行但失败的项目为 `failed`，并保留具体错误。
- 不允许留下 `pending` 或 `importing`。

总数必须守恒：

```text
请求总数 = imported + failed + skipped
```

## 8. 验收

代码改动后执行：

```bash
cd web
npm run check

cd ../discord-import-service
npm run check

cd ..
git diff --check
```

浏览器验收必须包含：

- AIBAR 页面身份和目标 URL 正确。
- 本地热门列表非空，没有框架错误覆盖层。
- 所有授权项都有逐项结果。
- 所有成功角色卡都显示“已发布”，并能通过结果入口打开公共作品。
- 主项目 Discord 页面只显示手动卡体公共发布入口。
- 控制台没有相关应用错误。
- 截图能证明本地榜单结果和主项目 PNG 入口。

## 9. 完成报告模板

```text
同步总数：N
请求发布：N
公共作品：新发布 N，重复关联 N
跳过：N（无受支持卡体/只有安装包或源码）
最终失败：N
验证：后端、服务和前端质量门禁、diff check、浏览器公共发布链路、控制台
未验证：明确列出外部副作用、其他浏览器或未覆盖视口
```
