#!/usr/bin/env python3
"""
Extract POI metadata from docs/网络数据源 下的公众号 JSON, enrich with AMap geodata,
then upsert into babyplace-poi through babyplace-admin seed HTTP actions.

Examples:
  python scripts/enrich_azhen_poi.py --dry-run --limit 20
  python scripts/enrich_azhen_poi.py --amap-web-key <KEY>
"""

import argparse
import json
import os
import re
import sys
import time
import hmac
import hashlib
import urllib.parse
import urllib.request
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = BASE_DIR / "docs" / "网络数据源" / "真的叫阿珍" / "真的叫阿珍.json"
DEFAULT_REPORT_DIR = BASE_DIR / "seed" / "reports"
DEFAULT_URL = "https://byupload.aixifs.com/babyplace-admin"
DEFAULT_SECRET = "babyplace2026"
DEFAULT_NATIVE_FUNCTION = "babyplace-seed-v2"
DEFAULT_NATIVE_ENDPOINT = "https://api.next.bspapp.com"
AMAP_PLACE_URL = "https://restapi.amap.com/v3/place/text"
AMAP_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo"

GENERIC_ALBUM_TITLES = {
    "旅游景点推荐",
    "小众旅游景点",
    "自驾游",
    "自由行",
    "穷游推荐",
    "广州游玩",
    "旅游胜地推荐",
    "小众旅游胜地",
    "避暑胜地",
    "周末一日游",
}

CITY_KEYWORDS = ["广州", "佛山", "深圳", "东莞", "中山", "珠海", "惠州", "清远", "肇庆", "江门"]
DEFAULT_TARGET_CITIES = ["广州", "佛山", "深圳"]
REGION_CITY_MAP = {
    "越秀": "广州",
    "荔湾": "广州",
    "海珠": "广州",
    "天河": "广州",
    "白云": "广州",
    "黄埔": "广州",
    "番禺": "广州",
    "花都": "广州",
    "南沙": "广州",
    "增城": "广州",
    "从化": "广州",
    "顺德": "佛山",
    "南海": "佛山",
    "禅城": "佛山",
    "三水": "佛山",
    "高明": "佛山",
    "南山": "深圳",
    "福田": "深圳",
    "罗湖": "深圳",
    "宝安": "深圳",
    "龙岗": "深圳",
    "龙华": "深圳",
    "盐田": "深圳",
    "坪山": "深圳",
    "光明": "深圳",
}
CITY_REGION_MAP = {}
for region, city in REGION_CITY_MAP.items():
    CITY_REGION_MAP.setdefault(city, set()).add(region)
POI_SUFFIX_PATTERN = re.compile(r"(公园|湿地|动物园|植物园|博物馆|艺术中心|艺术馆|古村|古镇|古街|村|镇|塔|苑|寺|山|岛|湖|江|湾|林场|步道|碧道|景区|乐园|广场|绿道|书院|书屋|水库|天坑|小镇|图书馆|文化馆|创意园)$")
GENERIC_POI_PATTERN = re.compile(r"(中国|全国|国内|小众|推荐|旅游|景点|四座|几个|一日游|攻略|路线|清单|地方|目的地|城市|胜地)")


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def post_json(url, payload, timeout=90):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    return load_json_with_retry(req, timeout=timeout)


def get_json(url, params, timeout=30):
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        f"{url}?{query}",
        method="GET",
        headers={"User-Agent": "babyplace-ingest/1.0"},
    )
    return load_json_with_retry(req, timeout=timeout)


def load_json_with_retry(req, timeout=30, retries=5, sleep_seconds=1.2):
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:
            last_error = error
            if attempt >= retries:
                raise
            time.sleep(sleep_seconds * attempt)
    raise last_error


def call_seed_api(url, secret, payload):
    return post_json(url, {"secret": secret, **payload})


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
    if not appdata:
        return config
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


def native_post_json(endpoint, payload, client_secret, token=""):
    headers = {
        "Content-Type": "application/json",
        "x-serverless-sign": sign_native_payload(payload, client_secret),
    }
    if token:
        headers["x-basement-token"] = token
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
    return load_json_with_retry(req, timeout=120, retries=5, sleep_seconds=2)


