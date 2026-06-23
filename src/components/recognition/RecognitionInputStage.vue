<template>
  <div class="recognition-input" @dragover.prevent="isDragOver = true" @dragleave.self="isDragOver = false" @drop.prevent="handleDrop">
    <input ref="fileInputRef" type="file" accept=".docx" style="display:none" @change="handleFileChange" />

    <!-- 拖拽遮罩 -->
    <div v-if="isDragOver" class="drag-overlay"><span>松开以上传简历</span></div>

    <!-- 强度下拉背景遮罩 -->
    <div v-if="showIntensity" class="intensity-backdrop" @click="showIntensity = false" />

    <div class="form-wrap">

      <!-- ① 求职者身份 -->
      <div class="section-label">求职者身份</div>
      <div class="identity-row">
        <button
          v-for="item in identityOptions"
          :key="item.value"
          :class="['identity-chip', { 'identity-chip--on': store.userType === item.value }]"
          @click="onSelectUserType(item.value)"
        >
          <span class="identity-name">{{ item.label }}</span>
          <span class="identity-sub">{{ item.sub }}</span>
        </button>
      </div>

      <!-- ② 选择模板 -->
      <div class="section-label">
        选择简历模板
        <span class="section-sub">（共5套识别专属模板，模板上传后即可预览）</span>
      </div>
      <div class="template-grid">
        <div
          v-for="tpl in templateList"
          :key="tpl.id"
          :class="['tpl-card', { 'tpl-card--on': store.selectedTemplateId === tpl.id }]"
          @click="onSelectTemplate(tpl.id)"
        >
          <!-- 预览图区域：图片有效时显示，否则显示占位符 -->
          <div class="tpl-preview">
            <img
              v-if="tpl.previewUrl"
              :src="tpl.previewUrl"
              :alt="tpl.name"
              class="tpl-img"
            />
            <div v-else class="tpl-placeholder">
              <span class="tpl-num">{{ tpl.num }}</span>
            </div>
          </div>
          <div class="tpl-footer">
            <span class="tpl-name">{{ tpl.name }}</span>
            <span v-if="store.selectedTemplateId === tpl.id" class="tpl-check">✓</span>
          </div>
        </div>
      </div>

      <!-- 模板模块清单（选择模板后显示）-->
      <transition name="fade-slide">
        <div v-if="store.selectedTemplateId && selectedTemplateModules.length" class="module-list-panel">
          <div class="module-list-head">
            <span class="module-list-title">AI将识别以下模块</span>
            <span class="module-list-hint">（根据当前模板 + 身份确定）</span>
          </div>
          <div class="module-tags">
            <span
              v-for="mod in selectedTemplateModules"
              :key="mod.key"
              :class="['module-tag', { 'module-tag--polish': mod.polish }]"
            >
              {{ mod.label }}
              <span class="module-tag-count">×{{ mod.count }}</span>
              <span v-if="mod.polish" class="module-tag-badge">AI润色</span>
            </span>
          </div>
        </div>
      </transition>

      <!-- ③ 简历内容输入 -->
      <div class="section-label">简历内容</div>
      <div class="content-tab-row">
        <button
          :class="['content-tab', { 'content-tab--on': store.inputTab === 'word' }]"
          @click="store.inputTab = 'word'"
        >上传Word文档</button>
        <button
          :class="['content-tab', { 'content-tab--on': store.inputTab === 'text' }]"
          @click="store.inputTab = 'text'"
        >粘贴文本内容</button>
      </div>

      <!-- 上传Word -->
      <template v-if="store.inputTab === 'word'">
        <div
          class="upload-block"
          :class="{
            'upload-block--done': store.uploadedFileName,
            'upload-block--drag': isDragOver,
            'upload-block--loading': store.isExtractingWord
          }"
          @click="!store.isExtractingWord && triggerFileInput()"
        >
          <template v-if="store.isExtractingWord">
            <svg class="upload-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#93c5fd" stroke-width="3"/>
              <path d="M12 2 a10 10 0 0 1 10 10" stroke="#1565C0" stroke-width="3" stroke-linecap="round"/>
            </svg>
            <span class="upload-label" style="color:#1565C0">正在提取文档内容...</span>
          </template>
          <template v-else-if="uploading">
            <div class="upload-progress-wrap">
              <div class="upload-progress-bar" :style="{ width: uploadProgress + '%' }"></div>
            </div>
            <span class="upload-hint">上传中 {{ uploadProgress }}%</span>
          </template>
          <template v-else-if="store.uploadedFileName">
            <span class="upload-done-icon">✓</span>
            <span class="upload-filename">{{ store.uploadedFileName }}</span>
            <span class="upload-rehint">点击重新上传</span>
          </template>
          <template v-else>
            <span class="upload-plus">+</span>
            <span class="upload-label">上传原始简历</span>
            <span class="upload-hint">.docx 格式</span>
          </template>
        </div>
      </template>

      <!-- 粘贴文本 -->
      <template v-else>
        <textarea
          v-model="store.textContent"
          class="field-block text-area"
          rows="10"
          placeholder="请粘贴您的简历文本内容，示例格式：

