<template>
  <div class="ready-stage">

    <!-- 左侧：提取数据预览 -->
    <div class="ready-left">
      <div class="ready-left__header">
        <span class="ready-left__title">已识别内容</span>
        <span class="ready-left__sub">客户在小程序端完成AI识别并补填，以下为识别结果</span>
      </div>
      <div class="ready-left__body">
        <!-- 基本信息 -->
        <div v-if="basicInfo" class="data-card">
          <div class="data-card__title">基本信息</div>
          <div class="data-card__rows">
            <div v-for="(val, key) in basicInfo" :key="key" class="data-card__row">
              <span class="data-card__key">{{ BASIC_LABELS[key] || key }}</span>
              <span class="data-card__val">{{ val || '—' }}</span>
            </div>
          </div>
        </div>

        <!-- 各模块汇总 -->
        <div
          v-for="(items, moduleKey) in careerModules"
          :key="moduleKey"
          class="data-card"
        >
          <div class="data-card__title">
            {{ MODULE_LABELS[moduleKey] || moduleKey }}
            <span class="data-card__count">{{ Array.isArray(items) ? items.length : 1 }} 条</span>
          </div>
          <div v-if="Array.isArray(items)" class="data-card__module-list">
            <div v-for="(item, idx) in items" :key="idx" class="data-card__module-item">
              <span class="data-card__item-index">{{ idx + 1 }}</span>
              <span class="data-card__item-desc">{{ getItemDesc(moduleKey, item) }}</span>
            </div>
          </div>
          <div v-else class="data-card__text-preview">
            {{ (items?.content || '').slice(0, 100) }}{{ (items?.content || '').length > 100 ? '…' : '' }}
          </div>
        </div>

        <div v-if="!hasData" class="ready-empty">
          <p>未收到识别数据，将使用空白模板开始制作</p>
        </div>
      </div>
    </div>

    <!-- 右侧：工单信息 + 操作 -->
    <div class="ready-right">

      <!-- 工单标签 -->
      <div v-if="store.commissionOrderData" class="order-badge">
        <span class="order-badge__icon">
          <svg viewBox="0 0 16 16" fill="none">
            <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.4"/>
            <path d="M4 7h8M4 10h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="order-badge__id">{{ store.commissionOrderData.orderId }}</span>
        <span class="order-badge__type">简历定制</span>
      </div>

      <!-- 制作参数卡片 -->
      <div class="info-card">
        <div class="info-card__title">制作参数</div>
        <div class="info-row">
          <span class="info-key">模板</span>
          <span class="info-val">{{ templateName }}</span>
        </div>
        <div class="info-row">
          <span class="info-key">身份</span>
          <span class="info-val">{{ identityLabel }}</span>
        </div>
        <div class="info-row">
          <span class="info-key">润色模式</span>
          <span class="info-val">{{ polishModeLabel }}</span>
        </div>
        <div class="info-row">
          <span class="info-key">润色强度</span>
          <span class="info-val">{{ intensityLabel }}</span>
        </div>
        <div v-if="store.targetPosition" class="info-row">
          <span class="info-key">目标岗位</span>
          <span class="info-val">{{ store.targetPosition }}</span>
        </div>
        <div v-if="store.clientResumeFileName" class="info-row">
          <span class="info-key">原始简历</span>
          <span class="info-val file-name">{{ store.clientResumeFileName }}</span>
        </div>
      </div>

      <!-- 识别统计 -->
      <div class="stats-card">
        <div class="stats-card__title">识别概况</div>
        <div class="stats-row" v-for="(count, key) in moduleCounts" :key="key">
          <span class="stats-key">{{ MODULE_LABELS[key] || key }}</span>
          <span class="stats-val">{{ count }} 条</span>
        </div>
        <div v-if="!Object.keys(moduleCounts).length" class="stats-empty">无多条目模块</div>
      </div>

      <!-- 操作区 -->
      <div class="action-group">
        <button
          class="btn btn--primary"
          :disabled="starting"
          @click="handleStart"
        >
          <span v-if="starting" class="btn-spin"></span>
          <svg v-else viewBox="0 0 20 20" fill="none" class="btn-icon">
            <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.8"/>
            <path d="M8 7l5 3-5 3V7z" fill="currentColor"/>
          </svg>
          {{ starting ? '启动中...' : '开始制作' }}
        </button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useRecognitionStore } from '@/stores/recognition'
