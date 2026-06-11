# babyplace 测试数据包

## 文件说明
- poi_seed.json: 1004 条遛娃地点（POI）测试数据
- article_seed.json: 300 条模拟公众号文章
- source_seed.json: 1326 条 POI 与文章来源关联记录
- review_seed.json: 100 条家长评价测试数据

## 数据特点
- 城市：广州、深圳
- 字段结构：按你当前 PRD 的 POI / Article / ContentSource / UserReview 设计
- 用途：前端列表、详情页、来源聚合、去重演示、推荐接口联调

## 建议导入顺序
1. poi_seed.json
2. article_seed.json
3. source_seed.json
4. review_seed.json

## 典型联调场景
- 首页推荐：随机取 source_count 高、update_time 近的 POI
- 附近遛娃：按 location 经纬度做距离排序
- 地点详情：根据 poi_id 聚合 sources + reviews
- 来源展示：按 article_id 拉取文章标题与来源号名称

## 注意
- 这是一份模拟数据包，地名、地址、文章内容为测试用途，不保证真实存在。
