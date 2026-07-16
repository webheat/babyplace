# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Also read:** [`AGENTS.md`](./AGENTS.md) — Vue component patterns, API layer patterns, and cloud function templates (targeted at AI coding agents). This CLAUDE.md covers the big-picture architecture; AGENTS.md has the per-file code patterns.

## Project Overview

**遛娃宝地 (Babyplace)** — Cross-platform app helping parents find kid-friendly places (POIs). Built with uni-app Vue3 targeting H5 + multiple mini programs (WeChat, Xiaohongshu, Alipay, etc.). 

**Two backends that coexist:**
1. **Go Server** (`server/`) — PRIMARY backend. SQLite, modular handlers, single binary.
2. **uniCloud cloud functions** (`uniCloud-aliyun/cloudfunctions/`) — Legacy, being phased out.

**Admin UI** (`server/admin-ui/`) — Vue3 + Element Plus SPA for managing POIs, articles, sources, reviews.

**Data ingestion** — Python scripts in `scripts/` (Azhen POI import, basename CSV import, WeCom notifications).

## Commands

```bash
# Frontend (uni-app Vue3) — run from repo root
pnpm install                      # Install all deps (includes server/admin-ui via workspace)
pnpm dev:h5                       # H5 dev server (http://localhost:5173)
pnpm dev:mp-weixin                # WeChat Mini Program dev
pnpm build:h5                     # H5 production build
pnpm build:mp-weixin              # MP build + patch project-config.json

# Admin UI (Vue3 + Element Plus) — run from server/admin-ui/
pnpm --filter admin-ui dev        # Admin dashboard dev server (port mirrored in vite.config)
pnpm --filter admin-ui build      # Admin production build (output: static/manage/)

# Go Backend Server — run from server/
cd server && go run .             # Start on :8080 (reads .env from server/ or ../)
cd server && go build -o babyplace-server .  # Build binary
go test ./...                     # Run Go tests

# Docker (Go server + admin UI, multi-stage build)
docker build -t babyplace ./server
docker run -p 8080:8080 --env-file .env babyplace

# Data ingestion (Python scripts)
pnpm run ingest:azhen             # Import POI from "真的叫阿珍" WeChat articles
pnpm run ingest:azhen:dry-run     # Dry run without writing
pnpm run ingest:azhen:reset       # Clear all POIs before import
pnpm run ingest:basename          # Import from basename.csv
pnpm run ingest:basename:dry-run  # Basename dry run
pnpm run notify:wecom             # Send WeChat Work notification

# WeChat Mini Program upload (miniprogram-ci)
pnpm run upload:mp-weixin:auto    # Auto-upload to WeChat (uses private.wx0097f2621a6cb4b1.key)

# Deployment (legacy uniCloud — requires HBuilderX CLI on Windows)
pnpm run deploy:cloud:functions   # Upload cloud functions
pnpm run deploy:all               # Full deploy: functions + schema + web
```

## Architecture

### Go Server (`server/`) — PRIMARY backend

Single Go binary (`package main`), modular `.go` handler files. SQLite via `modernc.org/sqlite` (pure Go, no CGO).

**Key files:**
- `main.go` — Entry point: init modules, register HTTP routes, start server
- `db.go` — SQLite schema/init, `POI` and `Article` struct definitions, DB helper functions
- `admin.go` — `POST /babyplace-admin` action router + `AdminResponse{Code,Message,Data}` helpers + param extraction helpers
- `poi.go` — POI CRUD, nearby search
- `review.go`, `article.go`, `recommend.go` — Core data handlers
- `goods.go` — Legacy goods CRUD (old API without `poi.` prefix)
- `seed.go` — Batch import/upsert operations
- `mptext.go` — WeChat public account (公众号) article scraping via 猫铺text API
- `xhs.go`, `video.go`, `wxlogin.go` — External integrations
- `dify.go`, `llm.go` — AI/chat backends
- `amap.go`, `route.go` — AMap (高德地图) geocoding/route planning
- `scheduler.go` — Periodic article crawler
- `notify.go` — WeCom notifications
- `manage.go` — Admin UI static file serving (`/manage/`)
- `image.go` — Image processing

