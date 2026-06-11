#!/bin/bash
# babyplace 微信小程序一键构建+混包+上传脚本
# 用法: ./upload-weixin.sh [版本描述]

set -e

PROJECT_DIR="/opt/HBuilderX/babyplace"
DIST_DIR="$PROJECT_DIR/dist/build/mp-weixin"
APPID="wx0097f2621a6cb4b1"
PRIVATE_KEY="/opt/vk-hw/private.wx0097f2621a6cb4b1.key"
MINIPROGRAM_CI="/opt/node-v22.13.1-linux-x64/lib/node_modules/miniprogram-ci"
AI_DEMO="/opt/ob-vault/13.相关网络资源/微信AI用法/ai-mode-demo"

VERSION=$(date +%Y.%m%d.%H%M)
DESC="${1:-自动上传 $(date +%Y-%m-%d %H:%M)}"

echo "========================================="
echo "  babyplace 微信小程序构建+混包+上传"
echo "========================================="
echo "版本号: $VERSION"
echo "描述: $DESC"
echo ""

# Step 1: 构建
echo "[1/5] 构建微信小程序..."
cd "$PROJECT_DIR"
pnpm run build:mp-weixin
if [ ! -f "$DIST_DIR/app.json" ]; then
  echo "❌ 构建失败"
  exit 1
fi
echo "✅ 构建完成"

# Step 2: 混包 - 复制 AI Skills + packageDetail
echo "[2/5] 混包 AI Skills..."
cp -r "$AI_DEMO/skills" "$DIST_DIR/skills"
cp -r "$AI_DEMO/packageDetail" "$DIST_DIR/packageDetail"
cp "$AI_DEMO/page-meta.json" "$DIST_DIR/page-meta.json"
mkdir -p "$DIST_DIR/pages/ai-home"
cp "$AI_DEMO/pages/home/home.js" "$DIST_DIR/pages/ai-home/ai-home.js"
cp "$AI_DEMO/pages/home/home.json" "$DIST_DIR/pages/ai-home/ai-home.json"
cp "$AI_DEMO/pages/home/home.wxml" "$DIST_DIR/pages/ai-home/ai-home.wxml"
cp "$AI_DEMO/pages/home/home.wxss" "$DIST_DIR/pages/ai-home/ai-home.wxss"
echo "✅ Skills + packageDetail 已复制"

# Step 3: 修改配置
echo "[3/5] 修改 app.json、app.js、首页..."
node -e "
const fs = require('fs');
const dist = '$DIST_DIR';

// === app.json ===
const appJson = JSON.parse(fs.readFileSync(dist + '/app.json', 'utf8'));
if (!appJson.pages.includes('pages/ai-home/ai-home')) appJson.pages.push('pages/ai-home/ai-home');
if (!appJson.subPackages) appJson.subPackages = [];
if (!appJson.subPackages.some(p => p.root === 'skills')) {
  appJson.subPackages.push({ root: 'skills', pages: [], independent: true });
}
if (!appJson.subPackages.some(p => p.root === 'packageDetail')) {
  appJson.subPackages.push({
    root: 'packageDetail', name: 'detail',
    pages: ['pages/more-drinks', 'pages/sku-picker', 'pages/address-edit'],
    independent: true, componentFramework: 'glass-easel', renderer: 'skyline'
  });
}
appJson.agent = {
  skills: [{ name: 'drink', description: 'AI 点单场景', path: 'skills/drink-skill' }],
  pageMetadata: 'page-meta.json'
};
if (!appJson.lazyCodeLoading) appJson.lazyCodeLoading = 'requiredComponents';
fs.writeFileSync(dist + '/app.json', JSON.stringify(appJson, null, 2));

// === page-meta.json ===
const pm = JSON.parse(fs.readFileSync(dist + '/page-meta.json', 'utf8'));
pm.pages[0].path = 'pages/ai-home/ai-home';
fs.writeFileSync(dist + '/page-meta.json', JSON.stringify(pm, null, 2));

// === app.js ===
let appJs = fs.readFileSync(dist + '/app.js', 'utf8');
if (!appJs.includes('drink-skill')) {
  appJs = appJs.replace(
    'console.log(\"App Launch\")',
    'console.log(\"App Launch\");try{require(\"./skills/drink-skill/index.js\");console.log(\"[App] AI Skills init OK\")}catch(e){console.error(\"[App] AI Skills init fail:\",e)}'
  );
  fs.writeFileSync(dist + '/app.js', appJs);
}

// === 首页加 AI 入口 ===
let indexWxml = fs.readFileSync(dist + '/pages/index/index.wxml', 'utf8');
if (!indexWxml.includes('ai-home')) {
  indexWxml = indexWxml.replace(
    /<\/view>$/,
    '<navigator url=\"/pages/ai-home/ai-home\" open-type=\"navigate\" style=\"position:fixed;bottom:120rpx;right:30rpx;z-index:999;width:110rpx;height:110rpx;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;box-shadow:0 6rpx 20rpx rgba(102,126,234,0.4);\"><text style=\"color:#fff;font-size:32rpx;font-weight:bold;\">AI</text></navigator></view>'
  );
  fs.writeFileSync(dist + '/pages/index/index.wxml', indexWxml);
}

console.log('✅ 配置已更新');
"

# Step 4: 上传
echo "[4/5] 上传到微信平台..."
node -e "
const ci = require('$MINIPROGRAM_CI');
const project = new ci.Project({
  appid: '$APPID',
  type: 'miniProgram',
  projectPath: '$DIST_DIR',
  privateKeyPath: '$PRIVATE_KEY',
  ignores: ['node_modules/**/*'],
});
ci.upload({
  project,
  version: '$VERSION',
  desc: '$DESC',
  setting: { es6: true, es7: true, minify: true, autoPrefixWXSS: true },
}).then(r => {
  console.log('✅ 上传成功！');
  (r.subPackageInfo||[]).forEach(p => console.log('  ', p.name, (p.size/1024).toFixed(0)+'KB'));
}).catch(e => {
  console.error('❌ 上传失败:', e);
  process.exit(1);
});
"

echo ""
echo "========================================="
echo "  完成！版本: $VERSION"
echo "  首页右下角有 AI 悬浮按钮"
echo "========================================="
