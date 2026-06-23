/**
 * Service Worker — WPS WebOffice CDN 资源缓存
 *
 * 策略：Cache-First（先查缓存，未命中再网络请求并缓存结果）
 * 对 WPS 的 JS/CSS 包（带 hash 的版本化资源）永久缓存，
 * 首次打开后，后续 WPS 编辑器加载速度大幅提升。
 */

const CACHE_NAME = 'wps-cdn-v1'

// 需要缓存的 CDN 域名
const WPS_CDN_HOSTS = [
  'multiapp-cache-weboffice.wpscdn.cn',
  'wwo.wps.cn',
  'wpscdn.cn'
]

// 只缓存静态资源（带 hash 或版本的文件），不缓存 API 请求
const CACHEABLE_EXTENSIONS = ['.js', '.css', '.woff', '.woff2', '.ttf', '.png', '.svg', '.ico']

function isCacheableRequest(url) {
  try {
    const u = new URL(url)
    const isWpsCdn = WPS_CDN_HOSTS.some(h => u.hostname.includes(h))
    const isStatic = CACHEABLE_EXTENSIONS.some(ext => u.pathname.includes(ext))
    return isWpsCdn && isStatic
  } catch {
    return false
  }
}

// 安装：跳过等待，立即激活
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // 清理旧版本缓存
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch：拦截 WPS CDN 请求
self.addEventListener('fetch', (event) => {
  if (!isCacheableRequest(event.request.url)) return

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      // 先查缓存
      const cached = await cache.match(event.request)
      if (cached) {
        return cached
      }
      // 未命中：请求网络并缓存
      try {
        const response = await fetch(event.request)
        if (response.ok) {
          cache.put(event.request, response.clone())
        }
        return response
      } catch (err) {
        // 网络失败且无缓存，抛出
        throw err
      }
    })
  )
})
