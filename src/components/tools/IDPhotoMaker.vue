<template>
  <div class="id-photo-maker">

    <!-- ══════════════════════════════════════════════
         Step 1 · 上传照片
    ══════════════════════════════════════════════════ -->
    <template v-if="store.phase === 'upload'">
      <div class="upload-stage">
        <div class="stage-header">
          <div class="stage-title">证件照制作</div>
          <div class="stage-sub">上传您的正脸照片，AI 自动抠图 + 背景替换 + 规格裁剪，一键生成标准证件照</div>
        </div>

        <!-- 拍摄要求提示 -->
        <div class="tips-row">
          <div v-for="tip in uploadTips" :key="tip.icon" class="tip-card">
            <span class="tip-icon">{{ tip.icon }}</span>
            <span class="tip-text">{{ tip.text }}</span>
          </div>
        </div>

        <!-- 上传区域 -->
        <div
          class="upload-zone"
          :class="{
            'upload-zone--drag': isDragOver,
            'upload-zone--done': store.localImageUrl && !store.uploading,
            'upload-zone--loading': store.uploading,
          }"
          @click="!store.uploading && triggerFileInput()"
          @dragover.prevent="isDragOver = true"
          @dragleave.self="isDragOver = false"
          @drop.prevent="handleDrop"
        >
          <input ref="fileInputRef" type="file" accept="image/jpeg,image/png,image/webp" style="display:none" @change="handleFileChange" />

          <!-- 上传进度 -->
          <template v-if="store.uploading">
            <svg class="upload-spin" viewBox="0 0 44 44" fill="none">
              <circle cx="22" cy="22" r="18" stroke="#bfdbfe" stroke-width="4"/>
              <path d="M22 4 a18 18 0 0 1 18 18" stroke="#1565C0" stroke-width="4" stroke-linecap="round"/>
            </svg>
            <span class="upload-label" style="color:#1565C0">上传中 {{ store.uploadProgress }}%</span>
          </template>

          <!-- 已选照片预览 -->
          <template v-else-if="store.localImageUrl">
            <img :src="store.localImageUrl" class="preview-thumb" alt="预览" />
            <div class="preview-overlay">
              <span class="preview-change">点击更换照片</span>
            </div>
          </template>

          <!-- 初始状态 -->
          <template v-else>
            <div class="upload-icon-wrap">
              <svg viewBox="0 0 48 48" fill="none" class="upload-icon-svg">
                <rect x="6" y="8" width="36" height="32" rx="4" fill="#dbeafe"/>
                <circle cx="19" cy="21" r="5" fill="#93c5fd"/>
                <path d="M6 34l10-8 8 6 6-5 12 9" stroke="#bfdbfe" stroke-width="2" stroke-linejoin="round" fill="none"/>
                <path d="M34 14v8M30 18h8" stroke="#1565C0" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
            </div>
            <span class="upload-label">点击或拖拽上传照片</span>
            <span class="upload-hint">支持 JPG / PNG / WEBP，最大 20MB</span>
          </template>
        </div>

        <!-- 开始按钮 -->
        <div class="stage-footer">
          <button
            class="primary-btn"
            :class="{ 'primary-btn--off': !store.localImageUrl || store.uploading }"
            :disabled="!store.localImageUrl || store.uploading"
            @click="goToConfig"
          >
            下一步：选择规格 →
          </button>
        </div>
      </div>
    </template>

    <!-- ══════════════════════════════════════════════
         Step 2 · 规格配置
    ══════════════════════════════════════════════════ -->
    <template v-else-if="store.phase === 'config'">
      <div class="config-stage">
        <!-- 左侧：照片预览 -->
        <div class="config-left">
          <div class="photo-preview-wrap">
            <img :src="store.localImageUrl" class="config-photo" alt="待处理照片" />
            <button class="change-photo-btn" @click="store.phase = 'upload'">← 更换照片</button>
          </div>
        </div>

        <!-- 右侧：配置面板 -->
        <div class="config-right">
          <div class="config-scroll">

            <!-- 处理模式 -->
            <div class="config-section">
              <div class="section-label">处理模式</div>
              <div class="mode-cards">
                <div
                  v-for="m in processingModes"
                  :key="m.id"
                  :class="['mode-card', { 'mode-card--on': store.processingMode === m.id }]"
                  @click="store.processingMode = m.id"
                >
                  <div class="mode-card__body">
                    <div class="mode-card__name">{{ m.name }}</div>
                    <div class="mode-card__desc">{{ m.desc }}</div>
                  </div>
                  <div v-if="store.processingMode === m.id" class="mode-card__check">✓</div>
                </div>
              </div>
            </div>

            <!-- AI 模式专属配置 -->
            <transition name="fade-slide">
              <div v-if="store.processingMode === 'ai_generation'" class="config-section">
                <div class="section-label">AI 生成选项</div>
                <div class="option-group">
                  <div class="option-label">服装风格</div>
                  <div class="option-pills">
                    <span
                      v-for="c in clothingOptions"
                      :key="c.code"
                      :class="['option-pill', { 'option-pill--on': store.selectedClothing === c.code }]"
                      @click="store.selectedClothing = c.code"
                    >{{ c.name }}</span>
                  </div>
                </div>
                <div class="option-group">
                  <div class="option-label">发型风格</div>
                  <div class="option-pills">
                    <span
                      v-for="h in hairstyleOptions"
                      :key="h.code"
                      :class="['option-pill', { 'option-pill--on': store.selectedHairstyle === h.code }]"
                      @click="store.selectedHairstyle = h.code"
                    >{{ h.name }}</span>
                  </div>
                </div>
              </div>
            </transition>

            <!-- 证件照尺寸 -->
            <div class="config-section">
              <div class="section-label">证件照尺寸</div>
              <div class="size-grid">
                <div
                  v-for="sz in photoSizes"
                  :key="sz.code"
                  :class="['size-card', { 'size-card--on': store.selectedPhotoSize === sz.code }]"
                  @click="store.selectedPhotoSize = sz.code"
                >
                  <div class="size-card__name">{{ sz.name }}</div>
                  <div class="size-card__desc">{{ sz.desc }}</div>
                </div>
              </div>
            </div>

            <!-- 背景颜色 -->
            <div class="config-section">
              <div class="section-label">背景颜色</div>
              <div class="bg-row">
                <div
                  v-for="bg in backgrounds"
                  :key="bg.code"
                  :class="['bg-dot-wrap', { 'bg-dot-wrap--on': store.selectedBg === bg.code }]"
                  @click="store.selectedBg = bg.code"
                >
                  <div class="bg-dot" :style="{ background: bg.hex, border: bg.code === 'white' ? '1.5px solid #bfdbfe' : 'none' }"></div>
                  <span class="bg-name">{{ bg.name }}</span>
                </div>
              </div>
            </div>

          </div><!-- end config-scroll -->

          <!-- 开始制作按钮 -->
          <div class="config-footer">
            <button class="primary-btn" :disabled="isProcessing" @click="startProcessing">
              {{ isProcessing ? '制作中...' : '开始制作证件照' }}
            </button>
          </div>
        </div>

        <!-- 加载进度小弹窗（遮罩在 config-stage 上）-->
        <Teleport to="body">
          <transition name="modal-fade">
            <div v-if="isProcessing" class="proc-modal-mask">
              <div class="proc-modal">
                <svg class="proc-modal-spin" viewBox="0 0 44 44" fill="none">
                  <circle cx="22" cy="22" r="18" stroke="#bfdbfe" stroke-width="4"/>
                  <path d="M22 4 a18 18 0 0 1 18 18" stroke="#1565C0" stroke-width="4" stroke-linecap="round"/>
                </svg>
                <div class="proc-modal-title">正在制作证件照</div>
                <div class="proc-modal-status"></div>
                <div v-if="store.processingMode === 'ai_generation'" class="proc-modal-hint"></div>
              </div>
            </div>
          </transition>
        </Teleport>
      </div>
    </template>

    <!-- ══════════════════════════════════════════════
         Step 4 · 完成
    ══════════════════════════════════════════════════ -->
    <template v-else-if="store.phase === 'done'">
      <div class="done-stage">
        <!-- 左侧：结果图片 -->
        <div class="done-left">
          <div class="result-photo-wrap">
            <img
              :src="store.resultImageUrl"
              class="result-photo"
              alt="证件照"
              :style="{ background: resultBgHex }"
            />
            <div v-if="store.isFallback" class="fallback-tip">
              AI模式不可用，已自动切换为传统抠图模式
            </div>
          </div>
        </div>

        <!-- 右侧：信息 + 操作 -->
        <div class="done-right">
          <!-- 成功标题 -->
          <div class="done-head">
            <div class="done-check">✓</div>
            <div class="done-title">证件照制作完成</div>
            <div class="done-sub">{{ resultPhotoName }} · {{ resultBgName }} 背景</div>
          </div>

          <!-- 信息卡片 -->
          <div class="info-card">
            <div class="info-row">
              <span class="info-label">规格</span>
              <span class="info-val">{{ resultPhotoName }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">背景色</span>
              <span class="info-val">{{ resultBgName }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">尺寸</span>
              <span class="info-val">{{ store.photoConfig?.width }} × {{ store.photoConfig?.height }} px</span>
            </div>
            <div class="info-row">
              <span class="info-label">制作方式</span>
              <span class="info-val">{{ store.processMode === 'ai_generation' ? 'AI 大模型生成' : '传统人像抠图' }}</span>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="action-group">
            <button class="primary-btn" @click="handleDownload">
              <svg viewBox="0 0 20 20" fill="none" class="btn-icon">
                <path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3 16h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              下载证件照
            </button>
            <button class="secondary-btn" @click="handleRedo">
              重新制作
            </button>
          </div>
        </div>
      </div>
    </template>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useIDPhotoStore } from '@/stores/idPhoto'
import { uploadIDPhoto, generateIDPhoto, generateAIIDPhoto } from '@/api/tools'

const store = useIDPhotoStore()

const fileInputRef = ref(null)
const isDragOver   = ref(false)
const isProcessing = ref(false)

// ── 静态配置 ──────────────────────────────────────────────────────────────────
const uploadTips = [
  { icon: '👤', text: '正面拍摄，面部居中' },
  { icon: '💡', text: '光线充足，无阴影' },
  { icon: '😌', text: '表情自然，目视前方' },
  { icon: '👓', text: '建议摘下眼镜' },
  { icon: '🔍', text: '图片清晰，无模糊' },
]

const processingModes = [
  { id: 'traditional',   name: '传统抠图',  desc: '精准人像抠图 + 背景替换，稳定高效' },
  { id: 'ai_generation', name: 'AI智能生成', desc: '豆包大模型智能生成，支持服装/发型定制' },
]

const photoSizes = [
  { code: 'one_inch',       name: '一寸照',   desc: '2.5×3.5cm' },
  { code: 'two_inch',       name: '二寸照',   desc: '3.5×4.9cm' },
  { code: 'big_one_inch',   name: '大一寸',   desc: '3.3×4.8cm' },
  { code: 'passport',       name: '护照照片', desc: '3.3×4.8cm' },
  { code: 'driver_license', name: '驾驶证',   desc: '2.2×3.2cm' },
  { code: 'id_card',        name: '身份证',   desc: '2.6×3.2cm' },
]

const backgrounds = [
  { code: 'blue',  name: '蓝色', hex: '#4A90E2' },
  { code: 'red',   name: '红色', hex: '#E74C3C' },
  { code: 'white', name: '白色', hex: '#FFFFFF' },
]

const clothingOptions = [
  { code: 'formal_suit',   name: '黑色西服' },
  { code: 'business_suit', name: '商务套装' },
  { code: 'casual_shirt',  name: '休闲衬衫' },
]

const hairstyleOptions = [
  { code: 'keep_original', name: '保持原有发型' },
  { code: 'high_ponytail', name: '高马尾（女）' },
  { code: 'short_hair',    name: '短发（女）' },
  { code: 'long_hair',     name: '长发（女）' },
  { code: 'crew_cut',      name: '平头（男）' },
  { code: 'side_part',     name: '侧分（男）' },
  { code: 'business_cut',  name: '商务发型（男）' },
]

const processingSteps = ['上传照片', '人像处理', '规格裁剪', '合成完成']

// ── 计算属性 ──────────────────────────────────────────────────────────────────
const resultBgHex  = computed(() => backgrounds.find(b => b.code === store.selectedBg)?.hex || '#4A90E2')
const resultBgName = computed(() => backgrounds.find(b => b.code === store.selectedBg)?.name || '蓝色')
const resultPhotoName = computed(() => photoSizes.find(s => s.code === store.selectedPhotoSize)?.name || '一寸照')

// ── 文件处理 ──────────────────────────────────────────────────────────────────
function triggerFileInput() { fileInputRef.value?.click() }

function handleDrop(e) {
  isDragOver.value = false
  const file = e.dataTransfer?.files[0]
  if (file) selectPhoto(file)
}

function handleFileChange(e) {
  const file = e.target.files[0]
  if (file) selectPhoto(file)
  e.target.value = ''
}

function selectPhoto(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(file.type)) {
    ElMessage.error('请上传 JPG / PNG / WEBP 格式的图片')
    return
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('图片大小不能超过 20MB')
    return
  }
  // 释放旧 blob URL
  if (store.localImageUrl?.startsWith('blob:')) URL.revokeObjectURL(store.localImageUrl)
  store.localImageUrl   = URL.createObjectURL(file)
  store.localImageFile  = file
  store.uploadedFileKey = ''
  store.uploadedFileID  = ''
}