class UniCloudNativeClient:
    def __init__(self, endpoint, space_id, client_secret, function_name):
        self.endpoint = endpoint.rstrip("/") + "/client"
        self.space_id = space_id
        self.client_secret = client_secret
        self.function_name = function_name
        self.access_token = ""

    def get_access_token(self):
        if self.access_token:
            return self.access_token
        payload = {
            "method": "serverless.auth.user.anonymousAuthorize",
            "params": "{}",
            "spaceId": self.space_id,
            "timestamp": int(time.time() * 1000),
        }
        result = native_post_json(self.endpoint, payload, self.client_secret)
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
        result = native_post_json(self.endpoint, request_payload, self.client_secret, token=token)
        data = result.get("data") or {}
        if data.get("code") in ("GATEWAY_INVALID_TOKEN", "InvalidParameter.InvalidToken"):
            self.access_token = ""
            return self.call_function(payload)
        return data


def normalize_text(text):
    return re.sub(r"\s+", " ", str(text or "").replace("\u00a0", " ")).strip()


def split_sentences(text):
    clean = normalize_text(text)
    if not clean:
        return []
    return [item.strip() for item in re.split(r"[。！？!?]\s*", clean) if item.strip()]


def extract_context_sentence(content, poi_name):
    body = normalize_text(content)
    name = normalize_text(poi_name)
    if not body or not name or name not in body:
        return ""
    for sentence in split_sentences(body):
        if name in sentence:
            return sentence
    return ""


def pick_city(*texts):
    content = " ".join(normalize_text(text) for text in texts if normalize_text(text))
    for city in CITY_KEYWORDS:
        if city in content:
            return city
    for region, city in REGION_CITY_MAP.items():
        if region in content:
            return city
    city_match = re.search(r"([一-龥]{2,8})市", content)
    if city_match:
        return city_match.group(1)
    return "广州"


def is_specific_poi_name(title):
    value = normalize_text(title)
    if not value or value in GENERIC_ALBUM_TITLES:
        return False
    if not POI_SUFFIX_PATTERN.search(value):
        return False
    if GENERIC_POI_PATTERN.search(value):
        return False
    if len(value) < 2 or len(value) > 24:
        return False
    return True


def pick_album_poi(item):
    for album in item.get("appmsg_album_infos") or []:
        title = normalize_text(album.get("title"))
        if not is_specific_poi_name(title):
            continue
        return title
    return ""


def clean_poi_candidate(text):
    value = normalize_text(text)
    if not value:
        return ""
    value = re.sub(r"^[这那该个座片处间条段个我国著名的佛门圣地—\-——]+", "", value)
    value = re.sub(r"[，。！!？?\s].*$", "", value)
    if not is_specific_poi_name(value):
        return ""
    return value


def extract_with_regex(item):
    title = normalize_text(item.get("title"))
    content = normalize_text(item.get("content"))
    album_poi = pick_album_poi(item)
    poi_name = album_poi
    if not poi_name:
        patterns = [
            r"(?:这里就是|这就是|它就是|就是位于|就是|位于|打卡|来到|导航至|导航到)([^，。！!？?\s]{2,40})",
            r"(?:这里就是|它就是|就是|这个地方是|这个绝妙的[^，。]*就是)([^，。！!？?\s]{2,30})",
            r"(?:地点|地址|导航至|导航到|自驾导航)([^，。！!？?\s]{2,40})",
        ]
        for pattern in patterns:
            match = re.search(pattern, content)
            if match:
                candidate = clean_poi_candidate(match.group(1))
                if candidate:
                    poi_name = candidate
                    break
    explicit_address = ""
    for pattern in [r"地点[:：]\s*([^。！？!\n]{4,80})", r"地址[:：]\s*([^。！？!\n]{4,80})"]:
        match = re.search(pattern, content)
        if match:
            explicit_address = normalize_text(match.group(1))
            break

    transport_lines = []
    parking_lines = []
    for sentence in split_sentences(content):
        if any(token in sentence for token in ["地铁", "公交", "高铁", "有轨电车", "自驾", "导航", "步行", "打车"]):
            transport_lines.append(sentence)
        if any(token in sentence for token in ["停车", "车位", "停车场", "路边", "堵车"]):
            parking_lines.append(sentence)
    transport_hint = "；".join(dict.fromkeys(transport_lines))
    parking_tip = "；".join(dict.fromkeys(parking_lines))

    stroller_friendly = None
    if any(token in content for token in ["遛娃", "亲子", "推车", "平缓", "宽大", "步道好走"]):
        stroller_friendly = True

    poi_sentence = extract_context_sentence(content, poi_name)
    city = pick_city(explicit_address, poi_name, poi_sentence, title, content)
    summary = split_sentences(content)
    return {
        "title": title,
        "album_poi": album_poi,
        "poi_name": poi_name,
        "city": city,
        "content": content,
        "explicit_address": explicit_address,
        "transport_hint": transport_hint,
        "parking_tip": parking_tip,
        "stroller_friendly": stroller_friendly,
        "summary": summary[0] if summary else "",
        "recommend_reason": content[:600],
    }


