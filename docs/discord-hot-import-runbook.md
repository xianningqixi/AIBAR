# Discord 热门资源同步与导入 Runbook

本文是 AIBAR Discord 热门资源的可执行操作手册，面向任何“浏览器助手”——即能在用户已登录的 Chrome 中执行可见页面操作的 AI 代理（如 Claude Code；历史上也用过 Codex）。助手在执行“刷新热门榜”“导入已选”“重试失败项”或“支持帖子自带前端”之前，都应先读完本文和 [`discord-browser-import.md`](./discord-browser-import.md)。没有助手时，用户也可以按本文流程手动操作：自行整理 manifest 粘贴进面板，再逐项粘贴 CDN 链接或上传本地文件。

## 快速启动

在 Claude Code 中执行 `/discord-import`，或向任意浏览器助手直接说：

```text
按 docs/discord-hot-import-runbook.md 执行 Discord T+1 同步：遍历 Discord 原生标签筛选，收集 Asia/Shanghai 前一自然日的全部候选并去重；等待我在页面勾选后，完成所有下载、导入、网页应用分类和失败重试，直到失败数归零或每项都有明确的不可处理原因。
```

如果清单已经存在，只需要继续导入：

```text
按 docs/discord-hot-import-runbook.md 处理 AIBAR 页面里刚刚授权的 Discord 导入请求，并重试所有失败项。
```

## 固定边界

- 工作目录：AIBAR 仓库根目录。
- Discord guild：`1380075940285124724`。
- Discord forum channel：`1478612237869519021`。
- AIBAR 页面：本地开发为 `http://127.0.0.1:5173/#/hub?source=discord`；目标是已部署的正式环境时，改用 `https://<服务器地址>/aibar/#/hub?source=discord`。
- 前端代理目标（仅本地开发）：`http://127.0.0.1:8001`。
- 默认同步数量：100 项；用户要求更多时按用户数量执行。
- T+1 同步范围：`Asia/Shanghai` 前一自然日 `[00:00, 24:00)` 的全部候选，不设 100 项下限；首次回填或热门榜刷新仍默认至少 100 项。
- 默认标签：不限制最终标签；采集时遍历所有可见标签按钮并以无标签视图补漏。
- 角色卡支持：`.png`、`.json`、`.yaml`、`.yml`、`.charx`、`.byaf`。
- Discord 卡体上限：64 MB。通用 ZIP/RAR、APK、安装器、扩展包和普通图片不属于角色卡。

只使用用户已经登录的 Chrome 可见页面。禁止读取或记录 Cookie、token、Authorization header、浏览器密码、localStorage 或其他会话存储；禁止调用 Discord 私有 API 或使用 self-bot。密码只能从帖子可见内容中临时读取并立即用于对应下载，不得写入仓库、聊天、日志或长期变量文件。

## 1. 启动与预检

目标是已部署的正式环境时，仍在管理员电脑启动第 2 步的本地子服务，只跳过第 3、4 步的本地 AIBAR 后端和前端，直接打开正式入口并以管理员登录；其余预检相同。

1. 检查主仓库和 `SillyTavern/` 子模块的工作树，保留已有本地改动。
2. T+1 自动化模式启动本地子服务：

   ```bash
   cd discord-import-service
   npm start
   ```

   在独立终端保持进程运行。确认 `http://127.0.0.1:4317/health` 可用，并按 [`local-discord-import-service.md`](./local-discord-import-service.md) claim 最新 job。手动一次性刷新可以跳过本地子服务。
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

5. 使用 Browser/Chrome 能力连接现有登录会话，打开 AIBAR 和固定 Discord forum。不要用无登录状态的独立 Playwright 替代用户 Chrome。
6. 确认 AIBAR 能渲染、`/csrf-token` 可用、页面控制台没有相关应用错误。

## 2. T+1 与标签筛选

每日自动化在 T+1 运行，采集 T 日 `Asia/Shanghai` 自然日内发布的帖子。不得用滚动 24 小时代替自然日；跨日边界以帖子绝对时间为准，Discord 的“15 小时前”等相对时间只用于初筛。

