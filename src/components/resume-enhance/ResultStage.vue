<template>
  <div class="result-stage">
    <div class="result-layout">

      <!-- 左侧：简历预览图（大板块） -->
      <div class="preview-panel">
        <div class="preview-pages">
          <div
            v-for="(url, i) in store.originalPreviewUrls"
            :key="i"
            class="preview-img-wrap"
            :style="{ width: `${previewZoom * 100}%` }"
          >
            <img
              :src="url"
              class="preview-img"
              @click="openImagePreview(url)"
            />
          </div>
          <div v-if="!store.originalPreviewUrls.length" class="preview-placeholder">
            <span>预览图生成中...</span>
          </div>
        </div>

        <!-- 识别模块标签（内联显示，有内容的模块蓝色高亮） -->
        <div
          v-if="store.extractedSections && Object.keys(store.extractedSections).length"
          class="module-chips"
        >
          <span class="module-chips-label">已识别：</span>
          <span
            v-for="(section, key) in store.extractedSections"
            :key="key"
            class="module-chip"
            :class="(Array.isArray(section) && section.length > 0) ? 'module-chip--active' : 'module-chip--empty'"
          >
            {{ moduleLabelMap[key] || key }}
            <span v-if="Array.isArray(section) && section.length" class="module-chip-count">{{ section.length }}</span>
          </span>
        </div>

        <!-- 右下角缩放滑块（有预览图时显示） -->
        <div v-if="store.originalPreviewUrls.length" class="zoom-control">
          <span class="zoom-label">{{ Math.round(previewZoom * 100) }}%</span>
          <input
            v-model.number="previewZoom"
            type="range"
            min="0.5"
            max="1.5"
            step="0.05"
            class="zoom-slider"
          />
        </div>
      </div>

      <!-- 右侧：分析报告 + 按钮 -->
      <div class="right-panel">
        <!-- 分析报告内容 -->
        <div class="report-card">
          <div class="report-header">
            <span class="report-title">AI分析报告</span>
            <span v-if="store.scoreValue" class="report-score" :style="{ color: scoreColors.primary }">
              {{ store.scoreValue }} {{ store.scoreLevel }}
            </span>
          </div>
          <div class="report-body" v-if="store.analysisResult">
            <!-- 五维雷达图（岗位润色模式有 dimensionScores 时显示） -->
            <div v-if="store.analysisResult.dimensionScores" class="radar-wrap">
              <canvas ref="radarCanvas" class="radar-canvas" :width="radarW" :height="radarH" />
              <!-- 图例 -->
              <div class="radar-legend">
                <div class="radar-legend-item">
                  <div class="radar-legend-dot radar-legend-dot--industry" />
                  <span class="radar-legend-text">行业平均</span>
                </div>
                <div class="radar-legend-item">
                  <div class="radar-legend-dot" :style="{ background: scoreColors.primary }" />
                  <span class="radar-legend-text">您的简历</span>
                </div>
              </div>
              <!-- 五维评分条 -->
              <div class="radar-score-strip">
                <div v-for="dim in radarDims" :key="dim.key" class="radar-score-item">
                  <span class="radar-dim-label">{{ dim.label }}</span>
                  <span class="radar-dim-val" :style="{ color: scoreColors.primary }">
                    {{ store.analysisResult.dimensionScores[dim.key] }}/5
                  </span>
                </div>
              </div>
              <!-- 比较结论 -->
              <div v-if="radarCompareSummary" class="radar-compare" :class="`radar-compare--${radarCompareType}`">
                {{ radarCompareSummary }}
              </div>
            </div>
            <!-- 各维度文字分析 -->
            <div
              v-for="(item, i) in analysisItems"
              :key="i"
              class="report-item"
            >
              <div class="report-item__header">
                <span class="report-item__title">{{ item.title }}</span>
                <span v-if="item.score" class="report-item__score" :style="{ color: scoreColors.primary }">
                  {{ item.score }}/5
                </span>
              </div>
              <p class="report-item__content">{{ item.content }}</p>
            </div>
          </div>
          <div v-else class="report-empty">暂无分析内容</div>
        </div>

        <!-- 下方按钮区 -->
        <!-- 仅代做工单模式下显示（commissionStore.activeOrderId 存在） -->
        <button
          v-if="commissionStore.activeOrderId"
          class="action-btn action-btn--analysis"
          :disabled="sendingAnalysis"
          @click="handleSendAnalysis"
        >
          {{ sendingAnalysis ? '回传中…' : analysisSent ? '✅ 分析已回传' : '回传分析报告' }}
        </button>
        <button class="action-btn action-btn--primary" @click="handleStartPolish">
          开始润色
        </button>
      </div>

    </div>

    <!-- 输出格式选择弹窗 -->
    <BottomSheet v-model="showFormatModal" title="选择润色输出格式" :closable="false">
      <p class="format-sub">{{ store.detectedFormat ? '已根据原简历格式自动推荐，可手动切换' : 'AI将按照您选择的格式对简历内容进行润色' }}，自我评价始终以自然段输出</p>
      <div class="format-options">

        <!-- 自然段润色 -->
        <div
          class="format-option"
          :class="{ 'format-option--active': selectedFormat === 'paragraph' }"
          @click="onSelectFormat('paragraph')"
        >
          <div class="format-option__content">
            <div class="format-option__title-row">
              <span class="format-option__name">自然段润色</span>
              <span v-if="store.detectedFormat === 'paragraph'" class="format-recommend">系统推荐</span>
            </div>
            <div class="format-option__desc">AI将润色后的内容以流畅的自然段落形式输出，适合大多数简历风格</div>
          </div>
          <div class="format-check-circle" :class="{ 'format-check-circle--active': selectedFormat === 'paragraph' }">
            <span v-if="selectedFormat === 'paragraph'">✓</span>
          </div>
        </div>

        <!-- 小标题润色 -->
        <div
          class="format-option"
          :class="{ 'format-option--active': selectedFormat === 'subtitle' }"
          @click="onSelectFormat('subtitle')"
        >
          <div class="format-option__content">
            <div class="format-option__title-row">
              <span class="format-option__name">小标题润色</span>
              <span v-if="store.detectedFormat === 'subtitle'" class="format-recommend">系统推荐</span>
            </div>
            <div class="format-option__desc">AI将内容拆解为多个小标题模块归纳总结，结构清晰，突出核心能力</div>
            <!-- 小标题排列方式子选项（仅选中时展开） -->
            <div v-if="selectedFormat === 'subtitle'" class="subtitle-align-row" @click.stop>
              <span class="subtitle-align-label">排列方式</span>
              <div class="subtitle-align-toggle">
                <div
                  class="subtitle-align-btn"
                  :class="{ 'subtitle-align-btn--active': subtitleAlign === 'left' }"
                  @click="subtitleAlign = 'left'"
                >靠左对齐</div>
                <div
                  class="subtitle-align-btn"
                  :class="{ 'subtitle-align-btn--active': subtitleAlign === 'compact' }"
                  @click="subtitleAlign = 'compact'"
                >有序排列</div>
              </div>
            </div>
          </div>
          <div class="format-check-circle" :class="{ 'format-check-circle--active': selectedFormat === 'subtitle' }">
            <span v-if="selectedFormat === 'subtitle'">✓</span>
          </div>
        </div>

        <!-- 自由设置 -->
        <div
          class="format-option"
          :class="{ 'format-option--active': selectedFormat === 'custom', 'format-option--custom-open': selectedFormat === 'custom' }"
          @click="onSelectFormat('custom')"
        >
          <div class="format-option__content">
            <div class="format-option__title-row">
              <span class="format-option__name">自由设置</span>
            </div>
            <div class="format-option__desc">为每个模块单独指定输出格式，灵活匹配不同经历的表达风格</div>

            <!-- 各模块独立配置面板（仅选中时展开） -->
            <div
              v-if="selectedFormat === 'custom'"
              class="format-custom-panel"
              @click.stop
            >
              <template v-if="customModuleItems.length > 0">
                <div
                  v-for="mod in customModuleItems"
                  :key="mod.moduleType"
                  class="format-custom-row"
                  :class="{ 'format-custom-row--expanded': isSubtitleFormat(mod.format) }"
                >
                  <div class="format-custom-row__main">
                    <span class="format-custom-label">{{ mod.label }}</span>
                    <div class="format-custom-toggle">
                      <div
                        class="format-toggle-btn"
                        :class="{ 'format-toggle-btn--active': mod.format === 'paragraph' }"
                        @click="toggleModuleFormat(mod.moduleType, 'paragraph')"
                      >自然段</div>
                      <div
                        class="format-toggle-btn"
                        :class="{ 'format-toggle-btn--active': isSubtitleFormat(mod.format) }"
                        @click="!isSubtitleFormat(mod.format) && toggleModuleFormat(mod.moduleType, 'subtitle')"
                      >小标题</div>
                    </div>
                  </div>
                  <!-- 小标题排列方式子选项 -->
                  <div v-if="isSubtitleFormat(mod.format)" class="format-custom-subtitle-align">
                    <span class="subtitle-align-label">排列方式</span>
                    <div class="subtitle-align-toggle">
                      <div
                        class="subtitle-align-btn"
                        :class="{ 'subtitle-align-btn--active': mod.format === 'subtitle' }"
                        @click="toggleModuleFormat(mod.moduleType, 'subtitle')"
                      >靠左对齐</div>
                      <div
                        class="subtitle-align-btn"
                        :class="{ 'subtitle-align-btn--active': mod.format === 'subtitle_compact' }"
                        @click="toggleModuleFormat(mod.moduleType, 'subtitle_compact')"
                      >有序排列</div>
                    </div>
                  </div>
                </div>
                <!-- 自我评价固定项 -->
                <div class="format-custom-row format-custom-row--fixed">
                  <div class="format-custom-row__main">
                    <span class="format-custom-label">自我评价</span>
                    <span class="format-custom-fixed">自然段（固定）</span>
                  </div>
                </div>
              </template>
              <div v-else class="format-custom-empty">未识别到可单独配置的模块</div>
            </div>
          </div>
          <div class="format-check-circle" :class="{ 'format-check-circle--active': selectedFormat === 'custom' }">
            <span v-if="selectedFormat === 'custom'">✓</span>
          </div>
        </div>

      </div>
      <el-button
        type="primary"
        size="large"
        class="format-confirm-btn"
        :disabled="!selectedFormat"
        @click="confirmFormat"
      >
        确定开始润色
      </el-button>
    </BottomSheet>

  </div>

  <!-- 润色进度弹窗（Teleport 到 body） -->
  <Teleport to="body">
    <div v-if="showPolishingModal" class="polishing-overlay">
      <div class="polishing-modal">
        <div class="polishing-modal__title">AI正在润色简历</div>
        <div class="polishing-modal__status">{{ polishStatusText }}</div>
        <div class="polishing-modal__bar-wrap">
          <div class="polishing-modal__bar" :style="{ width: polishProgress + '%' }" />
        </div>
        <div class="polishing-modal__pct">{{ polishProgress }}%</div>
        <div class="polishing-modal__hint">请耐心等待，润色完成后自动跳转</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useResumeEnhanceStore } from '@/stores/resumeEnhance'
