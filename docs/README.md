# docs/

跨组件的契约、运维方案和历史资料。改动某个流程前先读对应文档。

| 文档 | 内容 | 读者 |
|---|---|---|
| [`server-deployment-plan.md`](./server-deployment-plan.md) | 生产服务器部署方案：目录布局、systemd、Nginx/HTTPS、证书续期、备份与回滚、Discord 数据存储边界 | 运维 / 部署执行者 |
| [`github-actions-deployment.md`](./github-actions-deployment.md) | GitHub Actions 自动发布：受限 SSH、Secrets、release 切换、健康检查与失败回滚 | 运维 / 部署执行者 |
| [`discord-hot-import-runbook.md`](./discord-hot-import-runbook.md) | Discord 热门角色卡同步与导入的可执行操作手册（浏览器助手或人工均可执行） | 浏览器助手 / 管理员 |
| [`discord-browser-import.md`](./discord-browser-import.md) | Discord 浏览器协作导入的版本 1 契约：manifest schema、双阶段授权、安全红线、去重规则 | 前后端开发 / 浏览器助手 |
| [`aibar-web-app-bridge.md`](./aibar-web-app-bridge.md) | 第三方网页应用在 AIBAR 隔离页运行的桥接协议 | 前端开发 / 应用作者 |
| [`PLAN.md`](./PLAN.md) | 原始实施/对照计划（中文，历史资料），解释设计取舍与旧 `simple-ui.js` 基线的差异 | 新成员了解背景 |

约定：新的跨组件契约或运维方案放本目录；单组件的说明放各自目录（如 `telegram-bot/README.md`）；本索引随文档增删同步更新。
