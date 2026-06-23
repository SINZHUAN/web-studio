<template>
  <div
    class="upload-stage"
    @dragover.prevent="isDragOver = true"
    @dragleave.self="isDragOver = false"
    @drop.prevent="handleDrop"
  >
    <input ref="fileInputRef" type="file" accept=".docx,.doc,.pdf" style="display:none" @change="handleFileChange" />

    <!-- 拖拽遮罩 -->
    <div v-if="isDragOver" class="drag-overlay"><span>松开以上传简历</span></div>

    <!-- 强度下拉背景遮罩（点空白关闭） -->
    <div v-if="showIntensity" class="intensity-backdrop" @click="showIntensity = false" />

    <div class="form-wrap">

      <!-- ① 润色模式切换 -->
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

      <!-- ② 上传简历 -->
      <div
        class="upload-block"
        :class="{
          'upload-block--done': store.uploadedFileName,
          'upload-block--drag': isDragOver
        }"
        @click="triggerFileInput"
      >
        <template v-if="uploading">
          <div class="upload-block__progress">
            <el-progress :percentage="uploadProgress" :stroke-width="5" style="flex:1" />
            <span class="upload-hint">上传中...</span>
          </div>
        </template>
        <template v-else-if="store.uploadedFileName">
          <span class="upload-done-icon">✓</span>
          <span class="upload-filename">{{ store.uploadedFileName }}</span>
          <span class="upload-rehint">点击重新上传</span>
        </template>
        <template v-else>
          <span class="upload-plus">+</span>
          <span class="upload-label">上传原始简历</span>
          <span class="upload-hint">.docx</span>
        </template>
      </div>

      <!-- ③ 求职者身份（两种模式都需要） -->
      <div class="identity-row">
        <button
          v-for="item in identityOptions"
          :key="item.value"
          :class="['identity-chip', { 'identity-chip--on': store.userIdentity === item.value }]"
          @click="store.userIdentity = item.value"
        >
          <span class="identity-name">{{ item.label }}</span>
          <span class="identity-sub">{{ item.sub }}</span>
        </button>
      </div>

      <!-- ─── 岗位润色专属字段 ─── -->
      <template v-if="store.polishMode === 'position'">

        <!-- ④-A 目标岗位名称 + 润色强度（并列） -->
        <div class="two-col">
          <input
            v-model="store.targetPosition"
            class="field-block field-input"
            placeholder="目标岗位名称 *"
          />
          <!-- 润色强度 -->
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

        <!-- ④-B 目标岗位JD -->
        <textarea
          v-model="store.jobDescription"
          class="field-block jd-area"
          placeholder="目标岗位JD（粘贴招聘要求，AI将针对岗位精准润色）"
          rows="6"
        />

      </template>

      <!-- ─── 自身润色专属字段 ─── -->
      <template v-else-if="store.polishMode === 'self'">

        <!-- ④-C 润色强度（全宽） -->
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


      <!-- ⑤ 发起分析 -->
      <div class="submit-row">
        <button
          class="submit-btn"
          :class="{ 'submit-btn--off': !canStart || uploading || showAnalyzingModal }"
          :disabled="!canStart || uploading || showAnalyzingModal"
          @click="handleStart"
        >
          发起分析
        </button>
      </div>

    </div>

    <!-- 分析加载弹窗 -->
    <Teleport to="body">
      <div v-if="showAnalyzingModal" class="analyzing-overlay">
        <div class="analyzing-modal">
          <div class="analyzing-ring-wrap">
            <svg class="analyzing-ring" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="27" fill="none" stroke="#e8f0fe" stroke-width="5"/>
              <circle
                cx="32" cy="32" r="27" fill="none"
                stroke="#1565C0" stroke-width="5"
                stroke-linecap="round"
                stroke-dasharray="169.6"
                :stroke-dashoffset="169.6 * (1 - analyzeProgress / 100)"
                transform="rotate(-90 32 32)"
                style="transition: stroke-dashoffset 0.4s ease"
              />
            </svg>
            <span class="analyzing-pct">{{ analyzeProgress }}%</span>
          </div>
          <p class="analyzing-status">{{ analyzeStatusText }}</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useResumeEnhanceStore } from '@/stores/resumeEnhance'
import { useWorkorderStore } from '@/stores/workorder'
import { useResumeAnalyze } from '@/composables/useResumeAnalyze'
import { uploadWordFile } from '@/api/word'

const store            = useResumeEnhanceStore()
const workorderStore   = useWorkorderStore()
const fileInputRef   = ref(null)
const uploading      = ref(false)
const uploadProgress = ref(0)
const isDragOver     = ref(false)
const showIntensity  = ref(false)

