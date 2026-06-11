# CI/CD Pipeline

Pipeline Steps

1. Pull source from GitCode
2. Install dependencies
3. Build project
4. Deploy uniCloud
5. Publish build

Commands

```powershell
pnpm install
.\node_modules\.bin\uni.CMD build
.\node_modules\.bin\uni.CMD build -p mp-weixin
```

Mini Program Upload

The current auto upload script is:

```powershell
pnpm run upload:mp-weixin:auto
```

Its default execution order is now:

1. `pnpm run deploy:cloud:functions`
2. `pnpm run build:mp-weixin`
3. Upload the built package with WeChat DevTools CLI

Why this matters:

- This project depends on uniCloud cloud functions/cloud objects in real mini program environments.
- Uploading only the frontend package can leave the online demo/experience version calling old cloud code.
- A real issue was reproduced on 2026-03-19: the mini program package was updated, but the online demo still showed `network error` until cloud functions were redeployed manually.

If you intentionally want to upload only the frontend package and skip cloud function deployment, use:

```powershell
$env:SKIP_CLOUD_DEPLOY="1"
pnpm run upload:mp-weixin:auto
```

HBuilderX CLI

Verified local path:

```powershell
C:\HBuilderX\cli.exe
```

Verified commands for this project:

```powershell
# Upload local cloud functions and common modules to the bound aliyun space
C:\HBuilderX\cli.exe cloud functions --upload all --prj babyplace --provider aliyun

# Upload the current babyplace POI schema
C:\HBuilderX\cli.exe cloud functions --upload db --prj babyplace --provider aliyun --name babyplace-poi.schema.json

# Publish H5 and upload it to aliyun web hosting
C:\HBuilderX\cli.exe publish web --project C:\Users\Admin\babyplace --webTitle babyplace --webHosting true --provider aliyun --spaceId mp-55536281-ad8f-4f58-b590-ad515baf863a

# One-command deploy
npm run deploy:all
```

Current cloud status

- The current aliyun target space is `pay5` (`mp-55536281-ad8f-4f58-b590-ad515baf863a`).
- H5 publish + hosting upload has been verified successfully.
- Cloud functions/common upload has been verified successfully.
- The mini program upload flow must be treated as `cloud deploy + package upload`, not package upload alone.

Notes

- H5 hosting requires the uniCloud web security domain to be configured in the service space, otherwise cross-origin access will fail.
- If the online demo/experience version shows updated UI but request failures, redeploy cloud functions first before suspecting frontend packaging.
- HBuilderX CLI may report local Node `18.20.0` vs cloud Node `16.15.1`; keep cloud function code compatible with Node 16 unless you upgrade the cloud runtime.
