#!/usr/bin/env python3
"""
Import POIs from docs/basename.csv:
1. Resolve address/location from AMap
2. Generate description from Zhipu model
3. Upsert babyplace-poi and babyplace-article through babyplace-seed-v2
"""

import argparse
import csv
import hashlib
import hmac
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = BASE_DIR / "docs" / "basename.csv"
DEFAULT_REPORT_DIR = BASE_DIR / "seed" / "reports"
DEFAULT_SECRET = "babyplace2026"
DEFAULT_NATIVE_FUNCTION = "babyplace-seed-v2"
DEFAULT_NATIVE_ENDPOINT = "https://api.next.bspapp.com"
AMAP_PLACE_URL = "https://restapi.amap.com/v3/place/text"
ZHIPU_CHAT_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"


def normalize_text(text):
    return re.sub(r"\s+", " ", str(text or "").replace("\u00a0", " ")).strip()


def read_names(path):
    names = []
    with Path(path).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        for row in reader:
            value = normalize_text(row[0] if row else "")
            if value:
                names.append(value)
    deduped = []
    seen = set()
    for name in names:
        if name in seen:
            continue
        seen.add(name)
        deduped.append(name)
    return deduped


def load_json_with_retry(request, timeout=60, retries=5, sleep_seconds=1.2):
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:
            last_error = error
            if attempt >= retries:
                raise
            time.sleep(sleep_seconds * attempt)
    raise last_error


def hmac_md5_hex(content, secret):
    return hmac.new(secret.encode("utf-8"), content.encode("utf-8"), hashlib.md5).hexdigest()


def sign_native_payload(payload, client_secret):
    parts = []
    for key in sorted(payload.keys()):
        value = payload.get(key)
        if value is None or value == "":
            continue
        parts.append(f"{key}={value}")
    return hmac_md5_hex("&".join(parts), client_secret)


def discover_native_config():
    config = {
        "endpoint": os.getenv("UNICLOUD_ENDPOINT", DEFAULT_NATIVE_ENDPOINT),
        "space_id": os.getenv("UNICLOUD_SPACE_ID", ""),
        "client_secret": os.getenv("UNICLOUD_CLIENT_SECRET", ""),
        "function_name": os.getenv("BABYPLACE_SEED_FUNCTION", DEFAULT_NATIVE_FUNCTION),
    }
    if config["space_id"] and config["client_secret"]:
        return config

    appdata = os.getenv("APPDATA", "")
    projects_dir = Path(appdata) / "HBuilder X" / "projects"
    if not projects_dir.exists():
        return config
    for setting_path in projects_dir.glob("*/setting.json"):
        try:
            data = json.loads(setting_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for account in (data.get("uniCloud") or {}).values():
            aliyun = account.get("aliyun") or {}
            selected = aliyun.get("selected") or ""
            for space in aliyun.get("spaces") or []:
                if selected and space.get("spaceid") != selected:
                    continue
                if space.get("spaceid") == "mp-55536281-ad8f-4f58-b590-ad515baf863a":
                    config["space_id"] = space.get("spaceid") or config["space_id"]
                    config["client_secret"] = space.get("clientSecret") or config["client_secret"]
                    config["endpoint"] = space.get("apiEndpoint") or config["endpoint"]
                    return config
    return config


class UniCloudNativeClient:
    def __init__(self, endpoint, space_id, client_secret, function_name):
        self.endpoint = endpoint.rstrip("/") + "/client"
        self.space_id = space_id
        self.client_secret = client_secret
        self.function_name = function_name
        self.access_token = ""

    def _post(self, payload, token=""):
        headers = {
            "Content-Type": "application/json",
            "x-serverless-sign": sign_native_payload(payload, self.client_secret),
        }
        if token:
            headers["x-basement-token"] = token
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        return load_json_with_retry(request, timeout=120, retries=5, sleep_seconds=2)

    def get_access_token(self):
        if self.access_token:
            return self.access_token
        result = self._post({
            "method": "serverless.auth.user.anonymousAuthorize",
            "params": "{}",
            "spaceId": self.space_id,
            "timestamp": int(time.time() * 1000),
        })
        token = (((result or {}).get("data") or {}).get("accessToken")) or ""
        if not token:
            raise RuntimeError(f"native auth failed: {result}")
        self.access_token = token
        return token

    def call_function(self, payload):
        token = self.get_access_token()
        request_payload = {
            "method": "serverless.function.runtime.invoke",
            "params": json.dumps({
                "functionTarget": self.function_name,
                "functionArgs": payload,
            }, ensure_ascii=False),
            "spaceId": self.space_id,
            "timestamp": int(time.time() * 1000),
            "token": token,
        }
        result = self._post(request_payload, token=token)
        if not result.get("success", True):
            raise RuntimeError(f"native invoke failed: {result}")
        data = result.get("data") or {}
        if data.get("code") in ("GATEWAY_INVALID_TOKEN", "InvalidParameter.InvalidToken"):
            self.access_token = ""
            return self.call_function(payload)
        return data


def get_json(url, params, timeout=30):
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{url}?{query}",
        method="GET",
        headers={"User-Agent": "babyplace-basename-import/1.0"},
    )
    return load_json_with_retry(request, timeout=timeout)