姓名：张三
手机：138xxxx0000
邮箱：zhangsan@example.com

工作经历：
XX科技公司  产品经理  2021.03-2023.06
负责...

教育经历：
XX大学 计算机科学与技术 本科 2017.09-2021.07"
        />
      </template>

      <!-- ④ 润色模式 -->
      <div class="section-label">润色模式</div>
      <div class="mode-switch">
        <button
          :class="['mode-tab', { 'mode-tab--on': store.polishMode === 'position' }]"
          @click="store.polishMode = 'position'"
        >岗位润色</button>
        <button
          :class="['mode-tab', { 'mode-tab--on': store.polishMode === 'self' }]"
          @click="store.polishMode = 'self'"
        >自身润色</button>
      </div>

      <!-- 岗位润色专属 -->
      <template v-if="store.polishMode === 'position'">
        <div class="two-col">
          <input
            v-model="store.targetPosition"
            class="field-block field-input"
            placeholder="目标岗位名称 *"
          />
          <div class="field-block intensity-block" @click.stop="showIntensity = !showIntensity">
            <span :class="store.polishingIntensity ? 'intensity-val' : 'field-ph'">
              {{ intensityLabel || '润色强度 *' }}
            </span>
            <span class="field-arrow" :class="{ open: showIntensity }">›</span>
            <transition name="fade-drop">
              <div v-if="showIntensity" class="intensity-drop" @click.stop>
                <div
                  v-for="opt in intensityOptions"
                  :key="opt.value"
                  :class="['intensity-opt', { 'intensity-opt--on': store.polishingIntensity === opt.value }]"
                  @click="selectIntensity(opt)"
                >
                  <span class="opt-name">{{ opt.label }}</span>
                  <span class="opt-desc">{{ opt.desc }}</span>
                </div>
              </div>
            </transition>
          </div>
        </div>
        <textarea
          v-model="store.jobDescription"
          class="field-block jd-area"
          placeholder="目标岗位JD（粘贴招聘要求，AI将针对岗位精准润色，选填）"
          rows="5"
        />
      </template>

      <!-- 自身润色专属 -->
      <template v-else>
        <div class="field-block intensity-block" @click.stop="showIntensity = !showIntensity">
          <span :class="store.polishingIntensity ? 'intensity-val' : 'field-ph'">
            {{ intensityLabel || '润色强度 *' }}
          </span>
          <span class="field-arrow" :class="{ open: showIntensity }">›</span>
          <transition name="fade-drop">
            <div v-if="showIntensity" class="intensity-drop" @click.stop>
              <div
                v-for="opt in intensityOptions"
                :key="opt.value"
                :class="['intensity-opt', { 'intensity-opt--on': store.polishingIntensity === opt.value }]"
                @click="selectIntensity(opt)"
              >
                <span class="opt-name">{{ opt.label }}</span>
                <span class="opt-desc">{{ opt.desc }}</span>
              </div>
            </div>
          </transition>
        </div>
      </template>

      <!-- ⑤ 开始识别 -->
      <div class="submit-row">
        <button
          class="submit-btn"
          :class="{ 'submit-btn--off': !canStart }"
          :disabled="!canStart"
          @click="handleStart"
        >
          开始识别
        </button>
      </div>

    </div>

    <!-- 识别加载弹窗 -->
    <Teleport to="body">
      <div v-if="store.phase === 'recognizing'" class="recognizing-overlay">
        <div class="recognizing-modal">
          <div class="recognizing-ring-wrap">
            <svg class="recognizing-ring-svg" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="26" stroke="rgba(255,255,255,0.2)" stroke-width="5"/>
              <circle
                cx="32" cy="32" r="26"
                stroke="white" stroke-width="5"
                stroke-linecap="round"
                stroke-dasharray="163.4"
                stroke-dashoffset="40.8"
                transform="rotate(-90 32 32)"
              />
            </svg>
            <svg class="recognizing-icon-svg" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="6" stroke="white" stroke-width="1.8"/>
              <path d="M16 16l3 3" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </div>
          <p class="recognizing-title">AI识别中</p>
          <p class="recognizing-status">{{ store.recognizingStatus }}</p>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useRecognitionStore } from '@/stores/recognition'
