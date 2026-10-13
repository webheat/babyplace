#!/usr/bin/env bash
# nightly-geo.sh — 遛娃宝地 · 历史地理可视化的夜间批处理
#
# 由 crontab 调度（一次性，2026-10-14 01:30）。**只产出，不发布**：
# 不发公众号、不发视频号、不碰知识库、不改小程序 pages.json。
#
# 跑完看 /opt/babyplace/out/logs/nightly-*.log
set -uo pipefail

# cron 的 PATH 只有 /usr/bin:/bin：nvm 的 node 和 pyenv 的 python3 都不可见。
# 这里显式锁定到会话里那套（edge-tts 等依赖装在 pyenv 3.11 下，系统 /usr/bin/python3
# 是 3.10，缺依赖）。找不到再退回系统 python3——MiniMax 兜底只用标准库，3.10 能跑。
export PATH="/root/.nvm/versions/node/v22.22.1/bin:/root/.pyenv/shims:$PATH"
PY=/root/.pyenv/shims/python3
[ -x "$PY" ] || PY=/usr/bin/python3
export PY

ROOT=/opt/babyplace
WEB=$ROOT/web
PIPE=$ROOT/pipeline
OUT=$ROOT/out
LOGS=$OUT/logs
LOG=$LOGS/nightly-$(date +%Y%m%d-%H%M%S).log
mkdir -p "$LOGS" "$OUT/bake" "$OUT/shots"

# Chrome 必须显式指定：这台机器有 131/150 两个版本，bake 脚本默认挑到的
# 可能与 swiftshader 不兼容，表现为瓦片 idle 超时而不是明确报错。
export CHROME=${CHROME:-/root/.cache/puppeteer/chrome-headless-shell/linux-150.0.7871.24/chrome-headless-shell-linux64/chrome-headless-shell}
[ -x "$CHROME" ] || { echo "[FATAL] Chrome 不可用: $CHROME" | tee -a "$LOG"; exit 2; }

say() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }
die() { say "[FATAL] $*"; exit 1; }

# web/ 不在 pnpm workspace 内，依赖是独立的 npm 树。换机器或清理后需 npm i，
# 否则 bake（puppeteer-core）和构建（vite）都会在跑到一半时崩。这里提前判掉。
for dep in "$WEB/node_modules/puppeteer-core" "$WEB/node_modules/.bin/vite"; do
  [ -e "$dep" ] || { say "[FATAL] web 依赖缺失: $dep — 先跑 (cd $WEB && npm i)"; exit 2; }
done

say "=== 夜间批处理开始 ==="

# ── 1. 数据链：POI → 脚本 → 配音 ────────────────────────────────
say "[1/4] 重建 POI（GCJ-02→WGS-84 反算）"
"$PY" -I "$PIPE/poi_extract.py" 2>&1 | tee -a "$LOG" || die "poi_extract 失败"

say "[2/4] 编译脚本（lore → episode）"
"$PY" -I "$PIPE/script_gen.py" 2>&1 | tee -a "$LOG" || die "script_gen 失败"

say "[3/4] 合成配音（edge-tts 优先，MiniMax 兜底）"
# 已有音频会自动跳过（断点续跑），所以重跑不重复消耗额度
"$PY" -I "$PIPE/tts_episode.py" 2>&1 | tee -a "$LOG" || die "tts_episode 失败"

# ── 2. 矢量底图 bake（并行） ────────────────────────────────────
# episode.camera 的每一段都是一组真实镜头参数，直接喂给 bake 脚本。
# 只有 globe→mercator 之前的段能烘焙（bake 脚本固定 mercator）。
#
# 为什么并行：这台机器没有 NVIDIA GPU，bake 走 SwiftShader 软件光栅化，
# 实测约 9s/帧。串行 3 段 ≈ 45 分钟；12 核里每段只占 1-2 核，30G 内存
# 每段约 500M，并行 3 段压到 ~15 分钟。
#
# 为什么 nice -n 15：同机还跑着 new-api / video-gateway / remotion-worker。
# 降优先级让它们在撞车时优先，而不是被 bake 抢。
say "[4/4] 烘焙矢量底图镜头（并行）"
EID=$("$PY" -I -c "import json;d=json.load(open('$WEB/public/data/episode.json'));e=d[0] if isinstance(d,list) else d;print(e['episode_id'])")
CENTER=$("$PY" -I -c "import json;d=json.load(open('$WEB/public/data/episode.json'));e=d[0] if isinstance(d,list) else d;c=e['camera'][-1]['center'];print(f'{c[0]},{c[1]}')")

BAKE=$WEB/scripts/bake-basemap.mjs
BAKE_TIMEOUT=${BAKE_TIMEOUT:-900}
rm -f "$LOGS/bake-"*.ok "$LOGS/bake-"*.fail

# FPS=20 而非 30：软件渲染下帧率不影响视觉连续性（烘焙产物本来就是慢推镜头），
# 但直接省掉 1/3 的时间。60 帧 @ 9s ≈ 9 分钟/段。
bake_one() {
  local tag=$1 z0=$2 z1=$3 pitch=$4 bear=$5
  local name="${EID}-${tag}"
  say "  ▸ bake $name (zoom $z0→$z1 pitch $pitch) pid=$$"
  (
    cd "$OUT/bake" && \
    nice -n 15 env NAME="$name" STYLE=vector VECTOR_STYLE=dark \
      CENTER="$CENTER" ZSTART="$z0" ZEND="$z1" PITCH="$pitch" BEARING="$bear" \
      FPS=20 DUR=3 HOLD=0.75 \
      timeout "$BAKE_TIMEOUT" node "$BAKE"
  ) > "$LOGS/bake-$tag.log" 2>&1
  if [ $? -eq 0 ] && [ -f "$OUT/bake/$name.mp4" ]; then
    touch "$LOGS/bake-$tag.ok"
    say "    ✓ $name.mp4 ($(( $(stat -c%s "$OUT/bake/$name.mp4") / 1024 ))KB)"
  else
    touch "$LOGS/bake-$tag.fail"
    say "    ✗ $name 失败，详见 $LOGS/bake-$tag.log"
  fi
}

# 三段一次全起。每段独立日志，失败互不影响。
bake_one wide  10.5 12.5  0  -8 &
bake_one close 14.0 15.6 52 -12 &
bake_one era   14.8 16.4 56   0 &
wait

N=$(ls "$LOGS"/bake-*.ok 2>/dev/null | wc -l)
FAIL=$(ls "$LOGS"/bake-*.fail 2>/dev/null | wc -l)

# ── 3. H5 构建 ─────────────────────────────────────────────────
say "附加：构建 H5 静态产物"
# 必须先跑 inline_episode.py：episode-inline.js 是 gitignore 的生成物，
# 新克隆的机器上没有它，页面会因拿不到 window.__EPISODE__ 而白屏。
"$PY" -I "$PIPE/inline_episode.py" 2>&1 | tee -a "$LOG" || say "  ⚠ 内联 episode 失败"
( cd "$WEB" && "$WEB/node_modules/.bin/vite" build ) >> "$LOG" 2>&1 || say "  ⚠ 构建失败，见日志"
[ -f "$WEB/dist/index.html" ] && say "  ✓ dist/index.html 就绪"

# ── 4. 汇总 ────────────────────────────────────────────────────
say "=== 结束：bake 成功 $N / 失败 $FAIL ==="
say "产物：$OUT/bake/*.mp4  ·  页面：$WEB/dist/"
say "未做（需人工）：Remotion 出片、H5 部署、内容审核、发布"
[ "$N" -gt 0 ]