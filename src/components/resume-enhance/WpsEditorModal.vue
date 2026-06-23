<template>
  <Teleport to="body">
    <!--
      持久化架构：WPS iframe 一旦初始化就不再销毁，通过 CSS 切换显隐。
      关闭弹窗后 WPS 实例继续在后台保持，再次打开时无需任何加载，瞬间显示。
      当文档 fileKey 变化时才重新初始化。
    -->

    <!-- 背景遮罩：仅 visible 时渲染，避免遮挡其他页面操作 -->
    <Transition name="wps-bg-fade">
      <div v-if="visible" class="wps-overlay-bg" @mousedown.self="onOverlayClick"></div>
    </Transition>

    <!-- WPS 壳层：首次初始化后始终保留在 DOM，用 CSS 类控制显隐 -->
    <div
      v-if="shellMounted"
      class="wps-shell"
      :class="visible ? 'wps-shell--visible' : 'wps-shell--hidden'"
    >
      <div class="wps-modal">

        <!-- 标题栏 -->
        <div class="wps-header">
          <div class="wps-header-left">
            <div class="wps-header-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="3" fill="white" fill-opacity="0.2"/>
                <rect x="7" y="8" width="10" height="1.5" rx="0.75" fill="white"/>
                <rect x="7" y="11.25" width="10" height="1.5" rx="0.75" fill="white"/>
                <rect x="7" y="14.5" width="7" height="1.5" rx="0.75" fill="white"/>
              </svg>
            </div>
            <span class="wps-header-title">在线编辑简历</span>
            <span v-if="fileName" class="wps-header-filename">{{ fileName }}</span>
          </div>
          <div class="wps-header-right">
            <span class="wps-tip-text">编辑完成后点击此按钮，系统自动同步</span>
            <button class="btn-done" @click="onDone">完成编辑</button>
          </div>
        </div>

        <!-- 编辑器区 -->
        <div class="wps-body">
          <!-- 加载中（首次） -->
          <Transition name="wps-loading-fade">
            <div v-if="loading" class="wps-loading-mask">
              <div class="wps-loading-content">
                <svg class="wps-spinner" viewBox="0 0 50 50">
                  <circle cx="25" cy="25" r="20" fill="none" stroke="#1565C0" stroke-width="4"
                    stroke-dasharray="100" stroke-dashoffset="60" stroke-linecap="round"/>
                </svg>
                <p class="wps-loading-text">正在加载编辑器...</p>
                <p class="wps-loading-sub">首次加载约需 10-20 秒，此后打开瞬间就绪</p>
              </div>
            </div>
          </Transition>

          <!-- 错误提示 -->
          <div v-if="loadError" class="wps-error-mask">
            <div class="wps-error-content">
              <div class="wps-error-icon">!</div>
              <p class="wps-error-title">编辑器加载失败</p>
              <p class="wps-error-desc">{{ loadError }}</p>
              <button class="wps-retry-btn" @click="initEditor">重试</button>
            </div>
          </div>

          <!-- WPS 挂载容器：持久存在 -->
          <div ref="wpsContainer" class="wps-editor-container"></div>
        </div>

        <!-- 底部提示 -->
        <div class="wps-footer">
          <span class="wps-footer-tip">Ctrl+S 随时保存 · 完成编辑后点击右上角按钮</span>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { getWpsOpenConfig, getEditedPreview } from '@/api/docProcessor'
import { loadWpsSdk, getCachedWpsConfig } from '@/utils/wpsSdk'

// ── Props & Emits ────────────────────────────────────────────────
const props = defineProps({
  visible:  { type: Boolean, default: false },
  fileKey:  { type: String,  default: '' },
  fileName: { type: String,  default: '' }
})
const emit = defineEmits(['close', 'saved'])

// ── 状态 ─────────────────────────────────────────────────────────
const wpsContainer = ref(null)
const loading      = ref(false)
const loadError    = ref('')

