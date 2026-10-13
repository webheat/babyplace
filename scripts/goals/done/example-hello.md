---
name: example-hello
model: sonnet
workdir: /opt/babyplace
timeout: 120
notify: false
---

请在 /opt/babyplace/scripts/goals/ 目录下创建一个 hello.txt 文件，内容为当前时间戳和 "Goal runner works!"。

完成后删除这个文件，这是一个测试任务。
