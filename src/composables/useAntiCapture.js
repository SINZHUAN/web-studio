/**
 * useAntiCapture — 屏幕行为审计与内容保护
 *
 * ✅ 拦截并记录：
 *   - Ctrl/Cmd+S    保存网页
 *   - Ctrl/Cmd+P    打印 / 另存为 PDF
 *   - Ctrl/Cmd+U    查看网页源码
 *   - F12 / Cmd+Option+I / Ctrl+Shift+I / Ctrl+Shift+C   开发者工具
 *   - 拖拽页面内容
 *   - 浏览器打印对话框（beforeprint）
 *
 * ✅ 仅记录（无法阻止系统级操作）：
 *   - PrintScreen（Windows/Linux）
 *   - Cmd+Shift+3/4/5（macOS，Chrome/Firefox keydown 可接收）
 *   - 复制内容（非输入框区域）
 *
 * ✅ 无声拦截（不记录）：
 *   - 右键菜单
 *   - 文本选中（CSS user-select:none）
 *
 * 截图检测说明：
 *   - 仅检测 Windows/Linux 的 PrintScreen 键（keydown 可靠触发）
 *   - macOS 系统截图（Cmd+Shift+3/4/5）由系统层处理，浏览器无法接收，不检测
 *   - blur/focus 推断方案已移除：切换任何应用均会误报，无法实用
 */

import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { apiLogSecurityEvent } from '@/api/tools'
import { useAuthStore } from '@/stores/auth'