// shellMounted: 首次初始化后置为 true，此后壳层始终保留在 DOM
const shellMounted = ref(false)

let wpsInstance    = null
let currentFileKey = ''   // 记录当前已初始化的 fileKey

// ── 监听显隐 ─────────────────────────────────────────────────────
watch(() => props.visible, async (val) => {
  if (!val) return

  // fileKey 未变化 && WPS 已就绪 → 直接显示，无需任何操作
  if (currentFileKey === props.fileKey && wpsInstance && !loading.value && !loadError.value) {
    return
  }

  // fileKey 变化或首次打开 → 初始化
  loadError.value = ''
  await nextTick()
  await initEditor()
})

onUnmounted(() => {
  // 页面卸载时才真正销毁
  destroyEditor()
})

// ── 初始化编辑器 ─────────────────────────────────────────────────
async function initEditor() {
  if (!props.fileKey) { loadError.value = '文档路径缺失'; return }

  // 挂载壳层（使其进入 DOM）
  shellMounted.value = true
  loading.value      = true
  loadError.value    = ''

  // 若 fileKey 变化，先销毁旧实例
  if (wpsInstance && currentFileKey !== props.fileKey) {
    destroyEditor()
  }

  try {
    // 1. 获取 WPS 配置（优先缓存）
    let cfg = getCachedWpsConfig(props.fileKey)
    if (!cfg) {
      cfg = await getWpsOpenConfig({ fileKey: props.fileKey })
    }
    if (!cfg?.success) throw new Error(cfg?.message || '获取配置失败')

    // 2. 加载 SDK（已预加载则从缓存读取，几乎无延迟）
    await loadWpsSdk()

    // 3. 等 DOM 就绪后挂载
    await nextTick()

    wpsInstance = window.WebOfficeSDK.init({
      officeType:     window.WebOfficeSDK.OfficeType.Writer,
      appId:          cfg.appId,
      fileId:         cfg.fileId,
      mount:          wpsContainer.value,
      token:          cfg.token,
      attrAllow:      'clipboard-read; clipboard-write; fullscreen',
      isListenResize: true,
      commandBars: [
        { cmbId: 'HeaderHistoryMenuBtn', attributes: { visible: false } },
        { cmbId: 'HeaderRight',          attributes: { visible: false } }
      ]
    })

    await wpsInstance.ready()
    currentFileKey = props.fileKey
    loading.value  = false

    console.log('[WpsEditorModal] WPS 就绪，fileId:', cfg.fileId, '（后续打开将直接显示）')

  } catch (err) {
    loading.value   = false
    loadError.value = err.message || '编辑器加载失败'
    console.error('[WpsEditorModal] 初始化失败:', err)
  }
}

// ── 操作 ─────────────────────────────────────────────────────────
async function onDone() {
  emit('saved', { fileKey: props.fileKey })
  emit('close')
  // 注意：不销毁 WPS 实例！只是隐藏 shell，保持实例活跃
}

function onOverlayClick() {
  ElMessage.info('请点击右上角「完成编辑」退出')
}

function destroyEditor() {
  if (wpsInstance) {
    try { wpsInstance.destroy?.() } catch (e) { /* ignore */ }
    wpsInstance = null
  }
  currentFileKey = ''
}
</script>

<style scoped>
/* ── 背景遮罩 ────────────────────────────────────────────────────── */
.wps-overlay-bg {
  position: fixed;
  inset: 0;
  z-index: 2999;
  background: rgba(0, 0, 0, 0.7);
}

/* ── WPS 壳层（持久存在）────────────────────────────────────────── */
.wps-shell {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  /* 壳层本身走 GPU 合成层 */
  will-change: opacity, visibility;
  contain: strict;
}

/* 显示态：正常可见 */
.wps-shell--visible {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  /* 极短过渡：从隐藏态恢复 */
  transition: opacity 0.10s ease, visibility 0s linear 0s;
}

