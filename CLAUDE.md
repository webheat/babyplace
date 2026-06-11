# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**遛娃宝地 (Babyplace)** - A cross-platform app helping parents find kid-friendly places (POIs). Built with uni-app Vue3 targeting H5 web and WeChat Mini Program. Backend uses uniCloud (Aliyun) with HTTP-triggered cloud functions.

**Key Entity**: POI (Point of Interest) - locations suitable for children/families.

## Commands

```bash
pnpm install                    # Install dependencies
pnpm run dev:h5                 # H5 development server (http://localhost:5173)
pnpm run dev:mp-weixin          # WeChat Mini Program development
pnpm run build:h5               # H5 production build
pnpm run build:mp-weixin        # WeChat Mini Program production build

# Data ingestion (Python scripts)
pnpm run ingest:azhen           # Import POI from 真的叫阿珍 data source
pnpm run ingest:azhen:dry-run   # Dry run without actual import
pnpm run ingest:azhen:reset     # Clear POIs before import
pnpm run ingest:basename        # Import POIs from basename.csv
pnpm run ingest:basename:dry-run # Basename dry run
pnpm run notify:wecom           # Send WeChat Work notification

# Deployment (requires HBuilderX CLI at C:\HBuilderX\cli.exe)
pnpm run deploy:cloud:functions # Upload all cloud functions
pnpm run deploy:cloud:babyplace-db # Upload database schema
pnpm run deploy:web             # Deploy to web hosting
pnpm run deploy:all             # Full deploy (functions + schema + web)
pnpm run upload:mp-weixin:auto  # Auto-upload WeChat Mini Program
```

No automated tests - manual testing via dev servers.

## Architecture

```
src/
  ├── pages/          → Page components (Vue3 Composition API, <script setup>)
  ├── api/            → API wrappers calling cloud functions via HTTP
  ├── utils/          → Utility functions (auth.js, poi.js, customer-service.js)
  ├── components/     → Shared Vue components
  ├── config/         → App config (config.js, customer-service.js)
  ├── data/           → Static data snapshots (poi-snapshot.json for offline fallback)
  ├── static/         → Static assets
  ├── uview-ui/       → UI component library
  ├── manifest.json   → App configuration (CRITICAL: never delete)
  └── pages.json      → Page routing & config (CRITICAL: never delete)

uniCloud-aliyun/
  ├── cloudfunctions/ → Backend (CommonJS, strict mode)
  │   ├── babyplace-admin/    → Main HTTP entry (index.js, action-based routing)
  │   ├── babyplace-seed-v2/  → Data import functions
  │   ├── poi/                → POI operations (index.obj.js, uniCloud Object)
  │   ├── recommend/          → Recommendation engine (index.obj.js)
  │   ├── restaurant/         → Restaurant data (index.obj.js)
  │   ├── article/            → Article management
  │   ├── review/             → User reviews
  │   ├── route/              → Route planning - AMap (index.obj.js)
  │   └── common/             → Shared utilities (uni-config-center)
  └── database/       → JSON Schema definitions (.schema.json)

scripts/            → Python data processing
  ├── enrich_azhen_poi.py     → Import POIs from 真的叫阿珍
  ├── import_basename_poi.py  → Import POIs from basename.csv
  └── send_wecom_notice.py    → WeChat Work notifications

docs/               → Technical documentation
  ├── AI_DEV_SPEC.md          → AI development rules
  ├── POI_ENGINE_SPEC.md      → POI recommendation engine
  ├── CLOUD_SCHEMA.md         → Database schema reference
  ├── CONTENT_PARSER_SPEC.md  → Article content parsing spec
  ├── MEITUAN_UNION_INTEGRATION.md → Meituan affiliate integration
  ├── DATABASE_RELATIONS.md   → Database relationship diagrams
  └── 客服功能配置指南.md      → Customer service setup guide
```

**API Pattern**: HTTP calls to `https://byupload.aixifs.com/babyplace-admin` with action-based routing.

**Cloud Function Response**: `{ code: 0, message: 'ok', data: {} }` - code 0 = success.