import { useCommissionStore } from '@/stores/commission'
import { getReportColors } from '@/utils/canvas'
import BottomSheet from '@/components/common/BottomSheet.vue'
import { useResumePolish } from '@/composables/useResumePolish'
import { apiSendCommissionAnalysis } from '@/api/commission'

const store = useResumeEnhanceStore()
const commissionStore = useCommissionStore()
const { progress: polishProgress, statusText: polishStatusText, runPolish } = useResumePolish()

// ── 回传分析报告 ───────────────────────────────────────────────────────────
const sendingAnalysis = ref(false)
const analysisSent    = ref(false)

async function handleSendAnalysis() {
  const orderId = commissionStore.activeOrderId
  if (!orderId) { ElMessage.warning('当前没有关联的代做工单'); return }
  if (!store.analysisResult) { ElMessage.warning('暂无分析报告可回传'); return }

  sendingAnalysis.value = true
  try {
    const clientAnalysisData = {
      score:           store.scoreValue   || 0,
      level:           store.scoreLevel   || '',
      ...store.analysisResult,
    }
    await apiSendCommissionAnalysis({ _id: orderId, clientAnalysisData })
    analysisSent.value = true
    ElMessage.success('分析报告已回传至小程序')
  } catch (e) {
    ElMessage.error('回传失败：' + (e.message || '请检查网络'))
  } finally {
    sendingAnalysis.value = false
  }
}

