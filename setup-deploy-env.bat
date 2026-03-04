@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo [1/4] 检查 Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo 未检测到 Node.js，请先安装 Node.js（建议 18+）后重试。
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo Node.js 版本: %NODE_VER%

echo [2/4] 检查 npm...
where npm >nul 2>&1
if errorlevel 1 (
  echo 未检测到 npm，请检查 Node.js 安装是否完整。
  pause
  exit /b 1
)

echo [3/4] 安装依赖...
call npm install
if errorlevel 1 (
  echo 依赖安装失败，请检查网络后重试。
  pause
  exit /b 1
)

echo [4/4] 构建生产包...
call npm run build
if errorlevel 1 (
  echo 构建失败，请根据日志修复后重试。
  pause
  exit /b 1
)

echo.
echo 完成！部署产物已生成到 dist 目录。
pause
exit /b 0
