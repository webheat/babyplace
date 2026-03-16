#!/usr/bin/env python3
"""
Seed demo data into babyplace cloud tables.

One-click:
  python scripts/seed.py
"""

import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
SEED_DIR = BASE_DIR / "seed"
DEFAULT_BATCH = 100
DEFAULT_SECRET = "babyplace2026"
DEFAULT_URL = "https://byupload.aixifs.com/babyplace-admin"
DEFAULT_RETRY = 3

TARGET_COLLECTIONS = [
    "babyplace-poi",
    "babyplace-article",
    "babyplace-content-source",
    "babyplace-user-review",
]


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


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
            text = resp.read().decode("utf-8")
            return json.loads(text)
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


def clear_collections(url, secret):
    result = call_seed_api(
        url,
        secret,
        {
            "action": "clearCollections",
            "collections": TARGET_COLLECTIONS,
        },
    )
    if result.get("code") != 0:
        raise RuntimeError(f"clear collections failed: {result.get('message')}")
    for item in result.get("data", {}).get("list", []):
        print(f"  Cleared {item.get('collection')}: deleted={item.get('deleted')}")


def random_location(base_lat=23.1291, base_lng=113.2644):
    return {
        "lat": round(base_lat + random.uniform(-0.15, 0.15), 6),
        "lng": round(base_lng + random.uniform(-0.15, 0.15), 6),
    }


def normalize_poi(raw_list):
    out = []
    for item in raw_list:
        location = item.get("location") or {}
        lat = location.get("lat")
        lng = location.get("lng")
        if lat is None or lng is None:
            loc = random_location()
            lat = loc["lat"]
            lng = loc["lng"]
        out.append(
            {
                "name": str(item.get("name") or "示例地点").strip(),
                "canonical_name": str(item.get("canonical_name") or item.get("name") or "示例地点").strip(),
                "alias": item.get("alias") if isinstance(item.get("alias"), list) else [],
                "city": str(item.get("city") or "广州").strip(),
                "district": str(item.get("district") or "天河区").strip(),
                "address": str(item.get("address") or "").strip(),
                "location": {"lat": float(lat), "lng": float(lng)},
                "summary": str(item.get("summary") or "").strip(),
                "recommend_reason": str(item.get("recommend_reason") or item.get("summary") or "").strip(),
                "tags": item.get("tags") if isinstance(item.get("tags"), list) else [],
                "status": str(item.get("status") or "published").strip(),
            }
        )
    return out


def normalize_articles(raw_list):
    out = []
    for item in raw_list:
        out.append(
            {
                "title": str(item.get("title") or "示例文章").strip(),
                "source_account": str(item.get("source_account") or "测试公众号").strip(),
                "status": str(item.get("status") or "parsed").strip(),
                "content_text": str(item.get("content_text") or "").strip(),
            }
        )
    return out


def pick_mapped_id(raw_value, id_list):
    if not id_list:
        return ""
    try:
        index = int(str(raw_value).strip()) - 1
    except Exception:
        index = 0
    index = index % len(id_list)
    return id_list[index]


def normalize_sources(raw_list, poi_ids, article_ids):
    out = []
    for item in raw_list:
        poi_id = pick_mapped_id(item.get("poi_id"), poi_ids)
        article_id = pick_mapped_id(item.get("article_id"), article_ids)
        if not poi_id or not article_id:
            continue
        out.append(
            {
                "poi_id": poi_id,
                "article_id": article_id,
                "source_type": str(item.get("source_type") or "article").strip(),
                "confidence_score": float(item.get("confidence_score") or 0.85),
                "status": str(item.get("status") or "active").strip(),
            }
        )
    return out


def normalize_reviews(raw_list, poi_ids):
    out = []
    for item in raw_list:
        poi_id = pick_mapped_id(item.get("poi_id"), poi_ids)
        if not poi_id:
            continue
        try:
            rating = int(item.get("rating") or 5)
        except Exception:
            rating = 5
        rating = max(1, min(5, rating))
        out.append(
            {
                "poi_id": poi_id,
                "rating": rating,
                "comment": str(item.get("comment") or "不错，孩子很喜欢").strip(),
                "nickname": str(item.get("nickname") or "体验用户").strip(),
                "status": str(item.get("status") or "approved").strip(),
            }
        )
    return out


def chunked(data, size):
    for start in range(0, len(data), size):
        yield data[start : start + size]


