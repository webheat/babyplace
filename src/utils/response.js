/**
 * 统一响应构造器
 * 所有 API 文件统一使用本模块构造成功响应，消除重复的 ok() 定义
 */

/**
 * 构造成功响应
 * @param {any} data - 响应数据
 * @param {string} message - 响应消息
 * @returns {{ code: number, message: string, data: any }}
 */
export function ok(data = {}, message = 'ok') {
  return { code: 0, message, data };
}

/**
 * 构造分页响应
 * @param {any[]} list - 列表数据
 * @param {number} total - 总记录数
 * @param {number} page - 当前页码
 * @param {number} pageSize - 每页大小
 * @returns {{ code: number, message: string, data: { list: any[], total: number, page: number, pageSize: number } }}
 */
export function okPage(list = [], total = 0, page = 1, pageSize = 20) {
  return ok({ list, total, page, pageSize });
}
