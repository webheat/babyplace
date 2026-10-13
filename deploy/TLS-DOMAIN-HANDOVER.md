# TLS 域名交接说明

给在公网机器上执行的人看的。代码库在本机（`/opt/babyplace`，内网 192.168.20.173），
证书文件**不在本机**，需要在这两台公网机器上操作：

| 域名 | 公网 IP | 当前指向 |
|---|---|---|
| `byupload.aixifs.com` | 175.178.192.87 | babyplace Go 后端（服务正常） |
| `map.mengxa.com` | 175.178.33.107 | **New API 网关**（不是 babyplace） |

---

## 一、问题现象

两个域名的证书装反了：

| 域名 | 证书 CN | 证书 SAN | 有效期 |
|---|---|---|---|
| `byupload.aixifs.com` | `mengxa.com` | `*.mengxa.com`, `mengxa.com` | 2026-12-03 ✅ 未过期 |
| `map.mengxa.com` | `aixifs.com` | `*.aixifs.com`, `aixifs.com` | **2026-10-04 ❌ 已过期** |

两边各自拿到了对方的证书，且 SAN 都不覆盖自己的域名，所以 **HTTPS 握手一律失败**：

```
curl https://byupload.aixifs.com/babyplace-admin
→ curl: (60) SSL: certificate subject name 'mengxa.com' does not match
```

**但后端服务本身是好的**，跳过证书校验即可正常返回数据：

```
curl -k -X POST https://byupload.aixifs.com/babyplace-admin \
  -H 'Content-Type: text/plain;charset=UTF-8' \
  -d '{"action":"poi.list","page":1,"pageSize":2}'
→ 200 {"code":0,"message":"ok","data":{"list":[{"_id":"6a60604a...","name":"金山湖文化公园",...
```

**结论：问题纯在证书与 vhost 配置，不在代码、不在服务。**

---

## 二、方案 A（推荐）：续签 `byupload.aixifs.com` 的证书

**优点：后端代码一行不用改。** 前端 `src/config/config.js` 里的
`https://byupload.aixifs.com/babyplace-admin` 保持原样即可。

需要一张覆盖 `*.aixifs.com` + `aixifs.com` 的新证书。
本机找到的 `*.aixifs.com` 证书指纹（**已过期**）：

```
subject = CN = aixifs.com
SAN     = *.aixifs.com, aixifs.com
有效期  = 2026-07-06 → 2026-10-04  （已过期）
```

在 **175.178.192.87** 上按指纹定位旧证书：

```bash
find /etc/letsencrypt /etc/nginx /www/server/panel/vhost/cert /root/.acme.sh \
  -name 'fullchain.pem' 2>/dev/null | while read f; do
  echo "$(openssl x509 -noout -enddate -subject < "$f" | tr '\n' ' ')  $f"
done | grep -i 'aixifs'
```

续签（certbot 为例）：

```bash
sudo certbot renew --cert-name <上一步找到的名字> --force-renewal
sudo nginx -t && sudo systemctl reload nginx

# 验证：必须 status 200 且不报证书错
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST https://byupload.aixifs.com/babyplace-admin \
  -H 'Content-Type: text/plain;charset=UTF-8' \
  -d '{"action":"poi.list","page":1,"pageSize":1}'
```

> 若 `byupload.aixifs.com` 只是 CNAME/泛指，请确认 DNS 里指向的那台机器的
> nginx `server_name` 与证书 SAN 是否匹配。

---

## 三、方案 B：把 `*.mengxa.com` 证书搬到 `map.mengxa.com`

### 需要搬的那张证书（唯一有效的 mengxa 证书）

```
subject = CN = mengxa.com
issuer  = C = US, O = Let's Encrypt, CN = YE2
serial  = 0669533CB8DA41E27972ACC481FDC64325C4
SAN     = *.mengxa.com, mengxa.com
有效期  = 2026-09-04 15:03  →  2026-12-03 15:03
SHA256  = 2D:B8:56:23:37:6B:77:12:77:76:D4:76:3F:38:C7:30:EA:22:58:79:A1:12:
          EB:EC:F2:66:4E:F3:D9:CE:08:A0
```