def search_amap_place(amap_key, keywords, city=""):
    params = {
        "key": amap_key,
        "keywords": keywords,
        "city": city,
        "citylimit": "true" if city else "false",
        "extensions": "all",
        "offset": 5,
        "page": 1,
    }
    result = get_json(AMAP_PLACE_URL, params)
    if str(result.get("status")) != "1":
        return None, f"place search failed: {result.get('info') or result}"
    pois = result.get("pois") or []
    if not pois:
        return None, "place search empty"
    return select_best_poi(pois, keywords), ""


def infer_city_from_name(name):
    text = normalize_text(name)
    if "佛山" in text:
        return "佛山"
    if "从化" in text or "南沙" in text or "番禺" in text or "海珠" in text or "广州" in text:
        return "广州"
    return ""


def select_best_poi(pois, name):
    expected = normalize_text(name)
    for poi in pois:
        poi_name = normalize_text(poi.get("name"))
        if poi_name == expected:
            return poi
    for poi in pois:
        poi_name = normalize_text(poi.get("name"))
        if expected and (expected in poi_name or poi_name in expected):
            return poi
    return pois[0]


def map_category(amap_type):
    amap_type = normalize_text(amap_type)
    if any(token in amap_type for token in ["公园", "绿地", "广场"]):
        return "park"
    if any(token in amap_type for token in ["博物馆", "展览馆", "科技馆", "文化馆"]):
        return "museum"
    if any(token in amap_type for token in ["动物园"]):
        return "zoo"
    if any(token in amap_type for token in ["农场", "农业", "采摘园"]):
        return "farm"
    if any(token in amap_type for token in ["游乐", "儿童乐园", "欢乐海岸"]):
        return "playground"
    if any(token in amap_type for token in ["购物", "商场", "奥莱"]):
        return "mall"
    return "mixed"


def infer_price_type(name, amap_type):
    text = f"{normalize_text(name)} {normalize_text(amap_type)}"
    if any(token in text for token in ["博物馆", "科技馆", "欢乐海岸", "奥莱", "岭南天地"]):
        return "mixed"
    return "free"


def infer_duration(amap_type):
    text = normalize_text(amap_type)
    if any(token in text for token in ["山", "森林公园", "景区"]):
        return "half_day"
    if any(token in text for token in ["博物馆", "科技馆"]):
        return "2h"
    return "2h"