def search_amap_place(amap_key, keywords, city):
    result = get_json(AMAP_PLACE_URL, {
        "key": amap_key,
        "keywords": f"{city}{keywords}" if city else keywords,
        "city": city,
        "citylimit": "true",
        "extensions": "base",
        "offset": 5,
        "page": 1,
    })
    if str(result.get("status")) != "1":
        return None, f"place search failed: {result.get('info') or result}"
    pois = result.get("pois") or []
    if not pois:
        return None, "place search empty"
    best = select_best_poi(pois, keywords, city)
    if not best:
        return None, "place search no matched poi"
    return best, ""


def select_best_poi(pois, poi_name, city):
    expected = normalize_text(poi_name)
    for poi in pois:
        name = normalize_text(poi.get("name"))
        poi_type = normalize_text(poi.get("type"))
        poi_city = normalize_text(poi.get("cityname") or "")
        if any(token in poi_type for token in ["停车场", "住宿", "宾馆", "酒店", "民宿"]):
            continue
        if poi_type and not any(
            poi_type.startswith(prefix)
            for prefix in ["风景名胜", "公园广场", "科教文化服务", "地名地址信息", "商务住宅"]
        ):
            continue
        if expected and expected == name:
            return poi
        if expected and (expected in name or name in expected):
            return poi
        if city and city in poi_city and expected[:2] and expected[:2] in name:
            return poi
    return None


def geocode_amap_address(amap_key, address, city):
    result = get_json(AMAP_GEOCODE_URL, {
        "key": amap_key,
        "address": address,
        "city": city,
    })
    if str(result.get("status")) != "1":
        return None, f"geocode failed: {result.get('info') or result}"
    geocodes = result.get("geocodes") or []
    if not geocodes:
        return None, "geocode empty"
    return geocodes[0], ""


