/**
 * WPS WebOffice SDK 工具函数
 * 独立文件，供 WpsEditorModal.vue 和 DoneStage.vue 共同引用
 *
 * 性能策略：
 *   1. 润色完成后立即调用 preloadWpsSdk() + preWarmWpsConfig()
 *   2. 用户点击「在线编辑」时 SDK 已加载、配置已缓存 → 直接初始化 WPS
 */

const SDK_SRC = `${import.meta.env.BASE_URL}libs/web-office-sdk.umd.js`

// ── 配置缓存（预取结果存这里，避免点击时重复请求）────────────────
let _cachedConfig  = null
let _cacheFileKey  = null
let _warmingPromise = null   // 防止并发重复预取

// ── SDK 加载 Promise（确保同一时间只注入一次 script）────────────────
let _sdkLoadPromise = null

/**
 * 步骤1：预加载 SDK 脚本（DoneStage 挂载时调用）
 * 使用 <link rel="preload"> 注入：浏览器以最高优先级并行下载，
 * 比 script 标签注入快 200-400ms
 */
export function preloadWpsSdk() {
  if (typeof window === 'undefined') return
  if (window.WebOfficeSDK) return
  // 已有 preload 或 script，不重复
  if (document.querySelector(`link[href="${SDK_SRC}"]`)) return
  if (document.querySelector(`script[src="${SDK_SRC}"]`)) return

  const link = document.createElement('link')
  link.rel  = 'preload'
  link.as   = 'script'
  link.href = SDK_SRC
  document.head.appendChild(link)
}

/**
 * 步骤2：预取 WPS 打开配置（润色完成、fileKey 确定后调用）
 * 将 API 响应缓存到内存，点击时直接使用，消除一次网络往返
 */
export async function preWarmWpsConfig(fileKey) {
  if (!fileKey) return
  if (_cacheFileKey === fileKey && _cachedConfig) return   // 已缓存
  if (_warmingPromise) return                               // 已在预取中

  _warmingPromise = (async () => {
    try {
      // 动态 import 避免循环依赖
      const { getWpsOpenConfig } = await import('@/api/docProcessor.js')
      const cfg = await getWpsOpenConfig({ fileKey })
      if (cfg?.success) {
        _cachedConfig = cfg
        _cacheFileKey = fileKey
      }
    } catch (e) {
      // 静默失败，点击时会重新请求
    } finally {
      _warmingPromise = null
    }
  })()
}

/** 取缓存的 WPS 配置（命中则无需再次请求） */
export function getCachedWpsConfig(fileKey) {
  return (_cacheFileKey === fileKey) ? _cachedConfig : null
}

/** 清除配置缓存（文档更新后需重新预取） */
export function clearWpsConfigCache() {
  _cachedConfig  = null
  _cacheFileKey  = null
  _warmingPromise = null
}

/**
 * 步骤3：加载 WPS SDK（等待 script 执行完毕）
 * 若已预加载，浏览器从缓存取，速度很快
 */
export function loadWpsSdk() {
  if (window.WebOfficeSDK) return Promise.resolve()
  if (_sdkLoadPromise)     return _sdkLoadPromise

  _sdkLoadPromise = new Promise((resolve, reject) => {
    // 若 preload 已触发，直接注入 script（浏览器从缓存加载）
    const s = document.createElement('script')
    s.src = SDK_SRC
    s.onload  = () => {
      if (window.WebOfficeSDK) resolve()
      else reject(new Error('SDK 文件加载后未找到 WebOfficeSDK 对象，请检查文件是否正确'))
    }
    s.onerror = () => {
      _sdkLoadPromise = null
      reject(new Error('WPS SDK 加载失败（404）\n请确认 SDK 文件在 public/libs/web-office-sdk.umd.js'))
    }
    document.head.appendChild(s)
  })

  return _sdkLoadPromise
}
