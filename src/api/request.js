/**
 * 统一请求封装
 * 所有 API 请求应通过本模块发起，禁止在各 API 文件中自行封装 uni.request
 */

import config from '@/config/config';

/** 显示错误提示 */
export function showErrorToast(message) {
  if (message) {
    uni.showToast({ title: message, icon: 'none' });
  }
}

/**
 * 统一请求方法
 */
export function request(options) {
  const {
    url,
    method = 'GET',
    data,
    header = {},
    timeout = 30000,
    contentType = 'application/json',
    parseResponse = true,
  } = options;

  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method,
      data,
      header: { 'Content-Type': contentType, ...header },
      timeout,
      success: ({ statusCode, data: responseData }) => {
        if (statusCode >= 200 && statusCode < 300) {
          if (responseData && typeof responseData === 'object') {
            resolve(responseData);
            return;
          }
          if (parseResponse && typeof responseData === 'string') {
            try {
              resolve(JSON.parse(responseData));
            } catch {
              reject(new Error('响应解析失败'));
            }
            return;
          }
          resolve(responseData);
          return;
        }
        const msg = responseData?.message || `HTTP ${statusCode}`;
        showErrorToast(msg);
        reject(new Error(msg));
      },
      fail: (error) => {
        const isTimeout = String(error?.errMsg || '').toLowerCase().includes('timeout');
        const msg = isTimeout ? '请求超时，请重试' : '网络异常，请检查连接';
        showErrorToast(msg);
        reject(new Error(msg));
      },
    });
  });
}

/** GET 请求 */
export function get(url, data, options) {
  return request({ ...options, url, method: 'GET', data });
}

/** POST 请求（JSON body） */
export function post(url, data, options) {
  return request({ ...options, url, method: 'POST', data });
}

/** POST 请求（text/plain body，兼容 babyplace-admin 端点） */
export function postText(url, data, options) {
  return request({
    ...options,
    url,
    method: 'POST',
    data: JSON.stringify(data || {}),
    contentType: 'text/plain;charset=UTF-8',
  });
}

/** PUT 请求 */
export function put(url, data, options) {
  return request({ ...options, url, method: 'PUT', data });
}

/** DELETE 请求 */
export function del(url, data, options) {
  return request({ ...options, url, method: 'DELETE', data });
}