import { useRecognitionPolish } from '@/composables/useRecognitionPolish'
import { MODULE_LABELS } from '@/config/recognitionTemplateConfig'

const store = useRecognitionStore()
const { runPolishAndGenerate } = useRecognitionPolish()

const starting = ref(false)

// ── Labels ──────────────────────────────────────────────────────────────────
const TEMPLATE_NAMES = {
  word_r_1: '识别模板 R1', word_r_2: '识别模板 R2',
  word_r_3: '识别模板 R3', word_r_4: '识别模板 R4',
  word_r_5: '识别模板 R5',
}
const IDENTITY_LABELS = { work: '全职求职', internship: '实习求职', student: '在校学生' }
const POLISH_LABELS   = { position: '岗位润色', self: '自身润色' }
const INTENSITY_LABELS= { senior: '资深版', standard: '标准版', basic: '基础版' }

// 与识别提取（recognition_extract_all）及小程序定制一致：仅展示四项核心基本信息
const BASIC_LABELS = {
  name: '姓名', phone: '电话', email: '邮箱', gender: '性别',
}

const templateName   = computed(() => TEMPLATE_NAMES[store.selectedTemplateId]   || store.selectedTemplateId)
const identityLabel  = computed(() => IDENTITY_LABELS[store.userType]            || store.userType)
const polishModeLabel= computed(() => POLISH_LABELS[store.polishMode]            || store.polishMode)
const intensityLabel = computed(() => INTENSITY_LABELS[store.polishingIntensity] || store.polishingIntensity)

// ── Data display ────────────────────────────────────────────────────────────
const CAREER_MODULE_KEYS = ['work', 'internship', 'project', 'school_experience', 'education', 'skill', 'certificate']

// extractedData is a flat object: { basic: {...}, education: [...], work: [...], ... }
const basicInfo = computed(() => {
  const b = store.extractedData?.basic
  if (!b) return null
  const result = {}
  for (const key of Object.keys(BASIC_LABELS)) {
    if (b[key]) result[key] = b[key]
  }
  return Object.keys(result).length ? result : null
})

const careerModules = computed(() => {
  const data = store.extractedData
  if (!data) return {}
  const result = {}
  for (const key of CAREER_MODULE_KEYS) {
    if (data[key]) result[key] = data[key]
  }
  if (data.self_evaluation) result['self_evaluation'] = data.self_evaluation
  return result
})

const hasData = computed(() => basicInfo.value || Object.keys(careerModules.value).length > 0)

const moduleCounts = computed(() => {
  const data = store.extractedData
  if (!data) return {}
  const result = {}
  for (const key of CAREER_MODULE_KEYS) {
    if (Array.isArray(data[key]) && data[key].length > 0) result[key] = data[key].length
  }
  return result
})

function getItemDesc(moduleKey, item) {
  if (!item) return '—'
  const parts = []
  if (item.company || item.school || item.projectName || item.skillName || item.experienceName) {
    parts.push(item.company || item.school || item.projectName || item.skillName || item.experienceName || '')
  }
  if (item.position || item.major || item.role || item.level) {
    parts.push(item.position || item.major || item.role || item.level || '')
  }
  if (item.startDate) {
    const dateRange = item.startDate + (item.endDate ? ' ~ ' + item.endDate : '')
    parts.push(dateRange)
  }
  return parts.filter(Boolean).join(' · ') || '记录 ' + (parts.length + 1)
}

// ── Start ────────────────────────────────────────────────────────────────────
async function handleStart() {
  if (starting.value) return
  if (!store.selectedTemplateId) {
    ElMessage.error('缺少模板配置，请联系管理员重新接取工单')
    return
  }
  starting.value = true
  try {
    await runPolishAndGenerate()
  } finally {
    starting.value = false
  }
}
</script>