const { progress: analyzeProgress, statusText: analyzeStatusText, runAnalysis } = useResumeAnalyze()
const showAnalyzingModal = ref(false)

// 三种润色强度（与小程序保持一致）
const intensityOptions = [
  {
    value: 'senior',
    label: '资深版',
    desc: '强调专业深度与核心贡献，适合有丰富经验的求职者'
  },
  {
    value: 'standard',
    label: '标准版',
    desc: '平衡专业能力与学习能力，适合有一定基础的求职者'
  },
  {
    value: 'basic',
    label: '基础版',
    desc: '强调学习能力与成长潜力，适合基础阶段的求职者'
  },
]

const identityOptions = [
  { value: 'work',       label: '全职求职', sub: '有工作经验' },
  { value: 'internship', label: '实习求职', sub: '在校/应届生' },
  { value: 'student',    label: '在校学生', sub: '以校内经历为主' },
]

const intensityLabel = computed(() =>
  intensityOptions.find(o => o.value === store.polishingIntensity)?.label || ''
)

// 岗位润色：需要 文件+模式+岗位名+强度+身份
// 自身润色：需要 文件+模式+强度+身份
const canStart = computed(() => {
  if (!store.uploadedFileId || !store.polishingIntensity || !store.userIdentity) return false
  if (store.polishMode === 'position') return !!store.targetPosition.trim()
  return true
})

function selectIntensity(opt) {
  store.polishingIntensity     = opt.value
  store.polishingIntensityDesc = opt.desc
  showIntensity.value          = false
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
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['docx', 'doc', 'pdf'].includes(ext)) {
    ElMessage.error('请上传 .docx / .doc / .pdf 格式的文件')
    return
  }
  const maxSize = ext === 'pdf' ? 20 * 1024 * 1024 : 50 * 1024 * 1024
  if (file.size > maxSize) {
    ElMessage.error(ext === 'pdf' ? 'PDF 文件大小不能超过 20MB' : '文件大小不能超过 50MB')
    return
  }
  uploading.value      = true
  uploadProgress.value = 0
  try {
    // 先上传到云存储
    const res = await uploadWordFile(file, (pct) => { uploadProgress.value = pct })
    if (!res.success) throw new Error(res.message || '上传失败')

    uploadProgress.value = 100

    // PDF 无需在此处转换，extractParagraphs 云函数内会自动检测并转换
    // 直接记录 PDF fileId，点击"发起分析"时在云端完成转换
    store.uploadedFileId   = res.fileId || res.fileID
    store.uploadedFileKey  = res.fileKey || ''
    store.uploadedFileName = file.name
    if (ext === 'pdf') {
      ElMessage.success('PDF 上传成功，点击"发起分析"后将自动转换并处理')
    } else {
      ElMessage.success('文件上传成功')
    }

    const baseName = (store.resumeName || file.name).replace(/\.[^.]+$/, '')
    store.resumeName = baseName
    await workorderStore.syncWorkorderAfterUpload({
      resumeName:      baseName,
      uploadedFileKey: store.uploadedFileKey,
      polishMode:      store.polishMode,
      targetPosition:  store.targetPosition,
      polishIntensity: store.polishingIntensity,
    })
  } catch (err) {
    ElMessage.error('文件处理失败：' + (err.message || '请检查网络或联系管理员'))
    store.uploadedFileName = ''
  } finally {
    uploading.value      = false
    uploadProgress.value = 0
  }
}

async function handleStart() {
  if (!canStart.value) return
  // 上传后用户可能修改了「目标岗位/模式/强度」；分析前覆盖到当前工单，避免工单字段为空或旧值。
  await workorderStore.syncCurrentUploadMeta({
    resumeName:      store.resumeName || store.uploadedFileName || '',
    uploadedFileKey: store.uploadedFileKey,
    polishMode:      store.polishMode,
    targetPosition:  store.targetPosition,
    polishIntensity: store.polishingIntensity,
  })

  // 工单仍只允许在上传成功时创建，此处不做创建。
  showAnalyzingModal.value = true
  try {
    await runAnalysis()
  } finally {
    showAnalyzingModal.value = false
  }
}
</script>

<style scoped>
/* ── Shell ── */
.upload-stage {
  flex: 1;
  overflow-y: auto;
  padding: 28px 48px 52px;
  position: relative;
}

.form-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Drag overlay ── */
.drag-overlay {
  position: absolute;
  inset: 0;
  background: rgba(21, 101, 192, 0.1);
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
  white-space: nowrap;
}

