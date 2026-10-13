#!/bin/bash
# 每日定时抓取公众号文章
# 从 mptext.top API 获取最新文章 URL，然后通过 babyplace-admin 存入数据库
# 用法: ./crawl_articles.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="/tmp/babyplace-crawl.log"
BABYPLACE_API="https://byupload.aixifs.com/babyplace-admin"

# 从 .env 加载配置
ENV_FILE="${SCRIPT_DIR}/../.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "[$(date)] ERROR: .env not found at $ENV_FILE" >> "$LOG_FILE"
    exit 1
fi

WEBSIT_KEY=$(sed -n 's/^websit_key=//p' "$ENV_FILE" | tr -d '[:space:]')
FAKEIDS_STR=$(sed -n 's/^MPTEXT_FAKEIDS=//p' "$ENV_FILE" | tr -d '[:space:]')

if [ -z "$WEBSIT_KEY" ]; then
    echo "[$(date)] ERROR: websit_key not set" >> "$LOG_FILE"
    exit 1
fi

if [ -z "$FAKEIDS_STR" ]; then
    echo "[$(date)] ERROR: MPTEXT_FAKEIDS not set" >> "$LOG_FILE"
    exit 1
fi

# fakeid 列表（base64 编码，直接传给 API）
IFS=',' read -ra FAKEIDS <<< "$FAKEIDS_STR"

log() {
    echo "[$(date)] $*" >> "$LOG_FILE"
    echo "[crawl] $*"
}

# 调用 babyplace-admin API
call_api() {
    local body="$1"
    curl -s -X POST "$BABYPLACE_API" \
        -H 'Content-Type: application/json' \
        -d "$body" \
        --connect-timeout 10 \
        --max-time 30 2>/dev/null
}

log "=== 开始每日文章抓取 ==="

total_new=0
total_errors=0

for fakeid in "${FAKEIDS[@]}"; do
    log "抓取公众号: fakeid=$fakeid"

    # 1. 获取该公众号最新文章列表（fakeid 直接传 base64 值）
    articles_resp=$(call_api \
        "{\"action\":\"mptext.articles\",\"fakeid\":\"$fakeid\",\"begin\":0,\"size\":10}")

    if [ -z "$articles_resp" ]; then
        log "  ERROR: 获取文章列表失败（空响应）"
        ((total_errors++)) || true
        continue
    fi

    # 解析文章列表，提取 link 字段
    urls=$(echo "$articles_resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('code') != 0:
    sys.exit(1)
articles = data.get('data', {}).get('articles', [])
for a in articles:
    link = a.get('link', '')
    if link and 'mp.weixin.qq.com' in link:
        print(link)
" 2>/dev/null)

    if [ -z "$urls" ]; then
        log "  该公众号没有可抓取的文章"
        continue
    fi

    count=0
    while IFS= read -r article_url; do
        [ -z "$article_url" ] && continue

        # 2. 通过 mptext.fetch 抓取并存入数据库
        # 需要转义 URL 中的特殊字符
        escaped_url=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$article_url', safe=''))" 2>/dev/null || echo "$article_url")
        fetch_resp=$(call_api \
            "{\"action\":\"mptext.fetch\",\"url\":\"$article_url\"}")

        if [ -n "$fetch_resp" ]; then
            fetch_code=$(echo "$fetch_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code','-1'))" 2>/dev/null || echo "-1")
            if [ "$fetch_code" = "0" ]; then
                title=$(echo "$fetch_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('title','')[:60])" 2>/dev/null || echo "")
                log "  ✓ 已保存: $title"
                ((count++)) || true
                ((total_new++)) || true
            else
                msg=$(echo "$fetch_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message','unknown')[:80])" 2>/dev/null || echo "unknown")
                log "  ✗ 保存失败: code=$fetch_code msg=$msg"
                ((total_errors++)) || true
            fi
        else
            log "  ✗ 请求失败: $article_url"
            ((total_errors++)) || true
        fi

        # 避免请求过快
        sleep 2
    done <<< "$urls"

    log "  该公众号抓取 $count 篇"
done

log "=== 抓取完成: 新增 $total_new 篇，失败 $total_errors 篇 ==="
