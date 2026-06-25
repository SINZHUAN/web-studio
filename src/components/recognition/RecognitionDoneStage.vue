<template>
  <div class="rdone-stage">
    <div class="rdone-layout" :class="{ 'rdone-layout--before-collapsed': beforeCollapsed }">

      <!-- ─── 左侧：原始简历 / 成品预览 ─── -->
      <div class="preview-area" ref="previewAreaRef">

        <!-- 原始简历（润色前）-->
        <div class="preview-col" :class="{ 'preview-col--collapsed': beforeCollapsed }">
          <div class="preview-col__label before-label">
            <template v-if="!beforeCollapsed">
              <span>原始简历</span>
              <button class="collapse-btn" @click="beforeCollapsed = true" title="收起">
                <svg viewBox="0 0 12 12" fill="none" class="collapse-icon">
                  <path d="M8.5 2L4.5 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  <path d="M12 2L8 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <span>收起</span>
              </button>
            </template>
            <button v-else class="expand-btn" @click="beforeCollapsed = false" title="展开">
              <svg viewBox="0 0 12 12" fill="none" class="collapse-icon">
                <path d="M3.5 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M7 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <span class="strip-label">原始</span>
            </button>
          </div>
          <div class="preview-pages" v-show="!beforeCollapsed">
            <div
              v-for="(url, i) in store.clientResumePreviewUrls"
              :key="'before-' + i"
              class="preview-img-wrap"
            >
              <img :src="url" class="preview-img" />
            </div>
            <div v-if="!store.clientResumePreviewUrls.length" class="preview-placeholder">
              <div class="placeholder-icon">
                <svg viewBox="0 0 40 40" fill="none">
                  <rect x="6" y="4" width="28" height="32" rx="3" fill="#f0f4fc" stroke="#b0c4e8" stroke-width="1.5"/>
                  <path d="M12 12h16M12 18h16M12 24h10" stroke="#b0c4e8" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>
              <p>原始简历</p>
              <p class="placeholder-sub">{{ store.clientResumeFileName || '客户上传文件' }}</p>
              <button v-if="store.clientResumeFileKey" class="load-preview-btn" :disabled="loadingPreview" @click="loadOriginalPreview">
                {{ loadingPreview ? '加载中...' : '加载预览' }}
              </button>
            </div>
          </div>
        </div>

        <!-- 成品简历（润色后）-->
        <div class="preview-col">
          <div class="preview-col__label after-label">成品简历</div>
          <div class="preview-pages">
            <div
              v-for="(url, i) in store.previewImages"
              :key="'after-' + i"
              class="preview-img-wrap"
            >
              <img :src="url" class="preview-img" />
            </div>
            <div v-if="!store.previewImages.length" class="preview-placeholder">预览图加载中...</div>
          </div>
        </div>

        <!-- 缩放控件 -->
        <div class="zoom-control">
          <span class="zoom-label">{{ Math.round(previewZoom * 100) }}%</span>
          <input v-model.number="previewZoom" type="range" min="0.3" max="1.5" step="0.05" class="zoom-slider" />
        </div>
      </div>

      <!-- ─── 右侧面板 ─── -->
      <div class="right-panel">
        <div class="right-panel-body">

          <!-- Tab -->
          <div class="right-tabs">
            <button class="right-tab" :class="{ 'right-tab--active': activeTab === 'compare' }" @click="activeTab = 'compare'">润色对比</button>
            <button class="right-tab" :class="{ 'right-tab--active': activeTab === 'analysis' }" @click="activeTab = 'analysis'">润色解析</button>
          </div>

          <div class="right-content">

            <!-- 润色对比 -->
            <div v-if="activeTab === 'compare'" class="compare-list">
              <div
                v-for="(item, i) in store.polishList"
                :key="i"
                class="compare-item"
              >
                <div class="compare-item__header" @click="expandedIndex = expandedIndex === i ? -1 : i">
                  <span class="compare-item__label">{{ item.moduleLabel }}</span>
                  <div class="compare-item__meta">
                    <span class="word-count">{{ item.items?.[0]?.polishedText?.length || 0 }} 字</span>
                    <span class="compare-arrow" :class="{ 'compare-arrow--open': expandedIndex === i }">›</span>
                  </div>
                </div>
                <div v-show="expandedIndex === i" class="compare-item__body">
                  <div v-for="(sub, si) in item.items" :key="si" class="compare-sub">
                    <div v-if="item.items.length > 1" class="compare-sub__idx">第 {{ si + 1 }} 条</div>
                    <div class="compare-col">
                      <div class="compare-col__label">润色前</div>
                      <div class="compare-col__text">{{ sub.originalText }}</div>
                    </div>
                    <div class="compare-col">
                      <div class="compare-col__label compare-col__label--after">润色后</div>
                      <div class="compare-col__text compare-col__text--after">{{ sub.polishedText }}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="!store.polishList.length" class="empty-hint">暂无润色数据</div>
            </div>

            <!-- 润色解析 -->
            <div v-else-if="activeTab === 'analysis'" class="analysis-wrap">
              <template v-if="!store.summaryData && !analysisLoading">
                <div class="analysis-entry">
                  <div class="analysis-entry__icon">✦</div>
                  <div class="analysis-entry__title">定制解析</div>
                  <div class="analysis-entry__desc">AI将分析旧简历与新成品的差异，给出优化策略解析与面试建议</div>
                  <button class="analysis-generate-btn" @click="generateAnalysis">生成定制解析</button>
                </div>
              </template>
              <template v-else-if="analysisLoading">
                <div class="analysis-entry">
                  <div class="analysis-loading-spinner"></div>
                  <div class="analysis-entry__title" style="margin-top:12px">AI 解析生成中...</div>
                </div>
              </template>
              <template v-else>
                <div v-if="summaryObj.overall_strategy" class="summary-section">
                  <div class="summary-section__title">整体优化策略</div>
                  <p class="summary-section__text">{{ summaryObj.overall_strategy }}</p>
                </div>
                <div v-if="summaryObj.key_improvements?.length" class="summary-section">
                  <div class="summary-section__title">各模块优化重点</div>
                  <div v-for="(item, i) in summaryObj.key_improvements" :key="i" class="improvement-item">
                    <div class="improvement-item__module">{{ item.module }}</div>
                    <p class="improvement-item__text">{{ item.improvement }}</p>
                  </div>
                </div>
                <div v-if="summaryObj.interview_tips" class="summary-section">
                  <div class="summary-section__title">面试建议</div>
                  <p class="summary-section__text">{{ summaryObj.interview_tips }}</p>
                </div>
              </template>
            </div>

          </div>
        </div>

        <!-- 底部操作栏 -->
        <div class="right-footer">

          <!-- 工单标签 -->
          <div v-if="commissionStore.activeOrderId" class="footer-order-badge">
            <svg viewBox="0 0 16 16" fill="none" class="footer-badge-icon">
              <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.4"/>
              <path d="M4 7h8M4 10h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            <span>{{ commissionStore.activeOrderData?.orderId }}</span>
          </div>

          <div class="footer-actions">
            <!-- 导出 Word -->
            <button class="footer-btn footer-btn--primary" @click="handleExportWord">
              <svg viewBox="0 0 20 20" fill="none" class="footer-btn-icon">
                <path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3 15h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              导出 Word
            </button>

            <!-- 在线编辑 -->
            <button class="footer-btn footer-btn--secondary" @click="openWpsEditor">
              <svg viewBox="0 0 20 20" fill="none" class="footer-btn-icon">
                <path d="M14 3l3 3-9 9H5v-3L14 3z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              在线编辑
            </button>

            <!-- 打包导出 -->
            <button class="footer-btn footer-btn--secondary" @click="bundleDialogVisible = true">
              <svg viewBox="0 0 20 20" fill="none" class="footer-btn-icon">
                <rect x="2" y="10" width="16" height="8" rx="2" stroke="currentColor" stroke-width="1.6"/>
                <path d="M6 10V6a4 4 0 0 1 8 0v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
              打包导出
            </button>

            <!-- 回传小程序（仅委托模式）-->
            <template v-if="commissionStore.activeOrderId">
              <button
                class="footer-btn footer-btn--outline"
                :class="{ 'footer-btn--sent': previewSent }"
                :disabled="isSendingPreview"
                @click="sendPreviewToMiniprogram"
              >
                <span v-if="isSendingPreview" class="btn-spin-dark"></span>
                <svg v-else viewBox="0 0 20 20" fill="none" class="footer-btn-icon">
                  <path d="M3 10l7-7 7 7M10 3v14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                {{ previewSent ? '已回传' : '回传预览' }}
              </button>

              <button
                class="footer-btn footer-btn--outline"
                :disabled="isSavingProgress"
                @click="saveProgress"
              >
                <span v-if="isSavingProgress" class="btn-spin-dark"></span>
                <svg v-else viewBox="0 0 20 20" fill="none" class="footer-btn-icon">
                  <path d="M5 10h10M10 5l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                保存进度
              </button>
            </template>

            <!-- 重新开始 -->
            <button class="footer-btn footer-btn--restart" @click="handleRestart">
              <svg viewBox="0 0 20 20" fill="none" class="footer-btn-icon">
                <path d="M4 10a6 6 0 1 1 1.5 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M4 14v-4h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              重新开始
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── 打包导出弹窗 ─── -->
    <Teleport to="body">
      <Transition name="overlay-fade">
        <div v-if="bundleDialogVisible" class="overlay" @click.self="bundleDialogVisible = false">
          <div class="bundle-dialog" @click.stop>
            <div class="bundle-dialog__header">
              <span class="bundle-dialog__title">打包导出</span>
              <button class="bundle-dialog__close" @click="bundleDialogVisible = false">×</button>
            </div>

            <div class="bundle-dialog__body">
              <!-- 导出项列表 -->
              <div class="bundle-options">
                <label
                  v-for="opt in bundleOptions"
                  :key="opt.id"
                  class="bundle-option"
                  :class="{ 'bundle-option--unavailable': !opt.available, 'bundle-option--selected': selectedExports.includes(opt.id) }"
                >
                  <input
                    type="checkbox"
                    :value="opt.id"
                    v-model="selectedExports"
                    :disabled="!opt.available"
                  />
                  <img :src="opt.iconSrc" class="bundle-option__icon" />
                  <div class="bundle-option__info">
                    <div class="bundle-option__name">{{ opt.name }}</div>
                    <div class="bundle-option__desc">{{ opt.available ? opt.desc : opt.unavailableDesc }}</div>
                  </div>
                </label>
              </div>

              <div class="bundle-select-all">
                <button class="select-all-btn" @click="toggleSelectAll">
                  {{ isAllSelected ? '取消全选' : '全选可用项' }}
                </button>
              </div>

              <!-- 导出模式勾选 -->
              <div class="export-modes">
                <label class="export-mode-item">
                  <input type="checkbox" v-model="exportModes.download" />
                  <span>打包下载</span>
                </label>
                <label class="export-mode-item">
                  <input type="checkbox" v-model="exportModes.email" @change="emailAddress = emailAddress || (commissionStore.activeOrderData?.email || '')" />
                  <span>打包邮发</span>
                </label>
                <label class="export-mode-item" v-if="commissionStore.activeOrderId">
                  <input type="checkbox" v-model="exportModes.sendback" />
                  <span>打包回传</span>
                </label>
              </div>

              <!-- 邮件输入 -->
              <div v-if="exportModes.email" class="email-input-row">
                <input
                  v-model="emailAddress"
                  type="email"
                  placeholder="收件人邮箱"
                  class="email-input"
                />
                <span v-if="emailStatusText" class="email-status">{{ emailStatusText }}</span>
              </div>
            </div>

            <div class="bundle-dialog__footer">
              <span v-if="bundleStatusText" class="bundle-status">{{ bundleStatusText }}</span>
              <button
                class="bundle-btn"
                :disabled="!selectedExports.length || isBundling || isSendingEmail || isSendingResult"
                @click="runExportAll"
              >
                <span v-if="isBundling || isSendingEmail || isSendingResult" class="btn-spin"></span>
                {{ isBundling ? '打包中...' : isSendingEmail ? '发送中...' : isSendingResult ? '回传中...' : '打包导出' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- WPS 弹窗 -->
    <Teleport to="body">
      <div v-if="showWpsDialog" class="wps-overlay" @click.self="showWpsDialog = false">
        <div class="wps-dialog">
          <p class="wps-title">是否用 WPS 打开简历？</p>
          <p class="wps-sub">Word 文件已开始下载，也可直接用 WPS Office 打开</p>
          <div class="wps-actions">
            <button class="wps-cancel" @click="showWpsDialog = false">关闭</button>
            <button class="wps-confirm" @click="openWithWps">用 WPS 打开</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- WPS 在线编辑弹窗 -->
    <Teleport to="body">
      <WpsEditorModal
        v-if="wpsModalVisible"
        :file-key="store.polishedFileKey"
        @close="onWpsModalClose"
        @saved="onWpsSaved"
      />
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRecognitionStore } from '@/stores/recognition'
import { useCommissionStore } from '@/stores/commission'
import { downloadWordFile } from '@/api/word'
import { wordToPdf } from '@/api/docProcessor'
import { sendBundleEmail as apiSendBundleEmail } from '@/api/tools'
import {
  apiSaveCommissionProgress,
  apiSendCommissionPreview,
  apiSendCommissionResult,
  apiBridgeCommissionFile,
  apiCompleteCommissionOrder,
} from '@/api/commission'
import { docToImage } from '@/api/recognition'
import { enhancePolishSection } from '@/api/ai'
import WpsEditorModal from '@/components/resume-enhance/WpsEditorModal.vue'
import { preloadWpsSdk, preWarmWpsConfig, clearWpsConfigCache } from '@/utils/wpsSdk'
import iconDaochuWord from '@images/daochu_word.png'
import iconDaochuPdf from '@images/daochu_pdf.png'
import iconDaochuImage from '@images/daochu_image.png'
import iconDaochuBaogao from '@images/daochu_baogao.png'

const emit = defineEmits(['save-and-exit'])

const store           = useRecognitionStore()
const commissionStore = useCommissionStore()

// ── UI state ─────────────────────────────────────────────────────────────────
const activeTab       = ref('compare')
const expandedIndex   = ref(-1)
const previewZoom     = ref(0.95)
const beforeCollapsed = ref(false)
const previewAreaRef  = ref(null)

// Loading original resume preview
const loadingPreview = ref(false)

// Commission actions
const isSavingProgress = ref(false)
const isSendingPreview = ref(false)
const previewSent      = ref(false)
const analysisLoading  = ref(false)

// Bundle export
const bundleDialogVisible = ref(false)
const isBundling          = ref(false)
const bundleStatusText    = ref('')
const selectedExports     = ref([])
const emailAddress        = ref('')
const isSendingEmail      = ref(false)
const emailStatusText     = ref('')
const isSendingResult     = ref(false)
const _inExportAll        = ref(false)
const exportModes         = reactive({ download: true, email: false, sendback: false })

// WPS
const showWpsDialog   = ref(false)
const wpsModalVisible = ref(false)

// ── Bundle options ─────────────────────────────────────────────────────────
const bundleOptions = computed(() => [
  {
    id: 'word',
    name: '成品简历 Word',
    iconSrc: iconDaochuWord,
    desc: '可二次编辑的 .docx 格式',
    unavailableDesc: '暂无成品文档',
    available: !!store.polishedFileKey || !!store.wordDownloadUrl,
  },
  {
    id: 'pdf',
    name: '成品简历 PDF',
    iconSrc: iconDaochuPdf,
    desc: '由 Word 转换的真实 PDF',
    unavailableDesc: '暂无成品文档',
    available: !!store.polishedFileKey || !!store.wordDownloadUrl,
  },
  {
    id: 'images',
    name: '成品简历图片',
    iconSrc: iconDaochuImage,
    desc: `共 ${store.previewImages.length} 张 PNG 预览图`,
    unavailableDesc: '暂无预览图',
    available: store.previewImages.length > 0,
  },
  {
    id: 'analysis',
    name: '定制解析报告',
    iconSrc: iconDaochuBaogao,
    desc: '优化策略 & 面试建议文本报告',
    unavailableDesc: '尚未生成解析，请先在"润色解析"页生成',
    available: !!store.summaryData,
  },
])

const isAllSelected = computed(() => {
  const available = bundleOptions.value.filter(o => o.available).map(o => o.id)
  return available.length > 0 && available.every(id => selectedExports.value.includes(id))
})

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedExports.value = []
  } else {
    selectedExports.value = bundleOptions.value.filter(o => o.available).map(o => o.id)
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────
const summaryObj = computed(() => {
  const d = store.summaryData
  if (!d) return {}
  if (typeof d === 'string') {
    try { return JSON.parse(d) } catch { return { overall_strategy: d } }
  }
  return d
})

// ── Load original preview ────────────────────────────────────────────────────
onMounted(async () => {
  if (!emailAddress.value) {
    emailAddress.value = commissionStore.activeOrderData?.email || ''
  }
  preloadWpsSdk()
})

watch(() => store.polishedFileKey, (fileKey) => {
  if (fileKey) preWarmWpsConfig(fileKey)
})

async function loadOriginalPreview() {
  if (loadingPreview.value || !store.clientResumeFileKey) return
  loadingPreview.value = true
  try {
    const bridgeRes = await apiBridgeCommissionFile({
      fileID: store.clientResumeFileKey,
      fileName: store.clientResumeFileName || 'resume.docx',
    })
    if (bridgeRes?.fileKey) {
      const imgRes = await docToImage({ fileKey: bridgeRes.fileKey })
      if (imgRes?.success) {
        store.clientResumePreviewUrls = imgRes.previewImageUrls
          || (imgRes.previewImageUrl ? [imgRes.previewImageUrl] : [])
          || []
        if (!store.clientResumePreviewUrls.length) {
          ElMessage.warning('原始简历预览图生成为空')
        }
      } else {
        ElMessage.warning('原始简历预览图生成失败')
      }
    }
  } catch (e) {
    ElMessage.error('加载原始简历预览失败：' + (e.message || ''))
  } finally {
    loadingPreview.value = false
  }
}

// ── Export Word ──────────────────────────────────────────────────────────────
function handleExportWord() {
  const url = store.wordDownloadUrl || store.polishedDownloadUrl
  if (!url) { ElMessage.warning('暂无可下载的 Word 文件'); return }
  downloadWordFile(url, `定制简历_${store.selectedTemplateId || ''}.docx`)
  showWpsDialog.value = true
}

function openWithWps() {
  const url = store.wordDownloadUrl || store.polishedDownloadUrl
  if (!url) return
  window.open(`wps://d?url=${encodeURIComponent(url)}`, '_blank')
  showWpsDialog.value = false
}

// ── WPS 在线编辑 ─────────────────────────────────────────────────────────────
function openWpsEditor() {
  if (!store.polishedFileKey) {
    ElMessage.warning('暂无可编辑的文档，请先完成润色')
    return
  }
  wpsModalVisible.value = true
}

function onWpsModalClose() {
  wpsModalVisible.value = false
}

async function onWpsSaved({ fileKey }) {
  clearWpsConfigCache()
  ElMessage.success('编辑已保存，正在更新预览...')
  try {
    const { getEditedPreview } = await import('@/api/docProcessor.js')
    const res = await getEditedPreview({ fileKey })
    if (res?.success) {
      if (res.previewImageUrls?.length) {
        store.previewImages = res.previewImageUrls
      } else if (res.previewImageUrl) {
        store.previewImages = [res.previewImageUrl]
      }
      if (store.previewImages.length) ElMessage.success('预览已更新')
    }
  } catch (err) {
    console.warn('[RecognitionDoneStage] WPS 保存后预览刷新失败:', err.message)
  }
}

// ── 重新开始 ─────────────────────────────────────────────────────────────────
async function handleRestart() {
  try {
    await ElMessageBox.confirm(
      '重新开始将清空当前制作结果，确认吗？',
      '提示',
      { confirmButtonText: '确认重新开始', cancelButtonText: '取消', type: 'warning' }
    )
    store.reset()
    commissionStore.clearActiveOrder()
  } catch { /* 取消 */ }
}

// ── Generate Analysis ────────────────────────────────────────────────────────
async function generateAnalysis() {
  if (analysisLoading.value) return
  analysisLoading.value = true
  try {
    const polishTexts = store.polishList.flatMap(m =>
      m.items.map(sub => `[${m.moduleLabel}] 润色前：${sub.originalText}\n润色后：${sub.polishedText}`)
    ).join('\n\n')

    if (!polishTexts.trim()) {
      ElMessage.warning('暂无润色内容，无法生成解析')
      return
    }

    const res = await enhancePolishSection({
      moduleType: 'summary',
      originalText: `以下是简历定制项目的润色对比内容，请分析优化策略：\n\n${polishTexts}`,
      polishMode: store.polishMode || 'self',
      polishingIntensity: store.polishingIntensity || 'standard',
      targetPosition: store.targetPosition || '',
      contentFormat: 'analysis',
      userIdentity: store.userType || 'work',
    })

    if (res?.success && res.polishedText) {
      try {
        store.summaryData = JSON.parse(res.polishedText)
      } catch {
        store.summaryData = { overall_strategy: res.polishedText }
      }
    } else {
      ElMessage.warning('解析生成失败，请重试')
    }
  } catch (e) {
    ElMessage.error('解析生成失败：' + (e.message || ''))
  } finally {
    analysisLoading.value = false
  }
}

// ── Save Progress ────────────────────────────────────────────────────────────
async function saveProgress() {
  if (!commissionStore.activeOrderId || isSavingProgress.value) return
  try {
    await ElMessageBox.confirm(
      '保存当前进度后退出，可在任务工单「制作中」列表点击「继续制作」恢复。',
      '保存进度',
      { confirmButtonText: '保存并退出', cancelButtonText: '取消', type: 'info' }
    )
  } catch { return }

  isSavingProgress.value = true
  try {
    const progressData = {
      stage:                  'done',
      selectedTemplateId:     store.selectedTemplateId,
      userType:               store.userType,
      polishMode:             store.polishMode,
      polishingIntensity:     store.polishingIntensity,
      targetPosition:         store.targetPosition,
      jobDescription:         store.jobDescription,
      polishList:             store.polishList,
      polishedCount:          store.polishedCount,
      previewImages:          store.previewImages,
      wordDownloadUrl:        store.wordDownloadUrl,
      polishedFileKey:        store.polishedFileKey,
      polishedDownloadUrl:    store.polishedDownloadUrl,
      clientResumeFileKey:    store.clientResumeFileKey,
      clientResumeFileName:   store.clientResumeFileName,
      clientResumePreviewUrls:store.clientResumePreviewUrls,
      summaryData:            store.summaryData,
      extractedData:          store.extractedData,
    }
    await apiSaveCommissionProgress({ _id: commissionStore.activeOrderId, savedProgress: progressData })
    commissionStore.clearActiveOrder()
    ElMessage.success('进度已保存，可在任务工单中继续制作')
    emit('save-and-exit')
  } catch (err) {
    ElMessage.error('保存失败：' + (err.message || '请重试'))
  } finally {
    isSavingProgress.value = false
  }
}

// ── Send Preview to Miniprogram ──────────────────────────────────────────────
async function sendPreviewToMiniprogram() {
  if (!commissionStore.activeOrderId || isSendingPreview.value) return

  let includeAnalysis = false
  try {
    await ElMessageBox.confirm(
      '是否同时将定制解析报告一起回传给客户？\n点击「连同解析」将自动生成并回传；点击「仅回传预览图」则只发送对比预览图。',
      '回传小程序',
      {
        confirmButtonText:  '连同解析',
        cancelButtonText:   '仅回传预览图',
        distinguishCancelAndClose: true,
        type: 'info',
      }
    )
    includeAnalysis = true
  } catch (action) {
    if (action === 'cancel') {
      includeAnalysis = false
    } else {
      return
    }
  }

  isSendingPreview.value = true
  try {
    let analysisReport = null
    if (includeAnalysis) {
      if (!store.summaryData) {
        ElMessage.info('正在生成定制解析报告，请稍候…')
        await generateAnalysis()
      }
      if (store.summaryData) analysisReport = store.summaryData
    }

    await apiSendCommissionPreview({
      _id:                commissionStore.activeOrderId,
      clientPreviewUrls:  store.previewImages || [],
      clientOriginalUrls: store.clientResumePreviewUrls || [],
      clientAnalysis:     null,
      clientAnalysisReport: analysisReport,
    })
    previewSent.value = true
    ElMessage.success(
      includeAnalysis && analysisReport
        ? '已回传成品预览图和定制解析报告'
        : '已回传成品预览图'
    )
  } catch (err) {
    ElMessage.error('回传失败：' + (err.message || '请重试'))
  } finally {
    isSendingPreview.value = false
  }
}

// ── Convert Word to PDF ───────────────────────────────────────────────────────
async function convertWordToPdfUrl() {
  const fileKey = store.polishedFileKey
  if (!fileKey) return null
  try {
    const res = await wordToPdf({ wordFileKey: fileKey, orderId: commissionStore.activeOrderId })
    if (res?.success && res?.pdfUrl) {
      store.pdfDownloadUrl = res.pdfUrl
      return res.pdfUrl
    }
    return null
  } catch (e) {
    console.error('[RecognitionDoneStage] Word→PDF 失败:', e?.message)
    return null
  }
}

// ── Bundle Export ────────────────────────────────────────────────────────────
function buildAnalysisText() {
  const s = summaryObj.value
  const parts = []
  if (s.overall_strategy) parts.push(`【整体优化策略】\n${s.overall_strategy}`)
  if (s.key_improvements?.length) {
    parts.push('【各模块优化重点】')
    s.key_improvements.forEach(item => parts.push(`${item.module}：${item.improvement}`))
  }
  if (s.interview_tips) parts.push(`【面试建议】\n${s.interview_tips}`)
  return parts.join('\n\n')
}

async function runBundleDownload() {
  if (isBundling.value) return
  isBundling.value = true
  bundleStatusText.value = '正在准备打包文件...'
  try {
    const sel = selectedExports.value
    const wordUrl = store.wordDownloadUrl || store.polishedDownloadUrl

    if (sel.includes('word') && wordUrl) {
      bundleStatusText.value = '下载 Word 文件...'
      downloadWordFile(wordUrl, `定制简历_${store.selectedTemplateId || ''}.docx`)
      await new Promise(r => setTimeout(r, 600))
    }
    if (sel.includes('pdf')) {
      bundleStatusText.value = '正在转换 PDF...'
      let pdfUrl = store.pdfDownloadUrl
      if (!pdfUrl) pdfUrl = await convertWordToPdfUrl()
      if (pdfUrl) {
        const a = document.createElement('a')
        a.href = pdfUrl; a.download = `定制简历_${store.selectedTemplateId || ''}.pdf`; a.target = '_blank'
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        await new Promise(r => setTimeout(r, 600))
      } else {
        ElMessage.warning('PDF 转换失败，已跳过')
      }
    }
    if (sel.includes('images')) {
      bundleStatusText.value = '下载预览图...'
      for (let i = 0; i < store.previewImages.length; i++) {
        const a = document.createElement('a')
        a.href = store.previewImages[i]; a.download = `定制简历_p${i + 1}.png`; a.target = '_blank'
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        await new Promise(r => setTimeout(r, 400))
      }
    }
    if (sel.includes('analysis') && store.summaryData) {
      bundleStatusText.value = '下载解析报告...'
      const blob = new Blob([buildAnalysisText()], { type: 'text/plain;charset=utf-8' })
      const url  = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = '定制解析报告.txt'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }

    if (!_inExportAll.value) {
      ElMessage.success('打包下载完成')
      bundleDialogVisible.value = false
    }
  } catch (e) {
    ElMessage.error('打包下载失败：' + (e.message || ''))
  } finally {
    isBundling.value = false
    bundleStatusText.value = ''
  }
}

async function runEmailSend() {
  const email = emailAddress.value.trim()
  if (!email) { ElMessage.warning('请输入收件人邮箱'); return }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { ElMessage.warning('邮箱格式不正确'); return }
  if (!selectedExports.value.length) { ElMessage.warning('请至少选择一项导出内容'); return }
  if (isSendingEmail.value) return

  isSendingEmail.value = true
  emailStatusText.value = '正在组装文件信息...'

  try {
    const sel = selectedExports.value
    const selectedItems = []
    const wordUrl = store.wordDownloadUrl || store.polishedDownloadUrl

    if (sel.includes('word') && store.polishedFileKey) {
      selectedItems.push({ type: 'word', fileKey: store.polishedFileKey })
    }
    if (sel.includes('pdf') && store.previewImages.length) {
      selectedItems.push({ type: 'pdf', urls: store.previewImages })
    }
    if (sel.includes('images') && store.previewImages.length) {
      selectedItems.push({ type: 'images', urls: store.previewImages })
    }
    if (sel.includes('analysis') && store.summaryData) {
      selectedItems.push({ type: 'analysis', text: buildAnalysisText() })
    }

    if (!selectedItems.length) {
      ElMessage.warning('所选内容暂无可发送的文件')
      return
    }

    emailStatusText.value = '云函数打包中，请稍候（可能需要30秒）...'
    const res = await apiSendBundleEmail({
      recipientEmail: email,
      resumeName: store.clientResumeFileName?.replace(/\.[^.]+$/, '') || '定制简历',
      selectedItems,
    })

    if (res?.success) {
      if (!_inExportAll.value) {
        ElMessage.success(`邮件已发送至 ${email}`)
        bundleDialogVisible.value = false
      }
    } else {
      ElMessage.error(res?.message || '发送失败，请重试')
    }
  } catch (err) {
    ElMessage.error('发送失败：' + (err.message || '请重试'))
  } finally {
    isSendingEmail.value = false
    emailStatusText.value = ''
  }
}

async function runSendResult() {
  if (!commissionStore.activeOrderId || isSendingResult.value) return

  const sel = selectedExports.value
  const clientResultItems = bundleOptions.value.map(opt => ({
    id:        opt.id,
    label:     opt.name,
    available: sel.includes(opt.id) && opt.available,
  }))

  isSendingResult.value = true

  let resultPdfUrl = null
  if (sel.includes('pdf') && store.polishedFileKey) {
    ElMessage.info('正在将 Word 转换为 PDF，请稍候…')
    resultPdfUrl = await convertWordToPdfUrl()
    if (!resultPdfUrl) ElMessage.warning('PDF 转换失败，其他内容仍会正常回传')
  }

  try {
    const wordUrl = store.wordDownloadUrl || store.polishedDownloadUrl
    await apiSendCommissionResult({
      _id:               commissionStore.activeOrderId,
      clientResultItems,
      clientIdPhotoUrl:  null,
      resultWordUrl:     sel.includes('word') ? (wordUrl || null) : null,
      resultWordFileKey: sel.includes('word') ? (store.polishedFileKey || null) : null,
      resultPdfUrl,
      resultPdfFileKey:  null,
      resultPreviewUrls: sel.includes('images') ? (store.previewImages || []) : null,
      resultAnalysisUrl: null,
    })
    if (!_inExportAll.value) {
      ElMessage.success('成品已回传至小程序，客户可在订单详情「成品下载」区查看')
      bundleDialogVisible.value = false
    }
  } catch (err) {
    ElMessage.error('回传失败：' + (err?.message || '请重试'))
  } finally {
    isSendingResult.value = false
  }
}

async function runExportAll() {
  if (!selectedExports.value.length) { ElMessage.warning('请至少选择一项内容'); return }
  const { download, email, sendback } = exportModes
  if (!download && !email && !sendback) { ElMessage.warning('请至少选择一种导出方式'); return }

  const emailVal = emailAddress.value.trim()
  if (email) {
    if (!emailVal) { ElMessage.warning('请输入收件人邮箱'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) { ElMessage.warning('邮箱格式不正确'); return }
  }

  _inExportAll.value = true
  const results = []
  const errors  = []

  try {
    if (download) {
      try { await runBundleDownload(); results.push('打包下载') }
      catch { errors.push('打包下载') }
    }
    if (email) {
      try { await runEmailSend(); results.push('邮件发送') }
      catch { errors.push('邮件发送') }
    }
    if (sendback && commissionStore.activeOrderId) {
      try { await runSendResult(); results.push('回传小程序') }
      catch { errors.push('回传小程序') }
    }

    // 导出成功后，完结委托工单（从「制作中」流转到「已完成」）
    const savedOrderId = commissionStore.activeOrderId
    if (results.length && savedOrderId) {
      try {
        await apiCompleteCommissionOrder({
          _id: savedOrderId,
          resultFileKey: store.polishedFileKey || '',
          resultPreviewUrls: store.previewImages || [],
          linkedWorkorderId: '',
        })
      } catch (e) {
        console.error('[RecognitionDoneStage] 完结任务工单失败:', e)
      }
    }

    const msg = [
      results.length ? `${results.join('、')} 完成` : '',
      errors.length  ? `${errors.join('、')} 失败`   : '',
    ].filter(Boolean).join('；')
    if (errors.length) ElMessage.warning(msg || '部分操作失败')
    else ElMessage.success(msg || '导出完成')

    bundleDialogVisible.value = false
  } finally {
    _inExportAll.value = false
    bundleStatusText.value = ''
  }
}
</script>

<style scoped>
.rdone-stage {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.rdone-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ── Preview area ─────────────────────────────────────────────────────────── */
.preview-area {
  flex: 1;
  display: flex;
  border-right: 1px solid #e8f0fe;
  overflow: hidden;
  position: relative;
}

.preview-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #f0f4fc;
  overflow: hidden;
  min-width: 0;
}
.preview-col:last-child { border-right: none; }
.preview-col--collapsed {
  flex: none !important;
  width: 28px;
}

.preview-col__label {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
  border-bottom: 1px solid #f0f4fc;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  background: #fff;
}
.before-label { color: #888; }
.after-label  { color: #1565C0; }

.collapse-btn, .expand-btn {
  display: flex; align-items: center; gap: 4px;
  background: none; border: none; cursor: pointer;
  font-size: 11px; color: #888; margin-left: auto;
  padding: 2px 4px;
}
.collapse-btn:hover, .expand-btn:hover { color: #1565C0; }
.collapse-icon { width: 10px; height: 10px; }
.strip-label { writing-mode: vertical-rl; font-size: 10px; letter-spacing: 1px; color: #1565C0; }

.preview-pages {
  flex: 1;
  overflow: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  background: #f8faff;
}

.preview-img-wrap { width: 100%; flex-shrink: 0; }
.preview-img {
  width: 100%;
  display: block;
  border-radius: 6px;
  border: 1px solid #eee;
}

.preview-placeholder {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: #aaa;
  font-size: 13px;
  text-align: center;
}
.placeholder-icon svg { width: 48px; height: 48px; }
.placeholder-sub { font-size: 11px; color: #ccc; margin: 0; }
.load-preview-btn {
  padding: 6px 14px;
  background: #e8f0fe; color: #1565C0;
  border: none; border-radius: 8px;
  font-size: 12px; font-weight: 600; cursor: pointer;
}
.load-preview-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.zoom-control {
  position: absolute;
  bottom: 12px; right: 12px;
  display: flex; align-items: center; gap: 8px;
  background: rgba(255,255,255,0.95);
  border: 1px solid #e0e0e0;
  border-radius: 20px;
  padding: 5px 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 10;
}
.zoom-label { font-size: 11px; color: #666; min-width: 34px; }
.zoom-slider { width: 80px; cursor: pointer; }

/* ── Right panel ─────────────────────────────────────────────────────────── */
.right-panel {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  overflow: hidden;
}

.right-panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.right-tabs {
  display: flex;
  border-bottom: 1px solid #e8f0fe;
  flex-shrink: 0;
}

.right-tab {
  flex: 1;
  padding: 12px 8px;
  background: none;
  border: none;
  font-size: 13px;
  font-weight: 600;
  color: #888;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.right-tab--active { color: #1565C0; border-bottom-color: #1565C0; }

.right-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* compare list */
.compare-list { display: flex; flex-direction: column; gap: 8px; }
.compare-item {
  border: 1px solid #e8f0fe;
  border-radius: 10px;
  overflow: hidden;
}
.compare-item__header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  background: #f7fbff;
}
.compare-item__header:hover { background: #eef4ff; }
.compare-item__label { font-size: 13px; font-weight: 600; color: #1a1a1a; }
.compare-item__meta { display: flex; align-items: center; gap: 8px; }
.word-count { font-size: 11px; color: #888; }
.compare-arrow { font-size: 16px; color: #aaa; transition: transform 0.2s; }
.compare-arrow--open { transform: rotate(90deg); }

.compare-item__body { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.compare-sub { display: flex; flex-direction: column; gap: 8px; }
.compare-sub__idx { font-size: 11px; font-weight: 600; color: #888; padding: 2px 0; }

.compare-col { display: flex; flex-direction: column; gap: 4px; }
.compare-col__label {
  font-size: 11px; font-weight: 700; color: #888;
  text-transform: uppercase; letter-spacing: 0.5px;
}
.compare-col__label--after { color: #1565C0; }
.compare-col__text {
  font-size: 12px; line-height: 1.7; color: #555;
  background: #f8f9fb;
  border-radius: 6px; padding: 8px 10px;
}
.compare-col__text--after { background: #f0f6ff; color: #1a1a1a; }

.empty-hint { text-align: center; color: #aaa; font-size: 13px; padding: 40px 0; }

/* analysis */
.analysis-wrap { display: flex; flex-direction: column; gap: 16px; }
.analysis-entry {
  display: flex; flex-direction: column; align-items: center;
  padding: 32px 16px; gap: 12px; text-align: center;
}
.analysis-entry__icon { font-size: 28px; color: #1565C0; }
.analysis-entry__title { font-size: 15px; font-weight: 700; color: #1a1a1a; }
.analysis-entry__desc { font-size: 12px; color: #888; line-height: 1.6; }
.analysis-generate-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #1565C0, #1976D2);
  color: #fff; border: none; border-radius: 10px;
  font-size: 13px; font-weight: 700; cursor: pointer;
}
.analysis-loading-spinner {
  width: 28px; height: 28px;
  border: 3px solid #e8f0fe; border-top-color: #1565C0;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.summary-section { display: flex; flex-direction: column; gap: 8px; }
.summary-section__title {
  font-size: 13px; font-weight: 700; color: #1565C0;
  padding-bottom: 6px; border-bottom: 1px solid #e8f0fe;
}
.summary-section__text { font-size: 13px; color: #444; line-height: 1.7; margin: 0; }
.improvement-item { background: #f7fbff; border-radius: 8px; padding: 10px 12px; }
.improvement-item__module { font-size: 12px; font-weight: 700; color: #1565C0; margin-bottom: 4px; }
.improvement-item__text  { font-size: 12px; color: #555; line-height: 1.6; margin: 0; }

/* ── Right footer ─────────────────────────────────────────────────────────── */
.right-footer {
  border-top: 1px solid #e8f0fe;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fff;
  flex-shrink: 0;
}

.footer-order-badge {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600; color: #1565C0;
}
.footer-badge-icon { width: 14px; height: 14px; flex-shrink: 0; }

.footer-actions {
  display: flex; gap: 8px; flex-wrap: wrap;
}

.footer-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 9px 14px;
  border: none; border-radius: 10px;
  font-size: 12px; font-weight: 700;
  cursor: pointer; transition: all 0.15s;
  white-space: nowrap;
}
.footer-btn-icon { width: 14px; height: 14px; flex-shrink: 0; }

.footer-btn--primary {
  background: linear-gradient(135deg, #1565C0, #1976D2);
  color: #fff;
  box-shadow: 0 2px 8px rgba(21,101,192,0.2);
}
.footer-btn--primary:hover { opacity: 0.9; }

.footer-btn--secondary {
  background: #f0f4fc; color: #1565C0;
}
.footer-btn--secondary:hover { background: #dbeafe; }

.footer-btn--outline {
  background: #fff; color: #555;
  border: 1px solid #d0d8f0;
}
.footer-btn--outline:hover { background: #f0f4fc; color: #1565C0; border-color: #90b4f0; }
.footer-btn--sent { color: #2e7d32; border-color: #a5d6a7; background: #f1f8f1; }

.footer-btn--restart {
  background: #fff5f5; color: #c62828;
  border: 1px solid #ffcdd2;
}
.footer-btn--restart:hover { background: #ffebee; border-color: #ef9a9a; }

.btn-spin-dark {
  width: 12px; height: 12px;
  border: 2px solid #ddd; border-top-color: #555;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
  flex-shrink: 0;
}

/* ── Bundle dialog ──────────────────────────────────────────────────────────── */
.overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  z-index: 9100;
}

.bundle-dialog {
  background: #fff; border-radius: 16px;
  width: 440px; max-width: 90vw;
  display: flex; flex-direction: column;
  box-shadow: 0 16px 48px rgba(0,0,0,0.2);
  max-height: 85vh;
  overflow: hidden;
}

.bundle-dialog__header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 20px 24px 16px;
  border-bottom: 1px solid #f0f4fc;
  flex-shrink: 0;
}
.bundle-dialog__title { font-size: 16px; font-weight: 700; color: #1a1a1a; }
.bundle-dialog__close {
  width: 28px; height: 28px; border-radius: 50%;
  background: #f0f4fc; border: none; cursor: pointer;
  font-size: 16px; color: #888; display: flex; align-items: center; justify-content: center;
}
.bundle-dialog__close:hover { background: #dbeafe; color: #1565C0; }

.bundle-dialog__body {
  flex: 1; overflow-y: auto; padding: 16px 24px;
  display: flex; flex-direction: column; gap: 12px;
}

.bundle-options { display: flex; flex-direction: column; gap: 8px; }
.bundle-option {
  display: flex; align-items: center; gap: 12px;
  padding: 12px; border: 1px solid #e0effe; border-radius: 10px;
  cursor: pointer; transition: all 0.15s;
}
.bundle-option:hover { background: #f7fbff; border-color: #90b4f0; }
.bundle-option--selected { background: #f0f6ff; border-color: #1565C0; }
.bundle-option--unavailable { opacity: 0.5; cursor: not-allowed; }
.bundle-option--unavailable:hover { background: transparent; border-color: #e0effe; }
.bundle-option__icon { width: 32px; height: 32px; flex-shrink: 0; }
.bundle-option__name { font-size: 13px; font-weight: 600; color: #1a1a1a; }
.bundle-option__desc { font-size: 11px; color: #888; margin-top: 2px; }

.bundle-select-all { display: flex; justify-content: flex-end; }
.select-all-btn {
  padding: 4px 10px; background: #f0f4fc; color: #1565C0;
  border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;
}
.select-all-btn:hover { background: #dbeafe; }

.export-modes {
  display: flex; gap: 16px; flex-wrap: wrap;
  padding: 10px 12px; background: #f7fbff;
  border: 1px solid #e0effe; border-radius: 10px;
}
.export-mode-item {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; cursor: pointer;
}

.email-input-row { display: flex; flex-direction: column; gap: 6px; }
.email-input {
  padding: 9px 12px; border: 1px solid #d0d8f0; border-radius: 8px;
  font-size: 13px; width: 100%; box-sizing: border-box;
}
.email-input:focus { outline: none; border-color: #1565C0; }
.email-status { font-size: 11px; color: #888; }

.bundle-dialog__footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #f0f4fc;
  flex-shrink: 0;
}
.bundle-status { font-size: 12px; color: #888; flex: 1; }
.bundle-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 24px;
  background: linear-gradient(135deg, #1565C0, #1976D2);
  color: #fff; border: none; border-radius: 12px;
  font-size: 14px; font-weight: 700; cursor: pointer;
  box-shadow: 0 4px 12px rgba(21,101,192,0.3);
}
.bundle-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-spin {
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
  border-radius: 50%; animation: spin 0.75s linear infinite; flex-shrink: 0;
}

/* ── WPS dialog ──────────────────────────────────────────────────────────── */
.wps-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 9200;
}
.wps-dialog {
  background: #fff; border-radius: 16px;
  padding: 28px 32px; width: 320px;
  display: flex; flex-direction: column; gap: 10px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.2);
}
.wps-title { font-size: 16px; font-weight: 700; color: #1a1a1a; margin: 0; }
.wps-sub   { font-size: 13px; color: #888; margin: 0; line-height: 1.6; }
.wps-actions { display: flex; gap: 10px; margin-top: 6px; }
.wps-cancel {
  flex: 1; padding: 11px; background: #f0f4fc; color: #64748b;
  border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.wps-cancel:hover { background: #dbeafe; color: #1565C0; }
.wps-confirm {
  flex: 1; padding: 11px;
  background: linear-gradient(135deg, #1565C0, #1976D2);
  color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.wps-confirm:hover { opacity: 0.9; }

/* transitions */
.overlay-fade-enter-active, .overlay-fade-leave-active { transition: opacity 0.2s ease; }
.overlay-fade-enter-from, .overlay-fade-leave-to { opacity: 0; }

/* collapsed layout */
.rdone-layout--before-collapsed .preview-area .preview-col:first-child {
  flex: none;
  width: 28px;
}
</style>
