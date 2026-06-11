#!/usr/bin/env python3
"""
Send a text notification to a WeCom user via custom app message.

Required env vars:
  WECOM_CORP_ID
  WECOM_AGENT_ID
  WECOM_SECRET
  WECOM_USER_ID

Example:
  python scripts/send_wecom_notice.py --title "任务完成" --message "增量导入已完成"
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request


TOKEN_URL = "https://qyapi.weixin.qq.com/cgi-bin/gettoken"
MESSAGE_URL = "https://qyapi.weixin.qq.com/cgi-bin/message/send"


def get_env(name):
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"missing env: {name}")
    return value


def load_config():
    return {
        "corp_id": get_env("WECOM_CORP_ID"),
        "agent_id": get_env("WECOM_AGENT_ID"),
        "secret": get_env("WECOM_SECRET"),
        "user_id": get_env("WECOM_USER_ID"),
    }


def load_json_with_retry(request, timeout=30, retries=4):
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:
            last_error = error
            if attempt >= retries:
                raise
            time.sleep(attempt)
    raise last_error


def get_access_token(config):
    query = urllib.parse.urlencode({
        "corpid": config["corp_id"],
        "corpsecret": config["secret"],
    })
    request = urllib.request.Request(f"{TOKEN_URL}?{query}", method="GET")
    result = load_json_with_retry(request)
    if result.get("errcode") != 0:
        raise RuntimeError(f"gettoken failed: {result}")
    token = result.get("access_token", "")
    if not token:
        raise RuntimeError("gettoken failed: empty access_token")
    return token


def send_text_message(config, title, message):
    token = get_access_token(config)
    content = f"{title}\n{message}".strip() if title else message.strip()
    payload = {
        "touser": config["user_id"],
        "msgtype": "text",
        "agentid": int(config["agent_id"]),
        "text": {
            "content": content,
        },
        "safe": 0,
        "enable_id_trans": 0,
        "enable_duplicate_check": 0,
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{MESSAGE_URL}?access_token={urllib.parse.quote(token)}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    result = load_json_with_retry(request)
    if result.get("errcode") != 0:
        raise RuntimeError(f"message send failed: {result}")
    return result


def main():
    parser = argparse.ArgumentParser(description="Send WeCom app notification")
    parser.add_argument("--title", default="任务通知", help="Message title")
    parser.add_argument("--message", required=True, help="Message body")
    args = parser.parse_args()

    try:
        config = load_config()
        result = send_text_message(config, args.title, args.message)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as error:
        print(str(error))
        sys.exit(1)


if __name__ == "__main__":
    main()
