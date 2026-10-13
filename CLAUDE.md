# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Also read:** [`AGENTS.md`](./AGENTS.md) — Vue component patterns, API layer patterns, and cloud function templates (targeted at AI coding agents). This CLAUDE.md covers the big-picture architecture; AGENTS.md has the per-file code patterns.

## Project Overview

**遛娃宝地 (Babyplace)** — Cross-platform app helping parents find kid-friendly places (POIs). Built with uni-app Vue3 targeting H5 + multiple mini programs (WeChat, Xiaohongshu, Alipay, etc.).

**Three coexisting systems** — knowing which one owns a file is the main thing to get right:

1. **Go Server** (`server/`) — PRIMARY backend. SQLite, modular handlers, single binary.
2. **uniCloud cloud functions** (`uniCloud-aliyun/cloudfunctions/`) — Legacy, being phased out.
3. **Story/geo H5** (`web/` + `pipeline/`) — A standalone Vite+MapLibre app that renders history & folklore as a narrated 3D globe. **Not in the pnpm workspace** — it has its own `package-lock.json` and needs its own `npm i`. Nothing in `src/` depends on it; it's a separate deliverable that reads from the same SQLite DB.

**Admin UI** (`server/admin-ui/`) — Vue3 + Element Plus SPA for managing POIs, articles, sources, reviews.

**Data ingestion** — Python scripts in `scripts/` (Azhen POI import, basename CSV import, WeChat article scraping, WeCom notifications). These use `scripts/.venv/`, separate from the pyenv python the geo pipeline uses.

## ⚠️ Two trees at the repo root — only `src/` is source

The repo root contains **two parallel trees that look identical**, and picking the wrong one wastes an hour of debugging minified code:

| Path | What it is |
|---|---|
| `src/pages/`, `src/api/`, `src/components/`, `src/utils/`, `src/store/` | **Source.** `.vue` / `.js`, human-readable, aliased as `@/`. |
| `pages/`, `api/`, `components/`, `utils/`, `store/`, `common/`, `config/`, `static/` | **Committed WeChat mini-program build output.** Minified `.js`, plus `.wxml` / `.wxss` / `.json` with no source counterpart. |

Root `api/poi.js` is the *compiled* form of `src/api/poi.js` (see the minified `exports.nearbyPoi`). Root files are committed on purpose (`build:` commits, e.g. `8f88677 build: 更新小程序编译产物 v1.1.0`) and are **not** in `.gitignore` — `.gitignore` only covers `dist/`.

**Rules:** edit only under `src/`. Never hand-edit or regenerate the root tree; it is refreshed by copying `dist/dev/mp-weixin` out. If you see a bug "in `api/poi.js`", you are looking at build output — the bug is in `src/api/poi.js`.

`src/pages.json`, `src/manifest.json`, `src/App.vue` are the real routing/config entries (there is no root `pages.json` or `manifest.json`).

## Commands