/* 隐藏态：视觉不可见但保留 WPS iframe 在 DOM 中 */
.wps-shell--hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  /* 隐藏时先淡出，再设 visibility */
  transition: opacity 0.10s ease, visibility 0s linear 0.10s;
}

/* ── 弹窗 ────────────────────────────────────────────────────────── */
.wps-modal {
  width:  calc(100vw - 24px);
  height: calc(100vh - 24px);
  background: #fff;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  will-change: transform;
  transform: translateZ(0);
}

/* ── 标题栏 ──────────────────────────────────────────────────────── */
.wps-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 52px;
  background: #1565C0;
  flex-shrink: 0;
}
.wps-header-left {
  display: flex; align-items: center; gap: 10px;
}
.wps-header-icon {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.15); border-radius: 8px;
}
.wps-header-title  { font-size: 15px; font-weight: 600; color: #fff; }
.wps-header-filename {
  font-size: 12px; color: rgba(255,255,255,0.65);
  max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.wps-header-right { display: flex; align-items: center; gap: 12px; }
.wps-tip-text { font-size: 12px; color: rgba(255,255,255,0.6); }

.btn-done {
  padding: 7px 20px;
  background: #fff; color: #1565C0;
  border: none; border-radius: 8px;
  font-size: 13px; font-weight: 600;
  cursor: pointer; transition: background 0.15s;
}
.btn-done:hover { background: #e8f0fe; }

/* ── 编辑器区 ────────────────────────────────────────────────────── */
.wps-body {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #f5f5f5;
  isolation: isolate;
}
.wps-editor-container {
  width: 100%; height: 100%;
  will-change: transform;
  transform: translateZ(0);
  backface-visibility: hidden;
}
.wps-editor-container :deep(iframe) {
  width: 100% !important;
  height: 100% !important;
  border: none !important;
  display: block !important;
}

/* 加载/错误遮罩 */
.wps-loading-mask,
.wps-error-mask {
  position: absolute; inset: 0; z-index: 10;
  display: flex; align-items: center; justify-content: center;
  background: #f5f7fa;
}
.wps-loading-content,
.wps-error-content {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.wps-spinner {
  width: 52px; height: 52px;
  animation: wps-spin 1.2s linear infinite;
}
@keyframes wps-spin { to { transform: rotate(360deg); } }
.wps-loading-text { font-size: 15px; font-weight: 600; color: #333; margin: 0; }
.wps-loading-sub  { font-size: 12px; color: #999; margin: 0; text-align: center; }
.wps-error-icon {
  width: 48px; height: 48px; border-radius: 50%;
  background: #fee2e2; color: #ef4444;
  font-size: 24px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.wps-error-title { font-size: 15px; font-weight: 600; color: #333; margin: 0; }
.wps-error-desc  { font-size: 12px; color: #666; margin: 0; }
.wps-retry-btn {
  padding: 7px 20px; background: #1565C0; color: #fff;
  border: none; border-radius: 8px; font-size: 13px; cursor: pointer;
}
.wps-retry-btn:hover { background: #1251A3; }

/* ── 底部提示 ────────────────────────────────────────────────────── */
.wps-footer {
  height: 36px; padding: 0 20px;
  display: flex; align-items: center;
  background: #f8faff; border-top: 1px solid #e8eaf6; flex-shrink: 0;
}
.wps-footer-tip { font-size: 12px; color: #888; }

/* ── 背景遮罩动画 ────────────────────────────────────────────────── */
.wps-bg-fade-enter-active,
.wps-bg-fade-leave-active { transition: opacity 0.10s ease; }
.wps-bg-fade-enter-from,
.wps-bg-fade-leave-to     { opacity: 0; }

/* ── 加载遮罩动画 ────────────────────────────────────────────────── */
.wps-loading-fade-enter-active,
.wps-loading-fade-leave-active { transition: opacity 0.2s; }
.wps-loading-fade-enter-from,
.wps-loading-fade-leave-to     { opacity: 0; }
</style>
