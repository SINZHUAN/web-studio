/**
 * commission.js — 代做工单云函数前端 API 层
 *
 * 对应云函数：commission_web（HTTP路由：/commission_web）
 * 本文件独立，不影响任何现有代码和功能。
 */
import request from './request'

const BASE = (action, data = {}) =>
  request.post('/commission_web', { action, ...data })

// ── 员工端 ──────────────────────────────────────────────────────────────────

/** 列出代做工单（可按 status 筛选） */
export function apiListCommissionOrders(params = {}) {
  return BASE('staff_list_orders', params)
}

/** 接取工单 */
export function apiClaimOrder(params) {
  return BASE('staff_claim_order', params)
}

/** 标记工单完成 */
export function apiCompleteCommissionOrder(params) {
  return BASE('staff_complete_order', params)
}

/** 保存制作进度快照（工单仍保持 claimed 状态，可继续制作） */
export function apiSaveCommissionProgress(params) {
  return BASE('staff_save_progress', params)
}

/** 将润色预览图 + 分析摘要回传至小程序客户端 */
export function apiSendCommissionPreview(params) {
  return BASE('staff_send_preview', params)
}

/** 将简历 AI 分析报告（analysisResult）回传至小程序客户端 */
export function apiSendCommissionAnalysis(params) {
  return BASE('staff_send_analysis', params)
}

/** 将打包导出成品信息回传至小程序客户端（在订单详情页展示成品下载区） */
export function apiSendCommissionResult(params) {
  return BASE('staff_send_result', params)
}

/** 获取客户上传文件的临时下载链接（7天有效期，通过微信云开发 API 生成，仅用于浏览器直接下载） */
export function apiGetCommissionFileUrl(params) {
  return BASE('staff_get_file_url', params)
}

/**
 * 服务端中转：云函数从 jk3 下载客户文件并转存到制作环境（web-02），
 * 返回 fileId / fileKey，可直接用于 word_processor_web 处理。
 * 绕过浏览器 CORS 限制。
 */
export function apiBridgeCommissionFile(params) {
  return BASE('staff_bridge_file', params)
}

// ── 管理员端 ─────────────────────────────────────────────────────────────────

/** 手动将工单分配给指定员工 */
export function apiAdminAssignOrder(params) {
  return BASE('admin_assign_order', params)
}

/** 读取工单分配设置 */
export function apiAdminGetCommissionSettings() {
  return BASE('admin_get_settings', {})
}

/** 更新工单分配设置 */
export function apiAdminUpdateCommissionSettings(params) {
  return BASE('admin_update_settings', params)
}

/** 各员工今日接单统计 */
export function apiAdminGetDailyStats() {
  return BASE('admin_get_daily_stats', {})
}