const showFormatModal = ref(false)
const showPolishingModal = ref(false)
const selectedFormat = ref('')
const subtitleAlign  = ref('left')   // 'left'（靠左对齐）| 'compact'（有序排列）
const customModuleItems = ref([])
const previewZoom = ref(0.5)

// ── Radar chart ─────────────────────────────────────────────────────────────
const radarCanvas = ref(null)
const radarW = 280
const radarH = 260
const radarDims = [
  { key: 'fit',       label: '岗位契合' },
  { key: 'highlight', label: '共同亮点' },
  { key: 'star',      label: 'STAR叙事' },
  { key: 'core',      label: '核心要求' },
  { key: 'quantify',  label: '结果量化' },
]
const radarCompareSummary = ref('')
const radarCompareType = ref('equal')
// 行业平均（生成一次后缓存，跟随 store）
let cachedIndustryAvg = null

function genIndustryAvg() {
  const g = () => { const r = Math.random(); return r < 0.4 ? 3 : r < 0.8 ? 4 : 5 }
  return { fit: g(), highlight: g(), star: g(), core: g(), quantify: g() }
}

function drawRadar() {
  const ds = store.analysisResult?.dimensionScores
  if (!ds || !radarCanvas.value) return

  if (!cachedIndustryAvg) cachedIndustryAvg = genIndustryAvg()
  const ia = cachedIndustryAvg

  const userValues = [ds.fit, ds.highlight, ds.star, ds.core, ds.quantify]
  const indValues  = [ia.fit, ia.highlight, ia.star, ia.core, ia.quantify]

  const userTotal = userValues.reduce((a, b) => a + b, 0)
  const indTotal  = indValues.reduce((a, b) => a + b, 0)
  const diff = userTotal - indTotal
  if (diff > 0)      { radarCompareSummary.value = `您的简历综合得分超越行业平均水平 ${diff} 分`; radarCompareType.value = 'ahead' }
  else if (diff < 0) { radarCompareSummary.value = `您的简历综合得分落后行业平均水平 ${Math.abs(diff)} 分`; radarCompareType.value = 'behind' }
  else               { radarCompareSummary.value = '您的简历综合得分与行业平均水平持平'; radarCompareType.value = 'equal' }

  const scoreColor = scoreColors.value
  const userStroke = scoreColor.primary
  const userFill   = scoreColor.primary.replace(')', ', 0.2)').replace('rgb', 'rgba')
  const indStroke  = '#2196F3'
  const indFill    = 'rgba(33,150,243,0.15)'

  const n = 5, W = radarW, H = radarH
  const cx = W / 2, cy = H / 2 + 6
  const maxR = 82, labelR = 106, maxScore = 5
  const startAngle = -Math.PI / 2
  const getPoint = (r, i) => {
    const a = startAngle + i * (Math.PI * 2 / n)
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  }

  const canvas = radarCanvas.value
  const dpr = window.devicePixelRatio || 1
  canvas.width  = W * dpr
  canvas.height = H * dpr
  canvas.style.width  = W + 'px'
  canvas.style.height = H + 'px'
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, W, H)

  // Grid
  for (let lv = 5; lv >= 1; lv--) {
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const p = getPoint(maxR * lv / 5, i)
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
    ctx.fillStyle = lv % 2 === 0 ? 'rgba(230,240,255,0.7)' : 'rgba(248,251,255,0.9)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(100,160,230,0.35)'
    ctx.lineWidth = 0.8
    ctx.stroke()
  }
  // Axes
  for (let i = 0; i < n; i++) {
    const p = getPoint(maxR, i)
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y)
    ctx.strokeStyle = 'rgba(100,160,230,0.4)'; ctx.lineWidth = 0.8; ctx.stroke()
  }
  // Industry polygon
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const p = getPoint(maxR * indValues[i] / maxScore, i)
    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
  }
  ctx.closePath(); ctx.fillStyle = indFill; ctx.fill()
  ctx.strokeStyle = indStroke; ctx.lineWidth = 1.5; ctx.stroke()
  // User polygon
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const p = getPoint(maxR * userValues[i] / maxScore, i)
    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
  }
  ctx.closePath(); ctx.fillStyle = userFill; ctx.fill()
  ctx.strokeStyle = userStroke; ctx.lineWidth = 2; ctx.stroke()
  // Dots + score text
  for (let i = 0; i < n; i++) {
    const p = getPoint(maxR * userValues[i] / maxScore, i)
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = userStroke; ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = userStroke; ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(String(userValues[i]), p.x, p.y - 5)
  }
  // Labels
  ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < n; i++) {
    const lp = getPoint(labelR, i)
    ctx.textAlign = 'center'
    ctx.fillText(radarDims[i].label, lp.x, lp.y)
  }
}

