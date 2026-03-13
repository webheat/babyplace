# Cloud Database Schema

---

## goods_items

Purpose

Store product records for babyplace. Public users can read on-sale products. Admin users can create, update, and remove products through the `goods-admin` cloud function.

Fields

- `_id`: document id
- `name`: product name, required, 2-50 characters
- `cover`: cover image url
- `price`: sale price, required, number >= 0
- `originalPrice`: original price, number >= 0
- `stock`: stock quantity, required, integer >= 0
- `status`: `draft | on_sale | off_sale`, required
- `category`: category name
- `summary`: short summary
- `content`: detailed description
- `sort`: sort weight, required, integer, default 0
- `createdBy`: creator uid
- `updatedBy`: updater uid
- `createdAt`: created timestamp
- `updatedAt`: updated timestamp

Cloud Function

- `goods-admin`
- actions: `create`, `list`, `detail`, `update`, `remove`

Example

```json
{
  "name": "婴儿湿巾",
  "cover": "https://example.com/goods/wipes.png",
  "price": 29.9,
  "originalPrice": 39.9,
  "stock": 120,
  "status": "on_sale",
  "category": "日用品",
  "summary": "新生儿可用，温和无香型。",
  "content": "80 抽，便携装，适合外出使用。",
  "sort": 100,
  "createdBy": "uid_admin_001",
  "updatedBy": "uid_admin_001",
  "createdAt": 1710000000000,
  "updatedAt": 1710000000000
}
```