```bash
# Frontend (uni-app Vue3) — run from repo root
pnpm install                      # Install root deps only (see note on admin-ui below)
pnpm dev:h5                       # H5 dev server (http://localhost:5173)
pnpm dev:mp-weixin                # WeChat Mini Program dev
pnpm build:h5                     # H5 production build
pnpm build:mp-weixin              # MP build + patch project.config.json

# Admin UI (Vue3 + Element Plus) — run from server/admin-ui/
cd server/admin-ui && pnpm i      # MUST install separately (see note)
cd server/admin-ui && pnpm dev    # Admin dashboard dev server
cd server/admin-ui && pnpm build  # Admin production build (output → static/manage/)

# Go Backend Server — run from server/
cd server && go run .             # Start on :8080 (reads .env from server/ or ../)
cd server && go build -o babyplace-server .
go vet ./...                      # Only static check available — there are no *_test.go files

# Data ingestion (Python, needs scripts/.venv)
pnpm run ingest:azhen             # Import POI from WeChat articles
pnpm run ingest:azhen:dry-run     # Dry run without writing
pnpm run ingest:azhen:reset       # Clear all POIs before import
pnpm run ingest:basename          # Import from basename.csv
pnpm run ingest:wechat            # Scrape WeChat articles
pnpm run notify:wecom             # Send WeChat Work notification
pnpm run upload:mp-weixin:auto    # Auto-upload mini program (miniprogram-ci)

# Story/geo H5 — run from web/ (NEEDS ITS OWN npm i FIRST)
cd web && npm i
npm run data:poi                  # SQLite POIs → poi.json (GCJ-02 → WGS-84)
npm run data:script               # lore.json → episode.json
npm run data:tts                  # episode.json → audio + real timing
npm run dev                       # inline + vite dev server (port 5188)
npm run build                     # inline + vite build → web/dist/

# Nightly batch (both are one-shot crontab entries, both只产出不发布)
bash web/scripts/nightly-geo.sh       # POI→script→TTS→bake→H5 build
bash web/scripts/nightly-folktale.sh  # validate→compile→GeoJSON→H5 build
# Logs: out/logs/nightly-*.log, out/logs/folktale-*.log

# Verification — the closest thing this repo has to a test suite
python3 -I pipeline/folktale_to_lore.py --check   # bijection + kid-copy rules
```

**Admin UI is NOT a pnpm workspace member.** The root `pnpm-workspace.yaml` has only an `allowBuilds:` key — no `packages:` list — and `server/admin-ui/` carries its own `pnpm-lock.yaml`. `pnpm --filter admin-ui ...` fails; the package is named `babyplace-admin-ui`. Always `cd server/admin-ui && pnpm i` first.

**The `deploy:cloud:*` and `deploy:all` npm scripts are Windows-only** — they hardcode `C:\HBuilderX\cli.exe`. They will not run on this Linux host; uploading cloud functions is not scriptable from here.

**`web/` runs its Python with `python3 -I`** (isolated mode) via npm scripts — the `-I` matters because the pipeline scripts live outside `web/` and must not pick up a stray local `json.py`/`os.py`. Keep the `-I` when running them by hand.

## Story/geo H5 subsystem (`web/` + `pipeline/`)

The piece most likely to be under-documented elsewhere. A narrated 3D-globe story player where **one `episode.json` drives both outputs** — the live H5 player and the Remotion render — via a shared camera model.

### Data flow

```
SQLite babyplace.db ──poi_extract.py──► poi.json          (GCJ-02 → WGS-84, iterative)
lore.json (hand-written) ─┐
                          ├─script_gen.py─► episode.json  ← THE single source of truth
poi.json ─────────────────┘                                (camera keys + beats + captions)
                              └─tts_episode.py─► audio/ + real timing written back
                                              └─inline_episode.py─► episode-inline.js
                                                                    (window.__EPISODE__)
folktales.json ──folktale_to_lore.py──► folktale-episode.json
                                     └─export_geojson.py──► folktales.geojson + -lite.geojson
```

`src/geo/data/chinese-folktales.json` (47 features) is the **upstream source of truth** for name / category / province / site / source / summary / coordinates. `web/public/data/folktales.json` stores **only the human-written fields** (`kid_line`, `ask_kid`, `want_to_see`) keyed by upstream `id`. `folktale_to_lore.py --check` enforces the bijection and refuses to produce output when it's broken — this is why a missing `kid_line` blocks the whole nightly batch rather than silently shipping 21 of 47 stories. `folktales-extra.json` holds 18 hand-added tales that don't exist upstream (own coords, `source_verified: false`).

### Hard-won invariants — don't regress these

