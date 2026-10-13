#!/usr/bin/env python3
"""
find_latest_video.py — 查找最新的 Remotion 渲染视频

尝试多种方式获取最新渲染结果的视频 URL:
1. Remotion /jobs 端点
2. Remotion /api/renders 端点
3. 本地 output 目录扫描
"""

import json
import os
import sys
import glob
import time

REMOTION_SERVER = os.environ.get("REMOTION_SERVER_URL", "http://lanes.ymxt.top:3010")
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LAST_RENDER_FILE = os.path.join(SCRIPT_DIR, "last-render-id.txt")


def save_render_id(render_id):
    """保存 renderId 到本地文件"""
    with open(LAST_RENDER_FILE, "w") as f:
        f.write(render_id.strip())


def load_render_id():
    """从本地文件读取上次的 renderId"""
    if not os.path.exists(LAST_RENDER_FILE):
        return None
    with open(LAST_RENDER_FILE, "r") as f:
        rid = f.read().strip()
        return rid if rid else None


def find_via_saved_id():
    """通过本地保存的 renderId 查询"""
    import requests
    render_id = load_render_id()
    if not render_id:
        return None
    try:
        resp = requests.get(f"{REMOTION_SERVER}/api/renders/{render_id}", timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") == "done" and data.get("videoUrl"):
            return {
                "render_id": render_id,
                "video_url": data["videoUrl"],
                "source": "saved_id",
                "created_at": "",
            }
    except Exception as e:
        print(f"[!] 保存的 renderId 查询失败: {e}", file=sys.stderr)
        # 回退: 用 curl 查询
        try:
            import subprocess
            result = subprocess.run(
                ["curl", "-s", "--max-time", "10", f"{REMOTION_SERVER}/api/renders/{render_id}"],
                capture_output=True, text=True, timeout=15
            )
            # curl 可能返回 18 (partial transfer) 但 JSON 仍完整
            if result.stdout:
                data = json.loads(result.stdout)
                if data.get("status") == "done" and data.get("videoUrl"):
                    return {
                        "render_id": render_id,
                        "video_url": data["videoUrl"],
                        "source": "saved_id_curl",
                        "created_at": "",
                    }
        except Exception:
            pass
    return None


def find_via_jobs_api():
    """通过 /jobs 端点查找"""
    import requests
    try:
        resp = requests.get(f"{REMOTION_SERVER}/jobs", timeout=10)
        if resp.status_code == 200:
            jobs = resp.json()
            done = [j for j in jobs if j.get("status") == "done"]
            if done:
                done.sort(key=lambda j: j.get("createdAt", ""), reverse=True)
                latest = done[0]
                return {
                    "render_id": latest["id"],
                    "video_url": f"{REMOTION_SERVER}/api/renders/{latest['id']}/video",
                    "source": "jobs_api",
                    "created_at": latest.get("createdAt", ""),
                }
    except Exception as e:
        print(f"[!] /jobs 端点不可用: {e}", file=sys.stderr)
    return None


def find_via_renders_api():
    """通过 /api/renders 端点查找（如果支持列表）"""
    import requests
    try:
        resp = requests.get(f"{REMOTION_SERVER}/api/renders", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            renders = data if isinstance(data, list) else data.get("renders", [])
            done = [r for r in renders if r.get("status") == "done"]
            if done:
                done.sort(key=lambda r: r.get("createdAt", ""), reverse=True)
                latest = done[0]
                return {
                    "render_id": latest.get("renderId", latest.get("id", "")),
                    "video_url": f"{REMOTION_SERVER}/api/renders/{latest.get('renderId', latest.get('id', ''))}/video",
                    "source": "renders_api",
                    "created_at": latest.get("createdAt", ""),
                }
    except Exception as e:
        print(f"[!] /api/renders 端点不可用: {e}", file=sys.stderr)
    return None


def find_via_local_files():
    """扫描本地 output 目录"""
    output_dir = "/output"
    if not os.path.isdir(output_dir):
        return None

    mp4_files = glob.glob(os.path.join(output_dir, "**/*.mp4"), recursive=True)
    if not mp4_files:
        return None

    # 按修改时间排序，取最新
    mp4_files.sort(key=lambda f: os.path.getmtime(f), reverse=True)
    latest = mp4_files[0]
    return {
        "render_id": os.path.basename(latest).replace(".mp4", ""),
        "video_url": latest,  # 本地路径
        "source": "local_file",
        "created_at": time.ctime(os.path.getmtime(latest)),
    }


def main():
    result = None

    # 按优先级尝试: 保存的ID → API列表 → 本地文件
    for finder in [find_via_saved_id, find_via_jobs_api, find_via_renders_api, find_via_local_files]:
        result = finder()
        if result:
            break

    if result:
        # 找到后持久化 renderId，下次可直接查询
        if result.get("render_id"):
            save_render_id(result["render_id"])
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(json.dumps({"error": "未找到已完成的渲染视频"}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