def enrich_with_amap(amap_key, extracted):
    poi_name = extracted["poi_name"]
    city = extracted["city"]
    explicit_address = extracted["explicit_address"]

    poi = None
    match_method = ""
    errors = []

    if explicit_address:
        geo, error = geocode_amap_address(amap_key, explicit_address, city)
        if geo:
            poi = {
                "name": poi_name or normalize_text(geo.get("formatted_address")),
                "address": normalize_text(geo.get("formatted_address")),
                "location": geo.get("location", ""),
                "city": normalize_text((geo.get("city") or city)),
                "district": normalize_text(geo.get("district")),
                "pname": normalize_text(geo.get("province")),
                "type": "",
            }
            match_method = "geocode"
        elif error:
            errors.append(error)

    if not poi and poi_name:
        place, error = search_amap_place(amap_key, poi_name, city)
        if place:
            poi = place
            match_method = "place"
        elif error:
            errors.append(error)

    if not poi:
        return None, " | ".join(errors) or "no amap result"

    actual_city = normalize_text(poi.get("cityname") or poi.get("city") or city)
    if city and actual_city and city not in actual_city and actual_city not in city:
        if explicit_address and city in explicit_address:
            return None, f"city mismatch: expected {city}, got {actual_city}"

    amap_name = normalize_text(poi.get("name") or "")
    amap_type = normalize_text(poi.get("type") or "")
    bad_type_tokens = ["停车场", "住宿", "宾馆", "酒店", "民宿"]
    if any(token in amap_type for token in bad_type_tokens):
        return None, f"bad amap type: {amap_type}"
    if amap_name and poi_name and poi_name not in amap_name and amap_name not in poi_name:
        return None, f"name mismatch: {poi_name} vs {amap_name}"

    location = normalize_text(poi.get("location"))
    lng_text, lat_text = ("0", "0")
    if "," in location:
        lng_text, lat_text = location.split(",", 1)

    transport = []
    combined_hint = f"{extracted['transport_hint']} {extracted['parking_tip']}"
    if any(token in combined_hint for token in ["地铁", "公交", "高铁", "电车", "步行", "打车"]):
        transport.append("公共交通")
    if any(token in combined_hint for token in ["自驾", "导航", "停车", "车位", "堵车"]):
        transport.append("自驾")
    if not transport:
        transport.append("自驾")

    return {
        "name": normalize_text(poi_name or poi.get("name")),
        "canonical_name": normalize_text(poi.get("name") or poi_name),
        "city": actual_city,
        "district": normalize_text(poi.get("adname") or poi.get("district")),
        "address": normalize_text(poi.get("address") or poi.get("formatted_address") or explicit_address),
        "location": {
            "lat": round(float(lat_text), 6),
            "lng": round(float(lng_text), 6),
        },
        "transport": transport,
        "transport_hint": extracted["transport_hint"],
        "parking_tip": extracted["parking_tip"],
        "facilities": {
            "parking": bool(extracted["parking_tip"]),
            "stroller_friendly": bool(extracted["stroller_friendly"]),
        },
        "summary": extracted["summary"],
        "recommend_reason": extracted["recommend_reason"],
        "cover_image": normalize_text(poi.get("photos", "").split(";")[0] if poi.get("photos") else ""),
        "status": "published",
        "_match_method": match_method,
        "_amap_type": amap_type,
    }, ""


def should_process(extracted, target_cities):
    album_poi = extracted["album_poi"]
    if not album_poi:
        return False
    if not target_cities:
        return True
    inferred_city = pick_city(
        extracted["explicit_address"],
        extracted["poi_name"],
        extract_context_sentence(extracted["content"], extracted["poi_name"]),
        extracted["title"],
        extracted["content"],
    )
    return inferred_city in target_cities


def build_source_rows(items, amap_key, target_cities):
    rows = []
    skipped = []
    for item in items:
        extracted = extract_with_regex(item)
        if not should_process(extracted, target_cities):
            skipped.append({
                "title": extracted["title"],
                "poi_name": extracted["poi_name"],
                "album_poi": extracted["album_poi"],
                "reason": f"out of target scope: {extracted['city']}",
            })
            continue
        if not extracted["poi_name"] and not extracted["explicit_address"]:
            skipped.append({
                "title": extracted["title"],
                "reason": "no poi clue",
            })
            continue
        try:
            enriched, error = enrich_with_amap(amap_key, extracted)
        except Exception as exc:
            enriched = None
            error = f"amap request error: {exc}"
        if not enriched:
            skipped.append({
                "title": extracted["title"],
                "poi_name": extracted["poi_name"],
                "reason": error,
            })
            continue
        enriched["_source"] = {
            "aid": item.get("aid"),
            "title": extracted["title"],
            "link": item.get("link"),
        }
        rows.append(enriched)
        time.sleep(0.15)
    filtered_rows, filtered_out = filter_rows(rows, target_cities)
    skipped.extend(filtered_out)
    return dedupe_rows(filtered_rows), skipped


