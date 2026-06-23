/**
 * tools.js — 工具事务云函数前端 API 层
 *
 * 对应云函数：tools_web（HTTP路由：/tools_web）
 * 本文件独立，不影响现有 ai.js / word.js / recognition.js。
 */
import request from './request'
import { getCloudbaseApp } from '@/utils/cloudbase'

const BASE_ACTION = (action, data = {}) =>
  request.post('/tools_web', { action, ...data })

// ── 证件照配置 ────────────────────────────────────────────────────────────────

/** 获取支持的证件照尺寸和背景色配置（无需登录）*/
export function getPhotoSizes() {
  return BASE_ACTION('getPhotoSizes')
}

// ── 证件照生成 ────────────────────────────────────────────────────────────────

/**
 * 传统抠图生成证件照
 * @param {object} params
 *   fileKey         - COS 路径（前端上传后取得）
 *   photoSize       - 尺寸代码（one_inch 等）
 *   backgroundColor - 背景色代码（blue/red/white）
 */
export function generateIDPhoto(params) {
  return BASE_ACTION('generateIDPhoto', params)
}

/**
 * AI 大模型生成证件照（豆包）
 * @param {object} params
 *   fileID          - cloudbase fileID（cloud://...），用于换取 CDN temp URL 传给豆包
 *   fileKey         - COS 路径（fileID 缺失时的兜底）
 *   clothing        - 服装风格代码
 *   hairstyle       - 发型风格代码
 *   photoSize       - 尺寸代码
 *   backgroundColor - 背景色代码
 */
export function generateAIIDPhoto(params) {
  return BASE_ACTION('generateAIIDPhoto', params)
}

// ── 照片上传（COS 直传）─────────────────────────────────────────────────────

/**
 * 将用户选择的照片直传到 COS id_photos/originals/ 路径
 * @param {File}     file        - 用户选择的图片文件
 * @param {Function} onProgress  - 上传进度回调 (0-100)
 * @returns {{ success, fileID, fileKey }}
 */
/**
 * 将选中的简历成品打包为 ZIP 通过 SMTP 发送到指定邮箱
 * @param {object} params
 *   recipientEmail  - 收件人邮箱
 *   resumeName      - 简历姓名（用于文件名）
 *   selectedItems   - 选中项数组，每项格式：
 *     { type: 'word',     fileKey: '...' }
 *     { type: 'images',   urls: [...] }
 *     { type: 'pdf',      urls: [...] }   // 服务端以图片代替 PDF
 *     { type: 'analysis', text: '...' }
 *     { type: 'idphoto',  url: '...' }
 * @returns {{ success, messageId, attachedTypes }}
 */
export function sendBundleEmail(params) {
  return BASE_ACTION('sendBundleEmail', params)
}

// ── 工单系统 ──────────────────────────────────────────────────────────────────

/** 上传成功后创建工单 */
export function apiCreateWorkorder(params) {
  return BASE_ACTION('createWorkorder', params)
}

/** 同一工单内覆盖上传元数据（重新上传文件时） */
export function apiUpdateWorkorderUpload(params) {
  return BASE_ACTION('updateWorkorderUpload', params)
}

/** 前端自动调用：更新工单状态（polished / exported） */
export function apiUpdateWorkorderStatus(params) {
  return BASE_ACTION('updateWorkorderStatus', params)
}

/** 员工更新自己的工单备注 */
export function apiUpdateEmployeeNote(params) {
  return BASE_ACTION('updateEmployeeNote', params)
}

/** 员工申请删除工单 */
export function apiRequestDeleteWorkorder(params) {
  return BASE_ACTION('requestDeleteWorkorder', params)
}

/** 查询当前员工自己的工单列表 */
export function apiListMyWorkorders(params = {}) {
  return BASE_ACTION('listMyWorkorders', params)
}

/** 获取首页仪表盘统计（今日制作、今日导出、进行中） */
export function apiGetDashboard() {
  return BASE_ACTION('getDashboard', {})
}

/** 管理员查询所有工单（可按 userId / status 筛选） */
export function apiAdminListAllWorkorders(params = {}) {
  return BASE_ACTION('adminListAllWorkorders', params)
}

/** 管理员修改工单（状态 / 管理员备注 / 撤销删除申请） */
export function apiAdminUpdateWorkorder(params) {
  return BASE_ACTION('adminUpdateWorkorder', params)
}

/** 管理员永久删除工单 */
export function apiAdminDeleteWorkorder(params) {
  return BASE_ACTION('adminDeleteWorkorder', params)
}

// ── 安全审计日志 ──────────────────────────────────────────────────────────────

/** 上报安全事件（无需登录，尽力而为）*/
export function apiLogSecurityEvent(params) {
  return BASE_ACTION('logSecurityEvent', params)
}

/** 管理员查询安全日志 */
export function apiAdminListSecurityLogs(params = {}) {
  return BASE_ACTION('adminListSecurityLogs', params)
}

/** 管理员查询近1小时高危用户（截屏频繁） */
export function apiAdminGetHighRiskUsers() {
  return BASE_ACTION('adminGetHighRiskUsers', {})
}

export async function uploadIDPhoto(file, onProgress) {
  const ext = file.name.split('.').pop().toLowerCase() || 'jpg'
  // 使用 web_uploads/ 前缀，与简历优化上传路径同属已放行路径，避免 CORS 403
  const key = `web_uploads/id_photos/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  try {
    const app    = await getCloudbaseApp()   // 必须 await，完成匿名登录后才可用
    const result = await app.uploadFile({
      cloudPath: key,
      filePath:  file,                        // 参数名与 recognition.js 保持一致
      onUploadProgress: (e) => {
        if (onProgress && e.total > 0) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      },
    })

    return {
      success: true,
      fileID:  result.fileID,
      fileKey: key,
    }
  } catch (err) {
    return { success: false, error: err.message || '上传失败' }
  }
}
