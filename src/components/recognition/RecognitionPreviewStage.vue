<template>
  <div class="preview-stage">

    <!-- 左侧：预览图 -->
    <div class="preview-left">
      <div class="preview-header">
        <span class="preview-title">简历预览</span>
        <span class="preview-pages">共 {{ store.previewImages.length }} 页</span>
      </div>
      <div ref="imgListRef" class="preview-img-list">
        <div
          v-for="(img, idx) in store.previewImages"
          :key="idx"
          class="preview-img-wrap"
        >
          <img :src="img" :alt="`第 ${idx + 1} 页`" class="preview-img" />
          <div class="page-num">{{ idx + 1 }}</div>
        </div>
        <div v-if="!store.previewImages.length" class="preview-empty">
          <div class="preview-empty-icon">📄</div>
          <p>预览图生成中...</p>
        </div>
      </div>
    </div>

    <!-- 右侧：操作区 -->
    <div class="preview-right">

      <!-- 成功状态头 -->
      <div class="result-head">
        <div class="result-icon">
          <svg viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="20" fill="#dbeafe"/>
            <path d="M12 20l6 6 10-12" stroke="#1565C0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="result-text">
          <p class="result-main">简历已生成</p>
          <p class="result-sub">基于 {{ templateName }} · {{ identityLabel }}</p>
        </div>
      </div>

      <!-- 模板信息 -->
      <div class="info-card">
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
      </div>

      <!-- 操作按钮 -->
      <div class="action-group">
        <button class="action-btn action-btn--primary" @click="handleExport">
          <svg viewBox="0 0 20 20" fill="none" class="btn-icon">
            <path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3 15h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          导出 Word 简历
        </button>
        <button class="action-btn action-btn--secondary" @click="handleRestart">
          <svg viewBox="0 0 20 20" fill="none" class="btn-icon">
            <path d="M4 10 a6 6 0 1 1 1 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M4 14v-4H8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          重新开始
        </button>
      </div>

    </div>

    <!-- WPS 打开弹窗 -->
    <Teleport to="body">
      <div v-if="showWpsDialog" class="wps-overlay" @click.self="showWpsDialog = false">
        <div class="wps-dialog">
          <p class="wps-title">是否用 WPS 打开简历？</p>
          <p class="wps-sub">Word 文件已开始下载，你也可以选择直接用 WPS Office 打开</p>
          <div class="wps-actions">
            <button class="wps-cancel" @click="showWpsDialog = false">关闭</button>
            <button class="wps-confirm" @click="openWithWps">用 WPS 打开</button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRecognitionStore } from '@/stores/recognition'
import { downloadWordFile } from '@/api/word'

const store = useRecognitionStore()
const imgListRef    = ref(null)
const showWpsDialog = ref(false)

const TEMPLATE_NAMES = {
  word_r_1: '识别模板 R1',
  word_r_2: '识别模板 R2',
  word_r_3: '识别模板 R3',
  word_r_4: '识别模板 R4',
  word_r_5: '识别模板 R5',
}

const IDENTITY_LABELS = {
  work:        '全职求职',
  internship:  '实习求职',
  student:     '在校学生',
}

const POLISH_MODE_LABELS = {
  position: '岗位润色',
  self:     '自身润色',
}

const INTENSITY_LABELS = {
  senior:   '资深版',
  standard: '标准版',
  basic:    '基础版',
}

const templateName   = computed(() => TEMPLATE_NAMES[store.selectedTemplateId]   || store.selectedTemplateId)
const identityLabel  = computed(() => IDENTITY_LABELS[store.userType]            || store.userType)
const polishModeLabel= computed(() => POLISH_MODE_LABELS[store.polishMode]       || store.polishMode)
const intensityLabel = computed(() => INTENSITY_LABELS[store.polishingIntensity] || store.polishingIntensity)

function handleExport() {
  if (!store.wordDownloadUrl) return
  downloadWordFile(store.wordDownloadUrl, `简历_${store.selectedTemplateId}.docx`)
  showWpsDialog.value = true
}

function openWithWps() {
  if (!store.wordDownloadUrl) return
  const encoded = encodeURIComponent(store.wordDownloadUrl)
  window.open(`wps://d?url=${encoded}`, '_blank')
  showWpsDialog.value = false
}

function handleRestart() {
  store.reset()
}
</script>

<style scoped>
/* ── Shell ── */
.preview-stage {
  flex: 1;
  display: flex;
  overflow: hidden;
  gap: 0;
}

/* ── Left: preview ── */
.preview-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e8f0fe;
  overflow: hidden;
}

.preview-header {
  padding: 18px 24px 14px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  border-bottom: 1px solid #e8f0fe;
  flex-shrink: 0;
}

.preview-title {
  font-size: 16px;
  font-weight: 700;
  color: #1a1a1a;
}

.preview-pages {
  font-size: 12px;
  color: #888;
}

.preview-img-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  background: #f0f4fc;
}

.preview-img-wrap {
  position: relative;
  width: 100%;
  max-width: 600px;
}

.preview-img {
  width: 100%;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  display: block;
}

.page-num {
  position: absolute;
  bottom: 8px;
  right: 12px;
  background: rgba(0,0,0,0.45);
  color: #fff;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
}

.preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 0;
  color: #aaa;
}

.preview-empty-icon { font-size: 48px; }

/* ── Right: actions ── */
.preview-right {
  width: 280px;
  flex-shrink: 0;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
  background: #fff;
}

/* ── Result head ── */
.result-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.result-icon { width: 40px; height: 40px; flex-shrink: 0; }
.result-icon svg { width: 100%; height: 100%; }

.result-main {
  font-size: 16px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
}

.result-sub {
  font-size: 12px;
  color: #888;
  margin: 2px 0 0;
}

/* ── Info card ── */
.info-card {
  background: #f7fbff;
  border: 1px solid #e0effe;
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.info-key { color: #888; }
.info-val { color: #1a1a1a; font-weight: 500; }

/* ── Actions ── */
.action-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 13px 20px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.2px;
}

.btn-icon { width: 18px; height: 18px; }

.action-btn--primary {
  background: linear-gradient(135deg, #1565C0, #1976D2);
  color: #fff;
  box-shadow: 0 4px 12px rgba(21,101,192,0.3);
}

.action-btn--primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.action-btn--secondary {
  background: #f0f4fc;
  color: #64748b;
}

.action-btn--secondary:hover {
  background: #dbeafe;
  color: #1565C0;
}

/* ── WPS dialog ── */
.wps-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9100;
}

.wps-dialog {
  background: #fff;
  border-radius: 16px;
  padding: 28px 32px;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.2);
}

.wps-title {
  font-size: 16px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
}

.wps-sub {
  font-size: 13px;
  color: #888;
  margin: 0;
  line-height: 1.6;
}

.wps-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}

.wps-cancel {
  flex: 1;
  padding: 11px;
  background: #f0f4fc;
  color: #64748b;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.wps-cancel:hover { background: #dbeafe; color: #1565C0; }

.wps-confirm {
  flex: 1;
  padding: 11px;
  background: linear-gradient(135deg, #1565C0, #1976D2);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.wps-confirm:hover { opacity: 0.9; }
</style>