- **`episode.json` is the only truth.** H5 and Remotion both read it and share `web/src/camera.js`; they differ only in clock source (rAF vs `useCurrentFrame()`). The acceptance criterion is that `camAt(keys, t)` returns the same camera for the same `t` regardless of renderer or frame count.
- **Coordinates are GCJ-02 in the DB, WGS-84 everywhere downstream.** Bake tiles are WGS-84. Convert with `gcj02towgs84_exact` (iterative to 1e-6°); a naive forward-minus-offset only converges to tens of metres near Guangzhou. `folktale_to_lore.py` defaults to assuming the upstream GeoJSON is already WGS-84 — it has a `--assume-gcj02` flag if that turns out wrong.
- **`episode-inline.js` is gitignored and required for the page to render.** A fresh clone white-screens until `inline_episode.py` runs. `npm run build`/`dev` already chain it; running `vite build` bare does not.
- **Kid-facing copy has a hard length budget.** `THRESHOLD = 30` chars/sentence in `folktale_to_lore.py`. Semantic coherence beats the character count — a mechanical punctuation split shattered causal clauses ("他不是把水堵住，而是挖出河道…" into fragments). `fix_long_sentences.py` is the historical evidence; read it before "fixing" long lines.
- **MiniMax TTS gotchas** (documented in `tts_episode.py`, do not remove): `data.audio` is a **hex** string not base64, and `language_boost` must be top-level, not nested in `voice_setting`.
- **This machine has no GPU.** Bake goes through SwiftShader at ~9s/frame, which is why `nightly-geo.sh` runs 3 segments in parallel at `nice -n 15` and uses `FPS=20`. `CHROME` must be set explicitly to the 150 headless shell — the 131 build silently hangs on tile fetches.
- **Wikidata is unreachable from this host** (direct and proxy both time out), so `fetch-wikidata-myths.mjs` ships a bundled public-domain fallback. Re-test before assuming it's still down.

### `bake-basemap.mjs` env knobs

`NAME STYLE(satellite|dark|light) CENTER=lng,lat ZSTART ZEND PITCH BEARING FPS DUR HOLD(out point of zoom, p∈[0,1]) MARGIN=lngDeg,latDeg KEEPMARGIN COUNTRIES OUT CREDIT`. Artifacts land in `process.cwd()`, not the script directory.

## Architecture (Go Server)

**NO framework** — raw `net/http` handlers. Single binary, `package main`.

**Key files:**
- `main.go` — Entry point: init modules, register HTTP routes, start server
- `db.go` — SQLite schema/init, `POI` and `Article` structs, DB helpers
- `admin.go` — `POST /babyplace-admin` action router + `AdminResponse{Code,Message,Data}` + param helpers
- `poi.go`, `review.go`, `article.go`, `recommend.go`, `goods.go` — Core data handlers
- `article_parse.go` — WeChat article HTML parsing
- `mptext.go` — 猫铺text WeChat scraping; `scheduler.go` — periodic crawler
- `dify.go`, `llm.go`, `amap.go`, `route.go`, `xhs.go`, `video.go`, `wxlogin.go`, `notify.go`, `image.go`, `obsidian.go`
- `manage.go` — Admin UI static serving (`/manage/`)

**Routes:** `POST /babyplace-admin` (action router) · `/api/chat`, `/api/openclaw/chat`, `/api/dify/chat` · `/api/amap/search`, `/api/amap/nearby` · `/api/xhs/*` · `/api/video/*` · `/api/wx-login` · `/api/client-log` · `/manage/` · `/health`

**Response format (all handlers):** `{ code: 0, message: 'ok', data: {} }` — matches the legacy uniCloud convention. `ok()` / `fail()` helpers; params via `getString()` / `getInt()` / `getFloat()` / `getPayload()`.

**CORS:** open (`*`) on all API routes.

### Four unrelated things wear the "LLM" label — don't conflate them

| Route / helper | Actually goes to | Defined in |
|---|---|---|
| `POST /api/chat` | AstrBot's sync API (`astrbotBaseURL + /api/v1/chat/sync`), username `miniprogram_<sessionID>` | `main.go:handleChat` |
| `POST /api/openclaw/chat` | Shells out to a **local binary** (`OPENCLAW_BIN`, default `openclaw`) and parses its stdout JSON; tolerates non-zero exit | `main.go:handleOpenClawChat` |
| `POST /api/dify/chat` | Dify `/v1/chat-messages` (default `http://lanes.ymxt.top:3000`) | `dify.go` |
| `llmChat(system, user)` | Generic OpenAI-compatible `/chat/completions` against `AI_API_URL` + `AI_API_KEY`, model from `LLM_MODEL` (default `qwen-turbo`) | `llm.go` |

