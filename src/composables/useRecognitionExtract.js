/**
 * useRecognitionExtract
 *
 * 识别创建模式 — 内容提取流水线：
 *   Word上传 → 段落提取 → 拼接原文 → AI识别（模板驱动）→ 写入 recognition store
 *
 * 本文件为独立新增，不影响任何现有功能。
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRecognitionStore } from '@/stores/recognition'
import {
  uploadRecognitionFile,
  extractWordParagraphs,
  recognitionExtractAll
} from '@/api/recognition'
import { buildModuleSpecList, normalizeExtractedArrayLengths } from '@/config/recognitionTemplateConfig'

export function useRecognitionExtract() {
  const store = useRecognitionStore()
  const isRunning = ref(false)

  /**
   * 上传Word文件并提取段落文本，写入 store.extractedRawText
   * @param {File} file
   * @param {Function} onProgress - 上传进度 (0-100)
   */
  async function uploadAndExtractWord(file, onProgress) {
    store.isExtractingWord = true
    try {
      const uploadRes = await uploadRecognitionFile(file, onProgress)
      if (!uploadRes.success) throw new Error('文件上传失败')

      store.uploadedFileId   = uploadRes.fileID
      store.uploadedFileName = file.name

      const extractRes = await extractWordParagraphs({ fileId: uploadRes.fileID })
      if (!extractRes || !extractRes.success) {
        throw new Error(extractRes?.error || 'Word段落提取失败')
      }

      const paragraphs = extractRes.paragraphs || []
      const fullText = paragraphs
        .map(p => (typeof p === 'string' ? p : p.text || ''))
        .filter(t => t.trim())
        .join('\n')

      store.extractedRawText = fullText
      return { success: true }
    } catch (err) {
      ElMessage.error('Word文件处理失败：' + (err.message || '请检查网络'))
      store.uploadedFileId   = ''
      store.uploadedFileName = ''
      return { success: false, error: err.message }
    } finally {
      store.isExtractingWord = false
    }
  }

  /**
   * 执行 AI 识别：旧简历全文仅作素材池；采集范围由当前模板【标识库 + 记录库】构成的 moduleSpecs
   * 唯一确定（与整份简历全量结构化无关）。完成后写入 store.extractedData 并进入 confirm。
   */
  async function runExtraction() {
    if (isRunning.value) return

    const rawText = store.extractedRawText || store.textContent
    if (!rawText.trim()) {
      ElMessage.error('请先上传简历文件或粘贴简历文本')
      return
    }
    if (!store.selectedTemplateId) {
      ElMessage.error('请先选择简历模板')
      return
    }

    // 根据模板+身份构建模块规格列表，传给AI
    const moduleSpecs = buildModuleSpecList(store.selectedTemplateId, store.userType)
    if (!moduleSpecs.length) {
      ElMessage.error('当前模板配置暂未完善，请联系管理员')
      return
    }

    isRunning.value = true
    store.phase = 'recognizing'
    store.recognizingStatus = 'AI正在识别简历内容...'

    try {
      store.recognizingStatus = `正在按模板解析 ${moduleSpecs.length} 个模块字段...`
      const res = await recognitionExtractAll({
        textContent: rawText,
        userType:    store.userType,
        moduleSpecs,
        templateId:  store.selectedTemplateId,
      })

      if (!res || !res.success) {
        throw new Error(res?.message || res?.error || 'AI识别失败，请重试')
      }

      store.extractedData = normalizeExtractedArrayLengths(
        res.extractedData,
        store.templateRecordCounts
      )
      store.phase = 'confirm'
    } catch (err) {
      ElMessage.error('识别失败：' + (err.message || '请检查网络或重试'))
      store.phase = 'template'
    } finally {
      isRunning.value = false
    }
  }

  return {
    isRunning,
    uploadAndExtractWord,
    runExtraction
  }
}
