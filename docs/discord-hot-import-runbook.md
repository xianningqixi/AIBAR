# Discord 热门资源同步与导入 Runbook

本文是 AIBAR Discord 热门资源的可执行操作手册。任何新的 Codex 任务在执行“刷新热门榜”“导入已选”“重试失败项”或“支持帖子自带前端”之前，都应先读完本文和 [`discord-browser-import.md`](./discord-browser-import.md)。

## 快速启动

用户可以在新的 Codex 任务中直接说：

```text
按 docs/discord-hot-import-runbook.md 刷新 Discord 热门资源，至少同步 100 项；等待我在页面勾选后，完成所有下载、导入、网页应用分类和失败重试，直到失败数归零或每项都有明确的不可处理原因。
```

如果清单已经存在，只需要继续导入：

```text
按 docs/discord-hot-import-runbook.md 处理 AIBAR 页面里刚刚授权的 Discord 导入请求，并重试所有失败项。
```

## 固定边界

- 工作目录：AIBAR 仓库根目录。
- Discord guild：`1380075940285124724`。
- Discord forum channel：`1478612237869519021`。
- AIBAR 页面：`http://127.0.0.1:5173/#/hub?source=discord`。
- 前端代理目标：`http://127.0.0.1:8001`。
- 默认同步数量：100 项；用户要求更多时按用户数量执行。
- 角色卡支持：`.png`、`.json`、`.yaml`、`.yml`、`.charx`、`.byaf`。
- Discord 卡体上限：64 MB。通用 ZIP/RAR、APK、安装器、扩展包和普通图片不属于角色卡。

只使用用户已经登录的 Chrome 可见页面。禁止读取或记录 Cookie、token、Authorization header、浏览器密码、localStorage 或其他会话存储；禁止调用 Discord 私有 API 或使用 self-bot。密码只能从帖子可见内容中临时读取并立即用于对应下载，不得写入仓库、聊天、日志或长期变量文件。

## 1. 启动与预检

1. 检查主仓库和 `SillyTavern/` 子模块的工作树，保留已有本地改动。
2. 启动后端：

   ```bash
   cd SillyTavern
   npm start -- --port 8001 --browserLaunchEnabled false
   ```

3. 启动前端：

   ```bash
   cd web
   npm run dev -- --host 127.0.0.1
   ```

4. 使用 Browser/Chrome 能力连接现有登录会话，打开 AIBAR 和固定 Discord forum。不要用无登录状态的独立 Playwright 替代用户 Chrome。
5. 确认 AIBAR 能渲染、`/csrf-token` 可用、页面控制台没有相关应用错误。

## 2. 同步热门清单

1. 从固定 forum 的帖子卡片收集标题、作者、帖子 URL、标签、回应数、回复数、发布时间和当前可用预览。
2. 按用户要求排序；“热门”默认按回应数降序。至少收集 100 项，不用截图或搜索结果代替真实帖子。
3. 每项先标记为以下一种资源：
   - `character-card`：帖子可能提供受支持的角色卡体。
   - `web-app`：帖子提供可直接运行的公网 HTTPS 页面。
   - `unsupported`：只有压缩包、客户端、APK、源码、文档、截图或普通图片。
4. 生成版本 1 manifest。结构、安全约束和字段定义以 [`discord-browser-import.md`](./discord-browser-import.md) 为准。
5. 在 AIBAR 中点击“粘贴清单”，将 JSON 放入 `discord-manifest-json`，点击 `discord-manifest-apply`。不要通过读取或改写浏览器存储绕过页面。
6. 确认列表数量、排序、预览和来源帖链接正确。预览失败只能回退为“无预览/网页应用”，不能让整行崩溃。

## 3. 等待用户授权

勾选本身不授权浏览器下载。只有用户点击“导入已选”后，页面出现“等待浏览器自动导入 N 项”，才进入下载阶段。

关键控件：

- 选择：`discord-select-<cardId>`
- 授权：`discord-import-selected`
- 卡体 URL：`discord-card-url-<cardId>`
- 接收链接：`discord-import-url-<cardId>`
- 跳过：`discord-skip-<cardId>`

任务应保持运行并观察页面请求。若上一个 Codex 任务已结束，新的任务应重新打开 AIBAR，从可见页面重建待处理列表，不依赖上一个任务的临时 JavaScript 变量。

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
2. 前端计算 SHA-256，并以 `threadId:fileSha256` 去重。
3. SillyTavern 解析角色卡元数据。出现 `PNG metadata does not contain any character data.` 或响应体 `{error:true}` 时必须标记失败，不能当成功。
4. 成功导入后写入 Discord 来源标记。
5. 如果角色包含有效开场白，自动生成故事卡。
6. 同一卡体已存在时标记“已导入/已去重”，不重复写文件。

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
