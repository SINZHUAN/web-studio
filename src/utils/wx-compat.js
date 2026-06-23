/**
 * wx-compat.js
 * 将小程序 wx.* API 映射为网页等效实现
 * 迁移小程序代码时，将 import wx from 'wx' 改为 import { wx } from '@/utils/wx-compat'
 */

import { ElMessage, ElLoading, ElMessageBox } from 'element-plus'

let loadingInstance = null

export const wx = {

  // ── Toast / Loading ────────────────────────────────────────────────────
  showToast({ title = '', icon = 'none', duration = 2000 } = {}) {
    const typeMap = { success: 'success', error: 'error', loading: 'info', none: 'info' }
    ElMessage({
      message: title,
      type: typeMap[icon] || 'info',
      duration
    })
  },

  showLoading({ title = '加载中...' } = {}) {
    if (loadingInstance) loadingInstance.close()
    loadingInstance = ElLoading.service({
      text: title,
      background: 'rgba(0, 0, 0, 0.5)'
    })
  },

  hideLoading() {
    if (loadingInstance) {
      loadingInstance.close()
      loadingInstance = null
    }
  },

  // ── Modal ──────────────────────────────────────────────────────────────
  showModal({
    title = '提示',
    content = '',
    showCancel = true,
    confirmText = '确定',
    cancelText = '取消',
    success = null
  } = {}) {
    return ElMessageBox.confirm(content, title, {
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      showCancelButton: showCancel,
      type: 'warning'
    }).then(() => {
      const res = { confirm: true, cancel: false }
      success?.(res)
      return res
    }).catch(() => {
      const res = { confirm: false, cancel: true }
      success?.(res)
      return res
    })
  },

  // ── 图片 / 文件预览 ───────────────────────────────────────────────────
  previewImage({ urls = [], current = '' } = {}) {
    const target = current || urls[0]
    if (target) window.open(target, '_blank')
  },

  saveImageToPhotosAlbum({ filePath = '' } = {}) {
    const a = document.createElement('a')
    a.href = filePath
    a.download = `resume_export_${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  },

  // ── 本地存储（对应 localStorage）──────────────────────────────────────
  setStorageSync(key, value) {
    try {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
    } catch (e) {
      console.warn('setStorageSync failed', e)
    }
  },

  getStorageSync(key) {
    try {
      const val = localStorage.getItem(key)
      if (val === null) return ''
      try { return JSON.parse(val) } catch { return val }
    } catch {
      return ''
    }
  },

  removeStorageSync(key) {
    localStorage.removeItem(key)
  },

  // ── 路由跳转（需在调用处传入 router 实例）────────────────────────────
  navigateTo({ url = '' } = {}, router = null) {
    if (router) router.push(url)
    else console.warn('wx.navigateTo: router 未传入')
  },

  navigateBack(router = null) {
    if (router) router.back()
    else window.history.back()
  },

  // ── Canvas（网页原生支持，直接透传）──────────────────────────────────
  createOffscreenCanvas({ width = 300, height = 300 } = {}) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  },

  canvasToTempFilePath({ canvas, success = null, fail = null } = {}) {
    try {
      const dataURL = canvas.toDataURL('image/png')
      success?.({ tempFilePath: dataURL })
    } catch (e) {
      fail?.(e)
    }
  },

  // ── 其他兼容 ──────────────────────────────────────────────────────────
  vibrateShort() { /* 网页无振动，忽略 */ },
  vibrateLong() { /* 网页无振动，忽略 */ },

  getSystemInfoSync() {
    return {
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      pixelRatio: window.devicePixelRatio || 1,
      platform: 'web'
    }
  }
}

export default wx