export function useAntiCapture() {
  const authStore = useAuthStore()
  const router    = useRouter()

  let styleEl = null

  // 每种事件独立冷却，防止不同类型互相干扰
  const LOG_COOLDOWN_MS = 2000
  const lastLogAtMap = {}

  // ── 静默写入审计日志 ──────────────────────────────────────────────────────────
  function sendLog(eventType, detail = '') {
    const now = Date.now()
    if (now - (lastLogAtMap[eventType] || 0) < LOG_COOLDOWN_MS) return
    lastLogAtMap[eventType] = now
    console.log(`[AntiCapture] 上报安全事件: ${eventType} — ${detail}`)

    apiLogSecurityEvent({
      userId:   authStore.userId   || localStorage.getItem('studio_userid') || '',
      userName: authStore.userName || '',
      eventType,
      detail,
      pageUrl:  window.location.pathname,
    }).then(res => {
      if (res?.autoFrozen) {
        ElMessage.error('账号已被安全监管系统冻结，请联系管理员解冻')
        setTimeout(() => {
          authStore.logout()
          router.replace('/login')
        }, 1500)
      }
    }).catch((err) => { console.warn('[AntiCapture] 上报失败:', err.message) })
  }

  // ── 可拦截的危险快捷键（non-passive，可调用 preventDefault）────────────────
  function handleKeyBlock(e) {
    const ctrl = e.ctrlKey || e.metaKey

    // Ctrl/Cmd+S — 保存网页
    if (ctrl && !e.shiftKey && !e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault()
      sendLog('save_page', '尝试保存网页 (Ctrl/Cmd+S)')
      return
    }

    // Ctrl/Cmd+P — 打印 / 另存为 PDF
    if (ctrl && !e.shiftKey && !e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault()
      sendLog('print_page', '尝试打印/导出PDF (Ctrl/Cmd+P)')
      return
    }

    // Ctrl/Cmd+U — 查看网页源码
    if (ctrl && !e.shiftKey && !e.altKey && (e.key === 'u' || e.key === 'U')) {
      e.preventDefault()
      sendLog('view_source', '尝试查看网页源码 (Ctrl/Cmd+U)')
      return
    }

    // F12 — 开发者工具
    if (e.key === 'F12') {
      e.preventDefault()
      sendLog('devtools', '尝试打开开发者工具 (F12)')
      return
    }

    // Cmd+Option+I / Ctrl+Shift+I — 开发者工具
    if (ctrl && e.shiftKey && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault()
      sendLog('devtools', '尝试打开开发者工具 (Ctrl+Shift+I)')
      return
    }

    // Cmd+Option+I (Mac altKey)
    if (ctrl && e.altKey && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault()
      sendLog('devtools', '尝试打开开发者工具 (Cmd+Option+I)')
      return
    }

    // Ctrl+Shift+C / Cmd+Shift+C — 审查元素
    if (ctrl && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault()
      sendLog('devtools', '尝试审查元素 (Ctrl+Shift+C)')
      return
    }

    // Ctrl+Shift+J / Cmd+Shift+J — 控制台
    if (ctrl && e.shiftKey && (e.key === 'j' || e.key === 'J')) {
      e.preventDefault()
      sendLog('devtools', '尝试打开控制台 (Ctrl+Shift+J)')
      return
    }
  }

  // ── PrintScreen 检测（Windows/Linux，passive，仅记录）──────────────────────
  function handleKeyLog(e) {
    if (e.key === 'PrintScreen' || e.keyCode === 44) {
      sendLog('printscreen', `PrintScreen 键 (${e.type})`)
    }
  }

  // ── 拖拽拦截 ─────────────────────────────────────────────────────────────────
  function onDragStart(e) {
    const tag = e.target?.tagName?.toLowerCase()
    // 允许输入框内部的文字拖拽
    if (tag === 'input' || tag === 'textarea') return
    e.preventDefault()
    sendLog('drag', '尝试拖拽页面内容')
  }

  // ── 打印对话框拦截（beforeprint：浏览器打印窗口弹出前）──────────────────────
  function onBeforePrint() {
    sendLog('print_page', '浏览器打印对话框被触发')
  }

  // ── 复制事件记录（仅记录，不拦截）────────────────────────────────────────────
  function onCopy() {
    const tag = document.activeElement?.tagName?.toLowerCase()
    if (tag === 'input' || tag === 'textarea') return
    sendLog('copy', '页面内容被复制')
  }

  // ── 右键禁用 ─────────────────────────────────────────────────────────────────
  function onContextMenu(e) {
    e.preventDefault()
  }

  // ── 注入 user-select:none（排除表单元素）────────────────────────────────────
  function injectSelectStyle() {
    if (styleEl) return
    styleEl = document.createElement('style')
    styleEl.id = '__anti-capture-style'
    styleEl.textContent = `
      *:not(input):not(textarea):not(select):not([contenteditable="true"]) {
        user-select: none !important;
        -webkit-user-select: none !important;
      }
    `
    document.head.appendChild(styleEl)
  }

  // ── 挂载 ─────────────────────────────────────────────────────────────────────
  onMounted(() => {
    injectSelectStyle()

    // 可拦截快捷键（non-passive，需要 preventDefault）
    const blockOpts = { capture: true }
    window.addEventListener('keydown',   handleKeyBlock, blockOpts)
    document.addEventListener('keydown', handleKeyBlock, blockOpts)

    // 截图类（passive，仅记录）
    const logOpts = { capture: true, passive: true }
    window.addEventListener('keydown',   handleKeyLog, logOpts)
    window.addEventListener('keyup',     handleKeyLog, logOpts)
    document.addEventListener('keydown', handleKeyLog, logOpts)
    document.addEventListener('keyup',   handleKeyLog, logOpts)

    document.addEventListener('copy',        onCopy)
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('dragstart',   onDragStart)

    window.addEventListener('beforeprint', onBeforePrint)
  })

  // ── 卸载 ─────────────────────────────────────────────────────────────────────
  onUnmounted(() => {
    const blockOpts = { capture: true }
    window.removeEventListener('keydown',   handleKeyBlock, blockOpts)
    document.removeEventListener('keydown', handleKeyBlock, blockOpts)

    const logOpts = { capture: true }
    window.removeEventListener('keydown',   handleKeyLog, logOpts)
    window.removeEventListener('keyup',     handleKeyLog, logOpts)
    document.removeEventListener('keydown', handleKeyLog, logOpts)
    document.removeEventListener('keyup',   handleKeyLog, logOpts)

    document.removeEventListener('copy',        onCopy)
    document.removeEventListener('contextmenu', onContextMenu)
    document.removeEventListener('dragstart',   onDragStart)

    window.removeEventListener('beforeprint', onBeforePrint)

    if (styleEl) { styleEl.remove(); styleEl = null }
  })
}