// ── Step 1 → Step 2 ───────────────────────────────────────────────────────────
async function goToConfig() {
  if (!store.localImageFile) return

  // 如果还没上传到 COS，先上传
  if (!store.uploadedFileKey) {
    store.uploading = true
    store.uploadProgress = 0
    const res = await uploadIDPhoto(store.localImageFile, pct => { store.uploadProgress = pct })
    store.uploading = false
    if (!res.success) {
      ElMessage.error('照片上传失败：' + (res.error || '请检查网络后重试'))
      return
    }
    store.uploadedFileKey = res.fileKey
    store.uploadedFileID  = res.fileID || ''
  }

  store.phase = 'config'
}

// ── Step 2 → Step 4（弹窗 loading，不切换 phase）────────────────────────────
async function startProcessing() {
  isProcessing.value     = true
  store.processingStep   = 0
  store.processingStatus = '正在连接服务器...'

  try {
    // 步骤 0：确认上传完成
    if (!store.uploadedFileKey) {
      store.processingStatus = '上传照片中...'
      const res = await uploadIDPhoto(store.localImageFile, pct => { store.uploadProgress = pct })
      if (!res.success) throw new Error(res.error || '上传失败')
      store.uploadedFileKey = res.fileKey
      store.uploadedFileID  = res.fileID || ''
    }
    store.processingStep = 1

    // 步骤 1：调用云函数处理
    store.processingStatus = store.processingMode === 'ai_generation'
      ? 'AI 大模型生成中，请稍候（约30-60秒）...'
      : '人像抠图处理中...'

    let res
    if (store.processingMode === 'ai_generation') {
      res = await generateAIIDPhoto({
        fileID:          store.uploadedFileID,    // 优先：CloudBase CDN temp URL（与小程序同款）
        fileKey:         store.uploadedFileKey,   // 兜底：COS 路径
        clothing:        store.selectedClothing,
        hairstyle:       store.selectedHairstyle,
        photoSize:       store.selectedPhotoSize,
        backgroundColor: store.selectedBg,
      })
    } else {
      res = await generateIDPhoto({
        fileID:          store.uploadedFileID,   // 用于确定源文件所在的真实 COS bucket
        fileKey:         store.uploadedFileKey,
        photoSize:       store.selectedPhotoSize,
        backgroundColor: store.selectedBg,
      })
    }

    if (!res || !res.success) throw new Error(res?.message || '处理失败')

    store.processingStep   = 2
    store.processingStatus = '规格裁剪中...'
    store.photoConfig      = res.photoConfig
    store.processMode      = res.mode || store.processingMode
    store.isFallback       = res.mode === 'fallback_to_traditional' && store.processingMode === 'ai_generation'

    // 步骤 2：Canvas 合成背景（仅传统模式需要）
    // 云函数已完成所有处理（传统模式：CI 裁剪+背景合成；AI 模式：AI 直接生成）
    // finalUrl 用于 <img> 展示（无需 CORS），downloadUrl 含 Content-Disposition 用于下载
    store.resultImageUrl = res.finalUrl
    store.downloadUrl    = res.downloadUrl || res.finalUrl

    store.processingStep   = 3
    store.processingStatus = '制作完成！'
    await new Promise(r => setTimeout(r, 400))
    isProcessing.value = false
    store.phase = 'done'

  } catch (err) {
    isProcessing.value = false
    ElMessage.error('证件照制作失败：' + (err.message || '请重试'))
  }
}

