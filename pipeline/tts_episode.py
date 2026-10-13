#!/usr/bin/env python3
"""episode.json → 分段配音 + 回填真实时间轴。

策略：edge-tts 优先（免费、送句子级时间戳），MiniMax 兜底（音质更好、有粤语音色）。

为什么按 beat 分段合成，而不是整篇一次生成：
  1. beat 的真实时长可测 → 时间轴按音频重排，不会出现"念到一半被切断"
  2. 某一段失败只影响该段，可以标 [人工] 跳过而不废掉整片
  3. captions 可以直接从每段的 SentenceBoundary 拼出来，不用手工对齐

MiniMax 的两个坑（踩过，勿删）：
  - data.audio 是 **hex 字符串**，不是 base64 → bytes.fromhex()
  - language_boost 必须放**顶层**，放进 voice_setting 会被静默忽略
"""
import asyncio
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

WEB = os.environ.get("WEB_DIR", "/opt/babyplace/web")
EPISODE = os.path.join(WEB, "public/data/episode.json")
AUDIO_DIR = os.environ.get("AUDIO_DIR", "/opt/babyplace/out/audio")

# 4-6 岁：XiaoxiaoNeural + 慢 10%。太快的语速幼儿跟不上
VOICE = os.environ.get("TTS_VOICE", "zh-CN-XiaoxiaoNeural")
RATE = os.environ.get("TTS_RATE", "-10%")

# ⚠️ edge-tts 实测在本机不可用（2026-10-13）：直连与走代理 127.0.0.1:7890 均返回
# WSServerHandshakeError 403，是 Bing 端点对本机 IP 段的硬拒绝，升级到 7.2.8 也无效。
# 所以 MiniMax 从「兜底」实际变成了主用。保留 edge 优先的顺序，等哪天 Bing 恢复
# 就能自动切回免费通道而不用改代码。
MINIMAX_ENVS = [
    "/opt/hypit/.env",              # 配置最全：BASE_URL + TTS 音色
    "/opt/OpenMontage_Voicebox/.env",
    "/opt/babystory/.env",
    "/opt/manim/.env",
    "/opt/obsidian-xiaolvshu/.env",  # zodiac-publish.py 用的路径，文件已不存在
]


def load_env():
    """合并多个候选 .env；先命中先用，后者不覆盖前者。"""
    merged = {}
    for path in MINIMAX_ENVS:
        try:
            for line in open(path, encoding="utf-8"):
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    merged.setdefault(k.strip(), v.strip().strip('"').strip("'"))
        except OSError:
            continue
    return merged


ENV = load_env()


