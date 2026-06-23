/**
 * docProcessor.js — 文档处理云函数前端 API 层
 *
 * 对应云函数：doc_processor_web（HTTP路由：/doc_processor_web）
 * 职责：WPS WebOffice 在线编辑能力的前端接入
 */
import request from './request'

const BASE = (action, data = {}) =>
  request.post('/doc_processor_web', { action, ...data })

/**
 * 获取 WPS WebOffice 初始化配置（appId + fileId）
 * @param {object} params
 * @param {string} params.fileKey  - COS 文件路径，如 'documents/enhanced_xxx.docx'
 * @returns {{ success, appId, fileId, fileKey, token }}
 */
export function getWpsOpenConfig(params) {
  return BASE('get_wps_open_config', params)
}

/**
 * WPS 保存后重新生成预览图
 * @param {object} params
 * @param {string} params.fileKey  - COS 文件路径
 * @returns {{ success, previewImageUrl }}
 */
export function getEditedPreview(params) {
  return BASE('get_edited_preview', params)
}

/**
 * 从 COS 下载指定文件并以 base64 返回（解决浏览器跨域限制，用于打包导出）
 * @param {object} params
 * @param {string} params.fileKey  - COS 文件路径，如 'documents/enhanced_xxx.docx'
 * @returns {{ success, base64, mimeType, fileName }}
 */
export function getFileBase64(params) {
  return BASE('get_file_base64', params)
}

/**
 * 代理下载任意 URL 并以 base64 返回（解决浏览器跨域限制，用于打包导出预览图/证件照）
 * @param {object} params
 * @param {string} params.url  - 目标 URL（COS 签名链接等）
 * @returns {{ success, base64, mimeType }}
 */
export function getUrlBase64(params) {
  return BASE('get_url_base64', params)
}

/**
 * 将 COS 上已有的 Word 文件转换为 PDF，返回公共可访问的 HTTPS URL
 * @param {object} params
 * @param {string} params.wordFileKey - COS 文件路径，如 'documents/enhanced_xxx.docx'
 * @param {string} [params.orderId]   - 可选，用于生成 PDF 文件名
 * @returns {{ success, pdfUrl, pdfKey }}
 */
export function wordToPdf(params) {
  return BASE('word_to_pdf', params)
}
