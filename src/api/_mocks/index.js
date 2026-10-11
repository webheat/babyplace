/**
 * Mock 数据统一导出
 * 所有 Mock/兜底数据集中在此目录，API 文件通过 import 引用
 */

export { default as mockUserApi } from './user';
export { buildFallbackRestaurants } from './restaurant';
export { TEST_VERIFICATION_CODE, getMockMsgCode } from './sms';
