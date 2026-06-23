/**
 * 小程序 HTTP 请求工具
 * 所有请求均 POST 到 commission_web 云函数
 */

const CLOUD_URL        = 'https://jiandacom-prod-d2gnxqxs93455d5d7-1340279912.ap-shanghai.app.tcloudbase.com/commission_web'
const PAYMENT_URL      = 'https://jiandacom-prod-d2gnxqxs93455d5d7-1340279912.ap-shanghai.app.tcloudbase.com/payment_web'
const AI_SERVICE_URL   = 'https://jiandacom-prod-d2gnxqxs93455d5d7-1340279912.ap-shanghai.app.tcloudbase.com/ai_service_clo'
const WORD_PROC_URL    = 'https://jiandacom-prod-d2gnxqxs93455d5d7-1340279912.ap-shanghai.app.tcloudbase.com/word_processor_clo'
const TIMEOUT          = 60000

/**
 * 发起请求到 commission_web
 * @param {string} action  云函数 action 名称
 * @param {object} data    请求参数（openid 会自动从 globalData 注入）
 */
function post(action, data = {}, timeout = TIMEOUT) {
  return new Promise((resolve, reject) => {
    const app    = getApp()
    const openid = app.globalData.openid || ''

    wx.request({
      url:    CLOUD_URL,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data:   JSON.stringify({ action, openid, ...data }),
      timeout,
      success(res) {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`)); return
        }
        const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
        if (body && body.success) {
          resolve(body)
        } else {
          reject(new Error((body && body.message) || '请求失败'))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'))
      },
    })
  })
}

/**
 * 确保已获取 openid（登录态）
 * - 若 globalData 中已有 openid，立即返回（不发任何网络请求）
 * - 若无，则调用 wx.login 换取 openid（使用微信默认超时，不自定义以免过短触发 timeout error）
 */
function ensureOpenid() {
  return new Promise((resolve, reject) => {
    const app = getApp()

    // 已有缓存，直接返回，不触发任何网络调用
    if (app.globalData.openid) {
      resolve(app.globalData.openid)
      return
    }

    // 无缓存，发起 wx.login（不设 timeout，使用微信默认超时避免过早失败）
    wx.login({
      success(loginRes) {
        if (!loginRes.code) {
          reject(new Error('wx.login 未返回 code，请检查小程序配置'))
          return
        }
        post('client_login', { code: loginRes.code })
          .then(res => {
            app.globalData.openid = res.openid
            wx.setStorageSync('commission_openid', res.openid)
            resolve(res.openid)
          })
          .catch(reject)
      },
      fail(err) {
        // wx.login 失败（网络问题/开发环境限制），透传错误让调用方决定如何处理
        reject(new Error(err.errMsg || 'wx.login 失败'))
      },
    })
  })
}

/**
 * 发起请求到 payment_web（微信支付云函数）
 * @param {string} action  云函数 action 名称
 * @param {object} data    请求参数（openid 会自动从 globalData 注入）
 */
function paymentPost(action, data = {}, timeout = TIMEOUT) {
  return new Promise((resolve, reject) => {
    const app    = getApp()
    const openid = app.globalData.openid || ''

    wx.request({
      url:    PAYMENT_URL,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data:   JSON.stringify({ action, openid, ...data }),
      timeout,
      success(res) {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`)); return
        }
        const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
        if (body && body.success) {
          resolve(body)
        } else {
          reject(new Error((body && body.message) || '请求失败'))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'))
      },
    })
  })
}

/**
 * 发起请求到 ai_service_clo（AI 服务云函数，无需 JWT，超时放宽到 90 秒）
 */
function aiPost(action, data = {}, timeout = 90000) {
  return new Promise((resolve, reject) => {
    wx.request({
      url:    AI_SERVICE_URL,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data:   JSON.stringify({ action, ...data }),
      timeout,
      success(res) {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`)); return
        }
        const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
        if (body && body.success) {
          resolve(body)
        } else {
          reject(new Error((body && body.message) || 'AI 服务请求失败'))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'))
      },
    })
  })
}

/**
 * 发起请求到 word_processor_web（文档处理云函数，超时 120 秒）
 */
function wordPost(action, data = {}, timeout = 120000) {
  return new Promise((resolve, reject) => {
    wx.request({
      url:    WORD_PROC_URL,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data:   JSON.stringify({ action, ...data }),
      timeout,
      success(res) {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`)); return
        }
        const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
        if (body && body.success) {
          resolve(body)
        } else {
          reject(new Error((body && body.message) || '文档处理请求失败'))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'))
      },
    })
  })
}

module.exports = { post, ensureOpenid, paymentPost, aiPost, wordPost }
