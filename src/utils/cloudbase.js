import cloudbase from '@cloudbase/js-sdk'

const ENV_ID = import.meta.env.VITE_CLOUDBASE_ENV_ID || 'jiandacom-prod-d2gnxqxs93455d5d7'

let app = null
let signInPromise = null

/**
 * 获取已初始化并完成匿名登录的 CloudBase 实例
 * 使用单例模式，整个应用生命周期内只初始化一次
 */
export async function getCloudbaseApp() {
  if (!app) {
    app = cloudbase.init({ env: ENV_ID })
  }

  // 确保匿名登录只执行一次（并发调用时复用同一个 Promise）
  if (!signInPromise) {
    signInPromise = (async () => {
      const auth = app.auth({ persistence: 'session' })
      const loginState = await auth.getLoginState()
      if (!loginState) {
        await auth.signInAnonymously()
      }
    })().catch(err => {
      signInPromise = null
      const hint = '请确认 CloudBase 控制台已开启「匿名登录」，并在 WEB 安全域名中加入 localhost:3000'
      throw new Error((err.message || String(err)) + '（' + hint + '）')
    })
  }

  await signInPromise
  return app
}
