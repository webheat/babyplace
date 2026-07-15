# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**遛娃宝地 (Babyplace)** — Cross-platform app helping parents find kid-friendly places (POIs). Built with uni-app Vue3 targeting H5 web and WeChat Mini Program. Backend uses uniCloud (Aliyun) cloud functions AND a Go HTTP server.

## Commands

```bash
# Frontend (uni-app Vue3)
pnpm install                    # Install dependencies
pnpm run dev:h5                 # H5 development server (http://localhost:5173)
pnpm run dev:mp-weixin          # WeChat Mini Program development
pnpm run build:h5               # H5 production build
pnpm run build:mp-weixin        # WeChat Mini Program production build

# Admin UI (Vue3 + Element Plus)
cd server/admin-ui && pnpm dev  # Admin dashboard dev server
cd server/admin-ui && pnpm build # Admin dashboard production build

# Go Backend Server (replaces uniCloud cloud functions for most operations)
cd server && go run .           # Start Go server (port 8080, reads .env)
cd server && go build -o babyplace-server .  # Build binary
go test ./...                   # Run Go tests (if any)

# Data ingestion (Python scripts)
pnpm run ingest:azhen           # Import POI from 真的叫阿珍 data source
pnpm run ingest:azhen:dry-run   # Dry run without actual import
pnpm run ingest:azhen:reset     # Clear POIs before import
pnpm run ingest:basename        # Import POIs from basename.csv
pnpm run ingest:basename:dry-run # Basename dry run
pnpm run notify:wecom           # Send WeChat Work notification

# Deployment
pnpm run deploy:cloud:functions # Upload cloud functions (requires HBuilderX CLI)
pnpm run deploy:cloud:babyplace-db # Upload database schema
pnpm run deploy:web             # Deploy to web hosting
pnpm run deploy:all             # Full deploy (functions + schema + web)
pnpm run upload:mp-weixin:auto  # Auto-upload WeChat Mini Program

# Docker (Go server + admin UI)
docker build -t babyplace .
docker run -p 8080:8080 --env-file .env babyplace
```

## Architecture

This project has **two backends** that coexist:

### 1. Go Server (`server/`) — PRIMARY backend
Single binary serving all API endpoints. Uses SQLite (`data/babyplace.db`) for persistence. Main entry: `main.go` with modular handlers in separate files:
- `poi.go`, `recommend.go`, `review.go`, `article.go` — core data handlers
- `admin.go` — `POST /babyplace-admin` action router (replaces uniCloud HTTP cloud function)
- `xhs.go`, `video.go`, `wxlogin.go` — external integrations
- `dify.go`, `llm.go` — AI/chat backends
- `mptext.go` — 猫铺text API
- `amap.go`, `route.go` — AMap geocoding/route planning
- `scheduler.go` — periodic article crawler
- `notify.go` — WeCom notifications
- `manage.go` — admin dashboard static file serving

All Go handlers return `{ code: 0, message: 'ok', data: {} }` matching the uniCloud response format.

### 2. uniCloud Cloud Functions (`uniCloud-aliyun/cloudfunctions/`)
Still present but being phased out in favor of Go server. Key functions:
- `babyplace-admin/` — HTTP action router (now mirrors Go server)
- `poi/`, `recommend/`, `review/`, `route/` — uniCloud Object handlers
- `babyplace-seed-v2/` — batch data import

### 3. Admin UI (`server/admin-ui/`)
Vue3 + Element Plus SPA for managing POIs, articles, sources, and reviews. Runs on Vite, built into Go binary's `static/manage/` via Docker multi-stage build.

### 4. Frontend App (`src/`)
uni-app Vue3 app targeting H5 + multiple mini programs (WeChat, Xiaohongshu, Alipay, etc.).

## API Fallback Chain

Frontend `src/api/` uses a 3-tier fallback (see `src/api/poi.js`, `src/api/recommend.js`):
1. `uniCloud.importObject()` → direct uniCloud Object call
2. `callAdminAction()` → HTTP call to `/babyplace-admin` (Go server in production)
3. Static snapshot from `src/data/poi-snapshot.json` → offline fallback

## Key Patterns