**Routes (defined in main.go):**
- `POST /babyplace-admin` — Main admin API (action-based routing)
- `/api/chat`, `/api/openclaw/chat`, `/api/dify/chat` — AI chat
- `/api/amap/search`, `/api/amap/nearby` — AMap geocoding
- `/api/xhs/status`, `/api/xhs/auth`, `/api/xhs/callback`, `/api/xhs/publish` — Xiaohongshu
- `/api/video/upload`, `/api/video/enhance`, `/api/video/render` — Video pipeline
- `/api/wx-login` — WeChat login
- `/api/client-log` — Client-side error/event logging
- `/manage/` — Admin dashboard (static files)
- `/health` — Health check

**Response format (all handlers):** `{ code: 0, message: 'ok', data: {} }` — matches legacy uniCloud convention.

**CORS:** `corsMiddleware` on all API routes (Allow-Origin: *, methods: GET/POST/OPTIONS).

**Config:** Loads `.env` from `server/.env` then `../.env`. Key vars: `PORT`, `DB_PATH`, `AMAP_KEY`, `ASTBOT_BASE_URL`, `ASTBOT_API_KEY`, `OPENCLAW_BIN`, `DIFY_API_URL`, `WX_APP_ID`, `WX_APP_SECRET`, `MPTEXT_FAKEIDS`, `WECOM_CORPID`, `AI_API_URL`, `AI_API_KEY`, `REMOTION_SERVER_URL`.

### Admin UI (`server/admin-ui/`)

Vue3 + Element Plus SPA, built with Vite. Compiled into Go binary's `static/manage/` via Docker multi-stage build.

**Structure:**
```
server/admin-ui/src/
├── main.js             # App entry, Element Plus registration
├── App.vue             # Root component
├── router.js           # Vue Router (login guard)
├── api.js              # API calls to POST /babyplace-admin
└── views/
    ├── Login.vue       # Auth page
    ├── Layout.vue      # App shell (sidebar + content)
    ├── Dashboard.vue   # Landing page
    ├── PoiList.vue     # POI management (search table + CRUD dialog)
    ├── ArticleList.vue # Article management
    ├── ReviewList.vue  # Review management
    └── SourceList.vue  # Content source management
```

**Dev server:** Run from `server/admin-ui/` with `pnpm dev` (Vite proxy configured in `vite.config.js`).

### Frontend App (`src/`)

uni-app Vue3 CLI project targeting H5 + multiple mini programs. Composition API with `<script setup>`.

**Key structure:**
```
src/
├── pages/              # Page components (16 subdirs: admin, auth, chat, poi, etc.)
├── api/                # API wrappers (3-tier fallback — see below)
├── components/         # Shared components (25 dirs)
├── utils/              # Utilities (auth.js, etc.)
├── config/             # App config
├── data/               # Static snapshots (e.g. poi-snapshot.json)
├── store/              # Vuex store
├── common/             # Shared assets (icon fonts)
├── static/             # Static files
└── pages.json          # Page routing (register all pages here)
```

**API Fallback Chain (3 tiers, see `src/api/poi.js`, `src/api/admin.js`):**
1. `uniCloud.importObject()` → direct uniCloud Object call
2. `callAdminAction()` → HTTP call to `POST /babyplace-admin` (Go server)
3. Static snapshot from `src/data/poi-snapshot.json` → offline fallback

### uniCloud Cloud Functions (`uniCloud-aliyun/cloudfunctions/`)

Legacy but still deployed. CommonJS modules with `{'action': '...', 'payload': {...}}` pattern.

**Key functions:** `babyplace-admin/` (HTTP action router), `poi/`, `recommend/`, `review/`, `article/`.

### Database

**Go Server:** SQLite at path set by `DB_PATH` env var (default: `data/babyplace.db`). Schema defined in `db.go` (`initDB()`). Key tables: `pois`, `reviews`, `articles`, `content_sources`, `mptext_accounts`.

