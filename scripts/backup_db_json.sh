#!/bin/bash
#
# backup_db_json.sh — 遛娃宝地 SQLite 数据库 JSON 导出脚本
#
# 将数据库中所有表导出为 JSON 文件，每表一个文件，便于查看/分发。
#
# 用法:
#   ./scripts/backup_db_json.sh                          # 导出到日期子目录（默认）
#   ./scripts/backup_db_json.sh --dir /path/exports      # 指定输出目录
#   ./scripts/backup_db_json.sh --flat                   # 禁用日期子目录，直接输出

set -euo pipefail

DB_PATH="${DB_PATH:-/opt/babyplace/data/babyplace.db}"
OUTPUT_DIR="${OUTPUT_DIR:-/opt/babyplace/data/exports}"
USE_DATE_DIR=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)  OUTPUT_DIR="$2"; shift 2 ;;
    --flat) USE_DATE_DIR=false; shift ;;
    --help|-h)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

if [[ ! -f "$DB_PATH" ]]; then
  echo "[ERROR] 数据库文件不存在: $DB_PATH"
  exit 1
fi

TABLES=$(sqlite3 "$DB_PATH" ".tables")
if [[ -z "$TABLES" ]]; then
  echo "[ERROR] 数据库中没有任何表"
  exit 1
fi

if $USE_DATE_DIR; then
  OUTPUT_DIR="${OUTPUT_DIR}/$(date '+%Y%m%d_%H%M%S')"
fi

mkdir -p "$OUTPUT_DIR"

echo "导出数据库: $DB_PATH"
echo "输出目录: $OUTPUT_DIR"

for tbl in $TABLES; do
  outfile="${OUTPUT_DIR}/${tbl}.json"
  sqlite3 -json "$DB_PATH" "SELECT * FROM \"$tbl\";" > "$outfile"
  size=$(du -h "$outfile" | cut -f1)
  rows=$(sqlite3 "$DB_PATH" "SELECT count(*) FROM \"$tbl\";")
  echo "  [$tbl] ${rows} 行 → ${outfile} (${size})"
done

total_size=$(du -sh "$OUTPUT_DIR" | cut -f1)
echo "导出完成，共计: ${total_size}"
