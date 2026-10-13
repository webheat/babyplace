#!/usr/bin/env bash
# nightly-folktale.sh — 民间故事数据管线的夜间批处理
#
# 由 crontab 调度（一次性，2026-10-14 02:30）。**只产出，不发布**。
#
# 范围说明：本机连不上 Wikidata 与维基文库（query.wikidata.org / zh.wikisource.org
# 直连超时、代理亦失败），因此**不包含 Wikidata SPARQL 拉取**。等网络可达再加。
#
# 跑完看 /opt/babyplace/out/logs/folktale-*.log
set -uo pipefail

export PATH="/root/.nvm/versions/node/v22.22.1/bin:/root/.pyenv/shims:$PATH"
PY=/root/.pyenv/shims/python3
[ -x "$PY" ] || PY=/usr/bin/python3

ROOT=/opt/babyplace
WEB=$ROOT/web
PIPE=$ROOT/pipeline
OUT=$ROOT/out
LOGS=$OUT/logs
LOG=$LOGS/folktale-$(date +%Y%m%d-%H%M%S).log
mkdir -p "$LOGS"

say() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }
die() { say "[FATAL] $*"; exit 1; }

say "=== 民间故事批处理开始 ==="

# ── 1. 校验（人工字段与上游是否仍一一对应）────────────────────
# 这一步最容易失败：上游 chinese-folktales.json 若被更新/重排，而我方 kid_line
# 按 id 对应，id 变了就会漏配。自检失败就停，不要产出半成品。
say "[1/3] 校验数据一致性"
"$PY" -I "$PIPE/folktale_to_lore.py" --check 2>&1 | tee -a "$LOG" || die "校验失败，未产出（详见上方问题列表）"

# ── 2. 编译 + 导出 GeoJSON ───────────────────────────────────
say "[2/3] 编译并导出 GeoJSON"
"$PY" -I "$PIPE/folktale_to_lore.py" 2>&1 | tee -a "$LOG" || die "编译失败"
"$PY" -I "$PIPE/export_geojson.py" 2>&1 | tee -a "$LOG" || die "GeoJSON 导出失败"

# ── 3. 构建 H5 ───────────────────────────────────────────────
say "[3/3] 构建 H5 静态产物"
"$PY" -I "$PIPE/inline_episode.py" 2>&1 | tee -a "$LOG" || say "  ⚠ 内联 episode 失败"
( cd "$WEB" && "$WEB/node_modules/.bin/vite" build ) >> "$LOG" 2>&1 || say "  ⚠ 构建失败，见日志"
[ -f "$WEB/dist/index.html" ] && say "  ✓ dist/index.html 就绪"

N=$(python3 -c "import json;print(len(json.load(open('$WEB/public/data/folktales.geojson'))['features']))" 2>/dev/null || echo 0)
say "=== 结束：$N 个故事点 ==="
say "产物：$WEB/public/data/folktales.geojson · folktales-lite.geojson · folktale-episode.json"
say "未做（需人工/网络）：Wikidata 拉取（网络不通）、出处核实（扩展 18 条）、发布"
[ "$N" -gt 0 ]