import { useRecognitionExtract } from '@/composables/useRecognitionExtract'
import { getRecognitionTemplateUrls } from '@/api/recognition'
import {
  getRequiredModules,
  getActualRecordCounts,
  POLISH_ELIGIBLE_MODULES,
  MODULE_LABELS,
} from '@/config/recognitionTemplateConfig'

const store = useRecognitionStore()
const { uploadAndExtractWord, runExtraction } = useRecognitionExtract()

const fileInputRef   = ref(null)
const uploading      = ref(false)
const uploadProgress = ref(0)
const isDragOver     = ref(false)
const showIntensity  = ref(false)

const identityOptions = [
  { value: 'work',       label: '全职求职', sub: '有工作经验' },
  { value: 'internship', label: '实习求职', sub: '在校/应届生' },
  { value: 'student',    label: '在校学生', sub: '以校内经历为主' },
]

const intensityOptions = [
  { value: 'senior',   label: '资深版', desc: '强调专业深度与核心贡献，适合有丰富经验的求职者' },
  { value: 'standard', label: '标准版', desc: '平衡专业能力与学习能力，适合有一定基础的求职者' },
  { value: 'basic',    label: '基础版', desc: '强调学习能力与成长潜力，适合基础阶段的求职者' },
]

// 模板列表（预览图由云函数动态获取，暂无时显示占位符）
const templateList = computed(() => [
  { id: 'word_r_1', name: '简历模板 R1', num: 'R1', previewUrl: templatePreviewUrls.value['word_r_1'] || '' },
  { id: 'word_r_2', name: '简历模板 R2', num: 'R2', previewUrl: templatePreviewUrls.value['word_r_2'] || '' },
  { id: 'word_r_3', name: '简历模板 R3', num: 'R3', previewUrl: templatePreviewUrls.value['word_r_3'] || '' },
  { id: 'word_r_4', name: '简历模板 R4', num: 'R4', previewUrl: templatePreviewUrls.value['word_r_4'] || '' },
  { id: 'word_r_5', name: '简历模板 R5', num: 'R5', previewUrl: templatePreviewUrls.value['word_r_5'] || '' },
])

const templatePreviewUrls = ref({})

async function loadTemplatePreviewUrls() {
  try {
    const res = await getRecognitionTemplateUrls({ userType: store.userType })
    if (res && res.success && res.urls) {
      templatePreviewUrls.value = res.urls
    }
  } catch {
    // 静默失败：显示占位符
  }
}

onMounted(() => {
  loadTemplatePreviewUrls()
})

