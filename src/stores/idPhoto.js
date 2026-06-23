import { ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * idPhoto store — 证件照制作流程状态
 *
 * phase 状态机：
 *   upload → config → processing → done
 */
export const useIDPhotoStore = defineStore('idPhoto', () => {

  // ── 阶段控制 ────────────────────────────────────────────────────────────────
  // 'upload' | 'config' | 'processing' | 'done'
  const phase = ref('upload')

  // ── Step 1: 照片上传 ────────────────────────────────────────────────────────
  const localImageUrl  = ref('')   // 本地预览 URL（URL.createObjectURL）
  const localImageFile = ref(null) // 原始 File 对象
  const uploading       = ref(false)
  const uploadProgress  = ref(0)
  const uploadedFileKey = ref('')  // COS 路径（如 web_uploads/id_photos/xxx.jpg）
  const uploadedFileID  = ref('')  // CloudBase fileID（cloud://...），用于获取 CDN temp URL

  // ── Step 2: 规格配置 ─────────────────────────────────────────────────────────
  // 处理模式：'traditional'（传统抠图）| 'ai_generation'（AI生成）
  const processingMode    = ref('traditional')

  // 通用配置
  const selectedPhotoSize = ref('one_inch')   // 证件照尺寸代码
  const selectedBg        = ref('blue')       // 背景色代码

  // AI 模式专属
  const selectedClothing  = ref('formal_suit')
  const selectedHairstyle = ref('keep_original')

  // ── Step 3: 处理中 ──────────────────────────────────────────────────────────
  const processingStep  = ref(0)     // 0=上传 1=处理中 2=裁剪 3=完成
  const processingStatus = ref('')   // 当前步骤文字
  const processMode     = ref('')    // 实际执行的模式（可能降级）

  // ── Step 4: 结果 ────────────────────────────────────────────────────────────
  const resultImageUrl   = ref('')   // 最终图片展示 URL（直接来自云函数，<img> 无需 CORS）
  const downloadUrl      = ref('')   // 下载专用 URL（含 Content-Disposition:attachment，浏览器直接触发下载）
  const resultBlob       = ref(null) // 保留字段（暂不使用）
  const transparentUrl   = ref('')   // 保留字段（透明 PNG URL，暂不使用）
  const photoConfig      = ref(null) // { name, width, height, backgroundColor, backgroundColorHex, needCanvasProcessing }
  const isFallback       = ref(false)// AI 模式是否降级为传统模式

  // ── Reset ───────────────────────────────────────────────────────────────────
  function reset() {
    // 释放本地 blob URL
    if (localImageUrl.value && localImageUrl.value.startsWith('blob:')) {
      URL.revokeObjectURL(localImageUrl.value)
    }
    if (resultImageUrl.value && resultImageUrl.value.startsWith('blob:')) {
      URL.revokeObjectURL(resultImageUrl.value)
    }

    phase.value          = 'upload'
    localImageUrl.value  = ''
    localImageFile.value = null
    uploading.value      = false
    uploadProgress.value = 0
    uploadedFileKey.value = ''
    uploadedFileID.value  = ''
    processingMode.value = 'traditional'
    selectedPhotoSize.value = 'one_inch'
    selectedBg.value     = 'blue'
    selectedClothing.value  = 'formal_suit'
    selectedHairstyle.value = 'keep_original'
    processingStep.value  = 0
    processingStatus.value = ''
    processMode.value    = ''
    resultImageUrl.value = ''
    downloadUrl.value    = ''
    resultBlob.value     = null
    transparentUrl.value = ''
    photoConfig.value    = null
    isFallback.value     = false
  }

  return {
    phase,
    localImageUrl, localImageFile, uploading, uploadProgress, uploadedFileKey, uploadedFileID,
    processingMode,
    selectedPhotoSize, selectedBg,
    selectedClothing, selectedHairstyle,
    processingStep, processingStatus, processMode,
    resultImageUrl, downloadUrl, resultBlob, transparentUrl, photoConfig, isFallback,
    reset,
  }
})
