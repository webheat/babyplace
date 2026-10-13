#!/usr/bin/env python3
"""把超长的幼儿口播句按逗号拆成两句。

背景：folktales 的 kid_line 面向 4–6 岁，单句过长会超出短时记忆的一个语义块。
自检阈值是 22 字。这些长句几乎都是「前半句铺场景 + 逗号 + 后半句给动作」的结构，
在逗号处断开一般不会破坏语义。

只改数据里已经存在的句子，不改写内容、不删信息。拆完仍超长的会报出来人工处理。

用法：
    python3 -I pipeline/fix_long_sentences.py            # 预览
    python3 -I pipeline/fix_long_sentences.py --apply    # 写回
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    os.path.join(ROOT, "web/public/data/folktales.json"),
    os.path.join(ROOT, "web/public/data/folktales-extra.json"),
]
THRESHOLD = 22


def split_long(sentence):
    """在逗号处找最合适的断点。前半 >=8 字、后半 <=20 字才接受。"""
    parts = sentence.split("，")
    if len(parts) < 2:
        return None
    # 从右往左找断点，让后半句尽量短
    for i in range(len(parts) - 1, 0, -1):
        head = "，".join(parts[:i])
        tail = "，".join(parts[i:])
        if len(head) >= 8 and len(tail) <= 20:
            return head + "。" + tail + "。"
    return None


def fix_line(line):
    out = []
    changed = False
    for sent in line.replace("！", "。").split("。"):
        s = sent.strip()
        if not s:
            continue
        if len(s) <= THRESHOLD:
            out.append(s + "。")
            continue
        parts = [p for p in s.split("。") if p.strip()]
        rebuilt = []
        for p in parts:
            if len(p) <= THRESHOLD:
                rebuilt.append(p + "。")
                continue
            r = split_long(p)
            if r:
                rebuilt.append(r)
                changed = True
            else:
                rebuilt.append(p + "。")
                print(f"    ⚠ 无法自动拆分({len(p)}字)：{p}", file=sys.stderr)
        out.extend(rebuilt)
    return "".join(out), changed


def main():
    apply = "--apply" in sys.argv
    total = 0
    for path in FILES:
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            doc = json.load(f)
        changed = 0
        for t in doc["tales"]:
            new, ch = fix_line(t.get("kid_line", ""))
            if ch:
                t["kid_line"] = new
                changed += 1
        if changed:
            total += changed
            print(f"{os.path.basename(path)}: 改写 {changed} 条 kid_line")
            if apply:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(doc, f, ensure_ascii=False, indent=2)
    print(("已写回 " if apply else "预览（加 --apply 写回）") + f"，共 {total} 条")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())