### Frontend (Vue3)
- **Composition API**: Use `<script setup>` syntax
- **Imports**: `onMounted/ref/reactive` from `vue`, `onLoad/onPullDownRefresh` from `@dcloudio/uni-app`
- **Path Alias**: `@/` resolves to `src/`
- **Error Handling**: Check `result.code !== 0`, show via `uni.showToast({ title, icon: 'none' })`
- **Platform Conditionals**: `// #ifdef H5` / `// #endif`
- **Naming**: camelCase for vars/functions, `handle` prefix for event handlers, `is`/`has` for booleans

### Backend (Go Server)
- **Package**: `main` with modular handlers in `.go` files
- **Database**: SQLite via `database/sql` (see `db.go` for init/schema)
- **Response**: `AdminResponse{ Code, Message, Data }` with `ok()` / `fail()` helpers
- **CORS**: `corsMiddleware` on all handlers
- **Env**: `.env` file in `server/` directory (PORT, AMap keys, AstrBot config, etc.)
- **Config**: AMap keys via `uni-config-center` in cloud functions (legacy) or env vars in Go server

### Backend (uniCloud Cloud Functions)
- **Module System**: CommonJS (`require`, `module.exports`)
- **Response Pattern**: `{ code: 0, message, data }` with `ok(data)` / `fail(code, message)` helpers
- **HTTP Entry**: `babyplace-admin` routes by `action` parameter
- **uniCloud Object**: `index.obj.js` callable via `uniCloud.importObject('name')`

## Database

- **Go Server**: SQLite at `server/data/babyplace.db` (schema defined in `db.go`)
- **uniCloud**: JSON schemas in `uniCloud-aliyun/database/*.schema.json`
- Key collections: `babyplace-poi`, `babyplace-article`, `babyplace-content-source`, `babyplace-user-review`, `babyplace-restaurant`, `babyplace-feedback`, `babyplace-error-log`, `babyplace-event-log`

## AI Integrations

- **AstrBot**: Chat backend (see `server/chat.go`) — sync API proxy
- **OpenClaw**: CLI-based agent backend (see `main.go` `handleOpenClawChat`) — shells out to `openclaw` binary
- **Dify**: Workflow/agent platform (see `server/dify.go`)
- **LLM**: Direct LLM calls via `server/llm.go` (configurable model, default `qwen-turbo`)
- Chat endpoints: `POST /api/chat`, `/api/openclaw/chat`, `/api/dify/chat`

## External Integrations

- **AMap** (高德地图): Geocoding, nearby search, driving routes
- **WeChat Mini Program**: Login (`wxlogin.go`), customer service, mp-xhs publishing
- **Xiaohongshu** (小红书): Auth, publish, status via `xhs.go`
- **Video**: Upload, enhance, render pipeline (`video.go`)
- **Meituan/Ele.me**: Affiliate links (`src/api/mt.js`, `src/api/ele/`)
- **Taobao**: TBK affiliate links (`src/api/tbk.js`)
- **猫铺text**: Product data (`mptext.go`)
- **WeCom**: Notifications (`notify.go`)

## Security Rules

- Never commit secrets/API keys — use `.env` files (Go server) or `uni-config-center` (cloud functions)
- Never delete `manifest.json`, `pages.json`
- Never modify `src/uni_modules/`
- API keys for AMap, AstrBot, Dify, etc. must come from environment variables or config center, never hardcoded

## Git Workflow

Commit format: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
Co-Authored-By: Claude <noreply@anthropic.com> on all commits.

## Key Files

- `server/main.go` — Go server entry point, all route definitions
- `server/poi.go` — POI handler (primary data logic, Go)
- `src/api/poi.js` — Frontend POI API wrapper (3-tier fallback)
- `src/pages.json` — uni-app page routing
- `src/manifest.json` — App configuration
- `src/utils/auth.js` — Auth utilities
- `src/config/customer-service.js` — 微信客服 config
- `server/admin-ui/src/` — Admin dashboard (Vue3 + Element Plus)
- `docs/POI_ENGINE_SPEC.md` — Recommendation engine spec
- `docs/AI_DEV_SPEC.md` — AI development rules
- `DESIGN.md` — Complete design system specification
- `server/Dockerfile` — Multi-stage build (admin-ui → Go binary)
