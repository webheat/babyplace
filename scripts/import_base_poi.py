#!/usr/bin/env python3
"""
Convert docs/base-poi.json into babyplace-poi schema rows and import them.

Examples:
  python scripts/import_base_poi.py
  python scripts/import_base_poi.py --dry-run --output seed/base_poi_converted.json
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = BASE_DIR / "docs" / "base-poi.json"
DEFAULT_URL = "https://byupload.aixifs.com/babyplace-admin"
DEFAULT_SECRET = "babyplace2026"
DEFAULT_BATCH = 100

GUANGZHOU_DISTRICTS = {
    "荔湾区",
    "越秀区",
    "海珠区",
    "天河区",
    "白云区",
    "黄埔区",
    "番禺区",
    "花都区",
    "南沙区",
    "从化区",
    "增城区",
}
FOSHAN_DISTRICTS = {"禅城区", "南海区", "顺德区", "三水区", "高明区"}
SHENZHEN_DISTRICTS = {
    "福田区",
    "罗湖区",
    "南山区",
    "盐田区",
    "宝安区",
    "龙岗区",
    "龙华区",
    "坪山区",
    "光明区",
    "大鹏新区",
}

AGE_PATTERNS = [
    re.compile(r"(\d+)\s*[-~到至]\s*(\d+)\s*岁"),
    re.compile(r"(\d+)\s*\+\s*岁"),
]


def load_source_rows(path):
    text = Path(path).read_text(encoding="utf-8")
    stripped = text.strip()
    if not stripped:
        return []
    if stripped.startswith("["):
        data = json.loads(stripped)
        return data if isinstance(data, list) else []
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def post_json(url, payload, timeout=90):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        try:
            raw = error.read().decode("utf-8")
        except Exception:
            raw = str(error)
        return {"code": error.code, "message": raw}
    except Exception as error:
        return {"code": -1, "message": str(error)}


def call_seed_api(url, secret, payload):
    request_payload = {"secret": secret, **payload}
    return post_json(url, request_payload)


def ping(url, secret):
    result = call_seed_api(url, secret, {"action": "ping"})
    if result.get("code") != 0:
        raise RuntimeError(f"seed API ping failed: {result.get('message')}")


def chunked(items, size):
    for start in range(0, len(items), size):
        yield items[start : start + size]


def infer_city(district):
    if district in GUANGZHOU_DISTRICTS:
        return "广州"
    if district in FOSHAN_DISTRICTS:
        return "佛山"
    if district in SHENZHEN_DISTRICTS:
        return "深圳"
    return "广州"


def infer_category(name, tags, description):
    haystack = " ".join([name or "", " ".join(tags or []), description or ""])
    if any(token in haystack for token in ["博物馆", "艺术中心", "展馆", "科技馆"]):
        return "museum"
    if any(token in haystack for token in ["动物园", "野生动物"]):
        return "zoo"
    if any(token in haystack for token in ["农场", "牧场", "庄园"]):
        return "farm"
    if any(token in haystack for token in ["乐园", "游乐", "蹦床", "运动公园"]):
        return "playground"
    if any(token in haystack for token in ["公园", "湿地", "森林", "步道", "山", "湖"]):
        return "park"
    if any(token in haystack for token in ["商场", "广场", "mall"]):
        return "mall"
    return "mixed"


def infer_age_range(description):
    text = description or ""
    for pattern in AGE_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        if len(match.groups()) == 2:
            start, end = match.groups()
            return [f"{start}-{end}岁"]
        start = match.group(1)
        return [f"{start}岁+"]
    if "低龄" in text:
        return ["1-6岁"]
    if "学龄" in text or "大孩子" in text:
        return ["6岁+"]
    return []


def infer_indoor(tags, description, name):
    haystack = " ".join((tags or []) + [description or "", name or ""])
    if any(token in haystack for token in ["室内", "商场", "艺术中心", "博物馆", "展馆"]):
        return True
    if any(token in haystack for token in ["森林", "湿地", "公园", "步道", "山顶", "户外"]):
        return False
    return False


def infer_price_type(price):
    try:
        amount = float(price)
    except Exception:
        amount = 0
    return "free" if amount <= 0 else "paid"


def infer_duration(category, indoor, description):
    text = description or ""
    if "全天" in text:
        return "full_day"
    if "半天" in text or "野餐" in text or category == "park":
        return "half_day"
    if indoor or category in {"museum", "playground", "mall"}:
        return "2h"
    return "2h"


def infer_transport(description):
    text = description or ""
    transport = []
    if any(token in text for token in ["地铁", "公交", "步行"]):
        transport.append("公共交通")
    if any(token in text for token in ["停车", "自驾", "车位"]):
        transport.append("自驾")
    if not transport:
        transport.append("自驾")
    return transport


def infer_facilities(description, indoor, category):
    text = description or ""
    return {
        "stroller_friendly": indoor or any(token in text for token in ["推车", "学步车", "平缓", "木栈道"]),
        "restroom": indoor or any(token in text for token in ["卫生间", "洗手台", "母婴室"]),
        "food": any(token in text for token in ["餐饮", "点心", "野餐", "小吃"]),
        "shade": indoor or any(token in text for token in ["树荫", "遮阳", "林荫"]),
        "parking": any(token in text for token in ["停车", "车位", "自驾"]),
        "rainy_day_ok": indoor or category in {"museum", "mall"},
    }


def normalize_status(state):
    if state == "销售中":
        return "published"
    if state in {"已下线", "停售"}:
        return "archived"
    return "draft"


def clean_summary(text, limit=60):
    text = (text or "").replace("\r", " ").replace("\n", " ").strip()
    if not text:
        return ""
    sentence = re.split(r"[。！？!?\n]", text)[0].strip()
    if not sentence:
        sentence = text
    if len(sentence) <= limit:
        return sentence
    return sentence[: limit - 1].rstrip() + "…"


def to_float(value, fallback):
    try:
        return float(value)
    except Exception:
        return fallback


def transform_row(row):
    name = str(row.get("name") or "").strip() or "未命名地点"
    district = str(row.get("district") or "").strip() or "天河区"
    description = str(row.get("description") or row.get("name_pw") or "").strip()
    tags = [str(item).strip() for item in (row.get("tags") or []) if str(item).strip()]
    category = infer_category(name, tags, description)
    indoor = infer_indoor(tags, description, name)
    gallery = [str(item).strip() for item in (row.get("imgs") or []) if str(item).strip()]

    return {
        "name": name,
        "canonical_name": str(row.get("original_name") or name).strip(),
        "alias": [],
        "city": infer_city(district),
        "district": district,
        "address": "",
        "location": {
            "lat": to_float(row.get("latitude"), 23.1291),
            "lng": to_float(row.get("longitude"), 113.2644),
        },
        "category": category,
        "age_range": infer_age_range(description),
        "indoor": indoor,
        "price_type": infer_price_type(row.get("price")),
        "recommended_duration": infer_duration(category, indoor, description),
        "transport": infer_transport(description),
        "facilities": infer_facilities(description, indoor, category),
        "summary": clean_summary(description),
        "recommend_reason": description,
        "notice": "",
        "cover_image": gallery[0] if gallery else "",
        "gallery": gallery,
        "tags": tags,
        "source_count": 0,
        "review_count": 0,
        "avg_rating": 0,
        "status": normalize_status(str(row.get("state") or "").strip()),
    }


def dedupe_rows(rows):
    deduped = []
    seen = set()
    for row in rows:
        location = row.get("location") or {}
        key = (
            row.get("name", ""),
            row.get("district", ""),
            round(float(location.get("lat", 0)), 6),
            round(float(location.get("lng", 0)), 6),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped


def import_rows(url, secret, rows, batch_size):
    total_succeeded = 0
    total_failed = 0
    for index, batch in enumerate(chunked(rows, batch_size), start=1):
        result = call_seed_api(
            url,
            secret,
            {
                "action": "insertBatch",
                "collection": "babyplace-poi",
                "data": batch,
            },
        )
        if result.get("code") != 0:
            raise RuntimeError(f"batch {index} failed: {result.get('message')}")
        data = result.get("data", {})
        succeeded = int(data.get("succeeded") or 0)
        failed = int(data.get("failed") or 0)
        total_succeeded += succeeded
        total_failed += failed
        print(f"batch {index}: succeeded={succeeded} failed={failed}")
        time.sleep(0.1)
    return total_succeeded, total_failed


def main():
    parser = argparse.ArgumentParser(description="Import docs/base-poi.json into babyplace-poi")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Source file path")
    parser.add_argument("--url", default=os.getenv("BABYPLACE_ADMIN_HTTP_URL", DEFAULT_URL), help="HTTP URL")
    parser.add_argument("--secret", default=DEFAULT_SECRET, help="Import secret")
    parser.add_argument("--batch", type=int, default=DEFAULT_BATCH, help="Batch size, max 200")
    parser.add_argument("--output", default="", help="Optional path to save converted JSON array")
    parser.add_argument("--dry-run", action="store_true", help="Convert only, do not upload")
    args = parser.parse_args()

    if args.batch <= 0 or args.batch > 200:
        print("batch must be between 1 and 200")
        sys.exit(1)

    raw_rows = load_source_rows(args.input)
    converted_rows = dedupe_rows([transform_row(row) for row in raw_rows if not row.get("is_delete")])

    if args.output:
        output_path = Path(args.output)
        if not output_path.is_absolute():
            output_path = BASE_DIR / output_path
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(converted_rows, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"saved converted data: {output_path}")

    print(f"source rows: {len(raw_rows)}")
    print(f"converted rows: {len(converted_rows)}")

    if args.dry_run:
        return

    ping(args.url, args.secret)
    print(f"seed API reachable: {args.url}")
    succeeded, failed = import_rows(args.url, args.secret, converted_rows, args.batch)
    print(f"import done: succeeded={succeeded} failed={failed}")


if __name__ == "__main__":
    main()