.mode-tab:hover { color: #1565C0; }

.mode-tab--on {
  background: #1565C0;
  color: #fff;
}

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
  box-shadow: 0 0 0 2px rgba(21, 101, 192, 0.2);
}

/* ── Upload block ── */
.upload-block {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 100px;
  background: #dbeafe;
  border-radius: 14px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.upload-block:hover     { background: #bfdbfe; }
.upload-block--drag     { background: #bfdbfe; box-shadow: 0 0 0 2px #1565C0; }
.upload-block--done     { background: #1565C0; border-color: #1565C0; }
.upload-block--done:hover { background: #1251A3; border-color: #1251A3; }

.upload-plus   { font-size: 26px; color: #1565C0; font-weight: 300; line-height: 1; }
.upload-label  { font-size: 16px; color: #1565C0; font-weight: 600; letter-spacing: 0.4px; }
.upload-hint   { font-size: 12px; color: #93c5fd; }

.upload-done-icon { font-size: 18px; color: #fff; }
.upload-filename  {
  font-size: 14px; color: #fff; font-weight: 600;
  max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.upload-rehint    { font-size: 11px; color: rgba(255,255,255,0.65); margin-left: 2px; }

.upload-block__progress {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 80%;
}

/* ── Identity row ── */
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

.identity-name {
  font-size: 14px;
  font-weight: 600;
  color: #1565C0;
}
.identity-chip--on .identity-name { color: #fff; }

.identity-sub {
  font-size: 11px;
  color: #93c5fd;
  font-weight: 400;
}
.identity-chip--on .identity-sub { color: rgba(255,255,255,0.65); }

/* ── Two-col ── */
.two-col {
  display: flex;
  gap: 14px;
}

.field-input {
  flex: 1;
  min-width: 0;
}

.field-input::placeholder { color: #93c5fd; }

/* ── Intensity block ── */
.intensity-block {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  position: relative;
  user-select: none;
  min-width: 0;
}

.intensity-block:hover { background: #bfdbfe; }

.intensity-val { font-size: 14px; color: #1a1a1a; font-weight: 600; }
.field-ph      { font-size: 14px; color: #93c5fd; }

.field-arrow {
  font-size: 20px;
  color: #93c5fd;
  transition: transform 0.2s;
  display: inline-block;
  line-height: 1;
  flex-shrink: 0;
}
.field-arrow.open { transform: rotate(90deg); color: #1565C0; }

/* Dropdown */
.intensity-drop {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.14);
  overflow: hidden;
  z-index: 200;
  min-width: 200px;
}

.intensity-opt {
  padding: 14px 18px;
  cursor: pointer;
  transition: background 0.1s;
  border-bottom: 1px solid #f0f4fb;
}
.intensity-opt:last-child  { border-bottom: none; }
.intensity-opt:hover       { background: #f0f6ff; }
.intensity-opt--on         { background: #eff6ff; }

.opt-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  display: block;
}
.opt-desc {
  font-size: 12px;
  color: #888;
  display: block;
  margin-top: 3px;
  line-height: 1.5;
}
.intensity-opt--on .opt-name { color: #1565C0; }

/* Backdrop */
.intensity-backdrop {
  position: fixed;
  inset: 0;
  z-index: 199;
}

/* Transition */
.fade-drop-enter-active, .fade-drop-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}
.fade-drop-enter-from, .fade-drop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ── JD Textarea ── */
.jd-area {
  resize: none;
  line-height: 1.6;
  width: 100%;
}
.jd-area::placeholder { color: #93c5fd; }

/* ── Submit ── */
.submit-row {
  display: flex;
  justify-content: flex-end;
}

.submit-btn {
  align-self: center;
  background: #1565C0;
  color: #fff;
  border: none;
  border-radius: 26px;
  padding: 15px 64px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
  margin-top: 8px;
  letter-spacing: 0.5px;
}

.submit-btn:hover:not(:disabled)  { background: #1976D2; transform: translateY(-1px); }
.submit-btn:active:not(:disabled) { transform: translateY(0); }

.submit-btn--off {
  background: #93c5fd;
  cursor: not-allowed;
}

/* 分析加载弹窗 */
.analyzing-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.analyzing-modal {
  background: #fff;
  border-radius: 20px;
  padding: 32px 36px 28px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.analyzing-ring-wrap {
  position: relative;
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.analyzing-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  animation: spin 2s linear infinite;
}

.analyzing-pct {
  position: relative;
  z-index: 1;
  font-size: 15px;
  font-weight: 800;
  color: #1565C0;
  line-height: 1;
}

.analyzing-status {
  font-size: 14px;
  font-weight: 500;
  color: #444;
  margin: 0;
  max-width: 200px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
