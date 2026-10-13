#!/usr/bin/env python3
"""POI 抽取 + GCJ-02 → WGS-84 坐标转换。

为什么必须转：DB 里 140 条 POI 的坐标是高德 GCJ-02，但 bake-basemap.mjs 用的瓦片源
(Esri World_Imagery / CARTO) 全是 WGS-84。GCJ-02 在广州偏移 300–500 米，不转换的话
博物馆的 pin 会落在隔壁街上。

反算用迭代法（gcj02towgs84_exact）：GCJ-02 偏移量本身是经纬度的非线性函数，
直接"正算后减一次偏移"在广州只能收敛到几十米，迭代到 1e-6 度（约 0.1 米）才稳。

输出：web/public/data/poi.json
"""
import json
import math
import os
import sqlite3
import sys

DB_PATH = os.environ.get(
    "DB_PATH", "/opt/babyplace/server/data/babyplace.db"
)
OUT = os.environ.get(
    "OUT", "/opt/babyplace/web/public/data/poi.json"
)

# Krasovsky 1940 椭球参数（GCJ-02 标准实现用值）
_A = 6378245.0
_EE = 0.00669342162296594323


def _out_of_china(lng, lat):
    return not (72.004 <= lng <= 137.8347 and 0.8293 <= lat <= 55.8271)


def _transform_lat(x, y):
    ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
    ret += (20 * math.sin(6 * x * math.pi) + 20 * math.sin(2 * x * math.pi)) * 2 / 3
    ret += (20 * math.sin(y * math.pi) + 40 * math.sin(y / 3 * math.pi)) * 2 / 3
    ret += (160 * math.sin(y / 12 * math.pi) + 320 * math.sin(y * math.pi / 30)) * 2 / 3
    return ret


def _transform_lng(x, y):
    ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
    ret += (20 * math.sin(6 * x * math.pi) + 20 * math.sin(2 * x * math.pi)) * 2 / 3
    ret += (20 * math.sin(x * math.pi) + 40 * math.sin(x / 3 * math.pi)) * 2 / 3
    ret += (150 * math.sin(x / 12 * math.pi) + 300 * math.sin(x / 30 * math.pi)) * 2 / 3
    return ret


def wgs2gcj(lat, lng):
    """WGS-84 → GCJ-02 正算。境外原样返回。"""
    if _out_of_china(lng, lat):
        return lat, lng
    dlat = _transform_lat(lng - 105.0, lat - 35.0)
    dlng = _transform_lng(lng - 105.0, lat - 35.0)
    radlat = lat / 180.0 * math.pi
    magic = math.sin(radlat)
    magic = 1 - _EE * magic * magic
    sqrtmagic = math.sqrt(magic)
    dlat = (dlat * 180.0) / ((_A * (1 - _EE)) / (magic * sqrtmagic) * math.pi)
    dlng = (dlng * 180.0) / (_A / sqrtmagic * math.cos(radlat) * math.pi)
    return lat + dlat, lng + dlng


def gcj2wgs_exact(lat, lng, threshold=1e-9, max_iter=50):
    """GCJ-02 → WGS-84 反算（不动点迭代）。返回 (lat, lng)，均为 WGS-84。

    解 f(w) = wgs2gcj(w) - gcj = 0，迭代式 w -= f(w)。

    ⚠️ 不要用网上流传的那个 pLat/mlat 交替写法——它的更新量是 offset - prev，
    会围绕真值振荡而不收敛（实测天安门点偏差 1032m）。本函数 3 次迭代即收敛到 1e-9 度。
    """
    if _out_of_china(lng, lat):
        return lat, lng
    wlat, wlng = lat, lng
    for _ in range(max_iter):
        glat, glng = wgs2gcj(wlat, wlng)
        dlat, dlng = glat - lat, glng - lng
        if abs(dlat) < threshold and abs(dlng) < threshold:
            return wlat, wlng
        wlat -= dlat
        wlng -= dlng
    return wlat, wlng


def _jloads(s, default):
    try:
        v = json.loads(s or "")
        return v if isinstance(v, list) else default
    except (json.JSONDecodeError, TypeError):
        return default


COLS = """id,name,canonical_name,alias,city,district,address,lat,lng,category,
age_range,price_type,recommended_duration,transport,summary,recommend_reason,
cover_image,tags,indoor,status"""


def main():
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    rows = con.execute(f"SELECT {COLS} FROM poi WHERE lat != 0 AND lng != 0").fetchall()
    out = []
    for r in rows:
        (pid, name, canon, alias, city, district, addr, lat, lng, cat,
         age, price, dur, transport, summary, reason, cover, tags, indoor, status) = r
        wlat, wlng = gcj2wgs_exact(lat, lng)
        out.append({
            "poi_id": pid,
            "name": name,
            "canonical_name": canon or name,
            "aliases": _jloads(alias, []),
            "city": city,
            "district": district,
            "address": addr,
            "category": cat,
            "age_range": _jloads(age, []),
            "price_type": price,
            "recommended_duration": dur,
            "transport": _jloads(transport, []),
            "indoor": bool(indoor),
            "summary": summary,
            "recommend_reason": reason,
            "cover_image": cover,
            "tags": _jloads(tags, []),
            "status": status,
            # MapLibre / Esri / CARTO 全部按 WGS-84 取瓦片
            "wgs84": [round(wlng, 7), round(wlat, 7)],   # [lng, lat]
            "gcj02": [round(lng, 7), round(lat, 7)],
            "has_lore": False,   # lore_seed.py 回填
        })

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"POI 写出 {len(out)} 条 → {OUT}")
    by_cat = {}
    for p in out:
        by_cat[p["category"]] = by_cat.get(p["category"], 0) + 1
    print("分类:", by_cat)

    # 自检：反算精度。拿广东省博物馆当标尺
    probe = next((p for p in out if p["name"] == "广东省博物馆"), None)
    if probe:
        glng, glat = probe["gcj02"]
        wlng, wlat = probe["wgs84"]
        # 正算回去应当还原原始 GCJ-02
        back_lat, back_lng = wgs2gcj(wlat, wlng)
        err_m = math.hypot((back_lng - glng) * 102000, (back_lat - glat) * 102000)
        print(f"标尺 {probe['name']}: gcj02={glng},{glat} wgs84={wlng},{wlat}")
        print(f"  偏移约 {abs(glng - wlng) * 102000:.0f} m")
        print(f"  往返校验误差 {err_m:.3f} m  (应 < 1 m)")
        if err_m > 1.0:
            print("坐标反算不达标", file=sys.stderr)
            return 1
    else:
        print("警告：库中没有『广东省博物馆』，跳过标尺校验", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())