const intensityLabel = computed(() =>
  intensityOptions.find(o => o.value === store.polishingIntensity)?.label || ''
)

const hasContent = computed(() => {
  if (store.inputTab === 'word') return !!store.uploadedFileId && !store.isExtractingWord
  return store.textContent.trim().length > 20
})

const canStart = computed(() => {
  if (!store.selectedTemplateId) return false
  if (!hasContent.value) return false
  if (!store.polishingIntensity) return false
  if (store.polishMode === 'position' && !store.targetPosition.trim()) return false
  return true
})

// 当前模板需要的模块清单（供确认页和本页展示）
const selectedTemplateModules = computed(() => {
  if (!store.selectedTemplateId) return []
  const modules = getRequiredModules(store.selectedTemplateId, store.userType)
  const counts  = getActualRecordCounts(store.selectedTemplateId, store.userType)
  return modules.map(key => ({
    key,
    label:   MODULE_LABELS[key] || key,
    count:   counts[key] || 0,
    polish:  POLISH_ELIGIBLE_MODULES.has(key),
  }))
})

// 同步模板配置到 store（供 useRecognitionExtract / useRecognitionPolish 使用）
function syncTemplateConfig() {
  if (!store.selectedTemplateId) return
  store.templateModules      = getRequiredModules(store.selectedTemplateId, store.userType)
  store.templateRecordCounts = getActualRecordCounts(store.selectedTemplateId, store.userType)
}

function onSelectTemplate(id) {
  store.selectedTemplateId = id
  syncTemplateConfig()
}

function onSelectUserType(type) {
  if (store.userType === type) return
  store.userType = type
  templatePreviewUrls.value = {}
  loadTemplatePreviewUrls()
  syncTemplateConfig()  // 身份变化时重新同步（模块组合可能变化）
}

function selectIntensity(opt) {
  store.polishingIntensity     = opt.value
  store.polishingIntensityDesc = opt.desc
  showIntensity.value = false
}

function triggerFileInput() { fileInputRef.value?.click() }

function handleDrop(e) {
  isDragOver.value = false
  const file = e.dataTransfer?.files[0]
  if (file) processFile(file)
}

function handleFileChange(e) {
  const file = e.target.files[0]
  if (file) processFile(file)
  e.target.value = ''
}

async function processFile(file) {
  if (!file.name.toLowerCase().endsWith('.docx')) {
    ElMessage.error('请上传 .docx 格式的 Word 文件')
    return
  }
  if (file.size > 50 * 1024 * 1024) {
    ElMessage.error('文件大小不能超过 50MB')
    return
  }
  uploading.value      = true
  uploadProgress.value = 0
  try {
    const res = await uploadAndExtractWord(file, (pct) => { uploadProgress.value = pct })
    if (res.success) {
      ElMessage.success('文件上传并提取成功')
    }
  } finally {
    uploading.value      = false
    uploadProgress.value = 0
  }
}

async function handleStart() {
  if (!canStart.value) return
  if (store.inputTab === 'text') {
    store.extractedRawText = store.textContent
  }
  await runExtraction()
}
</script>

<style scoped>
/* ── Shell ── */
.recognition-input {
  flex: 1;
  overflow-y: auto;
  padding: 28px 48px 52px;
  position: relative;
}