onMounted(() => { nextTick(drawRadar) })
watch(() => store.analysisResult, () => { nextTick(drawRadar) })

const scoreColors = computed(() => getReportColors(store.scoreLevel))

const moduleLabelMap = {
  work: '工作经历', internship: '实习经历', project: '项目经历',
  school_experience: '在校经历', self_evaluation: '自我评价'
}


const analysisItems = computed(() => {
  const r = store.analysisResult
  if (!r) return []
  const mode = r.mode || 'position'
  const items = []
  const ds = r.dimensionScores || {}

  if (mode === 'position') {
    const labels = ['岗位契合', '共同亮点', 'STAR叙事', '核心要求', '结果量化', '身份用词']
    const dsKeys = ['fit', 'highlight', 'star', 'core', 'quantify', null]
    labels.forEach((title, i) => {
      const content = r[`item${i + 1}`]
      if (content) items.push({ title, score: dsKeys[i] ? (ds[dsKeys[i]] || null) : null, content })
    })
    if (r.item7) items.push({ title: '综合分析', score: null, content: r.item7 })
  } else {
    const selfLabels = ['STAR叙事', '结果量化', '技术栈补全', '身份用词']
    selfLabels.forEach((title, i) => {
      const content = r[`item${i + 1}`]
      if (content) items.push({ title, score: null, content })
    })
    if (r.item6) items.push({ title: '综合评价', score: null, content: r.item6 })
  }
  return items
})