def call_zhipu_description(api_key, poi):
    prompt = (
        "请基于以下地点基础信息，生成适合 babyplace 使用的中文景点简介。"
        "不要编造票价、营业时间、停车场数量等无法从输入确定的事实。"
        "请输出 JSON，字段必须严格包含 summary, description, transport_hint, parking_tip, stroller_friendly, tags。"
        "其中 summary 为一句话，description 为 120-220 字，transport_hint 和 parking_tip 可保守描述，"
        "stroller_friendly 为 true/false，tags 为 3-6 个短标签数组。"
        f"\n地点名称: {poi['name']}"
        f"\n城市: {poi['city']}"
        f"\n区域: {poi['district']}"
        f"\n地址: {poi['address']}"
        f"\n高德类型: {poi['amap_type']}"
    )
    body = {
        "model": os.getenv("ZHIPU_MODEL", "glm-4-flash"),
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": "你是一个谨慎的中文城市亲子地点编辑。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.4,
    }
    request = urllib.request.Request(
        ZHIPU_CHAT_URL,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    result = load_json_with_retry(request, timeout=120, retries=4, sleep_seconds=2)
    choices = result.get("choices") or []
    if not choices:
        raise RuntimeError(f"zhipu empty result: {result}")
    content = (((choices[0] or {}).get("message") or {}).get("content")) or "{}"
    payload = json.loads(content)
    return {
        "summary": normalize_text(payload.get("summary")),
        "description": normalize_text(payload.get("description")),
        "transport_hint": normalize_text(payload.get("transport_hint")),
        "parking_tip": normalize_text(payload.get("parking_tip")),
        "stroller_friendly": bool(payload.get("stroller_friendly")),
        "tags": [normalize_text(item) for item in (payload.get("tags") or []) if normalize_text(item)],
    }


def enrich_name(amap_key, zhipu_key, raw_name):
    city = infer_city_from_name(raw_name)
    poi, error = search_amap_place(amap_key, raw_name, city)
    if not poi and city:
        poi, error = search_amap_place(amap_key, raw_name, "")
    if not poi:
        return None, error

    location = normalize_text(poi.get("location"))
    lng_text, lat_text = ("0", "0")
    if "," in location:
        lng_text, lat_text = location.split(",", 1)
    photos = poi.get("photos") or []
    cover_image = ""
    if isinstance(photos, list) and photos:
        cover_image = normalize_text((photos[0] or {}).get("url"))

    poi_name = normalize_text(poi.get("name") or raw_name)
    city_name = normalize_text(poi.get("cityname") or city or "广州")
    district = normalize_text(poi.get("adname") or "")
    address = normalize_text(poi.get("address") or "")
    amap_type = normalize_text(poi.get("type") or "")
    llm = call_zhipu_description(zhipu_key, {
        "name": poi_name,
        "city": city_name,
        "district": district,
        "address": address,
        "amap_type": amap_type,
    })

    poi_row = {
        "name": poi_name,
        "canonical_name": poi_name,
        "alias": [raw_name] if raw_name != poi_name else [],
        "city": city_name,
        "district": district or city_name,
        "address": address,
        "location": {
            "lat": round(float(lat_text), 6),
            "lng": round(float(lng_text), 6),
        },
        "category": map_category(amap_type),
        "price_type": infer_price_type(poi_name, amap_type),
        "recommended_duration": infer_duration(amap_type),
        "transport": ["公共交通", "自驾"],
        "transport_hint": llm["transport_hint"],
        "parking_tip": llm["parking_tip"],
        "facilities": {
            "stroller_friendly": llm["stroller_friendly"],
            "parking": bool(llm["parking_tip"]),
            "restroom": False,
            "food": False,
            "shade": False,
            "rainy_day_ok": False,
        },
        "summary": llm["summary"],
        "recommend_reason": llm["description"],
        "cover_image": cover_image,
        "tags": llm["tags"],
        "status": "published",
    }
    article_row = {
        "poi_name": poi_name,
        "title": f"{poi_name} 景点简介",
        "source_account": "AI生成",
        "source_account_id": "ai-generated",
        "cover_image": cover_image,
        "content_text": llm["description"],
        "content_html": f"<p>{llm['description']}</p>" if llm["description"] else "",
        "extracted_poi_names": [poi_name],
        "parse_result": {
            "source": "basename.csv",
            "raw_name": raw_name,
            "address": address,
            "city": city_name,
            "district": district,
            "location": poi_row["location"],
            "amap_type": amap_type,
            "summary": llm["summary"],
        },
        "status": "parsed",
        "parse_confidence": 0.9,
    }
    return {"poi": poi_row, "article": article_row}, ""


def chunked(items, size):
    for start in range(0, len(items), size):
        yield items[start:start + size]


def save_report(report_dir, filename, data):
    path = Path(report_dir)
    path.mkdir(parents=True, exist_ok=True)
    target = path / filename
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return target


def main():
    parser = argparse.ArgumentParser(description="Import POIs from basename.csv")
    parser.add_argument("--source", default=str(DEFAULT_SOURCE), help="CSV path")
    parser.add_argument("--report-dir", default=str(DEFAULT_REPORT_DIR), help="Report dir")
    parser.add_argument("--secret", default=DEFAULT_SECRET, help="Cloud secret")
    parser.add_argument("--limit", type=int, default=0, help="Only process first N names")
    parser.add_argument("--batch", type=int, default=10, help="Batch size")
    parser.add_argument("--dry-run", action="store_true", help="Do not write cloud data")
    args = parser.parse_args()

    amap_key = os.getenv("AMAP_WEB_KEY", "").strip()
    zhipu_key = os.getenv("ZHIPU_API_KEY", "").strip()
    if not amap_key:
        print("missing AMAP_WEB_KEY")
        sys.exit(1)
    if not zhipu_key:
        print("missing ZHIPU_API_KEY")
        sys.exit(1)

    native_config = discover_native_config()
    if not native_config["space_id"] or not native_config["client_secret"]:
        print("missing uniCloud native config")
        sys.exit(1)
    client = UniCloudNativeClient(
        endpoint=native_config["endpoint"],
        space_id=native_config["space_id"],
        client_secret=native_config["client_secret"],
        function_name=native_config["function_name"],
    )

    names = read_names(args.source)
    if args.limit > 0:
        names = names[:args.limit]

    prepared = []
    skipped = []
    for index, raw_name in enumerate(names, start=1):
        try:
            enriched, error = enrich_name(amap_key, zhipu_key, raw_name)
        except Exception as exc:
            enriched = None
            error = f"process failed: {exc}"
        if not enriched:
            skipped.append({"name": raw_name, "reason": error})
            continue
        prepared.append({
            "name": raw_name,
            "poi": enriched["poi"],
            "article": enriched["article"],
        })
        print(f"[{index}/{len(names)}] ok {raw_name}")
        time.sleep(0.2)

    timestamp = time.strftime("%Y%m%d-%H%M%S")
    prepared_report = save_report(args.report_dir, f"basename-prepared-{timestamp}.json", prepared)
    skipped_report = save_report(args.report_dir, f"basename-skipped-{timestamp}.json", skipped)
    print(f"prepared: {len(prepared)}")
    print(f"skipped: {len(skipped)}")
    print(f"prepared report: {prepared_report}")
    print(f"skipped report: {skipped_report}")

    if args.dry_run:
        return

    poi_succeeded = []
    poi_failed = []
    article_succeeded = []
    article_failed = []
    for batch in chunked(prepared, args.batch):
        poi_rows = [item["poi"] for item in batch]
        article_rows = [item["article"] for item in batch]
        poi_result = client.call_function({
            "action": "seed.upsertPoiBatch",
            "secret": args.secret,
            "data": poi_rows,
        })
        if poi_result.get("code") != 0:
            raise RuntimeError(f"poi upsert failed: {poi_result}")
        article_result = client.call_function({
            "action": "seed.upsertArticleBatch",
            "secret": args.secret,
            "data": article_rows,
        })
        if article_result.get("code") != 0:
            raise RuntimeError(f"article upsert failed: {article_result}")
        poi_data = poi_result.get("data") or {}
        article_data = article_result.get("data") or {}
        poi_succeeded.extend(poi_data.get("succeededItems") or [])
        poi_failed.extend(poi_data.get("failedItems") or [])
        article_succeeded.extend(article_data.get("succeededItems") or [])
        article_failed.extend(article_data.get("failedItems") or [])
        print(
            f"batch ok: poi {poi_data.get('succeeded', 0)}/{poi_data.get('total', 0)}, "
            f"article {article_data.get('succeeded', 0)}/{article_data.get('total', 0)}"
        )

    result_report = save_report(args.report_dir, f"basename-upsert-result-{timestamp}.json", {
        "poi": {"succeeded": poi_succeeded, "failed": poi_failed},
        "article": {"succeeded": article_succeeded, "failed": article_failed},
        "total": len(prepared),
    })
    print(f"result report: {result_report}")


if __name__ == "__main__":
    main()
