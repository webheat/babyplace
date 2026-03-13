# AI Development Specification

Project: babyplace
Framework: uni-app Vue3 CLI
Cloud: uniCloud
Language: JavaScript

---

# Project Structure

AI MUST follow this structure

src
uniCloud-aliyun
docs
scripts
ai

---

# Source Code Rules

Source code lives in:

src/

Pages:

src/pages

Components:

src/components

Static assets:

src/static

---

# Vue Rules

Use Vue3 Composition API

<script setup>

Avoid Options API unless required.

---

# uniCloud Rules

Backend lives in:

uniCloud-aliyun/

Cloud functions:

uniCloud-aliyun/cloudfunctions

Database schema:

uniCloud-aliyun/database

---

# Database Rules

Schema must exist before cloud code.

All schema definitions stored in:

docs/CLOUD_SCHEMA.md

---

# Frontend → Backend

Use:

uniCloud.callFunction()

Never call database directly.

---

# Development Flow

AI MUST follow order:

1 create schema
2 create cloud function
3 create frontend page
4 integrate API
5 test

---

# Local Commands

Install:

npm install

Run H5:

npm run dev:h5

Run Wechat Mini Program:

npm run dev:mp-weixin

---

# Git Rules

Commit format:

feat:
fix:
refactor:
docs:

---

# AI Safety Rules

AI MUST NOT

delete manifest.json
delete pages.json
change cloud provider
modify CI scripts

AI SHOULD

prefer minimal changes
keep code readable