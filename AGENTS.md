# AGENTS.md

Guidelines for AI coding agents working in the babyplace repository.

## Project Overview

- **Framework**: uni-app Vue3 CLI (cross-platform: H5, WeChat Mini Program)
- **Backend**: uniCloud (Aliyun) with HTTP-triggered cloud functions
- **Language**: JavaScript (not TypeScript)
- **Package Manager**: pnpm (preferred)

## Commands

```bash
pnpm install                    # Install dependencies
pnpm run dev:h5                 # H5 development server
pnpm run dev:mp-weixin          # WeChat Mini Program development
pnpm run build:h5               # H5 production build
pnpm run build:mp-weixin        # WeChat Mini Program production build
pnpm run deploy:cloud:functions # Upload cloud functions to Aliyun
pnpm run deploy:all             # Full deploy (functions + schema + web)
```

## Testing

No automated tests. Manual testing via `pnpm run dev:h5` or `pnpm run dev:mp-weixin`.

## Project Structure

```
src/pages/                      # Page components (registered in pages.json)
src/api/                        # API wrappers for backend calls
src/utils/                      # Utility functions
uniCloud-aliyun/cloudfunctions/ # Backend cloud functions
uniCloud-aliyun/database/       # Database schema (JSON Schema)
```

## Vue Components

- Use Vue3 Composition API with `<script setup>`
- Code order: imports → refs/reactive → computed → functions → lifecycle hooks
- Import from `vue`: `onMounted`, `ref`, `computed`, `reactive`, `nextTick`
- Import from `@dcloudio/uni-app`: `onLoad` (for route params)

```vue
<script setup>
import { onMounted, reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { listGoods } from '../../api/goods';

const loading = ref(false);
const items = ref([]);
const createEmptyForm = () => ({ name: '', address: '' });
const form = reactive(createEmptyForm());

async function refresh() {
  loading.value = true;
  try {
    const result = await listGoods({ keyword: '' });
    if (result.code !== 0) throw new Error(result.message);
    items.value = result.data.list || [];
  } catch (error) {
    uni.showToast({ title: error.message || 'Failed', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

onLoad((options) => { if (options?.code) handleCode(options.code); });
onMounted(() => refresh());
</script>
```

## Imports & Platform Conditionals

- `@/` alias for src: `import { foo } from '@/utils/auth'`
- Relative paths for siblings: `import { bar } from './api'`
- Platform conditionals: `// #ifdef H5` / `// #endif` and `// #ifndef H5`

```javascript
const isWeixinBrowser = computed(() => {
  // #ifdef H5
  return /MicroMessenger/i.test(window.navigator.userAgent || '');
  // #endif
  return false;
});
```

## API Layer

Wrap backend calls in `src/api/`. Use HTTP for cloud function calls:

```javascript
const HTTP_URL = 'https://byupload.aixifs.com/babyplace-admin';

function httpCall(data) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', HTTP_URL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 30000;
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch (e) { resolve({ code: -1, message: 'parse error' }); }
      } else { resolve({ code: xhr.status, message: 'HTTP error' }); }
    };
    xhr.onerror = function() { resolve({ code: -1, message: 'network error' }); };
    xhr.ontimeout = function() { resolve({ code: -1, message: 'timeout' }); };
    xhr.send(JSON.stringify(data));
  });
}

export async function listGoods(params = {}) {
  return httpCall({ action: 'list', ...params });
}
export async function createGoods(payload) {
  return httpCall({ action: 'create', payload });
}
```

For uniCloud objects: `uniCloud.importObject('uni-id-co', { customUI: true })`

## Cloud Functions

- Use CommonJS with `'use strict'` at top
- Response format: `{ code: 0, message: 'ok', data: {} }`
- Error codes: 0=success, 400=bad request, 401=unauthorized, 403=forbidden, 404=not found

```javascript
'use strict';
const db = uniCloud.database();
const collection = db.collection('babyplace');
const WRITE_ACTIONS = new Set(['create', 'update', 'remove']);
const PUBLIC_ACTIONS = new Set(['list', 'detail']);

function ok(data, message = 'ok') { return { code: 0, message, data }; }
function fail(code, message, data = null) { return { code, message, data }; }
function sanitizeString(value) { return typeof value === 'string' ? value.trim() : ''; }

exports.main = async (event, context) => {
  const action = sanitizeString(event.action);
  switch (action) {
    case 'list': return handleList(event, context);
    case 'create': return handleCreate(event, context);
    default: return fail(400, 'invalid action');
  }
};
```

## Error Handling

- Use try/catch for all async operations
- Check `result.code !== 0` after API calls
- Display messages: `uni.showToast({ title, icon: 'none' })` or `uni.showModal({ title, content, showCancel: false })`

## Naming Conventions

- **Variables/Functions**: camelCase (`isLoading`, `handleSubmit`)
- **Components**: PascalCase (`GoodsCard`)
- **Constants**: SCREAMING_SNAKE_CASE (`WRITE_ACTIONS`, `PUBLIC_ACTIONS`)
- **Event handlers**: `handle` prefix (`handleRemove`, `handleLogout`)
- **Boolean refs**: `is`/`has` prefix (`isLoggedIn`, `isLoading`)
- **Form factories**: `create` prefix (`createEmptyForm`)

## Styling

- Use `scoped` styles: `<style scoped>`
- Use rpx units (1rpx = 0.5px on 375px width)
- CSS Grid for forms, Flexbox for layouts

## Development Workflow

1. Create schema in `uniCloud-aliyun/database/`
2. Create cloud function in `uniCloud-aliyun/cloudfunctions/`
3. Create API wrapper in `src/api/`
4. Create page in `src/pages/`
5. Register page in `src/pages.json`
6. Test manually with dev server

## Page Registration

```json
{ "path": "pages/admin/index", "aliasPath": "/admin", "style": { "navigationBarTitleText": "Spot Management" } }
```

## Safety Rules

**MUST NOT:** Delete `manifest.json`/`pages.json`, modify `src/uni_modules/`, change cloud provider, commit secrets

**SHOULD:** Prefer minimal changes, follow existing patterns, run dev server to verify

## Git Commits

```
feat: add user profile page
fix: resolve login redirect issue
refactor: extract auth utilities
```

## Key Files

- `src/pages.json` - Page routing
- `src/manifest.json` - App config
- `src/App.vue` - App entry
- `src/utils/auth.js` - Auth utilities
- `src/api/goods.js` - API layer example