**它当前正挂在 `byupload.aixifs.com`（175.178.192.87）上**，源文件在那台机器。

### 步骤

**1）在 175.178.192.87 上按指纹定位源文件**

```bash
find /etc/letsencrypt /etc/nginx /www/server/panel/vhost/cert /root/.acme.sh \
  -name 'fullchain.pem' 2>/dev/null | while read f; do
  echo "$(openssl x509 -noout -fingerprint -sha256 < "$f")  $f"
done | grep -i '2D:B8:56:23'
```

**2）确认私钥配对**（两个 md5 必须一致，否则换上去会握手失败）

```bash
openssl x509 -noout -modulus < fullchain.pem | openssl md5
openssl rsa  -noout -modulus < privkey.pem   | openssl md5
```

**3）拷到 175.178.33.107**，改 vhost：

```nginx
server {
    server_name map.mengxa.com;
    ssl_certificate     /证书路径/fullchain.pem;
    ssl_certificate_key /证书路径/privkey.pem;
    ...
}
```

```bash
nginx -t && systemctl reload nginx
```

### ⚠️ 搬完证书还不够

`map.mengxa.com` 现在反代到的是 **New API**，不是 babyplace。
换证书只让它不再报 TLS 错，请求照样打到 New API：

```
curl -k https://map.mengxa.com/babyplace-admin
→ 200，但返回 <title>New API</title> 的首页 HTML
```

**必须同时把 upstream 指向 babyplace 的 Go server**（即
`byupload.aixifs.com` 背后那个进程，源码在本机 `/opt/babyplace/server/`）。

---

## 四、两条路怎么选

| | 方案 A（续签 aixifs 证书） | 方案 B（搬 mengxa 证书） |
|---|---|---|
| 要改代码 | **不用** | 不用（但前提是改 upstream） |
| 要改 nginx | 续签 + reload | 换证书 **+ 改 upstream** |
| 要跨机器拷证书 | 否 | 是（192.87 → 33.107） |
| 风险 | 低 | 中：证书被搬走后 `byupload.aixifs.com` 会彻底没证书 |

**建议走 A。** B 的证书是"借"给 `map.mengxa.com` 的，搬走后
`byupload.aixifs.com` 反而彻底不可用；而且还得额外改反代指向。

---

## 五、验证清单

方案执行完，在任意客户端跑这几条，全部满足才算修好：

```bash
# 1. 两个域名证书校验都必须通过（不加 -k，不报 60）
curl -s -o /dev/null -w 'byupload: %{http_code}\n' \
  -X POST https://byupload.aixifs.com/babyplace-admin \
  -H 'Content-Type: text/plain;charset=UTF-8' -d '{"action":"poi.list","pageSize":1}'

# 2. 返回必须是业务 JSON，不是 HTML
curl -s -X POST https://byupload.aixifs.com/babyplace-admin \
  -H 'Content-Type: text/plain;charset=UTF-8' -d '{"action":"poi.list","pageSize":1}' \
  | head -c 120        # 期望 {"code":0,"message":"ok",...

# 3. SAN 必须覆盖自身域名
echo | openssl s_client -connect <域名>:443 -servername <域名> 2>/dev/null \
  | openssl x509 -noout -subject -enddate -ext subjectAltName
```

---

## 六、相关代码位置（仅方案 B 需要改）

前端默认后端地址：

- `src/config/config.js:4` — `import.meta.env.VITE_BASE_URL || 'https://byupload.aixifs.com/babyplace-admin'`
- `src/pages/admin/index.vue:351` — `https://byupload.aixifs.com/api/wx-login`

另有一处**独立的既有 bug**，与证书无关，本次 H5 联调时发现：
`src/api/admin.js` 与 `src/api/goods.js` 共 8 处使用**相对路径**
`postText('/babyplace-admin', ...)`，H5 端会解析到当前 origin（localhost）
导致 404；`vite.config.js` 里也没有 `server.proxy`。
小程序端不受影响。修法见仓库 CLAUDE.md「Commands」一节。