---
description: 同步 Discord 热门角色卡并完成 AIBAR 导入（浏览器协作流程）
---

按仓库内的两份文档执行 Discord 热门资源同步与导入，你就是文档中所说的“浏览器助手”：

1. 先完整读 `docs/discord-hot-import-runbook.md`（操作步骤）和 `docs/discord-browser-import.md`（manifest schema 与安全契约），再开始任何浏览器操作。
2. 默认任务：刷新 Discord 热门资源，至少同步 100 项；等待用户在 AIBAR 页面勾选并点击“导入已选”后，完成所有下载、导入、网页应用分类和失败重试，直到失败数归零或每项都有明确的不可处理原因。用户在 $ARGUMENTS 中给出其他要求时以用户要求为准。
3. 只使用用户已登录的 Chrome 做可见页面操作。严禁读取或记录 Cookie、token、Authorization 头、localStorage 等会话凭据；严禁调用 Discord 私有 API 或 self-bot；帖内密码只能临时用于对应下载，不得输出或保存。
4. 完成后按 runbook 第 9 节的模板输出报告。
