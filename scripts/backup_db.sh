#!/bin/bash
#
# backup_db.sh — 遛娃宝地 SQLite 数据库全量备份脚本
#
# 用法:
#   ./scripts/backup_db.sh                    # 执行备份
#   ./scripts/backup_db.sh --keep-days 30     # 保留最近 N 天备份（默认 30 天）
#   ./scripts/backup_db.sh --dir /path/backups # 指定备份目录
#
# 功能:
#   - 先将 WAL 文件 checkpoint 写入主库，确保一致性
#   - 用 sqlite3 .backup 命令创建一致性快照（不影响运行中的服务）
#   - 自动清理过期备份
#   - 记录备份日志到备份目录

set -euo pipefail

# ---- 默认配置 ----
DB_PATH="${DB_PATH:-/opt/babyplace/data/babyplace.db}"
BACKUP_DIR="${BACKUP_DIR:-/opt/babyplace/data/backups}"
KEEP_DAYS=30
NOW=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="${BACKUP_DIR}/backup.log"

# ---- 解析参数 ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep-days) KEEP_DAYS="$2"; shift 2 ;;
    --dir)       BACKUP_DIR="$2"; shift 2 ;;
    --help|-h)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

# ---- 前置检查 ----
if ! command -v sqlite3 &>/dev/null; then
  echo "[ERROR] 找不到 sqlite3 命令，请先安装 libsqlite3 或 sqlite3-cli"
  exit 1
fi

if [[ ! -f "$DB_PATH" ]]; then
  echo "[ERROR] 数据库文件不存在: $DB_PATH"
  exit 1
fi

# ---- 创建备份目录 ----
mkdir -p "$BACKUP_DIR"

# ---- 日志函数 ----
log() {
  local level="$1"
  shift
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

log "INFO" "===== 开始数据库备份 ====="
log "INFO" "数据库: $DB_PATH ($(du -h "$DB_PATH" | cut -f1))"
log "INFO" "备份目录: $BACKUP_DIR"
log "INFO" "保留天数: ${KEEP_DAYS} 天"

# ---- Step 1: WAL checkpoint，确保主库是最新的 ----
log "INFO" "执行 WAL checkpoint..."
cp "$DB_PATH" "${DB_PATH}.bakckp"  # 备份 checkpoint 前的文件——然而不，直接在 WAL 模式下用 .backup 更安全
# sqlite3 的 .backup 命令在 WAL 模式下自动 checkpoint，但主动做一次更保险
sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" 2>&1 | while read -r line; do
  log "INFO" "checkpoint: $line"
done

# ---- Step 2: 创建一致性快照（使用 .backup 命令） ----
BACKUP_FILE="${BACKUP_DIR}/babyplace_${NOW}.db"
log "INFO" "创建备份: $BACKUP_FILE"
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# 验证备份完整性
log "INFO" "验证备份完整性..."
if ! sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" 2>&1 | grep -q "^ok$"; then
  log "ERROR" "备份完整性检查失败！"
  rm -f "$BACKUP_FILE"
  exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "INFO" "备份完成: $BACKUP_FILE (${BACKUP_SIZE})"

# ---- Step 3: 创建压缩版备份（节省空间） ----
log "INFO" "创建压缩包..."
gzip -k -f "$BACKUP_FILE" 2>/dev/null || true
GZ_FILE="${BACKUP_FILE}.gz"
if [[ -f "$GZ_FILE" ]]; then
  GZ_SIZE=$(du -h "$GZ_FILE" | cut -f1)
  log "INFO" "压缩包: $GZ_FILE (${GZ_SIZE})"
fi

# ---- Step 4: 清理过期备份 ----
log "INFO" "清理 ${KEEP_DAYS} 天前的旧备份..."
find "$BACKUP_DIR" -name "babyplace_*.db" -type f -mtime "+${KEEP_DAYS}" -print -delete >> "$LOG_FILE" 2>&1 || true
find "$BACKUP_DIR" -name "babyplace_*.db.gz" -type f -mtime "+${KEEP_DAYS}" -print -delete >> "$LOG_FILE" 2>&1 || true

# ---- Step 5: 统计 ----
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "babyplace_*.db" -type f | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log "INFO" "当前备份数量: ${TOTAL_BACKUPS} 个，总计占用: ${TOTAL_SIZE}"
log "INFO" "===== 备份完成 ====="
