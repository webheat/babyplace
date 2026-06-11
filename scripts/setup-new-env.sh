#!/bin/bash
# 新环境部署脚本
# 用法: 解压后执行 bash babyplace/setup-new-env.sh

set -e

echo "========================================="
echo "  babyplace 新环境部署"
echo "========================================="

# 检查当前目录
if [ ! -f "package.json" ]; then
  echo "❌ 请在 /opt/HBuilderX/babyplace/ 目录下执行"
  exit 1
fi

# 1. 检查 Node.js
echo "[1/4] 检查 Node.js..."
if ! command -v node &>/dev/null; then
  echo "❌ 未安装 Node.js，请先安装 v18+"
  exit 1
fi
echo "  Node: $(node --version)"

# 2. 安装 pnpm（如果没有）
echo "[2/4] 检查 pnpm..."
if ! command -v pnpm &>/dev/null; then
  echo "  安装 pnpm..."
  npm i -g pnpm
fi
echo "  pnpm: $(pnpm --version)"

# 3. 安装依赖
echo "[3/4] 安装项目依赖..."
pnpm install

# 4. 安装 miniprogram-ci
echo "[4/4] 检查 miniprogram-ci..."
if ! command -v miniprogram-ci &>/dev/null; then
  echo "  安装 miniprogram-ci..."
  npm i -g miniprogram-ci
fi
echo "  miniprogram-ci: $(npx miniprogram-ci --version)"

# 5. 检查密钥
KEY="/opt/vk-hw/private.wx0097f2621a6cb4b1.key"
if [ ! -f "$KEY" ]; then
  echo ""
  echo "⚠️  上传密钥不存在: $KEY"
  echo "   请确认密钥文件已解压到正确位置"
else
  echo "  密钥: ✅"
fi

# 6. 验证编译
echo ""
echo "========================================="
echo "  测试编译..."
echo "========================================="
pnpm run build:mp-weixin

if [ -f "dist/build/mp-weixin/app.json" ]; then
  echo ""
  echo "✅ 部署完成！"
  echo ""
  echo "上传命令: ./scripts/upload-weixin.sh '版本描述'"
else
  echo "❌ 编译失败"
fi
