#!/usr/bin/env python3
"""把 episode.json 转成 episode-inline.js，供 index.html 直接挂 window.__EPISODE__。

为什么内联而不是运行时 fetch：H5 产物可能被丢到内网任意静态目录或 CDN，
运行时 fetch 会因为 base 路径 / 离线 / CORS 变成白屏。内联后页面不依赖任何
运行时数据请求，拿到 dist/ 就能直接开。

注意 puppeteer-core 只在 scripts/bake-basemap.mjs 用到，不进前端依赖树，
所以这里删掉，避免把 20MB 无用代码写进 package.json 依赖。
"""
import json
import os

WEB = os.environ.get("WEB_DIR", "/opt/babyplace/web")
SRC = os.path.join(WEB, "public/data/episode.json")
OUT = os.path.join(WEB, "public/data/episode-inline.js")


def main():
    if not os.path.exists(SRC):
        print(f"缺少 {SRC}，先跑 script_gen.py / tts_episode.py", flush=True)
        return 1
    with open(SRC, encoding="utf-8") as f:
        doc = json.load(f)
    ep = doc[0] if isinstance(doc, list) else doc

    # 体积守卫：内联进 HTML，超过 400KB 就该改回 fetch
    raw = json.dumps(ep, ensure_ascii=False, separators=(",", ":"))
    if len(raw.encode()) > 400_000:
        print(f"episode 过大（{len(raw.encode())}B），不适合内联", flush=True)
        return 1

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("window.__EPISODE__ = " + raw + ";\n")

    caps = len(ep.get("captions", []))
    print(f"内联 {ep['episode_id']} · {ep['duration_s']}s · {caps} 条字幕 "
          f"· {len(raw.encode())}B → {OUT}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())