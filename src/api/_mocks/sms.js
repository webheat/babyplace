/**
 * Mock 验证码（开发/调试模式）
 * 生产环境应通过后端短信服务发送真实验证码
 */

export const TEST_VERIFICATION_CODE = '123456';
export const MSG_CODE_STORAGE_KEY = 'babyplace-msg-code';
export const MSG_CODE_SCENE = 'reset-pwd-by-sms';

export function getMockMsgCode(phone = '') {
  return {
    phone,
    code: TEST_VERIFICATION_CODE,
    scene: MSG_CODE_SCENE,
  };
}
