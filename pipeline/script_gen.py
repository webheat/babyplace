#!/usr/bin/env python3
"""lore.json → episode.json：把历史知识编译成可渲染的脚本 + 镜头时间轴。

episode.json 是整个系统的唯一真相源：H5 页面和 Remotion 出口都读它，
两边共享 camera.js / layers/ 的纯函数，只是时钟来源不同（H5 真实时间 vs
Remotion 的 frame/fps）。

时长硬上限：单片 ≤ 95 秒。4-6 岁的注意力撑不住更长，十二生肖单集 160 秒
是给 6-8 岁的，不能照抄。

输出：web/public/data/episode.json
"""
import json
import os
import sys

WEB = os.environ.get("WEB_DIR", "/opt/babyplace/web")
LORE = os.path.join(WEB, "public/data/lore.json")
POI = os.path.join(WEB, "public/data/poi.json")
OUT = os.environ.get("EPISODE_OUT", os.path.join(WEB, "public/data/episode.json"))

# 五层楼的时间轴配色，与 lore.json 的 era.color 同源
ERAS = [1, 2, 3, 4, 5]


def load(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        if default is not None:
            return default
        print(f"缺少 {path}", file=sys.stderr)
        raise


def build(lore, poi_by_name):
    name = lore["poi_name"]
    poi = poi_by_name.get(name)
    if not poi:
        raise SystemExit(f"lore 里的 {name} 在 poi.json 里找不到")

    # 坐标一律用 WGS-84：Esri/OpenFreeMap 全按 WGS-84 取瓦片
    lng, lat = poi["wgs84"]
    eras = [e for e in lore["eras"] if not e.get("_placeholder")]

    # ── 镜头：globe 开场 → ease 到 mercator → 落到 POI → 逐层微推 ──
    # 投影只在 t=GLIDE 处切一次，中途切会让坐标跳变
    GLIDE = 11.0
    SETTLE = 25.0          # 历史时间轴开始
    per = 11.0             # 每个朝代 11 秒

    camera = [
        {"t": 0.0,  "center": [lng, lat], "zoom": 1.6,  "pitch": 0,  "bearing": 0,   "projection": "globe"},
        {"t": 6.0,  "center": [lng, lat], "zoom": 3.4,  "pitch": 0,  "bearing": 0,   "projection": "globe"},
        {"t": GLIDE, "center": [lng, lat], "zoom": 11.5, "pitch": 30, "bearing": -12, "projection": "mercator"},
        {"t": SETTLE, "center": [lng, lat], "zoom": 14.6, "pitch": 50, "bearing": -12, "projection": "mercator"},
    ]
    for i, e in enumerate(eras):
        camera.append({
            "t": SETTLE + i * per,
            "center": [lng, lat],
            "zoom": 14.6 + i * 0.35,
            "pitch": 50 + i * 2,
            "bearing": -12 + i * 4,
            "projection": "mercator",
        })

    duration = SETTLE + per * len(eras) + 6.0

    # ── 幕 ──
    beats = [
        {
            "t": 0.0,
            "type": "globe-intro",
            "narration": "小朋友们坐好了吗？我们要飞出去看看。",
            "dur": 5.5,
            "title": None,
        },
        {
            "t": 6.0,
            "type": "geo-flyover",
            "narration": "这是我们的家，广州。它在中国的最南边，旁边就是大海。",
            "dur": 8.0,
            "title": None,
        },
        {
            "t": 15.0,
            "type": "poi-pin",
            "poi_id": poi["poi_id"],
            "narration": f"我们要去的地方，就在这里。",
            "dur": 9.0,
            "title": name,
        },
    ]

    if lore.get("building_story"):
        bs = lore["building_story"]
        beats.append({
            "t": SETTLE - 2.0,
            "type": "building-story",
            "narration": bs["kid_line"],
            "dur": 9.0,
            "title": bs["name"],
        })

    for i, e in enumerate(eras):
        beats.append({
            "t": SETTLE + i * per,
            "type": "era-highlight",
            "era_order": e["order"],
            "color": e["color"],
            "narration": e["artifact_kid_line"],
            "ask_kid": e.get("ask_kid"),
            "dur": per,
            "title": f"{e['era_label']} · {e['artifact']}",
        })

    beats.sort(key=lambda b: b["t"])

    return {
        "episode_id": lore["lore_id"],
        "poi_id": poi["poi_id"],
        "poi_name": name,
        "title": lore.get("hook") or name,
        "age_band": lore.get("age_band", "4-6"),
        "duration_s": round(duration, 1),
        "center": [lng, lat],
        "camera": camera,
        "beats": beats,
        "captions": [],   # 由 tts_episode.py 用真实时间戳回填，不手工对齐
        "credit": "© OpenFreeMap © OpenStreetMap contributors",
    }


def main():
    lore_doc = load(LORE)
    pois = load(POI, [])
    by_name = {p["name"]: p for p in pois}
    # 名称兜底：lore 里写的名可能带后缀
    for p in pois:
        by_name.setdefault(p["canonical_name"], p)

    usable = [l for l in lore_doc["lores"] if not l.get("_placeholder") and l.get("eras")]
    if not usable:
        print("lore.json 里没有可编译的条目（全为 placeholder）", file=sys.stderr)
        return 1

    eps = [build(l, by_name) for l in usable]

    # ── 自检 ──
    for ep in eps:
        # 镜头时间轴必须单调递增，否则 camAt 插值会倒放
        ts = [c["t"] for c in ep["camera"]]
        assert ts == sorted(ts), f"{ep['episode_id']} 镜头时间轴非单调: {ts}"
        # 最后一个镜头不能超过总时长
        assert ts[-1] <= ep["duration_s"], (
            f"{ep['episode_id']} 末镜头 t={ts[-1]} 超出总时长 {ep['duration_s']}"
        )
        # beat 同样
        bts = [b["t"] for b in ep["beats"]]
        assert bts == sorted(bts), f"{ep['episode_id']} beat 非单调: {bts}"
        # 幼儿硬规则：单句不超过 18 字（四岁短时记忆约 3-5 秒一个语义块）
        for b in ep["beats"]:
            for sent in b["narration"].replace("！", "。").split("。"):
                s = sent.strip()
                if len(s) > 22:
                    print(f"  ⚠️ [{ep['episode_id']}] 句子偏长({len(s)}字): {s}", file=sys.stderr)
        assert ep["duration_s"] <= 95, f"{ep['episode_id']} 超时长上限"

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(eps[0] if len(eps) == 1 else eps, f, ensure_ascii=False, indent=2)

    for ep in eps:
        print(f"{ep['episode_id']}: {ep['duration_s']}s / {len(ep['beats'])} beats / "
              f"{len(ep['camera'])} 镜头关键帧")
    print(f"→ {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())