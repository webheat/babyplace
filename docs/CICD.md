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

HBuilderX CLI

Verified local path:

```powershell
C:\HBuilderX\cli.exe
```

Verified commands for this project:

```powershell
# Upload local cloud functions and common modules to the bound aliyun space
C:\HBuilderX\cli.exe cloud functions --upload allcloudfunctions --prj babyplace --provider aliyun

# Upload the custom goods schema
C:\HBuilderX\cli.exe cloud functions --upload db --prj babyplace --provider aliyun --name goods_items.schema.json

# Publish H5 and upload it to aliyun web hosting
C:\HBuilderX\cli.exe publish web --project C:\Users\Admin\babyplace --webTitle babyplace --webHosting true --provider aliyun --spaceId mp-55536281-ad8f-4f58-b590-ad515baf863a

# One-command deploy
npm run deploy:all
```

Current cloud status

- The current aliyun target space is `pay5` (`mp-55536281-ad8f-4f58-b590-ad515baf863a`).
- H5 publish + hosting upload has been verified successfully.
- Cloud functions/common upload has been verified successfully.
- `goods_items.schema.json` is now in the standard path [goods_items.schema.json](/Users/Admin/babyplace/uniCloud-aliyun/database/goods_items.schema.json).
- `goods_items` has been created successfully in the new space.

Notes

- H5 hosting requires the uniCloud web security domain to be configured in the service space, otherwise cross-origin access will fail.
- `goods-admin` has been uploaded successfully, but HBuilderX CLI reported local Node `18.20.0` vs cloud Node `16.15.1`; keep cloud function code compatible with Node 16 unless you upgrade the cloud runtime.
