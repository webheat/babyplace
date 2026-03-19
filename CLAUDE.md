# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**遛娃宝地 (Babyplace)** - A cross-platform app helping parents find kid-friendly places (POIs). Built with uni-app Vue3 targeting H5 web and WeChat Mini Program. Backend uses uniCloud (Aliyun) with HTTP-triggered cloud functions.

**Key Entity**: POI (Point of Interest) - locations suitable for children/families.

## Commands

```bash
pnpm install                    # Install dependencies
pnpm run dev:h5                 # H5 development server
pnpm run dev:mp-weixin          # WeChat Mini Program development
pnpm run build:h5               # H5 production build
pnpm run build:mp-weixin        # WeChat Mini Program production build

# Data ingestion
pnpm run ingest:azhen           # Import POI data from content source
pnpm run ingest:azhen:dry-run   # Dry run without actual import

# Deployment (requires HBuilderX CLI)
pnpm run deploy:cloud:functions # Upload cloud functions
pnpm run deploy:all             # Full deploy
```

No automated tests - manual testing via dev servers.

## Architecture

```
src/pages/          → Page components (Vue3 Composition API, <script setup>)
src/api/            → API wrappers calling cloud functions via HTTP
src/utils/          → Utility functions
uniCloud-aliyun/cloudfunctions/  → Backend (CommonJS, strict mode)
uniCloud-aliyun/database/        → JSON Schema definitions
scripts/            → Python data processing scripts
```

**API Pattern**: HTTP calls to `https://byupload.aixifs.com/babyplace-admin` with action-based routing.

**Cloud Function Response**: `{ code: 0, message: 'ok', data: {} }` - code 0 = success.

## Key Patterns

- **Vue Components**: Composition API with `<script setup>`. Import `onMounted/ref/reactive` from `vue`, `onLoad` from `@dcloudio/uni-app`.
- **Platform Conditionals**: `// #ifdef H5` / `// #endif` for platform-specific code.
- **Imports**: `@/` alias for src directory.
- **Error Handling**: Check `result.code !== 0` after API calls. Show messages via `uni.showToast({ title, icon: 'none' })`.
- **Naming**: camelCase (variables/functions), PascalCase (components), `handle` prefix for event handlers, `is`/`has` prefix for booleans.

## Development Workflow

1. Define schema in `uniCloud-aliyun/database/`
2. Implement cloud function in `uniCloud-aliyun/cloudfunctions/`
3. Create API wrapper in `src/api/`
4. Build page in `src/pages/`
5. Register page in `src/pages.json`
6. Test with dev server

## Important Rules

- Use uniCloud objects: `uniCloud.importObject('uni-id-co', { customUI: true })`
- Never delete `manifest.json` or `pages.json`
- Never modify `src/uni_modules/`
- Use pnpm as package manager
- Language is JavaScript (not TypeScript)