**babyplace-admin Actions**: Centralized HTTP cloud function that routes to different handlers based on `action` parameter:
- POI: `poi.list`, `poi.detail`, `poi.create`, `poi.update`, `poi.remove`, `poi.nearby`
- Article: `article.list`, `article.detail`, `article.create`, `article.update`, `article.remove`
- Source: `source.list`, `source.detail`, `source.create`, `source.update`, `source.remove`
- Review: `review.list`, `review.detail`, `review.create`, `review.update`, `review.remove`, `review.listByPoi`
- Seed: `seed.insertBatch`, `seed.upsertPoiBatch`, `seed.clearCollections`, `seed.listPoiByNames`
- Recommend: `recommend.home`
- Route: `route.drive`

**Cloud Function Patterns**: Two distinct patterns coexist:
- **HTTP entry** (`index.js`): `babyplace-admin` — exports `main(event, context)`, parses HTTP body, dispatches by `action`
- **uniCloud Object** (`index.obj.js`): `poi`, `recommend`, `route`, `restaurant` — exports named functions callable via `uniCloud.importObject('poi')`

**API Fallback Chain**: `src/api/poi.js` and `src/api/recommend.js` use a 3-tier fallback:
1. `uniCloud.importObject()` → direct uniCloud Object call
2. `callAdminAction()` → HTTP call to `babyplace-admin`
3. Static snapshot from `src/data/poi-snapshot.json` → offline fallback

**External Service Config**: AMap keys and other external service credentials are stored in `uniCloud-aliyun/cloudfunctions/common/uni-config-center/` (plugin-based config, not hardcoded).

## Key Patterns

### Frontend (Vue3)
- **Composition API**: Use `<script setup>` syntax
- **Imports**: `onMounted/ref/reactive` from `vue`, `onLoad/onPullDownRefresh` from `@dcloudio/uni-app`
- **Platform Conditionals**: `// #ifdef H5` / `// #endif` for platform-specific code (H5, MP-WEIXIN)
- **Path Alias**: `@/` resolves to `src/` directory
- **Error Handling**: Check `result.code !== 0` after API calls, show messages via `uni.showToast({ title, icon: 'none' })`
- **Naming Conventions**:
  - camelCase: variables, functions
  - PascalCase: components
  - `handle` prefix: event handlers (`handleClick`)
  - `is`/`has` prefix: booleans (`isLoading`, `hasError`)

### Backend (Cloud Functions)
- **Module System**: CommonJS (`require`, `module.exports`)
- **Strict Mode**: `'use strict';` at top of all cloud functions
- **Database**: `const db = uniCloud.database()`, collections named `babyplace-*`
- **Response Pattern**: Return `{ code, message, data }` - use helper functions `ok(data)` and `fail(code, message)`
- **HTTP Entry**: `babyplace-admin` is the main HTTP-triggered function for frontend API calls
- **uniCloud Object**: Functions using `index.obj.js` are callable via `uniCloud.importObject('name')` — preferred for new features
- **External Config**: Use `uni-config-center` for API keys (AMap, etc.), never hardcode secrets

### API Calls (Frontend → Backend)
```javascript
import { callAdminAction } from '@/api/admin';

const result = await callAdminAction('poi.list', {
  page: 1,
  pageSize: 20,
  keyword: 'park'
});
if (result.code === 0) {
  // Success: result.data contains response
} else {
  // Error: result.message contains error message
}
```

### Database Schema
- All schemas defined in `uniCloud-aliyun/database/*.schema.json`
- Key collections:
  - `babyplace-poi`: POI locations (name, canonical_name, alias, city, district, address, location{lat,lng}, category, age_range, indoor, price_type, facilities{stroller_friendly,restroom,food,shade,parking,rainy_day_ok}, avg_rating, review_count, status)
  - `babyplace-article`: Articles/content (title, source_account, url, content_text, content_html, images, parse_result, parse_confidence)
  - `babyplace-content-source`: Links articles to POIs (poi_id, article_id, quoted_text, confidence_score)
  - `babyplace-user-review`: User reviews (poi_id, nickname, rating, comment, tags, images)
  - `babyplace-restaurant`: Restaurant data
  - `babyplace-feedback`: User feedback submissions
  - `babyplace-error-log`: Error logging
  - `babyplace-event-log`: Event tracking (联盟埋点)

## Development Workflow