def is_row_high_confidence(row, target_cities):
    title = normalize_text(((row.get("_source") or {}).get("title")))
    name = normalize_text(row.get("name"))
    amap_type = normalize_text(row.get("_amap_type"))
    scope = " ".join([title, name])
    non_target_cities = [city for city in CITY_KEYWORDS if city not in target_cities]

    if any(city in scope for city in non_target_cities):
        return False, f"non target city in title/name: {scope}"
    if target_cities and not any(
        city in scope or any(region in scope for region in CITY_REGION_MAP.get(city, set()))
        for city in target_cities
    ):
        return False, f"missing target region hint: {name}"
    if amap_type.startswith("商务住宅") and not any(token in name for token in ["创意园", "小镇"]):
        return False, f"bad commercial type: {amap_type}"
    if amap_type.startswith("购物服务"):
        return False, f"bad commerce type: {amap_type}"
    return True, ""


def filter_rows(rows, target_cities):
    filtered = []
    skipped = []
    for row in rows:
        passed, reason = is_row_high_confidence(row, target_cities)
        if passed:
            filtered.append(row)
            continue
        skipped.append({
            "title": ((row.get("_source") or {}).get("title")) or "",
            "poi_name": row.get("name") or "",
            "reason": reason,
        })
    return filtered, skipped


def merge_text(left, right):
    values = [normalize_text(left), normalize_text(right)]
    values = [value for value in values if value]
    return "；".join(dict.fromkeys(values))


def dedupe_rows(rows):
    merged = {}
    for row in rows:
        key = f"{normalize_text(row.get('city'))}::{normalize_text(row.get('name'))}"
        if key not in merged:
            merged[key] = row
            continue
        current = merged[key]
        current["transport"] = list(dict.fromkeys((current.get("transport") or []) + (row.get("transport") or [])))
        current["transport_hint"] = merge_text(current.get("transport_hint"), row.get("transport_hint"))
        current["parking_tip"] = merge_text(current.get("parking_tip"), row.get("parking_tip"))
        if len(normalize_text(row.get("recommend_reason"))) > len(normalize_text(current.get("recommend_reason"))):
            current["recommend_reason"] = row.get("recommend_reason")
        if len(normalize_text(row.get("summary"))) > len(normalize_text(current.get("summary"))):
            current["summary"] = row.get("summary")
    return list(merged.values())


def chunked(rows, size):
    for start in range(0, len(rows), size):
        yield rows[start:start + size]


def upsert_rows(call_api, rows, batch_size):
    all_succeeded = []
    all_failed = []
    action = "seed.upsertPoiBatch"
    for index, batch in enumerate(chunked(rows, batch_size), start=1):
        payload = []
        for item in batch:
            row = {k: v for k, v in item.items() if not k.startswith("_")}
            payload.append(row)
        result = call_api({
            "action": action,
            "data": payload,
        })
        if result.get("code") == 400 and "invalid action" in str(result.get("message", "")) and action == "seed.upsertPoiBatch":
            action = "seed.insertBatch"
            result = call_api({
                "action": action,
                "collection": "babyplace-poi",
                "data": payload,
            })
        if result.get("code") != 0:
            raise RuntimeError(f"batch {index} failed: {result.get('message')}")
        data = result.get("data") or {}
        all_succeeded.extend(data.get("succeededItems") or [])
        all_failed.extend(data.get("failedItems") or [])
        print(f"batch {index}: succeeded={data.get('succeeded', 0)} failed={data.get('failed', 0)}")
    return all_succeeded, all_failed


