#!/usr/bin/env bash
# nightly-geo.sh — 遛娃宝地 · 历史地理可视化的夜间批处理
#
# 由 crontab 调度（一次性，2026-10-14 01:30）。**只产出，不发布**：
# 不发公众号、不发视频号、不碰知识库、不改小程序 pages.json。
#
# 跑完看 /opt/babyplace/out/logs/nightly-*.log
set -uo pipefail

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

say "=== 夜间批处理开始 ==="

# ── 1. 数据链：POI → 脚本 → 配音 ────────────────────────────────
say "[1/4] 重建 POI（GCJ-02→WGS-84 反算）"
python3 -I "$PIPE/poi_extract.py" 2>&1 | tee -a "$LOG" || die "poi_extract 失败"

say "[2/4] 编译脚本（lore → episode）"
python3 -I "$PIPE/script_gen.py" 2>&1 | tee -a "$LOG" || die "script_gen 失败"

say "[3/4] 合成配音（edge-tts 优先，MiniMax 兜底）"
# 已有音频会自动跳过（断点续跑），所以重跑不重复消耗额度
python3 -I "$PIPE/tts_episode.py" 2>&1 | tee -a "$LOG" || die "tts_episode 失败"

# ── 2. 矢量底图 bake ────────────────────────────────────────────
# episode.camera 的每一段都是一组真实镜头参数，直接喂给 bake 脚本。
# 只有 globe→mercator 之前的段能烘焙（bake 脚本固定 mercator）。
say "[4/4] 烘焙矢量底图镜头"
EID=$(python3 -I -c "import json;d=json.load(open('$WEB/public/data/episode.json'));e=d[0] if isinstance(d,list) else d;print(e['episode_id'])")
CENTER=$(python3 -I -c "import json;d=json.load(open('$WEB/public/data/episode.json'));e=d[0] if isinstance(d,list) else d;c=e['camera'][-1]['center'];print(f'{c[0]},{c[1]}')")

BAKE=$WEB/scripts/bake-basemap.mjs
N=0; FAIL=0
for spec in "wide:10.5:12.5:0:-8" "close:14.0:15.6:52:-12" "era:14.8:16.4:56:0"; do
  IFS=: read -r tag z0 z1 pitch bear <<< "$spec"
  name="${EID}-${tag}"
  say "  bake $name (zoom $z0→$z1 pitch $pitch)"
  ( cd "$OUT/bake" && NAME="$name" STYLE=vector VECTOR_STYLE=dark \
      CENTER="$CENTER" ZSTART="$z0" ZEND="$z1" PITCH="$pitch" BEARING="$bear" \
      FPS=30 DUR=4 HOLD=0.75 timeout 400 node "$BAKE" ) >> "$LOG" 2>&1
  rc=$?
  if [ $rc -eq 0 ] && [ -f "$OUT/bake/$name.mp4" ]; then
    sz=$(stat -c%s "$OUT/bake/$name.mp4")
    say "    ✓ $name.mp4 ($((sz/1024))KB)"
    N=$((N+1))
  else
    # 脚本在瓦片 idle 超时时是非 0 退出，这是最常见的失败模式
    say "    ✗ $name 失败 rc=$rc"
    FAIL=$((FAIL+1))
  fi
done

# ── 3. H5 构建 ─────────────────────────────────────────────────
say "附加：构建 H5 静态产物"
( cd "$WEB" && npm run build ) >> "$LOG" 2>&1 || say "  ⚠ 构建失败，见日志"
[ -f "$WEB/dist/index.html" ] && say "  ✓ dist/index.html 就绪"

# ── 4. 汇总 ────────────────────────────────────────────────────
say "=== 结束：bake 成功 $N / 失败 $FAIL ==="
say "产物：$OUT/bake/*.mp4  ·  页面：$WEB/dist/"
say "未做（需人工）：Remotion 出片、H5 部署、内容审核、发布"
[ "$N" -gt 0 ]