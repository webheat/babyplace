const messages = {
  200: 'success',
  401: '未登录',
  404: '未找到数据',
  408: '验证码已过期',
  422: '验证码错误',
  500: '服务异常',
};

const ErrorCode = {
  SUCCESS: 200,
  ERROR_USER_NO_LOGIN: 401,
  ERROR_UNKNOWN_USER: 404,
  ERROR_CODE_EXPIRE: 408,
  ERROR_CODE_ERROR: 422,
  ERROR_ACCOUNT_ERROR: 422,
  getErrorMessage(code) {
    return { code, message: messages[code] || '请求失败' };
  },
};

export default ErrorCode;
