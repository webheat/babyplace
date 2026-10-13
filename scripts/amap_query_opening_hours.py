#!/usr/bin/env python3
"""
遛娃宝地 — 高德地图 POI 开放时间批量查询工具

从数据库读取所有场所，尝试多个数据源获取营业时间，
将结果格式化为 "⏰ 营业时间\t<时间>" 插入到 summary 字段最前面。

数据源（按优先级）:
  1. 高德地图 POI 搜索 API（extensions=all）
  2. 百度网页搜索（抓取摘要中的营业时间信息）

用法:
  python3 scripts/amap_query_opening_hours.py                          # 全量处理
  python3 scripts/amap_query_opening_hours.py --limit 10               # 仅处理前 N 条
  python3 scripts/amap_query_opening_hours.py --dry-run                # 只查不写
  python3 scripts/amap_query_opening_hours.py --delay 0.3              # 请求间隔（秒，默认 0.8）
  python3 scripts/amap_query_opening_hours.py --force                  # 强制重新查询（默认跳过已有⏰的）
  python3 scripts/amap_query_opening_hours.py --source amap            # 仅用高德（不用百度降级）
"""

import json
import os
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request

# ---- 配置 ----
AMAP_KEY = os.environ.get("AMAP_KEY", "abcef158da87a62e42e1fb968ed33dd4")
DB_PATH = os.environ.get("DB_PATH", "/opt/babyplace/data/babyplace.db")
BATCH_DELAY = 0.8   # 请求间隔秒数
FORCE = False        # 是否强制重新查询已有开放时间的记录
DRY_RUN = False      # 仅查询不写入
LIMIT = None         # 处理条数上限
USE_BAIDU_FALLBACK = True  # 高德无结果时降级到百度搜索

# HTTP 请求头（模拟浏览器，避免被反爬）
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


def parse_args():
    global BATCH_DELAY, FORCE, DRY_RUN, LIMIT, USE_BAIDU_FALLBACK
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--delay" and i + 1 < len(args):
            BATCH_DELAY = float(args[i + 1])
            i += 2
        elif args[i] == "--force":
            FORCE = True
            i += 1
        elif args[i] == "--dry-run":
            DRY_RUN = True
            i += 1
        elif args[i] == "--limit" and i + 1 < len(args):
            LIMIT = int(args[i + 1])
            i += 2
        elif args[i] == "--source":
            val = args[i + 1]
            if val == "amap":
                USE_BAIDU_FALLBACK = False
            i += 2
        elif args[i] in ("--help", "-h"):
            print(__doc__)
            sys.exit(0)
        else:
            print(f"未知参数: {args[i]}")
            sys.exit(1)


def get_pois(cursor):
    """读取所有 POI"""
    cursor.execute("SELECT id, name, city, summary, address FROM poi WHERE name != '' ORDER BY id")
    rows = cursor.fetchall()
    result = []
    for row in rows:
        result.append({
            "id": row[0],
            "name": row[1],
            "city": row[2] or "",
            "summary": row[3] or "",
            "address": row[4] or "",
        })
    return result


def already_has_hours(summary):
    """判断 summary 是否已包含开放时间信息"""
    if not summary:
        return False
    first_line = summary.strip().split("\n")[0]
    return first_line.startswith("⏰")


# ─── 数据源 1: 高德地图 ─────────────────────────────

def query_amap(name, city):
    """
    调用高德 POI 搜索 API（extensions=all），返回营业时间字符串。
    返回 (hours, None) 成功，或 (None, err_msg) 失败。
    """
    params = urllib.parse.urlencode({
        "key": AMAP_KEY,
        "keywords": name,
        "city": city if city else "",
        "offset": "1",
        "page": "1",
        "extensions": "all",
    })
    url = f"https://restapi.amap.com/v3/place/text?{params}"

    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return None, f"API 异常: {e}"

    if data.get("status") != "1":
        return None, f"status={data.get('status')}"

    pois = data.get("pois", [])
    if not pois:
        return None, None  # 无匹配

    # 取 biz_ext 中的开放时间字段
    poi = pois[0]
    biz_ext = poi.get("biz_ext", {}) or {}
    hours = (biz_ext.get("opentime2") or "").strip()
    if not hours:
        hours = (biz_ext.get("open_time") or "").strip()

    # 如果 biz_ext 没有，尝试 deep_info
    if not hours:
        deep = poi.get("deep_info", {}) or {}
        hours = (deep.get("opentime") or deep.get("opentime_week") or "").strip()

    if not hours:
        return None, None  # 匹配到 POI 但没有开放时间

    return hours, None


