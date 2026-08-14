#!/usr/bin/env bash
#
# 一键本地开发脚本：准备并同时启动 SillyTavern 后端（:8001，后台）
# 和 AIBAR 前端 Vite dev server（:5173，前台）。
# 幂等设计——重复执行只补缺失的部分，不会重复安装或改坏已有配置。

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
st_dir="$repo_root/SillyTavern"
web_dir="$repo_root/web"

# 1. 子模块必须先初始化：SillyTavern 是 git submodule，
#    未初始化时目录里没有 package.json，后续所有步骤都无从谈起。
if [[ ! -f "$st_dir/package.json" ]]; then
    echo "SillyTavern 子模块尚未初始化，请先运行：" >&2
    echo "  git submodule update --init --recursive" >&2
    exit 1
fi

# 2. 后端依赖：ST 的 .npmrc 默认 ignore-scripts=true（不执行依赖安装脚本），
#    因此 npm install 后必须定向编译 better-sqlite3 原生模块，
#    否则 AIBAR 社区功能启动即报 bindings 错误。
if [[ ! -d "$st_dir/node_modules" ]]; then
    echo "==> 安装 SillyTavern 依赖"
    (cd "$st_dir" && npm install && npm rebuild better-sqlite3 --ignore-scripts=false)
fi

# 3. 本机配置：config.yaml 被 ST 的 .gitignore 排除，首次使用需从默认模板复制。
if [[ ! -f "$st_dir/config.yaml" ]]; then
    echo "==> 从 default/config.yaml 生成 SillyTavern/config.yaml"
    cp "$st_dir/default/config.yaml" "$st_dir/config.yaml"
fi

# 4. 端口对齐：AIBAR dev 代理（web/.env.development 的 VITE_ST_BACKEND）默认指向 8001，
#    而 ST 默认 config 是 8000。把 8000 幂等改成 8001；已经是 8001 则跳过。
if grep -qE '^port: 8000$' "$st_dir/config.yaml"; then
    echo "==> 把 config.yaml 的 port: 8000 改为 8001"
    # 用临时文件而非 sed -i，避免 GNU/BSD sed 的 -i 语法差异
    tmp_config="$(mktemp)"
    sed 's/^port: 8000$/port: 8001/' "$st_dir/config.yaml" > "$tmp_config"
    mv "$tmp_config" "$st_dir/config.yaml"
fi

# 5. 前端依赖
if [[ ! -d "$web_dir/node_modules" ]]; then
    echo "==> 安装 web 依赖"
    (cd "$web_dir" && npm install)
fi

# 6. 启动：ST 放后台（日志重定向到 /tmp，不污染仓库工作区），
#    Vite 占前台以便直接看到编译输出；Ctrl-C 时 trap 负责清理后台 ST 进程。
st_log="/tmp/aibar-sillytavern-dev.log"
echo "==> 启动 SillyTavern（后台，日志：$st_log）"
(cd "$st_dir" && exec npm start) >"$st_log" 2>&1 &
st_pid=$!

cleanup() {
    # kill 整个后台任务；进程可能已自行退出，所以容忍失败
    kill "$st_pid" 2>/dev/null || true
    wait "$st_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> 启动 AIBAR 前端 dev server（前台，Ctrl-C 同时停止前后端）"
cd "$web_dir"
npm run dev
