#!/usr/bin/env python3
"""
遛娃宝地 — 单 POI 高德数据充实工具

按场所名称查询高德 POI 搜索 API（extensions=all），
将营业时间、简介、电话、门票等数据写入数据库。

用法:
  python3 scripts/amap_enrich_poi.py "广州市儿童公园"                  # 按名称搜索并更新
  python3 scripts/amap_enrich_poi.py "儿童公园" --city 广州            # 指定城市提高精度
  python3 scripts/amap_enrich_poi.py "儿童公园" --city 广州 --dry-run  # 只预览不写入
  python3 scripts/amap_enrich_poi.py --help                            # 帮助
"""

import json
import os
import random
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request

# ---- 配置 ----
AMAP_KEY = os.environ.get("AMAP_KEY", "abcef158da87a62e42e1fb968ed33dd4")
DB_PATH = os.environ.get("DB_PATH", "/opt/babyplace/data/babyplace.db")

# POI 表完整列名（对应 Go server/poi.go poiColumns + INSERT 列清单）
POI_COLUMNS = [
    "id", "name", "canonical_name", "alias", "city", "district", "address",
    "lat", "lng", "category", "age_range", "indoor", "price_type", "recommended_duration",
    "transport", "transport_hint", "parking_tip",
    "stroller_friendly", "restroom", "food", "shade", "parking", "rainy_day_ok",
    "summary", "recommend_reason", "notice", "cover_image", "gallery", "tags",
    "source_count", "review_count", "avg_rating", "status", "created_at", "updated_at",
    "open_time", "ticket_info", "phone", "booking_url", "booking_qr_code", "reservation_type", "reservation", "featured",
]
POI_PLACEHOLDERS = ",".join("?" for _ in POI_COLUMNS)


def parse_args():
    """解析命令行参数"""
    args = sys.argv[1:]

    # 处理 --help
    if "--help" in args or "-h" in args or not args:
        print(__doc__)
        sys.exit(0)

    poi_name = None
    city = ""
    dry_run = False

    i = 0
    while i < len(args):
        if args[i] == "--city" and i + 1 < len(args):
            city = args[i + 1]
            i += 2
        elif args[i] == "--dry-run":
            dry_run = True
            i += 1
        elif args[i].startswith("-"):
            print(f"未知参数: {args[i]}")
            sys.exit(1)
        else:
            poi_name = args[i]
            i += 1

    if not poi_name:
        print("错误: 请指定场所名称")
        print(__doc__)
        sys.exit(1)

    return poi_name.strip(), city.strip(), dry_run


# ─── 工具函数 ─────────────────────────────────────

def get_poi(cursor, poi_name, city):
    """在 DB 中严格匹配 POI

    只有精确匹配或极高相似度（>0.85）才算匹配，
    避免把不同 POI 误合并。
    返回匹配的 POI 或 None。
    """
    if city:
        cursor.execute(
            "SELECT id, name, city, summary, address, phone, ticket_info, "
            "open_time, lat, lng, cover_image, district, recommend_reason "
            "FROM poi WHERE name != '' AND city LIKE ? ORDER BY id",
            (f"%{city}%",),
        )
    else:
        cursor.execute(
            "SELECT id, name, city, summary, address, phone, ticket_info, "
            "open_time, lat, lng, cover_image, district, recommend_reason "
            "FROM poi WHERE name != '' ORDER BY id",
        )

    rows = cursor.fetchall()
    if not rows:
        return None

    columns = [desc[0] for desc in cursor.description]
    candidates = [dict(zip(columns, row)) for row in rows]

    # 1) 精确匹配（不区分大小写）
    normalized_query = poi_name.lower().strip()
    for c in candidates:
        if c["name"].lower().strip() == normalized_query:
            return c

    # 2) 高相似度匹配（Levenshtein > 0.85，与 Go 后端 dedup 阈值一致）
    best = None
    best_score = 0.0
    threshold = 0.85
    for c in candidates:
        score = name_similarity(poi_name, c["name"])
        if score > best_score:
            best_score = score
            best = c

    if best and best_score >= threshold:
        return best

    return None