# ─── 数据源 2: 百度搜索降级 ──────────────────────────

def query_baidu(name, city):
    """
    通过百度搜索 "<场所名> 营业时间"，从搜索结果摘要中提取营业时间。
    返回 (hours, None) 成功，或 (None, err_msg) 失败。
    """
    keywords = f"{name} {city} 营业时间"
    params = urllib.parse.urlencode({"wd": keywords, "ie": "utf-8"})
    url = f"https://www.baidu.com/s?{params}"

    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        return None, f"请求失败: {e}"

    # 百度搜索结果摘要中常见的时间模式
    time_patterns = [
        # "营业时间：09:00-18:00" 或 "营业时间: 09:00-18:00"
        r'[营业][业业][时时][间间][：:：]\s*([^<。.]+?(?:\d+:\d+[-~到至]\d+:\d+)[^<。.]*)',
        # "开放时间：09:00-18:00"
        r'[开开][放放][时时][间间][：:：]\s*([^<。.]+?(?:\d+:\d+[-~到至]\d+:\d+)[^<。.]*)',
        # "08:00-18:00 开放" 等
        r'(\d{1,2}:\d{2}[-~到至]\d{1,2}:\d{2})',
        # 带中文的 "周一至周日 09:00-18:00"
        r'([周周][一一一二三四五六日全天]\s*(?:[-~到至]\s*[周周][一一一二三四五六日全天])?\s*\d{1,2}:\d{2}[-~到至]\d{1,2}:\d{2})',
        # 含节假日的特殊时间
        r'([节节][假偎][日日][：:：]?\s*[^<。.]*?\d{1,2}:\d{2}[-~到至]\d{1,2}:\d{2}[^<。.]*)',
    ]

    # 在摘要区域查找
    # 百度搜索结果在 div.c-abstract 或 span.content-right_8Zs40 中
    snippets = re.findall(
        r'(?:<div[^>]*class="[^"]*c-abstract[^"]*"[^>]*>|'
        r'<span[^>]*class="[^"]*content-[^"]*"[^>]*>|'
        r'<div[^>]*class="[^"]*c-span-last[^"]*"[^>]*>)'
        r'(.*?)</(?:div|span)>',
        html, re.DOTALL
    )

    if not snippets:
        # 退一步：搜整个 body 的纯文本
        body_match = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL)
        if body_match:
            text = re.sub(r'<[^>]+>', ' ', body_match.group(1))
            snippets = [text]
        else:
            snippets = [html]

    for snippet in snippets:
        text = re.sub(r'<[^>]+>', ' ', snippet)
        text = re.sub(r'\s+', ' ', text).strip()

        for pattern in time_patterns:
            matches = re.findall(pattern, text)
            if matches:
                # 取最长的匹配（通常信息最完整）
                best = max(set(matches), key=len)
                best = best.strip().rstrip("。，,")
                return best, None

    return None, None


# ─── 摘要格式化 ─────────────────────────────────────

def query_opening_hours(name, city):
    """
    多源查询营业时间，按优先级降级。
    返回 (hours, source_name, err_msg).
    """
    # 1) 高德
    hours, err = query_amap(name, city)
    if hours:
        return hours, "高德地图", None
    if err:
        return None, None, f"高德: {err}"

    # 2) 百度降级
    if USE_BAIDU_FALLBACK:
        try:
            hours, err = query_baidu(name, city)
            if hours:
                return hours, "百度搜索", None
            if err:
                return None, None, f"百度: {err}"
        except Exception as e:
            return None, None, f"百度异常: {e}"

    return None, None, "所有数据源均无结果"