def insert_collection(url, secret, collection, rows, batch_size, retry_times):
    if not rows:
        print(f"Skipping {collection}: no rows")
        return []
    print(f"Seeding {collection}: total={len(rows)} batch={batch_size}")
    inserted_ids = []
    total_succeeded = 0
    total_failed = 0
    for i, batch in enumerate(chunked(rows, batch_size), start=1):
        result = None
        for attempt in range(1, retry_times + 1):
            result = call_seed_api(
                url,
                secret,
                {
                    "action": "insertBatch",
                    "collection": collection,
                    "data": batch,
                },
            )
            code = result.get("code")
            if code == 0:
                break
            if attempt < retry_times:
                wait_seconds = min(3, attempt)
                print(
                    f"  batch {i}: attempt {attempt} failed ({result.get('message')}), retrying in {wait_seconds}s..."
                )
                time.sleep(wait_seconds)
        code = result.get("code") if result else -1
        if code != 0:
            raise RuntimeError(f"{collection} batch {i} failed: {result.get('message') if result else 'unknown'}")
        data = result.get("data", {})
        total_succeeded += int(data.get("succeeded") or 0)
        total_failed += int(data.get("failed") or 0)
        for item in data.get("succeededItems", []):
            row_id = item.get("id")
            if row_id:
                inserted_ids.append(row_id)
        print(
            f"  batch {i}: succeeded={data.get('succeeded', 0)} failed={data.get('failed', 0)}"
        )
        time.sleep(0.1)
    print(f"Done {collection}: succeeded={total_succeeded} failed={total_failed}")
    return inserted_ids


def main():
    parser = argparse.ArgumentParser(description="Seed demo data to babyplace tables")
    parser.add_argument(
        "--url",
        default=os.getenv("BABYPLACE_ADMIN_HTTP_URL", DEFAULT_URL),
        help="HTTP URL of cloud function babyplace-admin",
    )
    parser.add_argument("--secret", default=DEFAULT_SECRET, help="Seed import secret")
    parser.add_argument("--batch", type=int, default=DEFAULT_BATCH, help="Batch size per request")
    parser.add_argument("--retry", type=int, default=DEFAULT_RETRY, help="Retry times for each batch")
    parser.add_argument("--reset", dest="reset", action="store_true", help="Clear target collections before insert")
    parser.add_argument("--no-reset", dest="reset", action="store_false", help="Do not clear before insert")
    parser.add_argument("--clear-only", action="store_true", help="Only clear target collections and exit")
    parser.set_defaults(reset=True)
    parser.add_argument("--seed-dir", default=str(SEED_DIR), help="Seed json directory path")
    args = parser.parse_args()

    if args.batch <= 0 or args.batch > 200:
        print("batch must be between 1 and 200")
        sys.exit(1)
    if args.retry <= 0 or args.retry > 10:
        print("retry must be between 1 and 10")
        sys.exit(1)

    seed_dir = Path(args.seed_dir).resolve()
    if not seed_dir.exists():
        print(f"Seed dir not found: {seed_dir}")
        sys.exit(1)

    poi_file = seed_dir / "poi_seed.json"
    article_file = seed_dir / "article_seed.json"
    source_file = seed_dir / "source_seed.json"
    review_file = seed_dir / "review_seed.json"

    for path in [poi_file, article_file, source_file, review_file]:
        if not path.exists():
            print(f"Missing file: {path}")
            sys.exit(1)

    print(f"Checking seed API: {args.url}")
    ping(args.url, args.secret)
    print("Seed API reachable")

    if args.reset:
        print("Clearing old demo data...")
        clear_collections(args.url, args.secret)
    if args.clear_only:
        print("Clear-only done.")
        return

    random.seed(20260316)

    poi_rows = normalize_poi(load_json(poi_file))
    article_rows = normalize_articles(load_json(article_file))

    poi_ids = insert_collection(args.url, args.secret, "babyplace-poi", poi_rows, args.batch, args.retry)
    article_ids = insert_collection(args.url, args.secret, "babyplace-article", article_rows, args.batch, args.retry)

    source_rows = normalize_sources(load_json(source_file), poi_ids, article_ids)
    review_rows = normalize_reviews(load_json(review_file), poi_ids)

    insert_collection(args.url, args.secret, "babyplace-content-source", source_rows, args.batch, args.retry)
    insert_collection(args.url, args.secret, "babyplace-user-review", review_rows, args.batch, args.retry)

    print("Seed finished.")
    print(f"POI: {len(poi_ids)}")
    print(f"Article: {len(article_ids)}")
    print(f"Source: {len(source_rows)}")
    print(f"Review: {len(review_rows)}")


if __name__ == "__main__":
    main()
