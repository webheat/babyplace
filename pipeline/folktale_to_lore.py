#!/usr/bin/env python3
"""中国民间故事 GeoJSON → 幼儿讲述版 folktales.json 的校验与转换。

为什么要这个脚本：src/geo/data/chinese-folktales.json 是**一次性生成的静态数据**，
仓库里没有生成脚本（metadata 标 generated=2026-10-13，与 geo 模块提交同日）。
这意味着：
  - 不可复现：重跑拿不到同样的数据
  - 不可扩充：加故事只能手工编辑 JSON

所以补上这一环，同时做三件事：
  1. 校验上游 GeoJSON 与我的 folktales.json 是否一一对应（漏写/多写要立刻暴露）
  2. 坐标转换（默认假定 WGS-84；--assume-gcj02 可切）
  3. 输出 episode.json 供渲染，或只做校验（--check）

坐标系说明：chinese-folktales.json 没有 crs 字段。用杭州西湖断桥的已知精确
WGS-84（约 120.1496, 30.2595）反推，数据集值 120.149 落在 WGS-84 误差范围内，
而 GCJ-02 应在 120.154 附近。故默认按 WGS-84 处理，但这是单点推断——
如果后续发现判错，加 --assume-gcj02 重转即可，不必改数据。

用法：
    python3 -I pipeline/folktale_to_lore.py --check          # 只校验
    python3 -I pipeline/folktale_to_lore.py --assume-gcj02    # 按 GCJ-02 重转
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPSTREAM = os.path.join(ROOT, "src/geo/data/chinese-folktales.json")
MINE = os.path.join(ROOT, "web/public/data/folktales.json")
EXTRA = os.path.join(ROOT, "web/public/data/folktales-extra.json")
OUT_EPISODE = os.path.join(ROOT, "web/public/data/folktale-episode.json")

import importlib.util
_spec = importlib.util.spec_from_file_location("px", os.path.join(ROOT, "pipeline/poi_extract.py"))
px = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(px)

# 三类用不同颜色，和 lore.json 的朝代配色区分开
# 幼儿口播单句上限。最初定 22 字，但按标点机械拆分会把
# 「他不是把水堵住，而是挖出河道，让水自己流到大海去」这类
# 因果句拆成语义碎片（实测拆坏 6 条）。**语义连贯优先于字数**：
# 23–30 字的连贯句子念出来约 5–7 秒，幼儿可接受。
# 机械拆分的教训见 pipeline/fix_long_sentences.py。
THRESHOLD = 30

CATEGORY_COLOR = {"神话": "#f59e0b", "传说": "#22d3ee", "民间故事": "#a78bfa",
                  "史诗": "#34d399"}


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    assume_gcj02 = "--assume-gcj02" in sys.argv
    check_only = "--check" in sys.argv

    up = load(UPSTREAM)
    mine = load(MINE)
    up_by_id = {f["properties"]["id"]: f for f in up["features"]}
    my_by_id = {t["id"]: t for t in mine["tales"]}

    problems = []

    # 1. 一一对应
    only_up = set(up_by_id) - set(my_by_id)
    only_mine = set(my_by_id) - set(up_by_id)
    if only_up:
        problems.append(f"上游有但我没写 kid_line：{sorted(only_up)}")
    if only_mine:
        problems.append(f"我多写了上游没有的：{sorted(only_mine)}")

    # 2. 字段一致（改名/改坐标会导致图文不符）
    for tid, t in my_by_id.items():
        u = up_by_id.get(tid)
        if not u:
            continue
        up_p = u["properties"]
        # name/category/province/site/source/summary 以上游为唯一真源，我方不复制，
        # 因此这里只校验我写的字段是否存在，不做一致性比对。
        for f in ("kid_line", "ask_kid"):
            if not t.get(f):
                problems.append(f"{tid} 缺 {f}")

    # 3. 幼儿规则自检
    for t in mine["tales"]:
        line = t.get("kid_line", "")
        if not line:
            problems.append(f"{t['id']} 缺 kid_line")
            continue
        for sent in line.replace("！", "。").split("。"):
            s = sent.strip()
            if len(s) > THRESHOLD:
                problems.append(f"{t['id']} 句子偏长({len(s)}字)：{s}")
        if not t.get("ask_kid"):
            problems.append(f"{t['id']} 缺 ask_kid（每则要留一个互动口）")

    # 3.5 扩展集同样受幼儿规则约束，否则新数据会绕过自检
    if os.path.exists(EXTRA):
        extra_doc = load(EXTRA)
        seen = {t["id"] for t in mine["tales"]}
        for t in extra_doc["tales"]:
            if t["id"] in seen:
                problems.append(f"{t['id']} 在上游与扩展集重复出现")
            if "wgs84" not in t:
                problems.append(f"{t['id']} 缺 wgs84 坐标")
            elif not (-180 <= t["wgs84"][0] <= 180 and -90 <= t["wgs84"][1] <= 90):
                problems.append(f"{t['id']} 坐标越界：{t['wgs84']}")
            line = t.get("kid_line", "")
            if not line:
                problems.append(f"{t['id']} 缺 kid_line")
            else:
                for sent in line.replace("！", "。").split("。"):
                    s = sent.strip()
                    if len(s) > THRESHOLD:
                        problems.append(f"ext:{t['id']} 句子偏长({len(s)}字)：{s}")
            if not t.get("ask_kid"):
                problems.append(f"ext:{t['id']} 缺 ask_kid")
            if not t.get("source"):
                problems.append(f"ext:{t['id']} 缺 source（查不到就写「民间传说」，不要空着或编书名）")

    # 4. 坐标
    points = []
    for t in mine["tales"]:
        u = up_by_id.get(t["id"])
        if not u:
            continue
        lng, lat = u["geometry"]["coordinates"]
        if assume_gcj02:
            lat, lng = px.gcj2wgs_exact(lat, lng)
        if not (-180 <= lng <= 180 and -90 <= lat <= 90):
            problems.append(f"{t['id']} 坐标越界：{lng},{lat}")
        up_p = up_by_id[t["id"]]["properties"]
        points.append({
            "id": t["id"],
            # 以下五个字段一律取自上游 GeoJSON（唯一真源），不从本地文件复制
            "name": up_p["name"],
            "category": up_p["category"],
            "site": up_p.get("site", ""),
            "summary": up_p.get("summary", ""),   # 原文，供「给大人看」
            "source": up_p.get("source", ""),
            "color": CATEGORY_COLOR.get(up_p["category"], "#94a3b8"),
            "wgs84": [round(lng, 6), round(lat, 6)],
            "province": up_p.get("province", ""),
            "kid_line": t["kid_line"],             # 幼儿口播，本地撰写
            "ask_kid": t.get("ask_kid"),
            "want_to_see": t.get("want_to_see"),
        })

    print(f"上游 {len(up_by_id)} 条 / 我方 {len(my_by_id)} 条 / 可渲染 {len(points)} 个点")
    print(f"坐标系：{'GCJ-02 → WGS-84 已转换' if assume_gcj02 else '按 WGS-84 直用（单点推断，见 docstring）'}")

    if problems:
        print(f"\n✗ {len(problems)} 处问题：", file=sys.stderr)
        for p in problems:
            print("  -", p, file=sys.stderr)
        return 1

    if check_only:
        print("✓ 校验通过")
        return 0

    # ── 扩展集：新增故事，自带坐标，不走上游 ──────────────────
    # 上游 21 条能逐条核对出处；扩展集是我加的，出处凭记忆填写，已在数据里
    # 用 source_verified=false 标出，对外使用前必须核实。
    extra_doc = load(EXTRA)
    extra = []
    for t in extra_doc["tales"]:
        lng, lat = t["wgs84"]
        if assume_gcj02:
            lat, lng = px.gcj2wgs_exact(lat, lng)
        extra.append({
            "id": t["id"],
            "name": t["name"],
            "category": t["category"],
            "color": CATEGORY_COLOR.get(t["category"], "#94a3b8"),
            "wgs84": [round(lng, 6), round(lat, 6)],
            "site": t["site"],
            "province": t.get("province", ""),
            "location_kind": t.get("location_kind", "region"),
            "coord_precision": t.get("coord_precision", "city"),
            "summary": t["summary"],
            "kid_line": t["kid_line"],
            "ask_kid": t.get("ask_kid"),
            "source": t["source"],
            "source_verified": t.get("source_verified", False),
            "origin": "extended",
        })
    for p in points:
        p["origin"] = "upstream"
        p["source_verified"] = True

    # 类别分布
    from collections import Counter
    allp = points + extra
    print("上游", len(points), "条 +", "扩展", len(extra), "条 =", len(allp))
    print("类别:", dict(Counter(p["category"] for p in allp)))
    unver = [p["id"] for p in allp if not p.get("source_verified")]
    print(f"⚠ 出处未经核实：{len(unver)} 条（扩展集全部）—— 对外使用前须逐条核对")

    ep = {
        "episode_id": "folktale-map",
        "mode": "folktale-map",
        "title": "中国民间故事地图",
        "age_band": "4-6",
        "credit": "© OpenFreeMap © OpenStreetMap contributors",
        "crs": "wgs84" if not assume_gcj02 else "wgs84(converted-from-gcj02)",
        "duration_s": 0,          # 由播放器按点的停留时间累加，不预设
        "points": allp,
    }
    with open(OUT_EPISODE, "w", encoding="utf-8") as f:
        json.dump(ep, f, ensure_ascii=False, indent=2)
    print(f"→ {OUT_EPISODE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())