// ── Canvas 背景合成 ────────────────────────────────────────────────────────────
/**
 * 下载透明 PNG → Canvas 叠加背景色 → 返回 { blob, blobUrl }
 */
async function composeBackground(transparentUrl, bgHex, width, height) {
  // 用 fetch 获取图片 blob，避免 CORS taint 问题
  const resp      = await fetch(transparentUrl)
  const imgBlob   = await resp.blob()
  const objectUrl = URL.createObjectURL(imgBlob)

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width  = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    // 绘制背景色
    ctx.fillStyle = bgHex
    ctx.fillRect(0, 0, width, height)

    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(objectUrl)
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Canvas 导出失败'))
        resolve({ blob, blobUrl: URL.createObjectURL(blob) })
      }, 'image/jpeg', 0.95)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('图片加载失败'))
    }
    img.src = objectUrl
  })
}

// ── 下载 & 重置 ───────────────────────────────────────────────────────────────
function handleDownload() {
  if (!store.downloadUrl && !store.resultImageUrl) return
  // downloadUrl 含 Content-Disposition:attachment，COS 直接触发浏览器下载，无需 fetch/CORS
  const a = document.createElement('a')
  a.href = store.downloadUrl || store.resultImageUrl
  a.click()
  ElMessage.success('证件照已开始下载')
}