function openImagePreview(url) {
  window.open(url, '_blank')
}

function handleStartPolish() {
  const hasSub = detectSubtitleFormat()
  store.detectedFormat = hasSub ? 'subtitle' : 'paragraph'
  selectedFormat.value = store.detectedFormat
  subtitleAlign.value  = 'left'
  customModuleItems.value = []
  showFormatModal.value = true
}

/** 判断 format 是否属于小标题类（包含 compact 变体） */
function isSubtitleFormat(fmt) {
  return fmt === 'subtitle' || fmt === 'subtitle_compact'
}

function detectSubtitleFormat() {
  const sections = store.extractedSections
  if (!sections) return false
  for (const key of Object.keys(sections)) {
    const items = Array.isArray(sections[key]) ? sections[key] : [sections[key]]
    for (const item of items) {
      if (item?.contentFormat === 'subtitle') return true
    }
  }
  return false
}

function buildCustomModuleItems() {
  const moduleLabels = {
    work: '工作经历', internship: '实习经历',
    project: '项目经历', school_experience: '在校经历'
  }
  const sections = store.extractedSections || {}
  const items = []
  for (const [moduleType, label] of Object.entries(moduleLabels)) {
    const arr = (Array.isArray(sections[moduleType]) ? sections[moduleType] : [sections[moduleType]])
      .filter(i => i?.originalText?.trim())
    if (arr.length === 0) continue
    const hasSubtitle = arr.some(i => i.contentFormat === 'subtitle')
    // 自由设置初始 format：检测到小标题则默认 'subtitle'（靠左对齐），否则 'paragraph'
    items.push({ moduleType, label, format: hasSubtitle ? 'subtitle' : 'paragraph' })
  }
  return items
}

function onSelectFormat(fmt) {
  selectedFormat.value = fmt
  if (fmt === 'custom' && customModuleItems.value.length === 0) {
    customModuleItems.value = buildCustomModuleItems()
  }
}

function toggleModuleFormat(moduleType, fmt) {
  customModuleItems.value = customModuleItems.value.map(m =>
    m.moduleType === moduleType ? { ...m, format: fmt } : m
  )
}

async function confirmFormat() {
  if (!selectedFormat.value) return
  // 全局小标题：根据 subtitleAlign 映射为最终 format 值
  if (selectedFormat.value === 'subtitle') {
    store.outputFormat = subtitleAlign.value === 'compact' ? 'subtitle_compact' : 'subtitle'
  } else {
    store.outputFormat = selectedFormat.value
  }
  if (selectedFormat.value === 'custom') {
    store.customModuleItems = customModuleItems.value
  }
  showFormatModal.value = false
  showPolishingModal.value = true
  await runPolish()
  showPolishingModal.value = false
}
</script>