def name_similarity(a, b):
    """计算两个名称的相似度（基于 Levenshtein 距离）"""
    a = re.sub(r"[^一-龥a-zA-Z0-9]", "", a.lower())
    b = re.sub(r"[^一-龥a-zA-Z0-9]", "", b.lower())
    if not a or not b:
        return 0.0
    max_len = max(len(a), len(b))
    if max_len == 0:
        return 1.0
    dist = levenshtein(a, b)
    return 1.0 - dist / max_len


def levenshtein(a, b):
    """计算 Levenshtein 编辑距离"""
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr = [i + 1]
        for j, cb in enumerate(b):
            cost = 0 if ca == cb else 1
            curr.append(min(
                curr[j] + 1,        # 删除
                prev[j + 1] + 1,    # 插入
                prev[j] + cost,     # 替换
            ))
        prev = curr
    return prev[-1]


def generate_id():
    """生成与 Go 后端一致的 POI ID（24 位 hex，时间戳+随机）"""
    now_ms = int(time.time() * 1000)
    r = random.randint(0, 0xFFFFFF)
    return f"{now_ms // 1000:08x}{(now_ms % 1000) * 1000 + r:08x}{random.randint(0, 0xFFFFFF):08x}"


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


# ─── 高德 API 查询 ─────────────────────────────

