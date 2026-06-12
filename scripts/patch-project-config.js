/**
 * 编译后修补 project.config.json，排除源码目录
 * 用法：node scripts/patch-project-config.js
 */
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../dist/build/mp-weixin/project.config.json');

if (!fs.existsSync(configPath)) {
  console.error('project.config.json not found, run build first');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

config.packOptions = {
  ignore: [
    { type: 'folder', value: 'node_modules' },
    { type: 'folder', value: '.claude' },
    { type: 'folder', value: '.gstack' },
    { type: 'folder', value: '.hbuilderx' },
    { type: 'folder', value: 'src' },
    { type: 'folder', value: 'uniCloud-aliyun' },
    { type: 'folder', value: 'uniCloud-alipay' },
    { type: 'folder', value: 'scripts' },
    { type: 'folder', value: 'server' },
    { type: 'folder', value: 'skills' },
    { type: 'folder', value: 'docs' },
    { type: 'folder', value: 'seed' },
    { type: 'folder', value: 'babyplace-remote' },
    { type: 'folder', value: 'test-images' },
    { type: 'folder', value: 'public' },
    { type: 'folder', value: 'ai' },
    { type: 'folder', value: 'dist' },
    { type: 'file', value: 'package.json' },
    { type: 'file', value: 'pnpm-lock.yaml' },
    { type: 'file', value: 'pnpm-workspace.yaml' },
    { type: 'file', value: 'vite.config.js' },
    { type: 'file', value: 'vite.config.js.bak' },
    { type: 'file', value: 'vite.config.js.disabled' },
    { type: 'file', value: 'shims-uni.d.ts' },
    { type: 'file', value: 'index.html' },
    { type: 'file', value: 'CLAUDE.md' },
    { type: 'file', value: 'AGENTS.md' },
    { type: 'file', value: 'AI_RULES.md' },
    { type: 'file', value: 'DESIGN.md' },
    { type: 'file', value: '.env' },
    { type: 'file', value: '.npmrc' },
    { type: 'file', value: 'private.wx0097f2621a6cb4b1.key' },
  ],
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('patched project.config.json with packOptions.ignore');
