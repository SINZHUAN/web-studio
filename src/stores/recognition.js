import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useRecognitionStore = defineStore('recognition', () => {
  // ── Phase control ──────────────────────────────────────────────────────────
  // Independent mode:  'template' | 'recognizing' | 'confirm' | 'supplement' | 'polishing' | 'preview'
  // Commission mode:   'ready' | 'polishing' | 'done'
  const phase = ref('template')

  // ── User identity ──────────────────────────────────────────────────────────
  const userType = ref('work')   // 'work' | 'internship' | 'student'

  // ── Phase template: template selection ────────────────────────────────────
  const selectedTemplateId = ref('')   // 'word_r_1' ~ 'word_r_5'
  const templateModules     = ref([])  // string[] ordered module key list
  const templateRecordCounts= ref({})  // { moduleKey: maxCount }

  // ── Phase template/input: content input ───────────────────────────────────
  const inputTab = ref('word')
  const uploadedFileId = ref('')
  const uploadedFileName = ref('')
  const isExtractingWord = ref(false)
  const textContent = ref('')
  const extractedRawText = ref('')

  // ── Polish params ─────────────────────────────────────────────────────────
  const polishMode = ref('self')
  const targetPosition = ref('')
  const jobDescription = ref('')
  const polishingIntensity = ref('standard')
  const polishingIntensityDesc = ref('')

  // ── Phase recognizing ──────────────────────────────────────────────────────
  const recognizingStatus = ref('AI正在识别简历内容...')

  // ── Phase confirm: extracted data ─────────────────────────────────────────
  const extractedData = ref(null)

  // ── Phase supplement: gap detection & user-supplied data ──────────────────
  const gaps = ref([])
  const supplementData = ref({})

  // ── Phase polishing: polish list ──────────────────────────────────────────
  const polishList = ref([])
  const polishedCount = ref(0)
  const totalPolishCount = ref(0)

  // ── Phase polishing → preview/done: generating ────────────────────────────
  const isGenerating = ref(false)
  const generatingStatus = ref('正在生成简历...')

  // ── Phase preview (independent mode) ──────────────────────────────────────
  const previewImages = ref([])
  const wordFileKey = ref('')
  const wordDownloadUrl = ref('')

  // ── Commission mode state ─────────────────────────────────────────────────
  // Links this session to a commission work order (businessType === 'recognition')
  const commissionOrderId = ref('')       // commission_orders._id
  const commissionOrderData = ref(null)   // full order data object

  // Client's original resume (from miniprogram upload)
  const clientResumeFileKey = ref('')     // CloudBase fileKey of original resume
  const clientResumeFileName = ref('')    // original file name
  const clientResumePreviewUrls = ref([]) // preview images of original resume (loaded async)

  // Generated resume artifacts (commission mode done stage)
  const polishedFileKey = ref('')         // COS key of generated Word file (for WPS edit & PDF convert)
  const polishedDownloadUrl = ref('')     // full HTTPS URL for Word download
  const pdfDownloadUrl = ref('')          // PDF version URL (after word_to_pdf conversion)

  // Analysis / summary (like DoneStage.summaryData)
  const summaryData = ref(null)           // AI-generated before/after comparison analysis

  function reset() {
    phase.value = 'template'
    userType.value = 'work'
    selectedTemplateId.value = ''
    templateModules.value      = []
    templateRecordCounts.value = {}
    inputTab.value = 'word'
    uploadedFileId.value = ''
    uploadedFileName.value = ''
    isExtractingWord.value = false
    textContent.value = ''
    extractedRawText.value = ''
    polishMode.value = 'self'
    targetPosition.value = ''
    jobDescription.value = ''
    polishingIntensity.value = 'standard'
    polishingIntensityDesc.value = ''
    recognizingStatus.value = 'AI正在识别简历内容...'
    extractedData.value = null
    gaps.value = []
    supplementData.value = {}
    polishList.value = []
    polishedCount.value = 0
    totalPolishCount.value = 0
    isGenerating.value = false
    generatingStatus.value = '正在生成简历...'
    previewImages.value = []
    wordFileKey.value = ''
    wordDownloadUrl.value = ''
    // Commission mode state
    commissionOrderId.value = ''
    commissionOrderData.value = null
    clientResumeFileKey.value = ''
    clientResumeFileName.value = ''
    clientResumePreviewUrls.value = []
    polishedFileKey.value = ''
    polishedDownloadUrl.value = ''
    pdfDownloadUrl.value = ''
    summaryData.value = null
  }

  return {
    phase, userType, selectedTemplateId,
    templateModules, templateRecordCounts,
    inputTab, uploadedFileId, uploadedFileName, isExtractingWord,
    textContent, extractedRawText,
    polishMode, targetPosition, jobDescription,
    polishingIntensity, polishingIntensityDesc,
    recognizingStatus, extractedData,
    gaps, supplementData,
    polishList, polishedCount, totalPolishCount,
    isGenerating, generatingStatus,
    previewImages, wordFileKey, wordDownloadUrl,
    // Commission mode
    commissionOrderId, commissionOrderData,
    clientResumeFileKey, clientResumeFileName, clientResumePreviewUrls,
    polishedFileKey, polishedDownloadUrl, pdfDownloadUrl,
    summaryData,
    reset
  }
})