1. 打开固定 forum，确认页面不是登录页或成人内容确认页。需要用户本人确认或重新登录时停止本次运行并明确报告，不要绕过。
2. 打开“排序 & 查看”，选择“发帖日期”以发现 T 日新帖；需要刷新旧帖热度时才使用“最近活跃”。预览可保持列表或图库，但采集不能依赖截图。
3. 读取页面当前全部“按标签 <标签> 筛选”按钮，包括“查看所有标签”弹窗中的按钮。标签是动态配置，不能把某天读到的标签名永久硬编码为完整集合。
4. 最终不限制标签时，逐个点击所有可见标签，以“匹配部分”采集各视图并按 `threadId` 合并，再清除标签从无标签视图补漏。用户指定多个标签时一次选中全部标签，并按要求设置“匹配部分”或“全部匹配”。
5. 每次切换标签、匹配方式或排序后，等待帖子网格稳定；滚动到 T 日之前的第一项后停止该视图。跨视图重复帖子必须合并，保留最新可见计数和完整标签集合。
6. 从真实帖子卡片收集标题、作者、帖子 URL、标签、回应数、回复数、发布时间和当前可用预览。排除置顶规则帖、原始消息已删除且无法定位资源的帖子，以及不在 T 日边界内的帖子。
7. 按用户要求排序；T+1 默认按回应数降序。初次回填至少收集 100 项，T+1 则收集前一自然日全部项目。
8. 每项先标记为以下一种资源：
   - `character-card`：帖子可能提供受支持的角色卡体。
   - `web-app`：帖子提供可直接运行的公网 HTTPS 页面。
   - `unsupported`：只有压缩包、客户端、APK、源码、文档、截图或普通图片。
9. 生成版本 1 manifest。T+1 使用 `period: "previous-day"`；`filters` 记录最终标签约束，遍历全部标签但不限制最终结果时写 `{ "tags": [], "tagMatch": "any" }`。结构、安全约束和字段定义以 [`discord-browser-import.md`](./discord-browser-import.md) 为准。
10. 使用管理员账号在 AIBAR 中点击“粘贴清单”，将 JSON 放入 `discord-manifest-json`，点击 `discord-manifest-apply`。页面会同时创建或更新服务端导入批次；不要通过读取或改写浏览器存储绕过页面。
11. 确认列表数量、T+1 周期、标签条件、排序、预览和来源帖链接正确。预览失败只能回退为“无预览/网页应用”，不能让整行崩溃。

### 自动化运行约束

- 自动化只能唤醒浏览器协作任务，不能把 Discord 登录态搬到服务器或后台爬虫。
- 每次运行必须重新读取 Discord 当前可见标签按钮；新增、改名或删除的标签从当日开始生效。
- 清单成功应用到 AIBAR 后即完成 T+1 同步阶段。下载仍需用户点击“导入已选”授权，不能因为任务是定时启动就跳过第二阶段授权。
- Chrome 不在线、Discord 退出登录、成人内容确认未由用户完成、AIBAR 管理员会话失效时，本次自动化应失败并通知，不得生成空清单覆盖上一批。

## 3. 等待用户授权

勾选本身不授权浏览器下载。只有用户点击“导入已选”后，页面出现“等待浏览器自动导入 N 项”，才进入下载阶段。

关键控件：

- 选择：`discord-select-<cardId>`
- 授权：`discord-import-selected`
- 卡体 URL：`discord-card-url-<cardId>`
- 接收链接：`discord-import-url-<cardId>`
- 跳过：`discord-skip-<cardId>`

助手任务应保持运行并观察页面请求。若上一个助手任务已结束，新的任务应重新打开 AIBAR，从可见页面重建待处理列表，不依赖上一个任务的临时 JavaScript 变量。

## 4. Discord 下载流程

对每个已授权角色卡逐项处理，单项失败不能回滚其他成功项。

1. 打开帖子的 thread URL，不要为了执行 `/下载` 追加 message ID。
2. 等待消息输入框真实出现。Discord 慢加载时至少再等待 3 秒后重试，不能第一次找不到控件就判为“无资源”。
3. 在消息框输入 `/下载`。
4. 等待 Slash command 列表，点击第一个准确匹配“`/下载 获取本帖资源的下载列表`”的命令。
5. 按 Enter 提交，等待 `Odysseia-protect` 返回“版本选择”。
6. 点击“请选择一个公开/受保护的版本进行下载...”按钮，再读取版本选项。
7. 选择最新的受支持角色卡文件。不要机械点击最后一项：最后一项可能是 ZIP/RAR；必须按扩展名选择 PNG/JSON/YAML/CHARX/BYAF。
8. 若出现密码表单，从帖子可见正文或剧透中临时读取对应密码，填写并提交。不要输出或保存密码。
9. 获取“点击这里下载”的短期 Discord CDN URL，并立即交给 AIBAR；签名链接会过期。
10. 在 AIBAR 对应行填写 CDN URL，点击“接收链接”，等待该行结束后再处理下一行。

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

