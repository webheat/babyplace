/**
 * 存储 Key 常量
 * 统一管理 uni.getStorageSync / setStorageSync 的 Key
 */

export const STORAGE_KEYS = {
  /** 用户信息 */
  USER_INFO: 'mock-user-info',
  /** 登录 Token */
  TOKEN: 'token',
  /** uni-id token */
  UNI_ID_TOKEN: 'uni_id_token',
  /** uni-id token 过期时间 */
  UNI_ID_TOKEN_EXPIRED: 'uni_id_token_expired',
  /** uni-id refresh token */
  UNI_ID_REFRESH_TOKEN: 'uni_id_refresh_token',
  /** 登录时间 */
  UNI_ID_LOGIN_TIME: 'uni_id_login_time',
  /** 反馈列表 */
  FEEDBACK_LIST: 'babyplace-feedback-list',
  /** 短信验证码 */
  MSG_CODE: 'babyplace-msg-code',
  /** 搜索历史 */
  SEARCH_HISTORY: 'babyplace-search-history',
  /** 收藏地点 */
  FAVORITE_POIS: 'babyplace-favorite-pois',
} as const;
