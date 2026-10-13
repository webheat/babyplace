#!/usr/bin/env bash
# Goal Runner cron 包装脚本
# 放入 crontab: */30 * * * * /opt/babyplace/scripts/goal_cron.sh >> /opt/babyplace/scripts/goals/logs/cron.log 2>&1

set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/root"

# Claude Code 需要的环境
export TERM="dumb"

GOAL_RUNNER="/opt/babyplace/scripts/goal_runner.py"

# 检查是否有 pending goal
PENDING_DIR="/opt/babyplace/scripts/goals/pending"
if [ -z "$(ls -A "$PENDING_DIR"/*.md 2>/dev/null)" ]; then
    exit 0  # 没有任务, 静默退出
fi

echo "=== Goal Runner Cron $(date '+%Y-%m-%d %H:%M:%S') ==="
python3 "$GOAL_RUNNER" --run-all