.form-wrap {
  width: 100%;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Section label ── */
.section-label {
  font-size: 13px;
  font-weight: 700;
  color: #1565C0;
  letter-spacing: 0.3px;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-sub {
  font-size: 11px;
  font-weight: 400;
  color: #93c5fd;
  letter-spacing: 0;
}

/* ── Identity ── */
.identity-row {
  display: flex;
  gap: 12px;
}

.identity-chip {
  flex: 1;
  background: #dbeafe;
  border: 2px solid transparent;
  border-radius: 12px;
  padding: 12px 8px 10px;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.identity-chip:hover { background: #bfdbfe; }

.identity-chip--on {
  background: #1565C0;
  border-color: #1565C0;
}

.identity-name { font-size: 14px; font-weight: 600; color: #1565C0; }
.identity-chip--on .identity-name { color: #fff; }
.identity-sub { font-size: 11px; color: #60a5fa; }
.identity-chip--on .identity-sub { color: rgba(255,255,255,0.7); }

/* ── Template grid ── */
.template-grid {
  display: flex;
  gap: 12px;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 4px;
}

.tpl-card {
  flex: 0 0 calc(20% - 10px);
  min-width: 110px;
  background: #dbeafe;
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tpl-card:hover { background: #bfdbfe; border-color: #93c5fd; }

.tpl-card--on {
  background: #eff6ff;
  border-color: #1565C0;
  box-shadow: 0 2px 8px rgba(21,101,192,0.2);
}

.tpl-preview {
  aspect-ratio: 3/4;
  background: #e0effe;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.tpl-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tpl-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
}

.tpl-num {
  font-size: 22px;
  font-weight: 800;
  color: #1565C0;
  opacity: 0.5;
}

.tpl-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
}

.tpl-name {
  font-size: 12px;
  font-weight: 600;
  color: #1565C0;
}

.tpl-check {
  font-size: 13px;
  color: #1565C0;
  font-weight: 700;
}

/* ── Content tab ── */
.content-tab-row {
  display: flex;
  gap: 0;
  background: #dbeafe;
  border-radius: 10px;
  padding: 4px;
  align-self: flex-start;
}

.content-tab {
  background: transparent;
  border: none;
  font-size: 13px;
  font-weight: 600;
  color: #64a0d4;
  cursor: pointer;
  padding: 7px 18px;
  border-radius: 8px;
  transition: all 0.15s;
  white-space: nowrap;
}

.content-tab:hover { color: #1565C0; }

.content-tab--on {
  background: #1565C0;
  color: #fff;
}

/* ── Upload block ── */
.upload-block {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 110px;
  background: #dbeafe;
  border-radius: 14px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.upload-block:hover     { background: #bfdbfe; }
.upload-block--drag     { background: #bfdbfe; box-shadow: 0 0 0 2px #1565C0; }
.upload-block--done     { background: #1565C0; border-color: #1565C0; }
.upload-block--done:hover { background: #1251A3; }
.upload-block--loading  { cursor: not-allowed; opacity: 0.8; }

.upload-spin {
  width: 28px;
  height: 28px;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.upload-plus    { font-size: 26px; color: #1565C0; font-weight: 300; line-height: 1; }
.upload-label   { font-size: 15px; color: #1565C0; font-weight: 600; }
.upload-hint    { font-size: 12px; color: #93c5fd; }
.upload-done-icon { font-size: 18px; color: #fff; }
.upload-filename  {
  font-size: 14px; color: #fff; font-weight: 600;
  max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.upload-rehint    { font-size: 11px; color: rgba(255,255,255,0.65); }

.upload-progress-wrap {
  width: 70%;
  height: 6px;
  background: rgba(255,255,255,0.3);
  border-radius: 3px;
  overflow: hidden;
}
.upload-progress-bar {
  height: 100%;
  background: #1565C0;
  border-radius: 3px;
  transition: width 0.3s ease;
}

/* ── Drag overlay ── */
.drag-overlay {
  position: absolute;
  inset: 0;
  background: rgba(21,101,192,0.1);
  border: 3px dashed #1565C0;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #1565C0;
  font-weight: 600;
  z-index: 20;
  pointer-events: none;
}

/* ── Text area ── */
.text-area {
  resize: none;
  font-family: inherit;
  line-height: 1.6;
}

/* ── Mode switch ── */
.mode-switch {
  display: flex;
  align-items: center;
  gap: 0;
  background: #dbeafe;
  border-radius: 10px;
  padding: 4px;
  align-self: flex-start;
}

.mode-tab {
  background: transparent;
  border: none;
  font-size: 14px;
  font-weight: 600;
  color: #64a0d4;
  cursor: pointer;
  padding: 7px 20px;
  border-radius: 8px;
  transition: all 0.15s;
}

.mode-tab:hover { color: #1565C0; }
.mode-tab--on { background: #1565C0; color: #fff; }

/* ── Shared field block ── */
.field-block {
  background: #dbeafe;
  border: none;
  border-radius: 14px;
  padding: 16px 18px;
  font-size: 14px;
  color: #1a1a1a;
  outline: none;
  transition: background 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}

.field-block:focus {
  background: #bfdbfe;
  box-shadow: 0 0 0 2px rgba(21,101,192,0.2);
}

.field-ph  { color: #93c5fd; }
.field-input { width: 100%; }

/* ── Two-col ── */
.two-col {
  display: flex;
  gap: 12px;
}

.two-col > .field-block { flex: 1; }

/* ── JD area ── */
.jd-area { resize: none; width: 100%; font-family: inherit; line-height: 1.6; }

/* ── Intensity ── */
.intensity-block {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  position: relative;
  user-select: none;
  width: 100%;
}

.intensity-val { font-size: 14px; color: #1a1a1a; font-weight: 500; }

.field-arrow {
  font-size: 18px;
  color: #64a0d4;
  transition: transform 0.2s;
  display: inline-block;
}

.field-arrow.open { transform: rotate(90deg); }

.intensity-backdrop {
  position: fixed;
  inset: 0;
  z-index: 98;
}

.intensity-drop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #e0effe;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(21,101,192,0.15);
  z-index: 99;
  overflow: hidden;
}

.intensity-opt {
  padding: 13px 16px;
  cursor: pointer;
  transition: background 0.12s;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.intensity-opt:hover { background: #eff6ff; }
.intensity-opt--on   { background: #dbeafe; }

.opt-name { font-size: 13px; font-weight: 600; color: #1565C0; }
.opt-desc { font-size: 11px; color: #93c5fd; }

.fade-drop-enter-active, .fade-drop-leave-active { transition: opacity 0.15s, transform 0.15s; }
.fade-drop-enter-from, .fade-drop-leave-to { opacity: 0; transform: translateY(-6px); }

/* ── Submit ── */
.submit-row {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}

.submit-btn {
  padding: 13px 40px;
  background: linear-gradient(135deg, #1565C0, #1976D2);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.5px;
  transition: opacity 0.15s, transform 0.1s;
  box-shadow: 0 4px 12px rgba(21,101,192,0.35);
}

.submit-btn:hover:not(.submit-btn--off) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.submit-btn--off {
  background: #e2e8f0;
  color: #aaa;
  box-shadow: none;
  cursor: not-allowed;
}

/* ── Module list panel ── */
.module-list-panel {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border: 1px solid #bfdbfe;
  border-radius: 14px;
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.module-list-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.module-list-title {
  font-size: 12px;
  font-weight: 700;
  color: #1565C0;
}

.module-list-hint {
  font-size: 11px;
  color: #93c5fd;
}

.module-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.module-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: #fff;
  border: 1px solid #bfdbfe;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: #1565C0;
}

.module-tag--polish {
  background: #eff6ff;
  border-color: #93c5fd;
}

.module-tag-count {
  font-size: 11px;
  color: #60a5fa;
  font-weight: 400;
}

.module-tag-badge {
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: #1565C0;
  border-radius: 10px;
  padding: 1px 6px;
  margin-left: 2px;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ── Recognizing overlay ── */
.recognizing-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 40, 80, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
}

.recognizing-modal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.recognizing-ring-wrap {
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.recognizing-ring-svg {
  position: absolute;
  inset: 0;
  animation: spin 1.4s linear infinite;
}

.recognizing-icon-svg {
  width: 30px;
  height: 30px;
  z-index: 1;
}

.recognizing-title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin: 0;
}

.recognizing-status {
  font-size: 13px;
  color: rgba(255,255,255,0.7);
  margin: 0;
}
</style>
