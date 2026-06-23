App({
  globalData: {
    openid:         '',
    CLOUD_URL:      'https://jiandacom-prod-d2gnxqxs93455d5d7-1340279912.ap-shanghai.app.tcloudbase.com/commission_web',
    CLOUD_ENV:      'jk3-2gy9419jcb1c7fb7',
    cloudInited:    false,  // wx.cloud 懒加载标记
  },

  onLaunch() {
    // 仅读取本地缓存，不发起任何网络请求，避免启动时 timeout
    const saved = wx.getStorageSync('commission_openid')
    if (saved) this.globalData.openid = saved
    // wx.cloud.init 移至懒加载（上传文件前才初始化），防止启动时触发后台鉴权超时
  },

  // 全局错误兜底，防止非关键错误导致小程序崩溃
  onError(err) {
    console.warn('[App] onError (caught):', err)
  },

  /**
   * 按需初始化微信云开发 SDK（首次调用时才执行 wx.cloud.init）
   * 在 optimize.js uploadFile() 前调用
   */
  ensureCloudInited() {
    if (this.globalData.cloudInited) return
    if (!wx.cloud) {
      console.warn('[App] wx.cloud 不可用，请在开发者工具中开通云开发')
      return
    }
    wx.cloud.init({ env: this.globalData.CLOUD_ENV, traceUser: false })
    this.globalData.cloudInited = true
  },
})