## 5. 角色卡有效性与导入

CDN 返回 `200`、文件名为 `.png` 或图片能显示，都不能证明它是 Tavern Card。

有效性由 AIBAR/SillyTavern 导入链路最终确认：

1. 后端代理只允许 Discord CDN、受支持扩展名、最多 3 次重定向、15 秒超时和 64 MB 上限。
2. 服务端按原始字节计算 SHA-256，将卡体归档到 `_aibar/imports/discord/sha256/`；前端只消费服务端返回的可信哈希。
3. SillyTavern 解析角色卡元数据。出现 `PNG metadata does not contain any character data.` 或响应体 `{error:true}` 时必须标记失败，不能当成功。
4. 成功导入私人库后写入 Discord 来源标记，并自动发布为社区作品；同一 thread 的新内容形成新版本，全局相同文件关联已有作品。
5. 如果角色包含有效开场白，自动生成故事卡。
6. 最终状态为“已入库”或“已去重”，并出现“查看入库作品”入口；社区发布失败时保留私人角色，重试时不得重复解析写入。

完成一项后，等待它的 URL 输入框消失且后续故事生成消息稳定，再处理下一项。否则全局导入锁仍在释放过程中，下一行可能暂时不可填写。

## 6. 网页应用分类

帖子自带前端不能走角色卡导入。只有满足以下全部条件才设为 `web-app`：

1. 有直接可运行的公网 HTTPS 入口。
2. URL 不含凭据、自定义端口、localhost、`.local`、环回或私网地址。
3. 浏览器直接打开后不是 404、部署不存在、连接关闭、文档页或“服务暂不可用”。
4. 优先选择实际应用首页；不能用 GitHub 仓库、release 页面、教程、网盘、APK、截图、CDN 图片或 API 子路径冒充入口。
5. 主域名只加载错误壳时，检查页面提供的官方备用域名并验证备用入口。

普通第三方前端使用：

```json
{
  "availability": "ready",
  "kind": "web-app",
  "launchUrl": "https://verified.example/",
  "runtime": "standalone",
  "permissions": [],
  "note": "已验证公开 HTTPS 入口；在 AIBAR 隔离页启动"
}
```

只有明确实现 [`aibar-web-app-bridge.md`](./aibar-web-app-bridge.md) 的应用才能设为 `aibar-bridge` 并声明 `generation`/`storage` 权限。不能根据标题或作者口头描述自动授予桥接权限。

应用清单写回后，至少完整测试一个代表性入口：

1. 点击“启动应用”。
2. 核对来源域名、运行方式和权限确认页。
3. 点击“允许并启动”。
4. 确认 sandbox iframe 内出现应用真实内容，而不是加载页、错误壳或空白页。
5. 检查 AIBAR 控制台；忽略已确认与应用无关的浏览器扩展噪声，相关应用错误必须处理。

## 7. 归一化最终状态

完成下载和网页入口验证后，重新应用纠正后的 manifest：

- 已成功或去重的角色卡保留 `imported`。
- 已验证入口的应用设为 `web-app` + `ready`。
- 已重试但没有有效卡体或可运行入口的项目设为 `character-card` + `unsupported`。
- 不允许留下可避免的 `failed` 状态。

总数必须守恒：

```text
总项目数 = 已导入角色卡 + 可启动网页应用 + 不支持项目 + 仍在处理项目
```

## 8. 验收

代码改动后执行：

```bash
cd web
npm run check

cd ../SillyTavern
npx eslint src/endpoints/aibar.js
node --check src/endpoints/aibar.js

cd ..
git diff --check
git -C SillyTavern diff --check
```

浏览器验收必须包含：

- AIBAR 页面身份和目标 URL 正确。
- 清单非空，没有框架错误覆盖层。
- 所有授权项都有逐项结果。
- 所有成功角色卡都显示“已入库”并能打开对应社区作品。
- 最终失败数为 0，或每个残留失败都有无法继续的外部原因。
- 至少一个网页应用通过“确认权限 -> 允许启动 -> iframe 真实内容”全流程。
- 控制台没有相关应用错误。
- 截图能证明最终计数、角色卡状态和网页应用入口。

## 9. 完成报告模板

```text
同步总数：N
原失败数：N
角色卡：新导入 N，重复去重 N，故事卡生成 N
网页应用：验证可启动 N
不支持：N（无有效卡体/只有安装包或源码/入口失效）
最终失败：N
验证：npm run check、后端 ESLint/语法、diff check、浏览器启动链路、控制台
未验证：明确列出外部副作用、其他浏览器或未覆盖视口
```
