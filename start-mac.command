#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "[1/3] 检查 Node.js..."
if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js，请先安装 Node.js（建议 18+）后重试。"
  read -r -n 1 -s -p "按任意键退出..."
  echo
  exit 1
fi

echo "Node.js 版本: $(node -v)"

echo "[2/3] 检查 npm..."
if ! command -v npm >/dev/null 2>&1; then
  echo "未检测到 npm，请检查 Node.js 安装是否完整。"
  read -r -n 1 -s -p "按任意键退出..."
  echo
  exit 1
fi

echo "[3/3] 安装依赖并启动开发服务..."
npm install
echo "正在启动开发服务（按 Ctrl+C 停止）..."
exec npm run dev
