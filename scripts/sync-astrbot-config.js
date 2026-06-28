#!/usr/bin/env node
/**
 * 从 .env 读取 AstrBot 配置，同步到 uni-config-center/astrbot/config.json
 * 用法: node scripts/sync-astrbot-config.js
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const configPath = path.join(rootDir, 'uniCloud-alipay/cloudfunctions/common/uni-config-center/astrbot/config.json');

// 读取 .env
function loadEnv(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    vars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return vars;
}

const env = loadEnv(envPath);
const baseUrl = env.ASTBOT_BASE_URL || '';
const apiKey = env.ASTBOT_API_KEY || '';

if (!baseUrl) {
  console.warn('⚠ ASTBOT_BASE_URL is empty in .env');
}

const config = {
  baseUrl,
  apiKey,
  timeout: 120000,
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
console.log(`✅ Synced astrbot config to ${configPath}`);
console.log(`   baseUrl: ${baseUrl || '(empty)'}`);
console.log(`   apiKey: ${apiKey ? '***' + apiKey.slice(-4) : '(empty)'}`);
