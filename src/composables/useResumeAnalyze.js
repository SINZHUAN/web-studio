import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useResumeEnhanceStore } from '@/stores/resumeEnhance'
import { enhanceAnalyze, enhanceExtractSections } from '@/api/ai'
import { extractParagraphs, docPreview } from '@/api/word'

function convertScoreToGrade(score) {
  if (typeof score !== 'number' || isNaN(score)) return 'C'
  score = Math.max(0, Math.min(100, score))
  if (score >= 90) return 'A+'
  if (score >= 75) return 'A'
  if (score >= 65) return 'A-'
  if (score >= 50) return 'B+'
  if (score >= 40) return 'B'
  if (score >= 30) return 'B-'
  return 'C'
}

export function useResumeAnalyze() {
  const store = useResumeEnhanceStore()
  const progress = ref(0)
  const statusText = ref('正在解析简历...')

  async function runAnalysis() {
    progress.value = 0
    statusText.value = '正在解析简历...'

    try {
      // Step 0: 提取段落
      progress.value = 15
      const extractRes = await extractParagraphs({
        fileId: store.uploadedFileId,
        fileKey: store.uploadedFileKey
      })
      if (!extractRes?.success) throw new Error('段落提取失败：' + (extractRes?.message || extractRes?.error || ''))
      const paragraphs = extractRes.paragraphs || []

      // Step 1: AI分析
      progress.value = 35
      statusText.value = '正在分析简历内容...'
      const analyzeRes = await enhanceAnalyze({
        paragraphs,
        polishMode: store.polishMode,
        targetPosition: store.targetPosition,
        jobDescription: store.jobDescription,
        userType: store.userIdentity
      })
      if (!analyzeRes?.success) throw new Error('分析失败：' + (analyzeRes?.message || analyzeRes?.error || ''))

      const analysis = analyzeRes.analysis || {}
      store.analysisResult = analysis
      store.scoreValue = analysis.score || 0
      store.scoreLevel = convertScoreToGrade(analysis.score || 0)
      const ds = analysis.dimensionScores
      store.radarData = ds ? [ds.fit, ds.highlight, ds.star, ds.core, ds.quantify] : []
      store.radarIndustryAvg = []

      // Step 2: 识别模块
      progress.value = 60
      statusText.value = '正在识别各经历模块...'
      const extractSectRes = await enhanceExtractSections({ paragraphs })
      if (!extractSectRes?.success) throw new Error('模块识别失败：' + (extractSectRes?.message || extractSectRes?.error || ''))
      store.extractedSections = extractSectRes.sections || []
      store.resumeName = extractSectRes.resumeName || ''

      // Step 3: 生成预览图
      progress.value = 80
      statusText.value = '正在生成预览图...'
      const previewRes = await docPreview({
        fileId: store.uploadedFileId,
        fileKey: store.uploadedFileKey
      })
      if (previewRes?.success) {
        const single = previewRes.previewImageUrl
        store.originalPreviewUrls = single ? [single] : (previewRes.imageUrls || previewRes.urls || [])
      }

      progress.value = 100
      statusText.value = '分析完成'
      store.stage = 'result'
      return { success: true }
    } catch (err) {
      ElMessage.error('分析失败：' + (err.message || '请重试'))
      store.stage = 'upload'
      return { success: false, error: err }
    }
  }

  return { progress, statusText, runAnalysis }
}