### Adding New Features
1. **Define schema** in `uniCloud-aliyun/database/` (if new data model needed)
2. **Implement cloud function** in `uniCloud-aliyun/cloudfunctions/` or add action to `babyplace-admin`
3. **Create API wrapper** in `src/api/` using `callAdminAction()` pattern
4. **Build UI** in `src/pages/` using Vue3 Composition API
5. **Register page** in `src/pages.json` with route and navigation config
6. **Test** with `pnpm run dev:h5` or `pnpm run dev:mp-weixin`

### Adding New Pages
In `src/pages.json`:
```json
{
  "path": "pages/poi/list",
  "aliasPath": "/poi/list",  // Optional: for H5 friendly URLs
  "style": {
    "navigationBarTitleText": "地点列表",
    "enablePullDownRefresh": true,
    "enableShareAppMessage": true  // Enable WeChat sharing
  }
}
```

### Data Import Workflow
Python scripts in `scripts/` handle POI data ingestion:
1. Fetch data from external sources (JSON, CSV)
2. Enrich with AMap geocoding API
3. Call `babyplace-seed-v2` cloud function to upsert data
4. Secret: `babyplace2026` for seed operations

### Customer Service (微信客服)
- **Config**: `src/config/customer-service.js` — fill in `corpId` and `extInfo` from 企业微信管理后台
- **Utility**: `src/utils/customer-service.js` — `openEnterpriseChat()` calls `uni.openCustomerServiceChat`
- **FAB Component**: `src/components/customer-service-fab.vue` — floating button with `<button open-type="contact">` fallback
- **Integration**: FAB added to index, poi/list, mine, shop pages; menu entry in mine page
- **Platform**: Only compiles in `MP-WEIXIN`, invisible on H5
- **Dual mode**: 企业微信客服 (primary, requires corpId+extInfo) → 普通微信客服 (fallback via open-type="contact")

## Important Rules

- Use uniCloud objects: `uniCloud.importObject('uni-id-co', { customUI: true })`
- Never delete `manifest.json` or `pages.json`
- Never modify `src/uni_modules/` (currently empty, reserved for uni-app plugins)
- Use pnpm as package manager
- Language is JavaScript (not TypeScript)
- POI is the primary entity — always use cloud objects for POI operations

### Git Commit Format
```
feat: add new feature
fix: resolve bug
refactor: restructure code
docs: update documentation
```

## Design System

See `DESIGN.md` for the complete design specification. Key points:

- **Colors**: Primary `#2563eb`, semantic colors for success/warning/error
- **Typography**: rpx units (20-46rpx), system font stack
- **Spacing**: 4px/8rpx base unit system
- **Components**: Cards (20rpx radius), buttons (999rpx pill), tags, sections
- **Styling**: Use `<style scoped>`, rpx units, CSS Grid for forms, Flexbox for layouts
- **SCSS**: Theme variables loaded via `vite.config.js` from `src/uview-ui/theme.scss`

## gstack

Use /browse from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Available skills:
- `/office-hours` - YC Office Hours, reframe product thinking
- `/plan-ceo-review` - CEO/Founder perspective review
- `/plan-eng-review` - Engineering Manager architecture review
- `/plan-design-review` - Senior Designer design review
- `/design-consultation` - Design Partner consultation
- `/review` - Staff Engineer code review
- `/ship` - Release Engineer, deploy and create PR
- `/browse` - QA Engineer with real browser
- `/qa` - QA Lead, test and fix bugs
- `/qa-only` - QA Reporter, report bugs only
- `/design-review` - Designer Who Codes audit
- `/setup-browser-cookies` - Session Manager for authenticated pages
- `/retro` - Engineering Manager weekly retro
- `/investigate` - Debugger, root-cause analysis
- `/document-release` - Technical Writer, update docs
- `/codex` - Second Opinion from OpenAI Codex
- `/careful` - Safety Guardrails for destructive commands
- `/freeze` - Edit Lock to one directory
- `/guard` - Full Safety mode (careful + freeze)
- `/unfreeze` - Remove edit restrictions
- `/gstack-upgrade` - Self-updater

If gstack skills aren't working, run `cd .claude/skills/gstack && ./setup` to rebuild.