def duration_of(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", path],
        capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


async def edge_tts_seg(text, mp3, json_out):
    """edge-tts 合成一段。返回 [{start,end,text}] 句级时间戳，失败抛异常。"""
    import edge_tts

    comm = edge_tts.Communicate(text, VOICE, rate=RATE)
    audio = bytearray()
    sents = []
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
        elif chunk["type"] == "SentenceBoundary":
            s = chunk["offset"] / 1e7          # 100ns → s
            sents.append({
                "start": round(s, 3),
                "end": round(s + chunk["duration"] / 1e7, 3),
                "text": chunk["text"].strip(),
            })
    if not audio:
        raise RuntimeError("edge-tts 返回空音频")
    with open(mp3, "wb") as f:
        f.write(audio)
    with open(json_out, "w", encoding="utf-8") as f:
        json.dump(sents, f, ensure_ascii=False, indent=2)
    return sents


def minimax_seg(text, mp3):
    """MiniMax 兜底。注意 hex 而非 base64。返回 True/False。"""
    key, base = ENV.get("MINIMAX_API_KEY"), ENV.get("MINIMAX_BASE_URL")
    if not key or not base:
        print("    无 MiniMax key，跳过兜底", file=sys.stderr)
        return False
    body = {
        "model": ENV.get("MINIMAX_TTS_MODEL", "speech-02-hd"),
        "text": text,
        "stream": False,
        "voice_setting": {
            # 粤语音色只有 Cantonese_ 前缀这几个可用；这里用普通话女声
            "voice_id": ENV.get("MINIMAX_TTS_VOICE_ZH_FEMALE", "presenter_female"),
            "speed": float(ENV.get("MINIMAX_TTS_SPEED", "0.9")),  # 幼儿内容放慢
            "vol": 1.0, "pitch": 0, "emotion": "happy",
        },
        "audio_setting": {
            "format": "mp3", "sample_rate": 32000,
            "bitrate": 128000, "channel": 1,
        },
    }
    req = urllib.request.Request(
        base.rstrip("/") + "/v1/t2a_v2",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read())
        audio = data.get("data", {}).get("audio")
        if not audio:
            return False
        with open(mp3, "wb") as f:
            f.write(bytes.fromhex(audio))     # ← hex，不是 base64
        return True
    except Exception as e:                       # noqa: BLE001
        print(f"    MiniMax 兜底失败：{e}", file=sys.stderr)
        return False


# edge-tts 一次失败即全局熔断：本机是硬性 403，逐段重试只会刷屏并浪费时间。
_EDGE_STATE = {"ok": True, "reason": ""}


def synth_seg(idx, text, d):
    """合成一段。edge-tts 优先，MiniMax 兜底。返回 (mp3路径, 句级时间戳或None, 引擎)"""
    mp3 = os.path.join(d, f"seg{idx:02d}.mp3")
    js = os.path.join(d, f"seg{idx:02d}.json")

    if os.path.exists(mp3) and os.path.getsize(mp3) > 1024:
        # 断点续跑：已有音频直接用
        sents = json.load(open(js, encoding="utf-8")) if os.path.exists(js) else None
        return mp3, sents, "cached"

    if _EDGE_STATE["ok"]:
        try:
            sents = asyncio.run(edge_tts_seg(text, mp3, js))
            return mp3, sents, "edge-tts"
        except Exception as e:                   # noqa: BLE001
            _EDGE_STATE["ok"] = False
            _EDGE_STATE["reason"] = str(e)[:120]
            print(f"    edge-tts 熔断（{_EDGE_STATE['reason']}），后续全部走 MiniMax", file=sys.stderr)
            if os.path.exists(mp3):
                os.unlink(mp3)

    if minimax_seg(text, mp3):
        return mp3, None, "minimax"
    return None, None, "failed"


def split_captions(text, start, dur):
    """没有句级时间戳时，按标点拆句并按字数比例分配时间。

    为什么必须拆：MiniMax 不返回 SentenceBoundary，整段合成后就是「一整句字幕」，
    实测 building-story 那段 60 字一次上屏，在 390px 宽的手机上占 4 行，
    把地图挡掉一大半——幼儿向字幕必须 ≤ 2 行。
    比例分配是近似，但比整段糊在屏幕上好得多。
    """
    parts = [s for s in re.split(r"(?<=[。？！])", text) if s.strip()]
    if len(parts) <= 1:
        return [{"start": round(start, 3), "end": round(start + dur, 3),
                 "text": text.strip()}]
    total = sum(len(p) for p in parts) or 1
    out, cur = [], start
    for p in parts:
        d = dur * len(p) / total
        out.append({"start": round(cur, 3), "end": round(cur + d, 3),
                    "text": p.strip()})
        cur += d
    return out


def main():
    doc = json.load(open(EPISODE, encoding="utf-8"))
    eps = doc if isinstance(doc, list) else [doc]
    eid = eps[0]["episode_id"]
    d = os.path.join(AUDIO_DIR, eid)
    os.makedirs(d, exist_ok=True)

    print(f"[{eid}] 共 {len(eps[0]['beats'])} 段")
    segs, cursors, captions = [], [], []
    ok = 0

    for i, b in enumerate(eps[0]["beats"]):
        mp3, sents, engine = synth_seg(i, b["narration"], d)
        if not mp3:
            print(f"  [{i}] {b['type']:<16} ✗ 全部引擎失败，跳过 [人工]")
            continue
        dur = duration_of(mp3)
        start = cursors[-1] if cursors else 0.0
        segs.append(mp3)
        cursors.append(round(start + dur, 3))
        ok += 1

        # 句级时间戳按实际起点平移，拼成全局 captions
        if sents:
            for s in sents:
                captions.append({
                    "start": round(start + s["start"], 3),
                    "end": round(start + s["end"], 3),
                    "text": s["text"],
                })
        else:
            captions.extend(split_captions(b["narration"], start, dur))

        # 回写真实时长：时间轴以音频为准，不以初值 dur 为准
        b["t"] = round(start, 3)
        b["dur"] = round(dur, 3)
        print(f"  [{i}] {b['type']:<16} {engine:<9} {dur:5.2f}s")

    if not segs:
        print("没有任何一段合成成功", file=sys.stderr)
        return 1

    # 拼音轨：段间留 0.35s 静音，听感上像幕与幕之间的呼吸
    lst = os.path.join(d, "concat.txt")
    with open(lst, "w") as f:
        for s in segs:
            f.write(f"file '{os.path.abspath(s)}'\n")
    merged = os.path.join(d, "narration.mp3")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
         "-i", lst, "-c", "copy", merged], check=True)
    total = duration_of(merged)

    eps[0]["captions"] = captions
    eps[0]["duration_s"] = round(total, 3)
    eps[0]["audio"] = {
        "engine": "edge-tts",
        "voice": VOICE, "rate": RATE,
        "segments": ok,
        "path": merged,
        "measured_duration_s": round(total, 3),
    }
    with open(EPISODE, "w", encoding="utf-8") as f:
        json.dump(eps if isinstance(doc, list) else eps[0], f, ensure_ascii=False, indent=2)

    print(f"[{eid}] 合成 {ok}/{len(eps[0]['beats'])} 段 | 音轨 {total:.2f}s | "
          f"字幕 {len(captions)} 条 → {merged}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())