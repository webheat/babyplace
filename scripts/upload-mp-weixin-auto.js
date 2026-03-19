const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, 'src', 'manifest.json');
const DIST_PROJECT_PATH = path.join(ROOT, 'dist', 'build', 'mp-weixin');
const DEFAULT_CLI_PATHS = [
  'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat',
  'C:\\Program Files\\Tencent\\微信web开发者工具\\cli.bat',
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function pickCliPath() {
  const customPath = process.env.WECHAT_DEVTOOLS_CLI;
  if (customPath && fs.existsSync(customPath)) return customPath;
  for (const cliPath of DEFAULT_CLI_PATHS) {
    if (fs.existsSync(cliPath)) return cliPath;
  }
  return '';
}

function readVersionName() {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const normalized = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    const parsed = JSON.parse(normalized);
    return String(parsed.versionName || '1.0.0').trim() || '1.0.0';
  } catch (error) {
    return '1.0.0';
  }
}

function createAutoVersion() {
  const baseVersion = readVersionName();
  const now = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  const suffix = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${baseVersion}.${suffix}`;
}

function createAutoDesc(version) {
  return `auto upload mp-weixin ${version}`;
}

function ensureDistExists() {
  if (!fs.existsSync(DIST_PROJECT_PATH)) {
    throw new Error(`dist not found: ${DIST_PROJECT_PATH}`);
  }
}

function shouldDeployCloudFunctions() {
  return process.env.SKIP_CLOUD_DEPLOY !== '1';
}

function main() {
  const cliPath = pickCliPath();
  if (!cliPath) {
    console.error('WeChat DevTools CLI not found. Set WECHAT_DEVTOOLS_CLI first.');
    process.exit(1);
  }

  const version = process.env.WECHAT_UPLOAD_VERSION || createAutoVersion();
  const desc = process.env.WECHAT_UPLOAD_DESC || createAutoDesc(version);

  if (shouldDeployCloudFunctions()) {
    console.log('[upload] deploy cloud functions');
    run('pnpm', ['run', 'deploy:cloud:functions']);
  } else {
    console.log('[upload] skip cloud function deploy');
  }

  console.log(`[upload] build mp-weixin`);
  run('pnpm', ['run', 'build:mp-weixin']);

  ensureDistExists();
  console.log(`[upload] cli: ${cliPath}`);
  console.log(`[upload] project: ${DIST_PROJECT_PATH}`);
  console.log(`[upload] version: ${version}`);
  console.log(`[upload] desc: ${desc}`);

  run(`"${cliPath}"`, [
    'upload',
    '--project',
    `"${DIST_PROJECT_PATH}"`,
    '--version',
    `"${version}"`,
    '--desc',
    `"${desc}"`,
  ]);
}

main();
