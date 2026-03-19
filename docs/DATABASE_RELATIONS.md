# Database Relations

## Core Collections

- `babyplace-poi`
  - 景点主表。
  - 一条记录代表一个可展示地点。
  - 核心字段：
    - 基础识别：`name` `canonical_name` `alias`
    - 地理信息：`city` `district` `address` `location.lat` `location.lng`
    - 适合带娃信息：`age_range` `indoor` `recommended_duration`
    - 交通停车：`transport` `transport_hint` `parking_tip`
    - 设施：`facilities.stroller_friendly` `facilities.restroom` `facilities.food` `facilities.shade` `facilities.parking` `facilities.rainy_day_ok`
    - 内容展示：`summary` `recommend_reason` `notice` `cover_image` `gallery` `tags`
    - 聚合统计：`source_count` `review_count` `avg_rating`

- `babyplace-article`
  - 内容源文章表。
  - 保存公众号或其它来源文章的原始文本、发布时间、封面、URL、解析结果。

- `babyplace-content-source`
  - POI 与文章的关联表。
  - 作用是记录“哪个文章支持了哪个 POI 的哪些字段”。
  - 关键字段：
    - `poi_id` -> `babyplace-poi._id`
    - `article_id` -> `babyplace-article._id`
    - `support_fields`
    - `quoted_text`
    - `confidence_score`

- `babyplace-user-review`
  - 用户评价表。
  - `poi_id` -> `babyplace-poi._id`
  - 评价写入后，理论上会回流更新 `babyplace-poi.review_count` 与 `babyplace-poi.avg_rating`

## Current Import Strategy

- 当前“阿珍资料补坐标”脚本直接作用于 `babyplace-poi`
  - 目标是先把地点主表补齐坐标、地址、交通提示、停车提示。

- 后续如要做完整内容资产化，建议增加两步：
  - 把 `docs/真的叫阿珍/真的叫阿珍.json` 先入 `babyplace-article`
  - 再把文章与 POI 的对应关系写入 `babyplace-content-source`

## Why `babyplace-poi` Is The Target

- 前台列表、详情、路线规划、推荐位，当前都读取 `babyplace-poi`
- 路线规划直接依赖 `location.lat/lng`
- 停车和交通信息属于 POI 固有属性，应该沉淀到主表，而不是只留在文章正文里
