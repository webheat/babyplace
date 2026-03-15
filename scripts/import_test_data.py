#!/usr/bin/env python3
"""
Batch import test data from JSONPlaceholder into babyplace cloud database.

Usage:
  # Dry run (generate data only, no import)
  python scripts/import_test_data.py --dry-run

  # Import via HTTP
  python scripts/import_test_data.py --url https://your-space.bspapp.com/http/babyplace-admin

  # Save to JSON file for manual import
  python scripts/import_test_data.py --output test_data.json

Configuration:
  For HTTP import, you need to enable HTTP access in uniCloud console:
  1. Log in to https://unicloud.dcloud.net.cn
  2. Go to your cloud space -> Cloud Functions -> babyplace-admin
  3. Enable HTTP access and copy the URL
  4. Default secret is 'babyplace2026', change via --secret parameter
"""

import argparse
import json
import random
import sys
import urllib.request
import urllib.error
from datetime import datetime

JSONPLACEHOLDER_URL = "https://jsonplaceholder.typicode.com/users"

BABY_PLACE_NAMES = [
    "Baby Park", "Kids Playground", "Family Garden", "Children's Corner",
    "Little Explorers", "Toddler Town", "Kids Zone", "Family Fun Center",
    "Baby Paradise", "Happy Kids Park", "Sunshine Playground", "Rainbow Garden",
    "Adventure Land", "Magic Castle", "Dream Garden", "Joyful Park",
]

SUITABLE_AGES = ["0-1岁", "1-3岁", "3-6岁", "0-3岁", "全年龄段"]

TRANSPORT_HINTS = [
    "地铁1号线直达，A出口步行5分钟",
    "公交车12路、35路可达",
    "自驾导航即可，建议避开高峰期",
    "地铁2号线转公交可达",
    "停车方便，建议自驾",
]

PARKING_TIPS = [
    "地下停车场，前2小时免费",
    "路边有收费停车位",
    "商场停车场，消费可抵扣",
    "园区内有免费停车场",
    "建议停在对面商场",
]

STROLLER_FRIENDLY = ["是", "否", "部分区域"]


def fetch_jsonplaceholder_users():
    """Fetch user data from JSONPlaceholder."""
    req = urllib.request.Request(JSONPLACEHOLDER_URL)
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def generate_test_data(users, count=50):
    """Generate test data based on JSONPlaceholder users."""
    data = []
    random.seed(42)

    for i in range(count):
        user = users[i % len(users)]
        addr = user.get("address", {})
        geo = addr.get("geo", {})

        base_lat = float(geo.get("lat", 0))
        base_lng = float(geo.get("lng", 0))

        lat = base_lat + random.uniform(-2, 2)
        lng = base_lng + random.uniform(-2, 2)

        lat = max(-90, min(90, lat))
        lng = max(-180, min(180, lng))

        city = addr.get("city", f"City{i}")
        street = addr.get("street", f"Street{i}")
        zipcode = addr.get("zipcode", "")

        name = f"{random.choice(BABY_PLACE_NAMES)} - {city}"

        full_address = f"{street}, {city} {zipcode}".strip()

        data.append({
            "name": name,
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "address": full_address,
            "suitable_ages": random.choice(SUITABLE_AGES),
            "transport_hint": random.choice(TRANSPORT_HINTS),
            "parking_tip": random.choice(PARKING_TIPS),
            "stroller_friendly": random.choice(STROLLER_FRIENDLY),
        })

    return data


def call_batch_import(url, secret, items):
    """Call the batchImport cloud function via HTTP."""
    payload = json.dumps({
        "action": "batchImport",
        "secret": secret,
        "items": items,
    }).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
    }

    req = urllib.request.Request(
        url,
        data=payload,
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        return {"code": e.code, "message": f"HTTP Error: {error_body}"}
    except Exception as e:
        return {"code": -1, "message": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Import test data to babyplace")
    parser.add_argument("--dry-run", action="store_true", help="Generate data without importing")
    parser.add_argument("--output", "-o", help="Save generated data to JSON file")
    parser.add_argument("--url", help="Cloud function HTTP URL")
    parser.add_argument("--secret", default="babyplace2026", help="Import secret key")
    parser.add_argument("--count", type=int, default=50, help="Number of records to generate")
    args = parser.parse_args()

    print(f"[{datetime.now().isoformat()}] Fetching data from JSONPlaceholder...")

    try:
        users = fetch_jsonplaceholder_users()
        print(f"  Fetched {len(users)} users")
    except Exception as e:
        print(f"  Error: {e}")
        sys.exit(1)

    print(f"[{datetime.now().isoformat()}] Generating {args.count} test records...")
    test_data = generate_test_data(users, args.count)
    print(f"  Generated {len(test_data)} records")

    print(f"\nSample data (first 3):")
    for i, item in enumerate(test_data[:3]):
        print(f"  {i+1}. {item['name']}")
        print(f"     Address: {item['address']}")
        print(f"     Location: ({item['lat']}, {item['lng']})")

    if args.output:
        print(f"\n[{datetime.now().isoformat()}] Saving to {args.output}...")
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(test_data, f, ensure_ascii=False, indent=2)
        print(f"  Saved {len(test_data)} records")

    if args.dry_run:
        print(f"\n[{datetime.now().isoformat()}] Dry run complete. No data imported.")
        return

    if not args.url:
        print(f"\n[{datetime.now().isoformat()}] No URL provided. Use --url to import.")
        print("\nTo enable HTTP access:")
        print("  1. Go to https://unicloud.dcloud.net.cn")
        print("  2. Select your space -> Cloud Functions -> babyplace-admin")
        print("  3. Enable HTTP access and copy the URL")
        print("  4. Run: python scripts/import_test_data.py --url <URL>")
        sys.exit(0)

    print(f"\n[{datetime.now().isoformat()}] Importing to babyplace...")
    print(f"  URL: {args.url}")

    result = call_batch_import(args.url, args.secret, test_data)

    print(f"\n[{datetime.now().isoformat()}] Import result:")
    print(f"  Code: {result.get('code')}")
    print(f"  Message: {result.get('message')}")

    data = result.get("data", {})
    if data:
        print(f"  Total: {data.get('total')}")
        print(f"  Succeeded: {data.get('succeeded')}")
        print(f"  Failed: {data.get('failed')}")

        if data.get("failedItems"):
            print("\n  Failed items:")
            for item in data["failedItems"][:5]:
                print(f"    Index {item['index']}: {item['errors']}")


if __name__ == "__main__":
    main()
