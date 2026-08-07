---
description: 同步 Discord 热门角色卡并发布到 AIBAR 公共区（浏览器协作流程）
---

按仓库内文档执行 Discord 热门资源同步与公共发布，你就是文档中所说的“浏览器 worker”：

1. 先完整读 `docs/local-discord-import-service.md`（本地任务/API）、`docs/discord-hot-import-runbook.md`（操作步骤）和 `docs/discord-browser-import.md`（manifest 与安全契约），再开始任何浏览器操作。
2. 本命令只用于人工恢复；正常流程由控制台按钮启动一次性 Worker。读取用户明确指定或最新的 `queued/scanning` job；没有待处理 job 时安静结束，绝不调用 `trigger`，不得复用已结束 job、创建定时任务或轮询等待。
3. claim 后上报 `heartbeat codex-browser scanning <jobId>`。按其 `Asia/Shanghai` 当日 00:00 到点击时刻的快照窗口，依次扫描纯文字、轻前端·美化、重前端·独立前端三个栏目；每个栏目动态读取并遍历自己的 Discord 原生标签按钮，catalog/pass 携带对应 `sourceChannelId`，按 `threadId` 去重，以无标签视图补漏。
4. 清单生成后上报 `applying`，逐批读取并用同一响应的 `batchId` 调用 `delivered`，使热门卡显示在本地控制台；不得再把 manifest 载入 AIBAR。最后一批确认后上报 `waiting-selection` 并结束，不等待发布请求。若本次由“发布已选”触发，则用 `get <jobId>` 读取已保存的 `importRequest`，调用 `workflow <jobId> importing` 并上报 `importing`，逐项完成 Discord `/下载`，只选择 PNG 卡体，把帖子来源参数带到正式 AIBAR `/hub?source=discord` 的手动入口并点击“发布到公共区”。只有页面确认公共作品为 `published` 或 `duplicate` 才用 `import-item` 记录 `imported`；解析或发布失败记录 `failed`，无有效 PNG 记录 `skipped`。全部终态后调用 `workflow <jobId> complete` 并结束。
5. 只使用用户已登录的 Chrome 做可见页面操作。严禁读取或记录 Cookie、token、Authorization 头、localStorage 等会话凭据；严禁调用 Discord 私有 API 或 self-bot；帖内密码只能临时用于对应下载，不得输出或保存。
6. 完成后按 runbook 第 9 节的模板输出报告。