def ensure_report_dir(path):
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_report(report_dir, file_name, data):
    path = report_dir / file_name
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def main():
    parser = argparse.ArgumentParser(description="Enrich Azhen docs with AMap geodata and upsert POIs")
    parser.add_argument("--source", default=str(DEFAULT_SOURCE), help="Path to 真的叫阿珍.json")
    parser.add_argument("--url", default=os.getenv("BABYPLACE_ADMIN_HTTP_URL", DEFAULT_URL), help="babyplace-admin HTTP URL")
    parser.add_argument("--secret", default=DEFAULT_SECRET, help="seed secret")
    parser.add_argument("--amap-web-key", default=os.getenv("AMAP_WEB_KEY", ""), help="AMap Web Service key")
    parser.add_argument("--transport", choices=["native", "http"], default=os.getenv("BABYPLACE_INGEST_TRANSPORT", "native"), help="Cloud invoke transport")
    parser.add_argument("--native-space-id", default=os.getenv("UNICLOUD_SPACE_ID", ""), help="uniCloud space id")
    parser.add_argument("--native-client-secret", default=os.getenv("UNICLOUD_CLIENT_SECRET", ""), help="uniCloud client secret")
    parser.add_argument("--native-endpoint", default=os.getenv("UNICLOUD_ENDPOINT", DEFAULT_NATIVE_ENDPOINT), help="uniCloud endpoint")
    parser.add_argument("--native-function", default=os.getenv("BABYPLACE_SEED_FUNCTION", DEFAULT_NATIVE_FUNCTION), help="uniCloud function name")
    parser.add_argument("--limit", type=int, default=0, help="Only process first N items")
    parser.add_argument("--batch", type=int, default=20, help="Upsert batch size")
    parser.add_argument("--dry-run", action="store_true", help="Extract and enrich only, do not upload")
    parser.add_argument("--clear-poi-before-run", action="store_true", help="Clear babyplace-poi before upload")
    parser.add_argument("--report-dir", default=str(DEFAULT_REPORT_DIR), help="Output report dir")
    parser.add_argument("--target-cities", default=",".join(DEFAULT_TARGET_CITIES), help="Comma separated city whitelist")
    args = parser.parse_args()

    if not args.amap_web_key:
        print("missing --amap-web-key or AMAP_WEB_KEY")
        sys.exit(1)
    if args.batch <= 0 or args.batch > 100:
        print("batch must be between 1 and 100")
        sys.exit(1)

    source_items = read_json(args.source)
    if args.limit > 0:
        source_items = source_items[:args.limit]
    target_cities = [normalize_text(item) for item in args.target_cities.split(",") if normalize_text(item)]

    report_dir = ensure_report_dir(Path(args.report_dir))
    timestamp = time.strftime("%Y%m%d-%H%M%S")

    rows, skipped = build_source_rows(source_items, args.amap_web_key, target_cities)
    prepared_report = save_report(report_dir, f"azhen-poi-prepared-{timestamp}.json", rows)
    skipped_report = save_report(report_dir, f"azhen-poi-skipped-{timestamp}.json", skipped)

    print(f"prepared rows: {len(rows)}")
    print(f"skipped rows: {len(skipped)}")
    print(f"prepared report: {prepared_report}")
    print(f"skipped report: {skipped_report}")

    if args.dry_run:
        return

    if args.transport == "native":
        native_config = discover_native_config()
        if args.native_space_id:
            native_config["space_id"] = args.native_space_id
        if args.native_client_secret:
            native_config["client_secret"] = args.native_client_secret
        if args.native_endpoint:
            native_config["endpoint"] = args.native_endpoint
        if args.native_function:
            native_config["function_name"] = args.native_function
        if not native_config["space_id"] or not native_config["client_secret"]:
            print("missing native uniCloud config: UNICLOUD_SPACE_ID / UNICLOUD_CLIENT_SECRET")
            sys.exit(1)
        client = UniCloudNativeClient(
            endpoint=native_config["endpoint"],
            space_id=native_config["space_id"],
            client_secret=native_config["client_secret"],
            function_name=native_config["function_name"],
        )
        call_api = lambda payload: client.call_function({"secret": args.secret, **payload})
    else:
        call_api = lambda payload: call_seed_api(args.url, args.secret, payload)

    ping = call_api({"action": "seed.ping"})
    if ping.get("code") != 0:
        raise RuntimeError(f"seed ping failed: {ping.get('message')}")

    if args.clear_poi_before_run:
        clear_result = call_api({
            "action": "seed.clearCollections",
            "collections": ["babyplace-poi"],
        })
        if clear_result.get("code") != 0:
            raise RuntimeError(f"clear poi failed: {clear_result.get('message')}")
        print("cleared collection: babyplace-poi")

    succeeded, failed = upsert_rows(call_api, rows, args.batch)
    result_report = save_report(report_dir, f"azhen-poi-upsert-result-{timestamp}.json", {
        "succeeded": succeeded,
        "failed": failed,
        "total": len(rows),
    })
    print(f"upsert report: {result_report}")
    print(f"succeeded: {len(succeeded)}")
    print(f"failed: {len(failed)}")


if __name__ == "__main__":
    main()