<style scoped>
.result-stage {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.result-layout {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 12px 16px 16px;
  overflow: hidden;
  min-height: 0;
}

/* ─── 左侧：简历预览（大板块） ─── */
.preview-panel {
  flex: 1;
  min-width: 0;
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 1px 12px rgba(0,0,0,0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

.preview-pages {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  overflow: auto;
  min-height: 0;
}

.preview-img-wrap {
  flex-shrink: 0;
}

.preview-img {
  width: 100%;
  border-radius: 8px;
  cursor: zoom-in;
  border: 1px solid #eee;
  display: block;
  vertical-align: top;
}

.preview-placeholder {
  flex: 1;
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #bbb;
  font-size: 14px;
}

/* 右下角缩放滑块 */
.zoom-control {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255,255,255,0.95);
  padding: 8px 12px;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
}

.zoom-label {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  min-width: 36px;
}

.zoom-slider {
  width: 100px;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: #e0e0e0;
  border-radius: 3px;
}

.zoom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #1565C0;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}

.zoom-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #1565C0;
  cursor: pointer;
  border: none;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}

/* ─── 右侧：分析报告 + 按钮 ─── */
.right-panel {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.report-card {
  flex: 1;
  min-height: 0;
  background: #fff;
  border-radius: 14px 14px 0 0;
  box-shadow: 0 1px 12px rgba(0,0,0,0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.report-header {
  padding: 16px 18px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.report-title {
  font-size: 15px;
  font-weight: 700;
  color: #1a1a1a;
}

.report-score {
  font-size: 15px;
  font-weight: 700;
}

.report-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 18px 18px;
}

.report-item {
  padding: 12px 14px;
  background: #f8f9ff;
  border-radius: 10px;
  border-left: 3px solid #1565C0;
  margin-bottom: 10px;
}

.report-item:last-child { margin-bottom: 0; }

.report-item__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.report-item__title { font-size: 13px; font-weight: 600; color: #1a1a1a; }
.report-item__score { font-size: 13px; font-weight: 700; }
.report-item__content { font-size: 12px; color: #555; line-height: 1.65; margin: 0; }

.report-empty {
  padding: 24px;
  text-align: center;
  color: #bbb;
  font-size: 13px;
}

/* ─── Radar chart ─── */
.radar-wrap {
  margin-bottom: 12px;
  background: #f8f9ff;
  border-radius: 12px;
  padding: 10px 12px 12px;
}

.radar-canvas {
  display: block;
  margin: 0 auto;
}

.radar-legend {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 6px;
}

.radar-legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.radar-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.radar-legend-dot--industry { background: #2196F3; }

.radar-legend-text { font-size: 11px; color: #666; }

.radar-score-strip {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  padding: 8px 4px 4px;
  border-top: 1px solid #eaf0fb;
}

.radar-score-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.radar-dim-label {
  font-size: 10px;
  color: #999;
}

.radar-dim-val {
  font-size: 12px;
  font-weight: 700;
}

.radar-compare {
  margin-top: 8px;
  font-size: 11px;
  text-align: center;
  padding: 4px 8px;
  border-radius: 6px;
}

.radar-compare--ahead  { color: #16a34a; background: #dcfce7; }
.radar-compare--behind { color: #dc2626; background: #fee2e2; }
.radar-compare--equal  { color: #888; background: #f5f5f5; }

/* 操作按钮 */
.action-btn {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, transform 0.08s;
}

.action-btn:active { transform: scale(0.98); }

.action-btn--primary {
  background: #1565C0;
  color: #fff;
}

.action-btn--primary:hover { background: #1976D2; }

.action-btn--secondary {
  background: #e3f2fd;
  color: #1565C0;
}

.action-btn--secondary:hover { background: #bbdefb; }

.action-btn--analysis {
  background: #e8f5e9;
  color: #2e7d32;
}

.action-btn--analysis:hover:not(:disabled) { background: #c8e6c9; }
.action-btn--analysis:disabled { opacity: 0.65; cursor: not-allowed; }

/* 格式选项 */
.format-sub {
  font-size: 12px;
  color: #999;
  margin: -4px 0 14px;
  line-height: 1.6;
}

.format-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.format-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1.5px solid #e8e8e8;
  cursor: pointer;
  transition: all 0.15s;
}

.format-option:hover { border-color: #1565C0; background: #f0f6ff; }
.format-option--active { border-color: #1565C0; background: #eff6ff; }

.format-option__content {
  flex: 1;
  min-width: 0;
}

.format-option__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.format-option__name { font-size: 14px; font-weight: 600; color: #1a1a1a; }

.format-option__desc { font-size: 12px; color: #888; line-height: 1.5; }

.format-recommend {
  font-size: 10px;
  background: #fef3c7;
  color: #d97706;
  padding: 2px 7px;
  border-radius: 20px;
  font-weight: 600;
  flex-shrink: 0;
}

/* 选中时的推荐标签颜色保持 */
.format-option--active .format-recommend {
  background: #fef3c7;
  color: #d97706;
}

.format-check-circle {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid #d0d0d0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  transition: all 0.15s;
  margin-top: 2px;
}

.format-check-circle--active {
  background: #1565C0;
  border-color: #1565C0;
}

/* 自由设置：模块配置面板 */
.format-custom-panel {
  margin-top: 12px;
  padding: 12px;
  background: #f8faff;
  border-radius: 10px;
  border: 1px solid #dbeafe;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.format-custom-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.format-custom-row__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.format-custom-label {
  font-size: 12px;
  font-weight: 500;
  color: #444;
  flex: 1;
}

.format-custom-toggle {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.format-toggle-btn {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  color: #888;
  background: #fff;
  border: 1px solid #e0e0e0;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.format-toggle-btn:hover { border-color: #93c5fd; color: #1565C0; }

.format-toggle-btn--active {
  background: #1565C0;
  color: #fff;
  border-color: #1565C0;
  font-weight: 600;
}

.format-custom-row--fixed .format-custom-label { color: #aaa; }

.format-custom-fixed {
  font-size: 11px;
  color: #aaa;
  background: #f0f0f0;
  padding: 3px 9px;
  border-radius: 6px;
}

.format-custom-empty {
  font-size: 12px;
  color: #bbb;
  text-align: center;
  padding: 8px 0;
}

/* 小标题排列方式子选项（全局格式选择 & 自由设置） */
.subtitle-align-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
  padding: 6px 10px;
  background: #f0f6ff;
  border-radius: 8px;
}

.format-custom-subtitle-align {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 10px;
  background: #f0f6ff;
  border-radius: 8px;
}

.subtitle-align-label {
  font-size: 11px;
  color: #1565C0;
  font-weight: 500;
  flex-shrink: 0;
}

.subtitle-align-toggle {
  display: flex;
  gap: 4px;
}

.subtitle-align-btn {
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  color: #888;
  background: #fff;
  border: 1px solid #bfdbfe;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.subtitle-align-btn:hover { border-color: #1565C0; color: #1565C0; }

.subtitle-align-btn--active {
  background: #1565C0;
  color: #fff;
  border-color: #1565C0;
  font-weight: 600;
}

.format-confirm-btn { width: 100%; height: 48px; border-radius: 12px; }

/* 模块列表 */
/* ─── 识别模块内联标签条（预览图下方） ─── */
.module-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 10px 4px 2px;
  flex-shrink: 0;
}

.module-chips-label {
  font-size: 12px;
  font-weight: 600;
  color: #1565C0;
  flex-shrink: 0;
  line-height: 1.5;
}

.module-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  white-space: nowrap;
}

.module-chip--active {
  background: #e3f0ff;
  color: #1565C0;
  border: 1px solid #90caf9;
}

.module-chip--empty {
  background: #f2f2f2;
  color: #bbb;
  border: 1px solid #e0e0e0;
}

.module-chip-count {
  background: #1565C0;
  color: #fff;
  border-radius: 10px;
  padding: 0 5px;
  font-size: 11px;
  font-weight: 600;
  min-width: 16px;
  text-align: center;
}

/* ─── 润色进度弹窗 ─── */
.polishing-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.polishing-modal {
  background: #fff;
  border-radius: 20px;
  padding: 36px 40px;
  width: 380px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.polishing-modal__title {
  font-size: 18px;
  font-weight: 700;
  color: #1a1a1a;
}

.polishing-modal__status {
  font-size: 13px;
  color: #1565C0;
  min-height: 18px;
  text-align: center;
}

.polishing-modal__bar-wrap {
  width: 100%;
  height: 6px;
  background: #eee;
  border-radius: 999px;
  overflow: hidden;
}

.polishing-modal__bar {
  height: 100%;
  background: linear-gradient(90deg, #1565C0, #42A5F5);
  border-radius: 999px;
  transition: width 0.4s ease;
}

.polishing-modal__pct {
  font-size: 28px;
  font-weight: 800;
  color: #1565C0;
  line-height: 1;
}

.polishing-modal__hint {
  font-size: 12px;
  color: #aaa;
  text-align: center;
}

</style>
