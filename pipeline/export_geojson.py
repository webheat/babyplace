#!/usr/bin/env python3
"""把 folktale-episode.json 导出为标准 GeoJSON，供其他地图工具复用。

标准 = RFC 7946：FeatureCollection / Feature / geometry(Point) / properties。
WGS-84 经纬度，坐标顺序 [lng, lat]（GeoJSON 规范如此，注意不是 lat,lng）。

产物两个：
  folktales.geojson  — 完整版，带幼儿口播与出处，适合内容消费方
  folktales-lite.geojson — 只有 id/name/category/坐标，给纯制图工具（QGIS/kepler.gl）

用法：python3 -I pipeline/export_geojson.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "web/public/data/folktale-episode.json")
OUT_FULL = os.path.join(ROOT, "web/public/data/folktales.geojson")
OUT_LITE = os.path.join(ROOT, "web/public/data/folktales-lite.geojson")


def build(points, keep):
    feats = []
    for p in points:
        lng, lat = p["wgs84"]
        props = {k: p[k] for k in keep if k in p}
        feats.append({
            "type": "Feature",
            "id": p["id"],
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": props,
        })
    return {"type": "FeatureCollection", "features": feats}


def validate(gj):
    """RFC 7946 基本校验：结构、坐标范围、坐标顺序。"""
    errs = []
    if gj.get("type") != "FeatureCollection":
        errs.append("type 必须是 FeatureCollection")
    if not isinstance(gj.get("features"), list):
        errs.append("features 必须是数组")
    for f in gj.get("features", []):
        if f.get("type") != "Feature":
            errs.append(f"{f.get('id')} type 不是 Feature")
        g = f.get("geometry") or {}
        if g.get("type") != "Point":
            errs.append(f"{f.get('id')} geometry 不是 Point")
        c = g.get("coordinates") or []
        if len(c) != 2:
            errs.append(f"{f.get('id')} 坐标不是 [lng,lat] 两值")
            continue
        lng, lat = c
        if not (-180 <= lng <= 180):
            errs.append(f"{f.get('id')} 经度越界 {lng}")
        if not (-90 <= lat <= 90):
            errs.append(f"{f.get('id')} 纬度越界 {lat}")
        # 反常检测：东亚地区经度约 70–140，若经纬颠倒会立刻暴露
        if 70 < lat < 140 and not (70 < lng < 140):
            errs.append(f"{f.get('id')} 疑似经纬颠倒：{lng},{lat}")
    return errs


def main():
    if not os.path.exists(SRC):
        print(f"缺少 {SRC}，先跑 folktale_to_lore.py", file=sys.stderr)
        return 1
    doc = json.load(open(SRC, encoding="utf-8"))
    pts = doc["points"]

    full = build(pts, ["name", "category", "color", "province", "site",
                       "summary", "kid_line", "ask_kid", "want_to_see",
                       "source", "source_verified", "origin",
                       "location_kind", "coord_precision"])
    lite = build(pts, ["name", "category", "province", "origin"])

    for name, gj in (("full", full), ("lite", lite)):
        errs = validate(gj)
        if errs:
            print(f"✗ {name} 未通过 RFC7946 校验：", file=sys.stderr)
            for e in errs[:10]:
                print("  -", e, file=sys.stderr)
            return 1

    for path, gj in ((OUT_FULL, full), (OUT_LITE, lite)):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(gj, f, ensure_ascii=False, indent=1)
        size = os.path.getsize(path)
        print(f"✓ {os.path.basename(path)}: {len(gj['features'])} features, {size/1024:.0f}KB")

    print(f"坐标系 WGS-84，坐标顺序 [lng, lat]（RFC 7946 规范）")
    print(f"出处未核实 {sum(1 for f in full['features'] if not f['properties'].get('source_verified'))} 条")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())