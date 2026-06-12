// ============ 服务地址配置 ============

// babyplace 后端云函数
const BASE_URL = 'https://byupload.aixifs.com/babyplace-admin';

// Dify AI 知识库 & 客服Bot
const DIFY_API_URL = 'http://lanes.ymxt.top:3000';
const DIFY_CHAT_API = `${DIFY_API_URL}/v1/chat-messages`;
const DIFY_CHAT_KEY = 'app-sULIoSGR3LQlmejMhehcikKZ';
const DIFY_DATASET_ID = '58eed52d-9090-4657-ab6b-2db10af49af4';
const DIFY_APP_ID = 'f5d3b77d-177a-4565-a0a1-e8834082c860';
const DIFY_ADMIN_KEY = 'app-admin-Zx9Km2VpL8nQw3RtYuI5oP7aSdF4gH6j';
const DIFY_WORKSPACE_ID = '6dcf0717-8cdc-49b7-a437-e8efe88f175f';

// 高德地图
const AMAP_DRIVE_URL = 'https://restapi.amap.com/v3/direction/driving';

// 美团外卖
const MEITUAN_H5_URL = 'https://h5.waimai.meituan.com/waimai/mindex/home';

export default {
  // 后端
  baseUrl: BASE_URL,
  hostUrl: BASE_URL,

  // Go 后端（OpenClaw 桥接）
  openclawApi: 'https://oc.aixifs.com/api/openclaw/chat',

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

  // 美团
  meituanH5Url: MEITUAN_H5_URL,

  debug: true,
};