<style scoped>
.ready-stage {
  flex: 1;
  display: flex;
  overflow: hidden;
  gap: 0;
}

/* Left panel */
.ready-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e8f0fe;
  overflow: hidden;
}

.ready-left__header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid #e8f0fe;
  flex-shrink: 0;
}

.ready-left__title {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: #1a1a1a;
}

.ready-left__sub {
  display: block;
  font-size: 12px;
  color: #888;
  margin-top: 4px;
}

.ready-left__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #f8faff;
}

/* Data card */
.data-card {
  background: #fff;
  border: 1px solid #e0effe;
  border-radius: 12px;
  padding: 14px 16px;
}

.data-card__title {
  font-size: 13px;
  font-weight: 700;
  color: #1565C0;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.data-card__count {
  font-size: 11px;
  font-weight: 500;
  color: #fff;
  background: #1565C0;
  padding: 1px 6px;
  border-radius: 10px;
}

.data-card__rows { display: flex; flex-direction: column; gap: 6px; }
.data-card__row  { display: flex; justify-content: space-between; font-size: 13px; }
.data-card__key  { color: #888; flex-shrink: 0; }
.data-card__val  { color: #1a1a1a; font-weight: 500; max-width: 60%; text-align: right; }

.data-card__module-list { display: flex; flex-direction: column; gap: 6px; }
.data-card__module-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.data-card__item-index {
  width: 20px; height: 20px;
  background: #e8f0fe; color: #1565C0;
  font-size: 11px; font-weight: 700;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.data-card__item-desc { color: #444; }

.data-card__text-preview {
  font-size: 13px;
  color: #555;
  line-height: 1.6;
  max-height: 80px;
  overflow: hidden;
}

.ready-empty {
  text-align: center;
  color: #aaa;
  font-size: 13px;
  padding: 40px 0;
}

/* Right panel */
.ready-right {
  width: 300px;
  flex-shrink: 0;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  background: #fff;
}

/* Order badge */
.order-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #e8f0fe;
  border: 1px solid #90b4f0;
  border-radius: 10px;
  flex-shrink: 0;
}
.order-badge__icon { width: 16px; height: 16px; color: #1565C0; flex-shrink: 0; }
.order-badge__id   { font-size: 12px; font-weight: 700; color: #1565C0; flex: 1; }
.order-badge__type { font-size: 11px; font-weight: 600; color: #2e7d32; background: #e8f5e9; padding: 2px 6px; border-radius: 6px; flex-shrink: 0; }

/* Info card */
.info-card {
  background: #f7fbff;
  border: 1px solid #e0effe;
  border-radius: 12px;
  padding: 14px 16px;
}

.info-card__title {
  font-size: 12px;
  font-weight: 700;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  padding: 4px 0;
}
.info-key { color: #888; }
.info-val { color: #1a1a1a; font-weight: 500; }
.file-name { font-size: 11px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Stats card */
.stats-card {
  background: #f7fbff;
  border: 1px solid #e0effe;
  border-radius: 12px;
  padding: 14px 16px;
}
.stats-card__title {
  font-size: 12px; font-weight: 700; color: #888;
  text-transform: uppercase; letter-spacing: 0.5px;
  margin-bottom: 10px;
}
.stats-row {
  display: flex; justify-content: space-between;
  font-size: 13px; padding: 3px 0;
}
.stats-key { color: #555; }
.stats-val { font-weight: 600; color: #1565C0; }
.stats-empty { font-size: 12px; color: #aaa; }

/* Actions */
.action-group { display: flex; flex-direction: column; gap: 10px; margin-top: auto; }

.btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 14px 20px;
  border: none; border-radius: 12px;
  font-size: 14px; font-weight: 700;
  cursor: pointer; transition: all 0.15s;
}
.btn-icon { width: 18px; height: 18px; }
.btn-spin {
  width: 16px; height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.btn--primary {
  background: linear-gradient(135deg, #1565C0, #1976D2);
  color: #fff;
  box-shadow: 0 4px 12px rgba(21,101,192,0.3);
}
.btn--primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn--primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
</style>