**uniCloud (legacy):** JSON schemas in `uniCloud-aliyun/database/*.schema.json`. Collections: `babyplace-poi`, `babyplace-article`, `babyplace-content-source`, `babyplace-user-review`, `babyplace-restaurant`, `babyplace-feedback`.

## External Integrations

| Service | File(s) | Purpose |
|---------|---------|---------|
| AMap (高德地图) | `amap.go`, `route.go` | Geocoding, nearby search, driving routes |
| WeChat Mini Program | `wxlogin.go` | OAuth login |
| Xiaohongshu (小红书) | `xhs.go` | Auth, publish, status |
| AstrBot | `main.go` (handleChat) | Old AI chat backend (sync API proxy) |
| OpenClaw | `main.go` (handleOpenClawChat) | CLI-based agent (shells out to `openclaw` binary) |
| Dify | `dify.go` | Workflow/agent platform (遛娃宝地知识库) |
| LLM | `llm.go` | Direct LLM calls (default model: `qwen-turbo`) |
| 猫铺text | `mptext.go` | WeChat public account article scraping |
| WeCom (企业微信) | `notify.go` | Failure alerts |
| Remotion | `video.go` | Video rendering service |
| aitoearn | — | Multi-platform publishing (B站/抖音) |
| Meituan/Ele.me | `goods.go` | Affiliate link generation |

## Key Patterns

### Frontend (uni-app Vue3)
- **Composition API**: `<script setup>` syntax everywhere
- **Imports**: `onMounted/ref/reactive/computed` from `vue`; `onLoad/onPullDownRefresh` from `@dcloudio/uni-app`
- **Path Alias**: `@/` → `src/`
- **Error Handling**: Check `result.code !== 0`, show via `uni.showToast({ title, icon: 'none' })`
- **Platform Conditionals**: `// #ifdef H5` / `// #endif`
- **Naming**: camelCase vars/functions, `handle` prefix for events, `is`/`has` for booleans

### Backend (Go Server)
- **NO framework** — raw `net/http` handlers
- **Response**: `AdminResponse{ Code, Message, Data }` with `ok()` / `fail()` helpers
- **Param extraction**: `getString()`, `getInt()`, `getFloat()`, `getPayload()` helpers in `admin.go`
- **DB access**: `database/sql` with `modernc.org/sqlite` driver; `dbMu` mutex around writes

### Admin UI (Vue3 + Element Plus)
- Element Plus components: `el-table`, `el-form`, `el-card`, `el-dialog`, `el-tag`, `el-button`
- API calls via `api.js` → `POST /babyplace-admin` with `{action, payload}`
- Login guard in `router.js` (simple token check)
- Views follow a pattern: search form → table → pagination → CRUD dialog

### Design System
Defined in `DESIGN.md` at repo root. Covers colors, typography (rpx-based), spacing (4px grid), component CSS, responsive breakpoints.

## Key Reference Documents

Located in `docs/` — read these before working in related areas:
- `POI_ENGINE_SPEC.md` — Recommendation engine specification
- `AI_DEV_SPEC.md` — AI development rules
- `DATABASE_RELATIONS.md` — DB schema relations
- `CLOUD_SCHEMA.md` — Cloud database schemas
- `HTTP_CLOUD_FUNCTION_DEBUG.md` — Local cloud function debugging
- `MPTTEXT_API_INTEGRATION.md` — 猫铺text API docs
- `CONTENT_PARSER_SPEC.md` — Article parsing spec
- `MEITUAN_UNION_INTEGRATION.md` — Meituan affiliate integration
- `MINIAPP_API.md` — Mini program API docs

## Git Workflow

Commit format: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
Co-Authored-By: Claude <noreply@anthropic.com> on all commits.

Docker workflow for testing: `docker build -t babyplace ./server && docker run -p 8080:8080 --env-file .env babyplace`

## Security Rules

- Never commit secrets/API keys — use `.env` files
- Never delete `manifest.json`, `pages.json`
- Never modify `src/uni_modules/`
- API keys from env vars or config center, never hardcoded
