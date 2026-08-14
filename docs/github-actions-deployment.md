# GitHub Actions 自动部署

主仓库 `main` 每次收到 push（包括 PR 合入）后，`.github/workflows/ci.yml` 会先执行完整质量检查。只有 `verify` 全部通过，`deploy` 才会构建 AIBAR 前端、生成 SillyTavern release 包并发布到生产服务器。

生产地址：`https://aibar.peakstar88.store/aibar/`

## 信任边界

- GitHub 只持有专用 `aibar-deploy` SSH 私钥，不持有 root 密码。
- SSH 公钥使用 forced command，禁止端口转发和 PTY，只接受 SFTP 上传以及格式固定的 `deploy <release-id> <sha256>` 指令。
- `aibar-deploy` 只能通过 sudo 执行 root-owned `/usr/local/sbin/aibar-deploy-release`。
- 上传包先复制到 root-controlled staging，重新计算 SHA-256 后再以 `aibar` 身份解压和安装依赖。
- 生产配置和用户数据不进入 release 包，继续使用 `/opt/aibar/shared/config.yaml` 与 `/opt/aibar/data`。

## GitHub 配置

仓库 Actions secrets：

| Secret | 内容 |
| --- | --- |
| `AIBAR_DEPLOY_SSH_KEY` | 专用无口令 Ed25519 私钥 |
| `AIBAR_DEPLOY_KNOWN_HOSTS` | 从生产机本地公钥核验过的固定 SSH host key |

`production` environment 用于显示部署历史和生产 URL，不配置人工审批，因此通过测试的 `main` push 会自动发布。`workflow_dispatch` 可在 GitHub Actions 页面手动重跑同一流程，但只允许从 `main` 执行部署。

## 服务器文件

| 路径 | 用途 |
| --- | --- |
| `/usr/local/sbin/aibar-deploy-ssh` | forced-command SSH 入口 |
| `/usr/local/sbin/aibar-deploy-release` | 校验、备份、切换、回滚和健康检查 |
| `/etc/sudoers.d/aibar-deploy` | 仅放行固定部署脚本 |
| `/var/lib/aibar-deploy/incoming` | `aibar-deploy` 可写的上传目录 |
| `/var/lib/aibar-deploy/staging` | root-controlled 归档暂存目录 |
| `/opt/aibar/releases/<release-id>` | 不可变应用 release |
| `/opt/aibar/backups/<release-id>-predeploy` | 停服后生成的一致性数据与配置备份 |

仓库中的 `deploy/` 文件是服务器配置的唯一来源。更新它们时，需要先在服务器执行 `bash -n` / `visudo -cf`，再替换 root-owned 文件。

**部署拓扑约束：AIBAR 后端只能以单进程运行**（不要用 cluster、PM2 多实例或多副本水平扩容）。共享模型的限流器、每用户并发计数（`activeGenerationCounts`）与在途积分预留集合（`activeReservationIds`）都保存在进程内存里；多实例会让限流按实例数倍增，且 stale 预留清理会误释放其他实例在途请求的额度。SQLite（better-sqlite3 同步 API + WAL）也按单进程访问设计。

## 发布与回滚

部署顺序：

1. Actions 完成前端、Telegram companion 和 SillyTavern 检查。
2. Actions 从锁定的 SillyTavern 子模块提交构建 release 包并上传。
3. 服务器校验 release ID、文件所有者、大小与 SHA-256。
4. 以 `aibar` 身份解压，执行 `npm ci --omit=dev` 并验证 `better-sqlite3`。
5. 停止 `aibar.service`，检查社区 SQLite 完整性，备份完整 data 目录和共享配置。
6. 原子切换 `/opt/aibar/current`，启动服务并检查 `/csrf-token` 与 `/aibar/`。
7. Actions 再从公网检查 HTTPS 地址。

新 release 启动失败时，服务器会停止服务、从部署前备份恢复 data、把 `current` 切回上一 release，再启动并验证旧版本。失败 release 和变更后的 data 会留在服务器用于排障，不会静默删除。

## 日常检查

```bash
systemctl is-active aibar.service
systemctl show aibar.service -p NRestarts
readlink -f /opt/aibar/current
curl --fail --silent --show-error https://aibar.peakstar88.store/aibar/ >/dev/null
```

社区列表使用独立的 384x512 WebP 预览图，发布新角色或故事版本时会自动生成。历史版本会在首次访问封面时自动补生成；也可以在部署后主动预热全部版本：

```bash
sudo -u aibar npm --prefix /opt/aibar/current run backfill:aibar-previews -- --data-root /opt/aibar/data
```

Actions 运行日志记录 release ID、部署阶段和回滚结果，但不得打印私钥、密码、Cookie 或生产配置内容。
