#!/usr/bin/env python3
"""
Goal Harness Runner — 无人值守调用 Claude Code CLI 执行任务

用法:
  python3 goal_runner.py <goal_file>           # 执行指定 goal 文件
  python3 goal_runner.py --list                # 列出所有 goal
  python3 goal_runner.py --run-next            # 执行队列中下一个未完成 goal

Goal 文件格式 (Markdown):
  ---
  name: my-task
  agent: main                    # 可选, 默认 main
  model: sonnet                  # 可选, 默认 sonnet
  workdir: /opt/babyplace        # 可选, 默认 /opt/babyplace
  timeout: 600                   # 可选, 默认 600 秒
  notify: true                   # 可选, 执行完是否企微通知
  ---

  这里写 goal 内容, 即 Claude Code 要执行的任务描述。

目录结构:
  /opt/babyplace/scripts/goals/
    ├── pending/    → 待执行 goal 文件
    ├── running/    → 执行中 (锁)
    ├── done/       → 已完成
    └── failed/     → 失败
"""

import argparse
import json
import logging
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# ── 配置 ──────────────────────────────────────────────────

GOALS_DIR = Path(os.getenv("GOALS_DIR", "/opt/babyplace/scripts/goals"))
LOG_DIR = GOALS_DIR / "logs"
PENDING_DIR = GOALS_DIR / "pending"
RUNNING_DIR = GOALS_DIR / "running"
DONE_DIR = GOALS_DIR / "done"
FAILED_DIR = GOALS_DIR / "failed"

DEFAULTS = {
    "agent": "main",
    "model": "sonnet",
    "workdir": "/opt/babyplace",
    "timeout": "600",
    "notify": "false",
}

CLAUDE_BIN = os.getenv("CLAUDE_BIN", "claude")

# ── 日志 ──────────────────────────────────────────────────

def setup_logging():
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_file = LOG_DIR / f"{datetime.now():%Y-%m-%d}.log"
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(levelname)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )

# ── Goal 文件解析 ─────────────────────────────────────────

def parse_goal(path: Path) -> dict:
    """解析 goal markdown 文件, 返回 {meta..., content: str}"""
    text = path.read_text(encoding="utf-8")
    meta = {"name": path.stem}
    content = text

    # 解析 YAML frontmatter
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            frontmatter = parts[1].strip()
            content = parts[2].strip()
            for line in frontmatter.splitlines():
                if ":" in line:
                    key, val = line.split(":", 1)
                    meta[key.strip()] = val.strip()

    # 合并默认值
    for k, v in DEFAULTS.items():
        meta.setdefault(k, v)

    meta["content"] = content
    meta["source_file"] = str(path)
    return meta

# ── Claude Code 调用 ──────────────────────────────────────

def run_claude(goal: dict) -> dict:
    """调用 Claude Code CLI 执行 goal, 返回 {success, output, duration, error}"""
    name = goal["name"]
    workdir = goal["workdir"]
    timeout = int(goal["timeout"])
    model = goal["model"]

    log.info("▶ 开始执行 goal: %s (model=%s, timeout=%ds)", name, model, timeout)
    log.info("  工作目录: %s", workdir)
    log.info("  任务内容: %s...", goal["content"][:120])

    cmd = [
        CLAUDE_BIN,
        "-p",                            # 非交互模式
        "--dangerously-skip-permissions", # 跳过权限确认
        "--model", model,
        "--output-format", "text",
        goal["content"],
    ]

    start = time.time()
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=workdir,
            env={**os.environ, "CLAUDE_CODE_ENTRYPOINT": "goal-runner"},
        )
        duration = time.time() - start

        if result.returncode == 0:
            log.info("✓ goal %s 完成 (%.1fs)", name, duration)
            return {
                "success": True,
                "output": result.stdout.strip(),
                "duration": round(duration, 1),
                "error": None,
            }
        else:
            log.error("✗ goal %s 失败 (exit=%d, %.1fs)", name, result.returncode, duration)
            return {
                "success": False,
                "output": result.stdout.strip(),
                "duration": round(duration, 1),
                "error": result.stderr.strip() or f"exit code {result.returncode}",
            }

    except subprocess.TimeoutExpired:
        duration = time.time() - start
        log.error("✗ goal %s 超时 (%.1fs > %ds)", name, duration, timeout)
        return {
            "success": False,
            "output": "",
            "duration": round(duration, 1),
            "error": f"超时 ({timeout}s)",
        }
    except Exception as e:
        duration = time.time() - start
        log.error("✗ goal %s 异常: %s", name, e)
        return {
            "success": False,
            "output": "",
            "duration": round(duration, 1),
            "error": str(e),
        }

# ── 企微通知 ──────────────────────────────────────────────

def notify_result(goal: dict, result: dict):
    """通过企微 webhook 发送执行结果通知"""
    webhook_url = os.getenv("WECOM_WEBHOOK_URL")
    if not webhook_url:
        log.warning("未配置 WECOM_WEBHOOK_URL, 跳过通知")
        return

    status = "✅ 成功" if result["success"] else "❌ 失败"
    name = goal["name"]
    duration = result["duration"]
    output_preview = (result["output"] or result["error"] or "")[:300]

    text = (
        f"[Goal Runner] {status}\n"
        f"任务: {name}\n"
        f"耗时: {duration}s\n"
        f"输出: {output_preview}"
    )

    try:
        import urllib.request
        payload = json.dumps({"msgtype": "text", "text": {"content": text}})
        req = urllib.request.Request(
            webhook_url,
            data=payload.encode(),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=10)
        log.info("企微通知已发送")
    except Exception as e:
        log.warning("企微通知失败: %s", e)

