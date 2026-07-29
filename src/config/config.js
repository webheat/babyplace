// ============ 服务地址配置 ============

// 从环境变量读取，不再硬编码
const BASE_URL = import.meta.env.VITE_BASE_URL || 'https://byupload.aixifs.com/babyplace-admin';
const GO_SERVER = import.meta.env.VITE_GO_SERVER || 'https://oc.aixifs.com';
const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL || `${BASE_URL}/api/chat`;

// Dify AI
const DIFY_API_URL = import.meta.env.VITE_DIFY_API_URL || 'http://lanes.ymxt.top:3000';
const DIFY_CHAT_API = `${DIFY_API_URL}/v1/chat-messages`;
const DIFY_CHAT_KEY = import.meta.env.VITE_DIFY_CHAT_KEY || '';
const DIFY_DATASET_ID = import.meta.env.VITE_DIFY_DATASET_ID || '';
const DIFY_APP_ID = import.meta.env.VITE_DIFY_APP_ID || '';
const DIFY_ADMIN_KEY = import.meta.env.VITE_DIFY_ADMIN_KEY || '';
const DIFY_WORKSPACE_ID = import.meta.env.VITE_DIFY_WORKSPACE_ID || '';

// 高德地图
const AMAP_DRIVE_URL = import.meta.env.VITE_AMAP_DRIVE_URL || 'https://restapi.amap.com/v3/direction/driving';
const AMAP_WEB_KEY = import.meta.env.VITE_AMAP_WEB_KEY || '';

// 微信 AppID
const WECHAT_APPID_H5 = import.meta.env.VITE_WECHAT_APPID_H5 || '';
const WECHAT_APPID_WEB = import.meta.env.VITE_WECHAT_APPID_WEB || '';

// 企业微信
const WECOM_CORP_ID = import.meta.env.VITE_WECOM_CORP_ID || '';
const WECOM_EXT_INFO = import.meta.env.VITE_WECOM_EXT_INFO || '';

// 美团
const MEITUAN_APP_ID = import.meta.env.VITE_MEITUAN_APP_ID || '';
const MEITUAN_H5_URL = import.meta.env.VITE_MEITUAN_H5_URL || 'https://h5.waimai.meituan.com/waimai/mindex/home';

export default {
  // 后端
  baseUrl: BASE_URL,
  hostUrl: BASE_URL,
  goServer: GO_SERVER,
  chatApiUrl: CHAT_API_URL,

  // Dify AI
  difyApiUrl: DIFY_API_URL,
  difyChatApi: DIFY_CHAT_API,
  difyChatKey: DIFY_CHAT_KEY,
  difyDatasetId: DIFY_DATASET_ID,
  difyAppId: DIFY_APP_ID,
  difyAdminKey: DIFY_ADMIN_KEY,
  difyWorkspaceId: DIFY_WORKSPACE_ID,

  // 高德地图
  amapDriveUrl: AMAP_DRIVE_URL,
  amapWebKey: AMAP_WEB_KEY,

  // 微信
  wechatAppId: {
    h5: WECHAT_APPID_H5,
    web: WECHAT_APPID_WEB,
  },

  // 企业微信
  wecomCorpId: WECOM_CORP_ID,
  wecomExtInfo: WECOM_EXT_INFO,

  // 美团
  meituanAppId: MEITUAN_APP_ID,
  meituanH5Url: MEITUAN_H5_URL,

  // 微信 H5 登录重定向
  wechatRedirectOrigin: 'https://ds.aixifs.com',
  loginSessionDurationMs: 24 * 60 * 60 * 1000,

  debug: true,
};