def build_new_summary(current_summary, hours):
    """
    将开放时间插入到 summary 最前面。
    移除旧的 ⏰/开放日 行，避免重复堆积。
    """
    if not current_summary:
        return f"⏰ 营业时间\t{hours}"

    lines = current_summary.split("\n")
    kept = []
    for line in lines:
        stripped = line.strip()
        if (stripped.startswith("⏰")
                or stripped.startswith("开放日")
                or stripped.startswith("开放时间")):
            continue
        kept.append(line)

    cleaned = "\n".join(kept).strip()
    new_line = f"⏰ 营业时间\t{hours}"
    if cleaned:
        return f"{new_line}\n{cleaned}"
    return new_line


def update_summary(cursor, conn, poi_id, new_summary):
    """更新 POI summary 字段"""
    now_ms = int(time.time() * 1000)
    cursor.execute(
        "UPDATE poi SET summary = ?, updated_at = ? WHERE id = ?",
        (new_summary, now_ms, poi_id),
    )
    conn.commit()


# ─── 主流程 ─────────────────────────────────────────

def main():
    parse_args()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    pois = get_pois(cursor)
    total = len(pois)

    if LIMIT:
        pois = pois[:LIMIT]

    print(f"数据库:  {DB_PATH}")
    print(f"POI 总数: {total}，本次处理: {len(pois)}")
    print(f"模式:     {'DRY-RUN (不写入)' if DRY_RUN else '写入数据库'}")
    sources = ["高德地图"]
    if USE_BAIDU_FALLBACK:
        sources.append("百度搜索(降级)")
    print(f"数据源:   {' → '.join(sources)}")
    if not FORCE:
        print("提示: 已有 ⏰ 开头的记录将跳过（使用 --force 强制重新查询）")
    print(f"请求间隔: {BATCH_DELAY}s")
    print()

    stats = {"ok": 0, "skipped": 0, "no_data": 0, "failed": 0, "fallback": 0}
    sources_count = {}

    for i, poi in enumerate(pois):
        poi_id = poi["id"]
        name = poi["name"]
        city = poi["city"]
        summary = poi["summary"]

        # 跳过已处理
        if not FORCE and already_has_hours(summary):
            print(f"[{i+1}/{len(pois)}] ⏭️  {name:<20} 已有开放时间，跳过")
            stats["skipped"] += 1
            continue

        tag = f"[{i+1}/{len(pois)}]"
        print(f"{tag} 🔍  {name:<20} ({city})...", end=" ", flush=True)

        hours, source, err = query_opening_hours(name, city)

        if err:
            print(f"✗ {err}")
            stats["failed"] += 1
            time.sleep(BATCH_DELAY)
            continue

        if not hours:
            print(f"─ 无营业时间")
            stats["no_data"] += 1
            time.sleep(BATCH_DELAY)
            continue

        # 统计来源
        if source:
            sources_count[source] = sources_count.get(source, 0) + 1
            if source != "高德地图":
                stats["fallback"] += 1

        new_summary = build_new_summary(summary, hours)

        if not DRY_RUN:
            update_summary(cursor, conn, poi_id, new_summary)

        # 友好展示
        display = hours.replace("\n", "\\n")
        if len(display) > 70:
            display = display[:67] + "..."
        print(f"✓ [{source}] {display}")
        stats["ok"] += 1

        time.sleep(BATCH_DELAY)

    # ── 汇总 ──
    print()
    print("=" * 55)
    print(f"处理完成: {len(pois)} 条")
    print(f"  ✅ 已更新:   {stats['ok']}")
    print(f"  ⏭️  已跳过:  {stats['skipped']}")
    print(f"  ─ 无营业时间: {stats['no_data']}")
    print(f"  ⚠️  失败:    {stats['failed']}")
    if stats["fallback"]:
        print(f"  🔁 降级(百度): {stats['fallback']}")
    if sources_count:
        print(f"  📊 来源分布:  {sources_count}")

    conn.close()


if __name__ == "__main__":
    main()
