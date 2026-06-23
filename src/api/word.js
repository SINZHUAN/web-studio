import request from './request'
import { getCloudbaseApp } from '@/utils/cloudbase'

/**
 * 上传 Word 文件到云存储
 * 使用 @cloudbase/js-sdk 直接从浏览器上传到云存储，绕过 HTTP 触发器的 6MB 限制
 * @param {File} file - 浏览器 File 对象
 * @param {Function} onProgress - 上传进度回调 (0-100)
 */
export async function uploadWordFile(file, onProgress) {
  const app = await getCloudbaseApp()
  const cloudPath = `web_uploads/${Date.now()}_${file.name}`

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
    fileId: result.fileID,
    fileKey: cloudPath,
    fileName: file.name
  }
}

/**
 * 提取 Word 文档中的段落文本
 * 对应小程序：action: 'extractWordParagraphs'
 */
export function extractParagraphs(data) {
  return request.post('/word_processor_clo', { action: 'extractParagraphs', ...data })
}

/**
 * 将润色内容回填到 Word 文档
 * 对应小程序：action: 'replaceByParagraph'
 */
export function replaceByParagraph(data) {
  return request.post('/word_processor_clo', { action: 'replaceByParagraph', ...data })
}

/**
 * Word 文档生成预览图
 * 对应小程序：action: 'docPreview'
 */
export function docPreview(data) {
  return request.post('/word_processor_clo', { action: 'docToImage', ...data })
}

/**
 * 获取 Word 文档的下载链接
 * 对应小程序：wx.cloud.getTempFileURL
 */
export function getDownloadUrl(data) {
  return request.post('/word_processor_clo', { action: 'getDownloadUrl', ...data })
}

/**
 * 将 PDF 文件（已上传到云存储）转换为 Word (.docx) 文档
 * 云函数内部：pdf-parse 提取文字 → docx 生成 → 重新上传云存储
 * @param {{ fileId: string, fileName?: string }} data
 */
export function convertPdfToDocx(data) {
  // PDF 转换含 OCR，总耗时可能超过 2 分钟，单独设置 5 分钟超时
  return request.post('/word_processor_clo', { action: 'pdfToDocx', ...data }, { timeout: 300000 })
}

/**
 * 下载 Word 文件到浏览器（触发下载）
 * 使用直接导航而非 XHR/Axios，绕开 COS 跨域限制。
 * DOCX 文件浏览器无法渲染，会自动触发下载保存。
 * @param {string} url - 文件下载 URL（COS 预签名链接）
 * @param {string} filename - 保存的文件名（跨域时 download 属性被忽略，但 COS 返回原始文件名）
 */
export function downloadWordFile(url, filename = '简历.docx') {
  if (!url) return { success: false, error: '下载链接为空' }
  const a = document.createElement('a')
  a.href = url
  a.download = filename  // 同源时生效；跨域时浏览器回退到服务器文件名
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  return { success: true }
}
