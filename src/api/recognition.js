import request from './request'
import { getCloudbaseApp } from '@/utils/cloudbase'

// ========== 识别创建模式 API（独立新增，不影响其他功能）==========

/**
 * 模板清单驱动采集（非整份旧简历全量提取）
 * 对应云函数：ai_service_web, action: 'recognition_extract_all'
 * @param {{ textContent: string, userType: string, moduleSpecs: Array, templateId?: string }} data
 */
export function recognitionExtractAll(data) {
  return request.post('/ai_service_clo', { action: 'recognition_extract_all', ...data })
}

/**
 * 生成完整简历Word文档（使用识别模式专属模板）
 * 对应云函数：word_processor_web, action: 'generateResume'
 * @param {{ templateId: string, userData: object, userType: string }} data
 */
export function generateResume(data) {
  return request.post('/word_processor_clo', { action: 'generateResume', ...data })
}

/**
 * 获取识别模式专属模板预览图临时URL
 * 对应云函数：word_processor_web, action: 'getRecognitionTemplateUrls'
 * @param {{ userType: string }} data
 */
export function getRecognitionTemplateUrls(data) {
  return request.post('/word_processor_clo', { action: 'getRecognitionTemplateUrls', ...data })
}

/**
 * 上传Word文件到云存储（识别模式专用路径）
 * @param {File} file - 浏览器 File 对象
 * @param {Function} onProgress - 上传进度回调 (0-100)
 */
export async function uploadRecognitionFile(file, onProgress) {
  const app = await getCloudbaseApp()
  const cloudPath = `recognition_uploads/${Date.now()}_${file.name}`

  const result = await app.uploadFile({
    cloudPath,
    filePath: file,
    onUploadProgress: (e) => {
      if (onProgress && e.total > 0) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
  })

  return {
    success: true,
    fileID: result.fileID,
    cloudPath,
    fileName: file.name
  }
}

/**
 * 提取Word文档段落文本（复用简历优化功能）
 */
export function extractWordParagraphs(data) {
  return request.post('/word_processor_clo', { action: 'extractParagraphs', ...data })
}

/**
 * Word文档转预览图（复用简历优化功能）
 */
export function docToImage(data) {
  return request.post('/word_processor_clo', { action: 'docToImage', ...data })
}

/**
 * 获取文件临时下载URL
 */
export function getTempDownloadUrl(data) {
  return request.post('/word_processor_clo', { action: 'getTempDownloadUrl', ...data })
}