**`llmChat` is not used by any chat route.** Its only caller is `article_parse.go` for WeChat article HTML→POI extraction. If you're changing chat behaviour, edit the route handler; if you're changing extraction quality, edit `llm.go`.

**Config:** loads `.env` from `server/.env` then `../.env`. Key vars: `PORT`, `DB_PATH`, `AMAP_KEY`, `DIFY_API_URL`, `WX_APP_ID`/`WX_APP_SECRET`, `WECOM_CORPID`, `AI_API_URL`/`AI_API_KEY`, `OPENCLAW_BIN`, `REMOTION_SERVER_URL`.

**Frontend fallback chain (3 tiers, `src/api/poi.js`, `src/api/admin.js`):** `uniCloud.importObject()` → HTTP `POST /babyplace-admin` → static snapshot `src/data/poi-snapshot.json`.

## Key Patterns

**Backend:** raw `net/http`; `dbMu` mutex around writes; `modernc.org/sqlite` (pure Go, no CGO).

**Frontend:** Composition API `<script setup>`; imports from `@dcloudio/uni-app`; `// #ifdef H5` conditionals; always check `result.code !== 0`; camelCase with `handle`/`is` prefixes; rpx units.

**Admin UI:** `api.js` → `POST /babyplace-admin` with `{action, payload}`; Element Plus tables/forms/dialogs.

**Design system:** `DESIGN.md` — colors, typography, 4px spacing grid, breakpoints.

## Key Reference Documents

- `src/geo/README.md` — geo module capabilities, free data sources, and the Cesium/esbuild `#ifdef` trap (Cesium shaders break uni-app's conditional-compile preprocessor, so it must load as a global script)
- `docs/POI_ENGINE_SPEC.md` — recommendation engine
- `docs/DATABASE_RELATIONS.md`, `docs/CLOUD_SCHEMA.md` — schema
- `docs/AI_DEV_SPEC.md`, `docs/CONTENT_PARSER_SPEC.md`, `docs/MINIAPP_API.md`
- `docs/MPTEXT_API_INTEGRATION.md`, `docs/MEITUAN_UNION_INTEGRATION.md`, `docs/WECOM_NOTIFICATION.md`
- `docs/CICD.md`, `docs/INCREMENTAL_POI_WORKFLOW.md`, `docs/HTTP_CLOUD_FUNCTION_DEBUG.md`

## Testing

**There are no unit tests anywhere** — no `*_test.go`, no JS test runner. `go test ./...` passes vacuously; use `go vet ./...` as the only Go static check. The real regression gates are:

- `python3 -I pipeline/folktale_to_lore.py --check` — bijection between upstream GeoJSON and hand-written kid copy, plus the 30-char sentence rule. Blocks the nightly batch when broken.
- `bake-basemap.mjs` producing a non-empty MP4.
- Visual/WebGL verification is manual by design — the sandbox can't run WebGL.

## Git Workflow

Commit format: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`. `Co-Authored-By: Claude <noreply@anthropic.com>` on all commits.

`.gitignore` carries load-bearing exceptions: `data/` is ignored as SQLite but `!web/public/data/` re-includes it, then re-ignores the generated `episode.json` / `episode-inline.js` / `poi.json` while keeping hand-written `lore.json` and the folktale JSON. `out/` (bake frames + audio) is fully ignored and rebuildable.

## Security Rules

- Never commit secrets/API keys — use `.env` files
- Never delete `manifest.json`, `pages.json`
- Never modify `src/uni_modules/`
- API keys from env vars or config center, never hardcoded