# ── 结果持久化 ────────────────────────────────────────────

def save_result(goal: dict, result: dict, output_dir: Path):
    """保存执行结果到目标目录"""
    output_dir.mkdir(parents=True, exist_ok=True)
    result_file = output_dir / f"{goal['name']}.result.json"
    result_data = {
        "goal": goal["name"],
        "source_file": goal["source_file"],
        "finished_at": datetime.now().isoformat(),
        **result,
    }
    result_file.write_text(json.dumps(result_data, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info("结果已保存: %s", result_file)

# ── 单个 goal 执行 ────────────────────────────────────────

def execute_goal(goal_path: Path) -> bool:
    """执行一个 goal 文件, 返回是否成功"""
    goal = parse_goal(goal_path)
    name = goal["name"]

    # 移到 running 目录 (加锁)
    running_path = RUNNING_DIR / goal_path.name
    RUNNING_DIR.mkdir(parents=True, exist_ok=True)
    shutil.move(str(goal_path), str(running_path))

    # 用 try/finally 确保 goal 一定离开 running/
    try:
        result = run_claude(goal)
    except Exception as e:
        log.error("✗ goal %s 未捕获异常: %s", name, e)
        result = {
            "success": False,
            "output": "",
            "duration": 0,
            "error": f"未捕获异常: {e}",
        }

    # 保存结果
    target_dir = DONE_DIR if result["success"] else FAILED_DIR
    save_result(goal, result, target_dir)

    # 移动 goal 文件到终态目录
    target_path = target_dir / goal_path.name
    shutil.move(str(running_path), str(target_path))

    # 通知
    if goal.get("notify", "").lower() == "true":
        notify_result(goal, result)

    return result["success"]

# ── Stale goal 清理 ──────────────────────────────────────

def cleanup_stale_running():
    """检测 running 目录中超时的 goal，移到 failed"""
    RUNNING_DIR.mkdir(parents=True, exist_ok=True)
    now = time.time()

    for goal_path in RUNNING_DIR.glob("*.md"):
        # 文件修改时间 = 开始执行时间
        mtime = goal_path.stat().st_mtime
        elapsed = now - mtime

        # 解析 goal 获取 timeout
        try:
            goal = parse_goal(goal_path)
            timeout = int(goal["timeout"])
        except Exception:
            timeout = 600  # 默认

        # 超过 timeout + 30s buffer 视为 stale
        if elapsed > timeout + 30:
            log.warning("⚠ stale goal 检测到: %s (已运行 %.0fs > %ds)", goal_path.stem, elapsed, timeout)
            result = {
                "success": False,
                "output": "",
                "duration": round(elapsed, 1),
                "error": f"进程异常退出，stale 检测触发 (已运行 {int(elapsed)}s)",
            }
            save_result({"name": goal_path.stem, "source_file": str(goal_path)}, result, FAILED_DIR)
            shutil.move(str(goal_path), str(FAILED_DIR / goal_path.name))
            log.info("已移动到 failed/: %s", goal_path.name)

# ── 批量执行 ──────────────────────────────────────────────

def run_all_pending():
    """执行 pending 目录下所有 goal"""
    cleanup_stale_running()  # 先清理 stale
    PENDING_DIR.mkdir(parents=True, exist_ok=True)
    goals = sorted(PENDING_DIR.glob("*.md"))

    if not goals:
        log.info("没有待执行的 goal")
        return

    log.info("发现 %d 个待执行 goal", len(goals))
    success, failed = 0, 0

    for goal_path in goals:
        if execute_goal(goal_path):
            success += 1
        else:
            failed += 1

    log.info("全部完成: %d 成功, %d 失败", success, failed)

def run_next():
    """执行 pending 目录下第一个 goal"""
    cleanup_stale_running()
    PENDING_DIR.mkdir(parents=True, exist_ok=True)
    goals = sorted(PENDING_DIR.glob("*.md"))

    if not goals:
        log.info("没有待执行的 goal")
        return

    execute_goal(goals[0])

def list_goals():
    """列出所有 goal 状态"""
    for label, dir_path in [("待执行", PENDING_DIR), ("执行中", RUNNING_DIR), ("已完成", DONE_DIR), ("失败", FAILED_DIR)]:
        dir_path.mkdir(parents=True, exist_ok=True)
        files = sorted(dir_path.glob("*.md"))
        if files:
            print(f"\n{label} ({len(files)}):")
            for f in files:
                print(f"  - {f.stem}")

# ── 入口 ──────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Goal Harness Runner — 调用 Claude Code 执行任务")
    parser.add_argument("goal_file", nargs="?", help="Goal 文件路径")
    parser.add_argument("--list", action="store_true", help="列出所有 goal")
    parser.add_argument("--run-next", action="store_true", help="执行下一个待执行 goal")
    parser.add_argument("--run-all", action="store_true", help="执行所有待执行 goal")
    args = parser.parse_args()

    setup_logging()
    global log
    log = logging.getLogger("goal-runner")

    if args.list:
        list_goals()
    elif args.run_next:
        run_next()
    elif args.run_all:
        run_all_pending()
    elif args.goal_file:
        path = Path(args.goal_file)
        if not path.exists():
            log.error("Goal 文件不存在: %s", path)
            sys.exit(1)
        execute_goal(path)
    else:
        # 默认执行所有 pending
        run_all_pending()

if __name__ == "__main__":
    main()
