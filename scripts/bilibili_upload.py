#!/usr/bin/env python3
"""
bilibili_upload.py — B站视频无人值守发布（via aitoearn MCP）

用法:
  python3 bilibili_upload.py --video-url "http://..." --title "标题"
  python3 bilibili_upload.py --video /path/to/video.mp4 --title "标题" --tags "遛娃,亲子"

认证: 使用 aitoearn MCP API key，无需 B站 cookie
"""

import argparse
import json
import os
import sys
import time
import requests

MCP_ENDPOINT = os.environ.get("AITOEARN_MCP_URL", "https://aitoearn.cn/api/unified/mcp")
MCP_API_KEY = os.environ.get("AITOEARN_API_KEY", "ak_hekGwBij6mIxUIkFghZndk9I8hgjRBkws387fdXxtbQCg93z")


def mcp_call(method, arguments, timeout=60):
    """调用 aitoearn MCP JSON-RPC"""
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": arguments,
    }
    resp = requests.post(
        MCP_ENDPOINT,
        json=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "x-api-key": MCP_API_KEY,
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    data = resp.json()

    if "error" in data:
        raise Exception(f"MCP error: {data['error']}")

    result = data.get("result", {})
    content = result.get("content", [])
    if result.get("isError"):
        text = content[0].get("text", "") if content else "Unknown error"
        raise Exception(f"MCP call failed: {text}")

    return content


def tool_call(name, arguments, timeout=60):
    """调用 MCP tool"""
    return mcp_call("tools/call", {"name": name, "arguments": arguments}, timeout)


def get_profile():
    """获取当前用户信息"""
    content = tool_call("getMyProfile", {})
    return content[0].get("text", "") if content else ""


def publish_video(video_url, title, desc="", tags=None, tid=21, publish_now=True):
    """
    通过 aitoearn MCP 发布视频到 B站

    Args:
        video_url: 视频 URL（必须是公网可访问的）
        title: 视频标题
        desc: 视频描述
        tags: 标签列表
        tid: B站分区 ID（21=日常）
        publish_now: 是否立即发布
    """
    # 构建 tag 字符串
    tag_str = ",".join(tags) if tags else "遛娃,亲子"

    # 构建正文（带标签）
    body = desc or title
    if tags:
        body += "\n" + " ".join(f"#{t}" for t in tags)

    # 构建 publishAt
    if publish_now:
        publish_at = time.strftime("%Y-%m-%dT%H:%M:%S+08:00")
    else:
        # 明天 10:00
        tomorrow = time.time() + 86400
        publish_at = time.strftime("%Y-%m-%dT10:00:00+08:00", time.localtime(tomorrow))

    # 调用 createChannelPublishFlow
    print(f"[1/2] 创建发布流程...")
    arguments = {
        "content": {
            "title": title,
            "body": body,
            "media": [{"url": video_url}],
        },
        "items": [
            {
                "platform": "bilibili",
                "option": {
                    "tid": tid,
                    "copyright": 1,
                    "no_reprint": 1,
                },
            }
        ],
        "publishAt": publish_at,
    }

    content = tool_call("createChannelPublishFlow", arguments, timeout=120)
    result_text = content[0].get("text", "") if content else ""
    print(f"[✓] 发布流程已创建: {result_text}")

    # 解析返回的 taskId
    task_id = ""
    flow_id = ""
    for line in result_text.split("\n"):
        if "taskId" in line or "task_id" in line:
            task_id = line.split(":")[-1].strip()
        if "flowId" in line or "flow_id" in line:
            flow_id = line.split(":")[-1].strip()

    # 如果需要立即发布，调用 publishChannelTaskNow
    if publish_now and task_id:
        print(f"[2/2] 立即发布 (taskId={task_id})...")
        content2 = tool_call("publishChannelTaskNow", {"taskId": task_id}, timeout=60)
        publish_result = content2[0].get("text", "") if content2 else ""
        print(f"[✓] 发布指令已发送: {publish_result}")
    elif publish_now:
        print(f"[2/2] 已提交发布（scheduled={publish_at}）")

    return {
        "task_id": task_id,
        "flow_id": flow_id,
        "result": result_text,
    }


def main():
    parser = argparse.ArgumentParser(description="B站视频发布（aitoearn MCP）")
    parser.add_argument("--video", help="本地视频文件路径（需先上传到公网可访问的 URL）")
    parser.add_argument("--video-url", help="视频 URL")
    parser.add_argument("--title", required=True, help="视频标题")
    parser.add_argument("--desc", default="", help="视频描述")
    parser.add_argument("--tags", default="遛娃,亲子", help="标签，逗号分隔")
    parser.add_argument("--tid", type=int, default=21, help="分区ID (默认21=日常)")
    parser.add_argument("--schedule", action="store_true", help="定时发布（明天10:00）")
    parser.add_argument("--json", action="store_true", help="JSON 输出")
    args = parser.parse_args()

    # 确定视频 URL
    video_url = args.video_url
    if not video_url and args.video:
        print("[✗] 本地文件需先上传到公网 URL，请使用 --video-url")
        sys.exit(1)
    if not video_url:
        print("[✗] 必须指定 --video-url")
        sys.exit(1)

    # 验证连接
    try:
        profile = get_profile()
        print(f"[✓] aitoearn 已连接: {profile.split(chr(10))[0]}")
    except Exception as e:
        print(f"[✗] aitoearn 连接失败: {e}")
        sys.exit(1)

    # 发布
    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    try:
        result = publish_video(
            video_url=video_url,
            title=args.title,
            desc=args.desc,
            tags=tags,
            tid=args.tid,
            publish_now=not args.schedule,
        )

        if args.json:
            print(json.dumps({"status": "ok", "data": result}, ensure_ascii=False))
        else:
            print(f"\n🎉 视频已提交发布")

    except Exception as e:
        print(f"[✗] 发布失败: {e}")
        if args.json:
            print(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