function handleRedo() {
  store.phase          = 'config'
  store.processingStep = 0
  store.resultImageUrl = ''
  store.downloadUrl    = ''
  store.resultBlob     = null
}
</script>

<style scoped>
/* ── Shell ──────────────────────────────────────────────────────────────────── */
.id-photo-maker {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ══════════════════════════════════════════════
   Step 1 — Upload
══════════════════════════════════════════════ */
.upload-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 36px 48px 48px;
  gap: 24px;
  overflow-y: auto;
}

.stage-header { text-align: center; }

.stage-title {
  font-size: 22px;
  font-weight: 800;
  color: #1565C0;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.stage-sub {
  font-size: 13px;
  color: #60a5fa;
  max-width: 520px;
  line-height: 1.6;
}

.tips-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 600px;
}

.tip-card {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 20px;
  padding: 6px 14px;
  font-size: 12px;
  color: #1565C0;
}

.tip-icon { font-size: 14px; }
.tip-text { font-weight: 500; }

/* 上传区域 */
.upload-zone {
  width: 100%;
  max-width: 480px;
  height: 300px;
  border: 2.5px dashed #bfdbfe;
  border-radius: 20px;
  background: #eff6ff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.18s;
  position: relative;
  overflow: hidden;
}

.upload-zone:hover { border-color: #1565C0; background: #dbeafe; }
.upload-zone--drag { border-color: #1565C0; background: #dbeafe; box-shadow: 0 0 0 3px rgba(21,101,192,0.15); }
.upload-zone--done { border-style: solid; border-color: #1565C0; background: #fff; cursor: pointer; }
.upload-zone--loading { cursor: not-allowed; opacity: 0.8; }

.upload-spin {
  width: 44px;
  height: 44px;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.upload-icon-wrap { display: flex; align-items: center; justify-content: center; }
.upload-icon-svg  { width: 64px; height: 64px; }
.upload-label     { font-size: 15px; font-weight: 600; color: #1565C0; }
.upload-hint      { font-size: 12px; color: #93c5fd; }

.preview-thumb {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 18px;
}

.preview-overlay {
  position: absolute;
  inset: 0;
  background: rgba(21,101,192,0);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.18s;
  border-radius: 18px;
}

.upload-zone--done:hover .preview-overlay {
  background: rgba(21,101,192,0.35);
  opacity: 1;
}

.preview-change {
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  background: rgba(21,101,192,0.8);
  padding: 8px 18px;
  border-radius: 20px;
}

.stage-footer { width: 100%; max-width: 480px; display: flex; justify-content: flex-end; }

/* ══════════════════════════════════════════════
   Step 2 — Config (left-right split)
══════════════════════════════════════════════ */
.config-stage {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.config-left {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  border-right: 1px solid #e8f0fe;
  background: #fafcff;
}

.photo-preview-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.config-photo {
  width: 200px;
  height: 260px;
  object-fit: cover;
  border-radius: 14px;
  box-shadow: 0 4px 16px rgba(21,101,192,0.15);
}

.change-photo-btn {
  font-size: 12px;
  font-weight: 600;
  color: #60a5fa;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: color 0.15s, background 0.15s;
}

.change-photo-btn:hover { color: #1565C0; background: #eff6ff; }

.config-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.config-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 28px 36px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.config-section { display: flex; flex-direction: column; gap: 12px; }

.section-label {
  font-size: 12px;
  font-weight: 700;
  color: #1565C0;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

/* 处理模式卡片 */
.mode-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mode-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: #dbeafe;
  border: 2px solid transparent;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}

.mode-card:hover { background: #bfdbfe; }

.mode-card--on {
  background: #eff6ff;
  border-color: #1565C0;
  box-shadow: 0 2px 8px rgba(21,101,192,0.15);
}

.mode-card__body { flex: 1; }

.mode-card__name {
  font-size: 14px;
  font-weight: 700;
  color: #1565C0;
  margin-bottom: 2px;
}

.mode-card__desc { font-size: 12px; color: #60a5fa; }

.mode-card__check {
  font-size: 14px;
  font-weight: 700;
  color: #1565C0;
  width: 24px;
  height: 24px;
  background: #dbeafe;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* AI 选项 */
.option-group { display: flex; flex-direction: column; gap: 8px; }
.option-label { font-size: 12px; color: #60a5fa; font-weight: 600; }

.option-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.option-pill {
  padding: 5px 14px;
  background: #dbeafe;
  border: 1.5px solid transparent;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: #1565C0;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.option-pill:hover { background: #bfdbfe; }
.option-pill--on { background: #1565C0; color: #fff; border-color: #1565C0; }

/* 尺寸网格 */
.size-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.size-card {
  padding: 12px 10px;
  background: #dbeafe;
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}

.size-card:hover { background: #bfdbfe; }

.size-card--on {
  background: #eff6ff;
  border-color: #1565C0;
}

.size-card__name {
  font-size: 13px;
  font-weight: 700;
  color: #1565C0;
}

.size-card__desc {
  font-size: 11px;
  color: #60a5fa;
  margin-top: 2px;
}

/* 背景色选择 */
.bg-row {
  display: flex;
  gap: 20px;
  align-items: center;
}

.bg-dot-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 12px;
  border: 2px solid transparent;
  transition: all 0.15s;
}

.bg-dot-wrap:hover { background: #eff6ff; }

.bg-dot-wrap--on {
  border-color: #1565C0;
  background: #eff6ff;
}

.bg-dot {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0,0,0,0.12);
  transition: transform 0.15s;
}

.bg-dot-wrap--on .bg-dot { transform: scale(1.15); box-shadow: 0 3px 10px rgba(0,0,0,0.2); }

.bg-name { font-size: 12px; font-weight: 600; color: #1565C0; }

/* Config 底部 */
.config-footer {
  flex-shrink: 0;
  padding: 16px 36px 24px;
  border-top: 1px solid #e8f0fe;
  display: flex;
  justify-content: flex-end;
}

/* ══════════════════════════════════════════════
   Loading Modal（在 config-stage 上的小弹窗）
══════════════════════════════════════════════ */
.proc-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 30, 60, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3200;
  backdrop-filter: blur(2px);
}

.proc-modal {
  background: #fff;
  border-radius: 20px;
  padding: 36px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  box-shadow: 0 8px 40px rgba(21,101,192,0.18);
  min-width: 260px;
}

.proc-modal-spin {
  width: 48px;
  height: 48px;
  animation: spin 1s linear infinite;
}

.proc-modal-title {
  font-size: 16px;
  font-weight: 700;
  color: #1565C0;
}

.proc-modal-status {
  font-size: 13px;
  color: #60a5fa;
  text-align: center;
  max-width: 220px;
}

.proc-modal-hint {
  font-size: 12px;
  color: #93c5fd;
  text-align: center;
}

.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to     { opacity: 0; }

/* ══════════════════════════════════════════════
   Step 4 — Done (left-right split)
══════════════════════════════════════════════ */
.done-stage {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.done-left {
  flex: 0 0 340px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 36px 28px;
  border-right: 1px solid #e8f0fe;
  background: #fafcff;
}

.result-photo-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.result-photo {
  max-width: 240px;
  max-height: 320px;
  object-fit: contain;
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(21,101,192,0.2);
}

.fallback-tip {
  font-size: 11px;
  color: #f59e0b;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  padding: 6px 12px;
  text-align: center;
  max-width: 240px;
}

.done-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 44px 48px;
  gap: 24px;
  overflow-y: auto;
}

.done-head { display: flex; flex-direction: column; gap: 6px; }

.done-check {
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, #1565C0, #1976D2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(21,101,192,0.35);
}

.done-title { font-size: 22px; font-weight: 800; color: #1565C0; }
.done-sub   { font-size: 13px; color: #60a5fa; }

.info-card {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 14px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.info-label {
  font-size: 12px;
  color: #60a5fa;
  font-weight: 500;
}

.info-val {
  font-size: 13px;
  font-weight: 600;
  color: #1565C0;
}

.action-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ══════════════════════════════════════════════
   公共按钮
══════════════════════════════════════════════ */
.primary-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 13px 32px;
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
  white-space: nowrap;
}

.primary-btn:hover:not(.primary-btn--off) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.primary-btn--off {
  background: #e2e8f0;
  color: #aaa;
  box-shadow: none;
  cursor: not-allowed;
}

.secondary-btn {
  padding: 12px 32px;
  background: #dbeafe;
  color: #1565C0;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.secondary-btn:hover { background: #bfdbfe; }

.btn-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* ── Transition ─────────────────────────────────────────────────────────────── */
.fade-slide-enter-active,
.fade-slide-leave-active { transition: opacity 0.2s, transform 0.2s; }
.fade-slide-enter-from,
.fade-slide-leave-to     { opacity: 0; transform: translateY(-8px); }
</style>
