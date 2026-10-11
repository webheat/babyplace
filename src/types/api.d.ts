/**
 * 全局类型定义
 * 集中管理项目中使用的 TypeScript 类型（JSDoc 兼容）
 */

/**
 * 统一 API 响应结构
 * @template T
 */
// @typedef {Object} ApiResponse
// @property {number} code - 业务码，0 表示成功
// @property {string} message - 响应消息
// @property {T} data - 响应数据

/**
 * POI 地点
 * @typedef {Object} PoiItem
 * @property {string} _id - 唯一标识
 * @property {string} name - 地点名称
 * @property {string} canonical_name - 标准名称
 * @property {string} address - 地址
 * @property {string} city - 城市
 * @property {string} district - 区县
 * @property {string} category - 分类
 * @property {string} summary - 摘要
 * @property {string} cover_image - 封面图 URL
 * @property {Object} location - 坐标 { lat, lng }
 * @property {number} distance - 距离（米）
 * @property {number} avg_rating - 平均评分
 * @property {string} recommended_duration - 建议游玩时长
 * @property {string} recommend_reason - 推荐理由
 * @property {string[]} tags - 标签
 * @property {string} booking_url - 预约链接
 * @property {string} reservation - 预约信息
 */

/**
 * 用户信息
 * @typedef {Object} UserInfo
 * @property {string} user_id
 * @property {string} nickname
 * @property {string} avatar
 * @property {string} phone
 * @property {number} gender
 * @property {string} birthday
 * @property {string} city
 * @property {string} description
 */

/**
 * 评价
 * @typedef {Object} Review
 * @property {string} _id
 * @property {string} poi_id
 * @property {string} user_id
 * @property {string} content
 * @property {number} rating
 * @property {string} created_at
 */

/**
 * 文章
 * @typedef {Object} Article
 * @property {string} id
 * @property {string} title
 * @property {string} sub_title
 * @property {string} cat_name
 * @property {string} image
 * @property {number} publish_at
 * @property {string} content
 * @property {string} url
 */
