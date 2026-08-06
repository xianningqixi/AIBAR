---
description: 同步 Discord 热门角色卡并完成 AIBAR 导入（浏览器协作流程）
---

按仓库内文档执行 Discord 热门资源同步与导入，你就是文档中所说的“浏览器 worker”：

1. 先完整读 `docs/local-discord-import-service.md`（本地任务/API）、`docs/discord-hot-import-runbook.md`（操作步骤）和 `docs/discord-browser-import.md`（manifest 与安全契约），再开始任何浏览器操作。
2. 默认任务：确认本机 `127.0.0.1:4317` 子服务可用，读取并 claim 最新 `queued/scanning` job；没有应执行的 job 时只报告状态，不自行制造重复批次。用户在 $ARGUMENTS 中明确要求手动回填时才 trigger 指定日期或标签条件。
3. 执行 job 时，按其 `Asia/Shanghai` 自然日窗口收集全部新帖，动态读取并遍历 Discord 原生标签筛选按钮，逐 pass 上报本地服务，按 `threadId` 去重，以无标签视图补漏；从本地服务获取校验后的 `period: "previous-day"` manifest。
4. 同步清单成功应用后调用 `delivered`，再等待用户在 AIBAR 页面勾选并点击“导入已选”，完成所有下载、导入、网页应用分类和失败重试，直到失败数归零或每项都有明确的不可处理原因。定时启动不替代这一步明确授权。
5. 只使用用户已登录的 Chrome 做可见页面操作。严禁读取或记录 Cookie、token、Authorization 头、localStorage 等会话凭据；严禁调用 Discord 私有 API 或 self-bot；帖内密码只能临时用于对应下载，不得输出或保存。
6. 完成后按 runbook 第 9 节的模板输出报告。
