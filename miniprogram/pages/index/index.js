const request = require('../../utils/request')

Page({
  data: {
    loading:        true,
    initError:      '',
    newProgressCount: 0,  // 有未读新进展的订单总数，用于红点显示
    serviceIntroVisible: false,
  },

  onLoad() {
    this.init()
  },

  onShow() {
    // 每次页面显示时静默检查是否有新进展（不阻塞 UI）
    this._checkNewProgress()
  },

  async init() {
    const app = getApp()
    if (app.globalData.openid) {
      this.setData({ loading: false })
      this._checkNewProgress()
      return
    }
    try {
      await request.ensureOpenid()
    } catch (err) {
      console.warn('[index] ensureOpenid failed (non-fatal):', err.message)
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 静默检查是否有已回传但用户尚未知晓的新进展（预览/分析/成品）
   * - 三类进展合并为一条通知，避免开屏多弹窗
   * - 已知晓的订单 ID 存于 localStorage key: notified_progress（对象形式，按类型记录）
   */
  async _checkNewProgress() {
    if (!getApp().globalData.openid) return
    try {
      const res = await request.post('client_get_orders', {})
      const all = res.list || []

      // 读取已通知记录（格式：{ preview: [...ids], analysis: [...ids], result: [...ids] }）
      let notified = wx.getStorageSync('notified_progress') || {}
      if (!notified.preview)  notified.preview  = []
      if (!notified.analysis) notified.analysis = []
      if (!notified.result)   notified.result   = []

      const newPreviews  = all.filter(o => o.hasPreview        && !notified.preview.includes(o.orderId))
      const newAnalysis  = all.filter(o => o.hasAnalysisReport && !notified.analysis.includes(o.orderId))
      const newResults   = all.filter(o => o.hasResult         && !notified.result.includes(o.orderId))

      const totalNew = newPreviews.length + newAnalysis.length + newResults.length
      this.setData({ newProgressCount: totalNew })

      if (totalNew === 0) return

      // 立即将本批次标记为已通知，避免重复弹窗
      notified.preview  = [...notified.preview,  ...newPreviews.map(o => o.orderId)]
      notified.analysis = [...notified.analysis, ...newAnalysis.map(o => o.orderId)]
      notified.result   = [...notified.result,   ...newResults.map(o => o.orderId)]
      wx.setStorageSync('notified_progress', notified)

      wx.showModal({
        title:       '您的订单有新的进展',
        content:     '请前往「我的订单」查看。',
        confirmText: '立即查看',
        cancelText:  '稍后查看',
        success: (r) => {
          if (r.confirm) wx.navigateTo({ url: '/pages/order-status/index' })
        },
      })
    } catch (err) {
      // 静默失败，不影响首页正常显示
      console.warn('[index] _checkNewProgress failed:', err.message)
    }
  },

  goOptimize() {
    if (!getApp().globalData.openid) {
      wx.showToast({ title: '请稍候，正在初始化…', icon: 'none' }); return
    }
    wx.navigateTo({ url: '/pages/order-submit/optimize' })
  },

  goCustomize() {
    if (!getApp().globalData.openid) {
      wx.showToast({ title: '请稍候，正在初始化…', icon: 'none' }); return
    }
    wx.navigateTo({ url: '/pages/order-submit/customize' })
  },

  goMyOrders() {
    if (!getApp().globalData.openid) {
      wx.showToast({ title: '请稍候，正在初始化…', icon: 'none' }); return
    }
    wx.navigateTo({ url: '/pages/order-status/index' })
  },

  openServiceIntroModal() {
    this.setData({ serviceIntroVisible: true })
  },

  closeServiceIntroModal() {
    this.setData({ serviceIntroVisible: false })
  },

  noop() {},
})