def query_amap_rich(name, city):
    """
    调用高德 POI 搜索 API（extensions=all），返回丰富数据字典。
    返回 (data, None) 成功，或 (None, error_msg) 失败。
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
        return None, f"API 请求异常: {e}"

    if data.get("status") != "1":
        return None, f"高德 API status={data.get('status')}"

    pois = data.get("pois", [])
    if not pois:
        return None, "高德无匹配 POI"

    poi = pois[0]
    biz_ext = poi.get("biz_ext", {}) or {}
    deep_info = poi.get("deep_info", {}) or {}

    # 提取营业时间（多级 fallback）
    hours = (biz_ext.get("opentime2") or "").strip()
    if not hours:
        hours = (biz_ext.get("open_time") or "").strip()
    if not hours:
        hours = (deep_info.get("opentime") or "").strip()
    if not hours:
        hours = (deep_info.get("opentime_week") or "").strip()

    # 提取电话（顶层字段）
    phone = (poi.get("tel") or "").strip()
    if not phone:
        phone = (biz_ext.get("tel") or "").strip()

    # 提取门票/消费信息
    ticket_info = (biz_ext.get("cost") or "").strip()

    # 提取简介
    intro = (deep_info.get("intro") or "").strip()

    # 提取坐标
    location = (poi.get("location") or "").strip()
    lng, lat = 0.0, 0.0
    if location and "," in location:
        parts = location.split(",", 1)
        try:
            lng = round(float(parts[0]), 6)
            lat = round(float(parts[1]), 6)
        except ValueError:
            pass

    # 提取地址/城市/区域
    address = (poi.get("address") or "").strip()
    cityname = (poi.get("cityname") or "").strip()
    adname = (poi.get("adname") or "").strip()

    # 提取封面图
    cover_image = ""
    photos = poi.get("photos") or []
    if isinstance(photos, list) and photos:
        first = photos[0]
        if isinstance(first, dict):
            cover_image = (first.get("url") or "").strip()
        elif isinstance(first, str):
            cover_image = first.strip()
    elif isinstance(photos, str):
        # 可能以分号分隔
        parts = photos.split(";")
        if parts:
            cover_image = parts[0].strip()

    amap_name = (poi.get("name") or "").strip()

    return {
        "amap_name": amap_name,
        "hours": hours,
        "phone": phone,
        "ticket_info": ticket_info,
        "intro": intro,
        "lng": lng,
        "lat": lat,
        "address": address,
        "cityname": cityname,
        "adname": adname,
        "cover_image": cover_image,
    }, None


# ─── DB upsert（新建或覆盖更新）────────────────

def build_amap_summary(amap_data):
    """从高德数据构建 summary：营业时间前缀 + 简介"""
    parts = []
    if amap_data["hours"]:
        parts.append(f"⏰ 营业时间\t{amap_data['hours']}")
    if amap_data["intro"]:
        lines = amap_data["intro"].split("\n")
        clean = "；".join(line.strip() for line in lines if line.strip())
        if clean:
            parts.append(clean)
    return "\n".join(parts)


def upsert_poi(cursor, conn, amap_data, existing_poi, dry_run):
    """
    无匹配 → INSERT 新建 POI
    有匹配 → UPDATE 以高德数据覆盖更新（高德是源数据）
    返回 (action, fields, extra_id) — action='created' | 'updated' | 'noop'
    """
    summary = build_amap_summary(amap_data)

    if existing_poi:
        # ── 更新 ──
        set_clauses = []
        args = []

        # 高德有数据的字段全覆盖写入
        field_map = [
            ("open_time", amap_data["hours"]),
            ("summary", summary) if summary else None,
            ("phone", amap_data["phone"]),
            ("ticket_info", amap_data["ticket_info"]),
            ("address", amap_data["address"]),
            ("city", amap_data["cityname"]),
            ("district", amap_data["adname"]),
            ("cover_image", amap_data["cover_image"]),
        ]
        field_map = [f for f in field_map if f is not None]

        updated_fields = []
        for col, val in field_map:
            if val:
                set_clauses.append(f"{col} = ?")
                args.append(val)
                updated_fields.append(col)

        # 坐标单独处理
        if amap_data["lat"] != 0.0 and amap_data["lng"] != 0.0:
            set_clauses.append("lat = ?, lng = ?")
            args.extend([amap_data["lat"], amap_data["lng"]])
            updated_fields.append("location")

        if not set_clauses:
            return "noop", [], ""

        set_clauses.append("updated_at = ?")
        args.append(int(time.time() * 1000))
        args.append(existing_poi["id"])

        query = f"UPDATE poi SET {', '.join(set_clauses)} WHERE id = ?"

        if dry_run:
            print(f"\n  [DRY-RUN] 将执行: {query}")
            print(f"  [DRY-RUN] 参数: {args[:-1]}...")
        else:
            cursor.execute(query, args)
            conn.commit()

        return "updated", updated_fields, existing_poi["id"]

    else:
        # ── 新建 ──
        now_ms = int(time.time() * 1000)
        poi_id = generate_id()

        # 构建完整行数据（Go 后端 INSERT 43 列一致）
        row = {
            "id": poi_id,
            "name": amap_data["amap_name"],
            "canonical_name": amap_data["amap_name"],
            "alias": "[]",
            "city": amap_data["cityname"],
            "district": amap_data["adname"],
            "address": amap_data["address"],
            "lat": amap_data["lat"],
            "lng": amap_data["lng"],
            "category": "",
            "age_range": "[]",
            "indoor": 0,
            "price_type": "",
            "recommended_duration": "",
            "transport": "[]",
            "transport_hint": "",
            "parking_tip": "",
            "stroller_friendly": 0,
            "restroom": 0,
            "food": 0,
            "shade": 0,
            "parking": 0,
            "rainy_day_ok": 0,
            "summary": summary,
            "recommend_reason": "",
            "notice": "",
            "cover_image": amap_data["cover_image"],
            "gallery": "[]",
            "tags": "[]",
            "source_count": 0,
            "review_count": 0,
            "avg_rating": 0,
            "status": "published",
            "created_at": now_ms,
            "updated_at": now_ms,
            "open_time": amap_data["hours"],
            "ticket_info": amap_data["ticket_info"],
            "phone": amap_data["phone"],
            "booking_url": "",
            "booking_qr_code": "",
            "reservation_type": "",
            "reservation": "{}",
            "featured": "",
        }

        values = [row[col] for col in POI_COLUMNS]
        query = f"INSERT INTO poi ({','.join(POI_COLUMNS)}) VALUES ({POI_PLACEHOLDERS})"

        if dry_run:
            print(f"\n  [DRY-RUN] 将执行: {query}")
            print(f"  [DRY-RUN] 名称={amap_data['amap_name']}, 城市={amap_data['cityname']}, ID={poi_id}")
        else:
            cursor.execute(query, values)
            conn.commit()

        return "created", [col for col in POI_COLUMNS if row[col]], poi_id


def main():
    poi_name, city, dry_run = parse_args()

    print(f"🔍 搜索:   {poi_name}")
    print(f"  城市:   {city or '(不限)'}")
    print(f"  Key:    {AMAP_KEY[:8]}...")
    print(f"  DB:     {DB_PATH}")
    print(f"  模式:   {'DRY-RUN' if dry_run else '写入数据库'}")
    print()

    # 1) 查询高德
    print(f"⏳ 正在查询高德地图...", end=" ", flush=True)
    amap_data, err = query_amap_rich(poi_name, city)
    if err:
        print(f"✗ {err}")
        sys.exit(1)
    print("✓")

    print(f"\n📋 高德匹配结果:")
    print(f"  名称:     {amap_data['amap_name']}")
    print(f"  营业时间: {amap_data['hours'] or '(无)'}")
    print(f"  电话:     {amap_data['phone'] or '(无)'}")
    print(f"  消费:     {amap_data['ticket_info'] or '(无)'}")
    print(f"  坐标:     {amap_data['lng']},{amap_data['lat']}")
    print(f"  地址:     {amap_data['address'] or '(无)'}")
    print(f"  城市:     {amap_data['cityname'] or '(无)'}")
    print(f"  区域:     {amap_data['adname'] or '(无)'}")
    if amap_data["intro"]:
        intro_short = amap_data["intro"][:80]
        print(f"  简介:     {intro_short}...")
    print()

    # 2) 连接数据库并 upsert
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 先用用户输入的查询名匹配，再用高德返回的正式名匹配（防重复）
    matched = get_poi(cursor, poi_name, city)
    match_source = "用户输入"
    if not matched and amap_data["amap_name"] and amap_data["amap_name"] != poi_name:
        matched = get_poi(cursor, amap_data["amap_name"], city)
        match_source = "高德返回名"
    if matched:
        print(f"✅ 在数据库中找到匹配的 POI（匹配来源: {match_source}，高德数据将覆盖更新本地字段）:")
        print(f"  ID:       {matched['id']}")
        print(f"  名称:     {matched['name']}")
        print(f"  城市:     {matched['city'] or '(空)'}")
        print(f"  电话:     {matched['phone'] or '(空)'}")
        print(f"  营业时间: {matched['open_time'] or '(空)'}")
    else:
        print(f"🆕 数据库中无匹配，将新建 POI 记录")
        print(f"  新建名称: {amap_data['amap_name']}")
        print(f"  新建城市: {amap_data['cityname']}")
    print()

    # 3) upsert
    print("📝 数据写入:")
    action, fields, extra_id = upsert_poi(cursor, conn, amap_data, matched, dry_run)

    if action == "noop":
        print("  ─ 无新数据需要更新（高德无可用数据）")
    elif action == "updated":
        print(f"  ✓ 已更新 POI（ID: {extra_id}）")
        print(f"  更新字段: {', '.join(fields)}")
    elif action == "created":
        print(f"  ✓ 已新建 POI（ID: {extra_id}）")
        print(f"  新建字段: {', '.join(fields[:10])}{'...' if len(fields) > 10 else ''}")

    print()

    # 4) 检查未获取的字段，给出下一步建议
    missing = []
    if not amap_data["hours"]:
        missing.append("营业时间")
    if not amap_data["phone"]:
        missing.append("电话")
    if not amap_data["ticket_info"]:
        missing.append("门票信息")
    if not amap_data["intro"]:
        missing.append("简介")
    if missing:
        print(f"💡 高德未返回以下字段（可在 Admin 后台手动填写）:")
        print(f"  {'、'.join(missing)}")

    conn.close()
    print("✅ 完成")


if __name__ == "__main__":
    main()
