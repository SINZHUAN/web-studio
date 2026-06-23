import { defineStore } from 'pinia'
import { ref } from 'vue'

const DRAFT_KEY = 'resume_enhance_draft'

// 对应小程序 resume_enhance_pag.js 的 data 对象
export const useResumeEnhanceStore = defineStore('resumeEnhance', () => {

  // ── 阶段控制（对应小程序 stage 字段）──
  const stage = ref('upload') // 'upload' | 'analyzing' | 'result' | 'polishing' | 'done'

  // ── 上传阶段 ──
  const uploadedFileId = ref('')       // 云存储 fileId
  const uploadedFileKey = ref('')      // COS fileKey
  const uploadedFileName = ref('')     // 文件名显示
  const polishMode = ref('position')   // 'position' | 'self'
  const targetPosition = ref('')       // 目标岗位
  const jobDescription = ref('')       // 岗位JD
  const polishingIntensity = ref('')   // 润色强度
  const polishingIntensityDesc = ref('')
  const userIdentity = ref('')         // 用户身份（全职/实习/在校）
  const activeAccordion = ref('')      // 手风琴当前展开项

  // ── 分析阶段 ──
  const analyzeProgress = ref(0)       // 分析进度 0-100
  const analyzeStatusText = ref('正在分析简历...')

  // ── 识别/分析结果 ──
  const extractedSections = ref([])    // 识别出的各模块
  const resumeName = ref('')           // 识别出的姓名
  const analysisResult = ref(null)     // AI分析报告数据
  const scoreLevel = ref('')           // 评分等级
  const scoreValue = ref(0)            // 评分分值
  const radarData = ref([])            // 雷达图数据
  const radarIndustryAvg = ref([])     // 行业平均雷达数据

  // ── 预览图 ──
  const originalPreviewUrls = ref([])  // 润色前预览图（多页）
  const polishedPreviewUrls = ref([])  // 润色后预览图（多页）
  const previewMode = ref('original')  // 'original' | 'polished'

  // ── 润色阶段 ──
  const outputFormat = ref('')         // 'paragraph' | 'subtitle' | 'custom'
  const detectedFormat = ref('')       // 系统检测到的格式
  const customModuleItems = ref([])    // 自由设置模式各模块独立格式 [{ moduleType, label, format }]
  const polishList = ref([])           // 润色模块列表
  const polishedCount = ref(0)
  const polishScrollId = ref('')

  // ── 润色完成/对比 ──
  const showCompareModal = ref(false)
  const showAnalysisModal = ref(false)
  const showSummaryModal = ref(false)
  const showConfirmModal = ref(false)
  const showFormatSelectModal = ref(false)
  const showDoneModal = ref(false)

  // ── 优化总结 ──
  const summaryData = ref(null)

  // ── 生成的文档 ──
  const polishedFileKey = ref('')
  const polishedDownloadUrl = ref('')

  // ── 暂存草稿 ───────────────────────────────────────────────────────────────

  // 草稿摘要信息（用于恢复提示，避免解析整个草稿）
  const draftInfo = ref(null)

  function _loadDraftInfo() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const snap = JSON.parse(raw)
      if (snap?.stage && snap.stage !== 'upload') {
        draftInfo.value = {
          savedAt:    snap.savedAt,
          resumeName: snap.resumeName || snap.uploadedFileName || '',
          stage:      snap.stage,
        }
      }
    } catch { /* ignore */ }
  }

  function saveDraft() {
    const snapshot = {
      savedAt:               Date.now(),
      stage:                 stage.value,
      uploadedFileKey:       uploadedFileKey.value,
      uploadedFileName:      uploadedFileName.value,
      polishMode:            polishMode.value,
      targetPosition:        targetPosition.value,
      jobDescription:        jobDescription.value,
      polishingIntensity:    polishingIntensity.value,
      polishingIntensityDesc:polishingIntensityDesc.value,
      userIdentity:          userIdentity.value,
      extractedSections:     extractedSections.value,
      resumeName:            resumeName.value,
      analysisResult:        analysisResult.value,
      scoreLevel:            scoreLevel.value,
      scoreValue:            scoreValue.value,
      radarData:             radarData.value,
      radarIndustryAvg:      radarIndustryAvg.value,
      originalPreviewUrls:   originalPreviewUrls.value,
      polishedPreviewUrls:   polishedPreviewUrls.value,
      outputFormat:          outputFormat.value,
      detectedFormat:        detectedFormat.value,
      customModuleItems:     customModuleItems.value,
      polishList:            polishList.value,
      polishedCount:         polishedCount.value,
      summaryData:           summaryData.value,
      polishedFileKey:       polishedFileKey.value,
      polishedDownloadUrl:   polishedDownloadUrl.value,
    }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot))
      draftInfo.value = {
        savedAt:    snapshot.savedAt,
        resumeName: snapshot.resumeName || snapshot.uploadedFileName || '',
        stage:      snapshot.stage,
      }
    } catch (e) {
      console.warn('[resumeEnhance] 暂存草稿失败', e)
    }
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return false
      const s = JSON.parse(raw)
      stage.value                 = s.stage                  || 'upload'
      uploadedFileKey.value       = s.uploadedFileKey        || ''
      uploadedFileName.value      = s.uploadedFileName       || ''
      polishMode.value            = s.polishMode             || 'position'
      targetPosition.value        = s.targetPosition         || ''
      jobDescription.value        = s.jobDescription         || ''
      polishingIntensity.value    = s.polishingIntensity     || ''
      polishingIntensityDesc.value= s.polishingIntensityDesc || ''
      userIdentity.value          = s.userIdentity           || ''
      extractedSections.value     = s.extractedSections      || []
      resumeName.value            = s.resumeName             || ''
      analysisResult.value        = s.analysisResult         || null
      scoreLevel.value            = s.scoreLevel             || ''
      scoreValue.value            = s.scoreValue             || 0
      radarData.value             = s.radarData              || []
      radarIndustryAvg.value      = s.radarIndustryAvg       || []
      originalPreviewUrls.value   = s.originalPreviewUrls    || []
      polishedPreviewUrls.value   = s.polishedPreviewUrls    || []
      outputFormat.value          = s.outputFormat           || ''
      detectedFormat.value        = s.detectedFormat         || ''
      customModuleItems.value     = s.customModuleItems      || []
      polishList.value            = s.polishList             || []
      polishedCount.value         = s.polishedCount          || 0
      summaryData.value           = s.summaryData            || null
      polishedFileKey.value       = s.polishedFileKey        || ''
      polishedDownloadUrl.value   = s.polishedDownloadUrl    || ''
      draftInfo.value             = null
      return true
    } catch (e) {
      console.warn('[resumeEnhance] 恢复草稿失败', e)
      return false
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    draftInfo.value = null
  }

  // store 初始化时同步读取草稿摘要
  _loadDraftInfo()

  // 重置所有状态（重新开始时调用）
  function reset() {
    stage.value = 'upload'
    uploadedFileId.value = ''
    uploadedFileKey.value = ''
    uploadedFileName.value = ''
    polishMode.value = 'position'
    targetPosition.value = ''
    jobDescription.value = ''
    polishingIntensity.value = ''
    polishingIntensityDesc.value = ''
    analyzeProgress.value = 0
    extractedSections.value = []
    resumeName.value = ''
    analysisResult.value = null
    scoreLevel.value = ''
    scoreValue.value = 0
    radarData.value = []
    radarIndustryAvg.value = []
    originalPreviewUrls.value = []
    polishedPreviewUrls.value = []
    previewMode.value = 'original'
    outputFormat.value = ''
    detectedFormat.value = ''
    customModuleItems.value = []
    polishList.value = []
    polishedCount.value = 0
    summaryData.value = null
    polishedFileKey.value = ''
    polishedDownloadUrl.value = ''
    showCompareModal.value = false
    showAnalysisModal.value = false
    showSummaryModal.value = false
    showFormatSelectModal.value = false
    showDoneModal.value = false
  }

  return {
    stage, uploadedFileId, uploadedFileKey, uploadedFileName,
    polishMode, targetPosition, jobDescription, polishingIntensity, polishingIntensityDesc,
    userIdentity, activeAccordion,
    analyzeProgress, analyzeStatusText,
    extractedSections, resumeName, analysisResult, scoreLevel, scoreValue,
    radarData, radarIndustryAvg,
    originalPreviewUrls, polishedPreviewUrls, previewMode,
    outputFormat, detectedFormat, customModuleItems, polishList, polishedCount, polishScrollId,
    showCompareModal, showAnalysisModal, showSummaryModal,
    showConfirmModal, showFormatSelectModal, showDoneModal,
    summaryData, polishedFileKey, polishedDownloadUrl,
    draftInfo, saveDraft, restoreDraft, clearDraft,
    reset
  }
})
