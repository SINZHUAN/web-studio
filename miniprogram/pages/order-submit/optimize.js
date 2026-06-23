const request = require('../../utils/request')

// ================================================
// ⚠️  支付金额前端展示配置（仅用于弹窗显示，不参与实际收款）
//     实际收款金额由 cloud-functions/payment_web/index.js 中的
//     SERVICE_PRICES 控制，两处金额必须保持一致。
// ================================================
const PAYMENT_DISPLAY = {
  resume_optimize: { label: '简历优化', priceDisplay: '12.00' },  // 测试价；正式上线改为 '12.00'
  // resume_customize: { label: '简历代做', priceDisplay: '19.00' },  // 待开发
}
// ================================================

/** 填写指南文案（仅用于帮助弹窗，不参与业务逻辑） */
const FIELD_HELP = {
  resume: {
    title: '简历文档',
    // TODO [PDF支持待完善]: 后续开放 PDF 上传后，改为：
    // '请上传需要导师润色优化的简历文档，支持 .docx / .doc / .pdf 格式（PDF 最大 20MB，Word 最大 10MB）。提交后成品将以 Word 格式发送至收件邮箱。'
    content: '请上传需要导师润色优化的 Word 简历，支持 .docx / .doc 格式。文件将上传至云端供制作使用，提交前请确认内容完整。',
  },
  polishMode: {
    title: '润色模式',
    variant: 'blocks',
    blocks: [
      {
        title: '针对岗位润色（推荐）',
        text: '需填写目标岗位，导师将针对目标岗位进行一对一润色，使简历更符合目标岗位需求。',
      },
      {
        title: '依据自身润色',
        text: '按实际求职需求选择，导师将针对简历内容本身进行润色，使简历更符合求职需求。',
      },
    ],
  },
  targetPosition: {
    title: '目标岗位',
    content: '填写您计划应聘的职位名称，导师将根据目标行业调研对简历进行一对一专业润色，使简历更符合目标岗位需求。'
  },
  intensity: {
    title: '润色强度',
    variant: 'blocks',
    intro: '请选择简历话术的润色强度',
    blocks: [
      {
        name: '资深',
        subtitle: '（高级全职人士、高级实习生）',
        text: '适合有丰富经验的求职者，导师将在表述中强调专业深度与核心贡献，强化优势能力，展示竞争力',
      },
      {
        name: '标准',
        subtitle: '（基础全职人士、基础实习生）',
        text: '适合有一定基础的求职者，导师将在表述中平衡专业能力与学习能力，优化简历内容，提升竞争力',
      },
      {
        name: '基础',
        subtitle: '（初级实习生、应届在校生）',
        text: '适合基础欠缺的求职者，导师将在表述中强调学习能力与成长潜力，弥补简历不足性，增强竞争力',
      },
    ],
  },
  identity: {
    title: '求职者身份',
    content: '用于区分全职人士、实习生、在校生身份，导师将根据求职者身份对简历进行侧重润色，使简历更符合求职者当前身份。',
  },
  jobDescription: {
    title: '职位 JD',
    content: '选填。可粘贴目标岗位招聘启事中的职责与要求，导师将根据职位 JD 对简历进行润色匹配，使简历更符合职位 JD 要求，提高简历匹配性。',
  },
  email: {
    title: '收件邮箱',
    content: '选填。填写可正常收件的邮箱时，工单完成后成品会发送至该邮箱；不填也可在「我的订单」-「订单详情页」下载成品简历。',
  },
}

Page({
  data: {
    // 表单字段
    email:              '',
    userIdentity:       '',
    polishMode:         '',
    targetPosition:     '',
    polishingIntensity: '',

    // Picker 选项（标签数组 + 值数组）
    modeLabels:    ['针对岗位润色', '依据自身润色'],
    modeValues:    ['position', 'self'],
    modeIndex:     0,
    modeDisplayLabel: '请选择',

    intensityLabels: ['资深版', '标准版', '基础版'],
    intensityValues: ['senior', 'standard', 'basic'],
    intensityIndex:  0,
    intensityDisplayLabel: '请选择',

    identityLabels: ['全职', '实习', '在校'],
    identityValues: ['full', 'internship', 'student'],
    identityIndex:  0,
    identityDisplayLabel: '请选择',

    // 职位 JD
    jobDescription: '',
    showJdPanel:    false,

    // 邮箱后缀建议
    emailPrefix:       '',
    showEmailDropdown: false,
    emailSuffixes: ['@qq.com', '@163.com', '@126.com', '@gmail.com', '@foxmail.com', '@139.com', '@sina.com'],

    // 文件上传
    fileInfo:        null,
    uploadProgress:  0,
    uploading:       false,
    uploadedFileKey: '',

    // 提交状态
    submitting:  false,
    submitted:   false,
    orderId:     '',
    orderDbId:   '',
    subscribed:  false,   // 是否已授权微信订阅消息

    /** 填写指南弹窗（仅展示） */
    helpVisible: false,
    helpTitle:   '',
    helpContent: '',
    /** default | blocks — 润色模式 / 润色强度等为分块展示 */
    helpVariant: 'default',
    helpBlocks:  [],
    helpIntro:   '',
    /** 仅润色强度帮助：正文区略增高 */
    helpTallBody: false,

    /** 支付确认弹窗 */
    payVisible:       false,   // 支付弹窗是否显示
    paying:           false,   // 支付请求进行中（防重复点击）
    payServiceLabel:  '',      // 当前服务名称（弹窗展示用）
    payPriceDisplay:  '',      // 当前价格字符串（弹窗展示用，如 "12.00"）
  },

  // ── 填写指南弹窗（不影响表单逻辑）────────────────────────────────────────────

  showFieldHelp(e) {
    const key = e.currentTarget.dataset.key
    const item = FIELD_HELP[key]
    if (!item) return
    const useBlocks = item.variant === 'blocks' && Array.isArray(item.blocks)
    this.setData({
      helpVisible: true,
      helpTitle:   item.title,
      helpContent: useBlocks ? '' : (item.content || ''),
      helpVariant: useBlocks ? 'blocks' : 'default',
      helpBlocks:  useBlocks ? item.blocks : [],
      helpIntro:   useBlocks ? (item.intro || '') : '',
      helpTallBody: key === 'intensity',
    })
  },

  closeFieldHelp() {
    this.setData({
      helpVisible: false,
      helpTitle:   '',
      helpContent: '',
      helpVariant: 'default',
      helpBlocks:  [],
      helpIntro:   '',
      helpTallBody: false,
    })
  },

  // ── 生命周期 ──────────────────────────────────────────────────────────────────

  onLoad() {
    this._restoreProgress()
  },

  // ── 草稿持久化 ───────────────────────────────────────────────────────────────

  _saveProgress() {
    if (this.data.submitted) return
    const d = this.data
    try {
      wx.setStorageSync('optimize_draft', {
        email:              d.email,
        userIdentity:       d.userIdentity,
        polishMode:         d.polishMode,
        targetPosition:     d.targetPosition,
        polishingIntensity: d.polishingIntensity,
        jobDescription:     d.jobDescription,
        uploadedFileKey:    d.uploadedFileKey,
        fileInfo:           d.fileInfo,
      })
    } catch (e) { /* ignore */ }
  },

  _restoreProgress() {
    try {
      const draft = wx.getStorageSync('optimize_draft')
      if (!draft) return

      const d = this.data
      const modeIdx      = draft.polishMode         ? d.modeValues.indexOf(draft.polishMode)         : -1
      const intensityIdx = draft.polishingIntensity ? d.intensityValues.indexOf(draft.polishingIntensity) : -1
      const identityIdx  = draft.userIdentity       ? d.identityValues.indexOf(draft.userIdentity)   : -1

      this.setData({
        email:              draft.email              || '',
        polishMode:         draft.polishMode         || '',
        modeIndex:          modeIdx  >= 0 ? modeIdx  : 0,
        modeDisplayLabel:   modeIdx  >= 0 ? d.modeLabels[modeIdx]      : '请选择',
        targetPosition:     draft.targetPosition     || '',
        polishingIntensity: draft.polishingIntensity || '',
        intensityIndex:     intensityIdx >= 0 ? intensityIdx : 1,
        intensityDisplayLabel: intensityIdx >= 0 ? d.intensityLabels[intensityIdx] : '请选择',
        userIdentity:       draft.userIdentity       || '',
        identityIndex:      identityIdx  >= 0 ? identityIdx  : 0,
        identityDisplayLabel: identityIdx >= 0 ? d.identityLabels[identityIdx]  : '请选择',
        jobDescription:     draft.jobDescription     || '',
        uploadedFileKey:    draft.uploadedFileKey    || '',
        fileInfo:           draft.fileInfo           || null,
      })
    } catch (e) { /* ignore */ }
  },

  _clearProgress() {
    try { wx.removeStorageSync('optimize_draft') } catch (e) { /* ignore */ }
  },

  // ── Picker 选择 ──────────────────────────────────────────────────────────────

  onModeChange(e) {
    const idx  = parseInt(e.detail.value)
    const mode = this.data.modeValues[idx]
    this.setData({
      polishMode:       mode,
      modeIndex:        idx,
      modeDisplayLabel: this.data.modeLabels[idx],
      // 切换自身润色时清空岗位相关字段
      targetPosition:  mode === 'self' ? '' : this.data.targetPosition,
      jobDescription:  mode === 'self' ? '' : this.data.jobDescription,
      showJdPanel:     false,
    })
    this._saveProgress()
  },

  onIntensityChange(e) {
    const idx = parseInt(e.detail.value)
    this.setData({
      polishingIntensity:    this.data.intensityValues[idx],
      intensityIndex:        idx,
      intensityDisplayLabel: this.data.intensityLabels[idx],
    })
    this._saveProgress()
  },

  onIdentityChange(e) {
    const idx = parseInt(e.detail.value)
    this.setData({
      userIdentity:         this.data.identityValues[idx],
      identityIndex:        idx,
      identityDisplayLabel: this.data.identityLabels[idx],
    })
    this._saveProgress()
  },

  // ── 目标岗位输入 ──────────────────────────────────────────────────────────────

  onPositionInput(e) {
    this.setData({ targetPosition: e.detail.value })
    this._saveProgress()
  },

  toggleJdPanel() {
    this.setData({ showJdPanel: !this.data.showJdPanel })
  },

  onJdInput(e) {
    this.setData({ jobDescription: e.detail.value })
    this._saveProgress()
  },

  // ── 邮箱输入与后缀建议 ────────────────────────────────────────────────────────

  onEmailInput(e) {
    const value = e.detail.value
    const hasAt  = value.includes('@')
    let emailPrefix = ''
    let showDropdown = false

    if (value && !hasAt) {
      emailPrefix  = value
      showDropdown = true
    }

    this.setData({ email: value, emailPrefix, showEmailDropdown: showDropdown })
    this._saveProgress()
  },

  selectEmailSuffix(e) {
    const suffix    = e.currentTarget.dataset.suffix
    const fullEmail = (this.data.emailPrefix || '') + suffix
    this.setData({ email: fullEmail, emailPrefix: '', showEmailDropdown: false })
    this._saveProgress()
  },

  closeEmailDropdown() {
    this.setData({ showEmailDropdown: false })
  },

  // ── 文件选择与上传 ───────────────────────────────────────────────────────────

  chooseFile() {
    // TODO [PDF支持待完善]: PDF 上传入口暂时关闭，待以下问题解决后重新开放：
    //   1. 腾讯云 OCR 提取 PDF 文字时会混入 PDF 元数据噪声（%PDF、endobj 等），
    //      导致生成的预览图出现乱码，需要完善噪声过滤规则。
    //   2. 当 PDF 为设计软件导出（文字路径化）时，OCR 识别率和排版还原度有待验证。
    //   3. 开放时：将 extension 改回 ['docx', 'doc', 'pdf']，恢复大小校验和 PDF 说明弹窗，
    //      并更新 FIELD_HELP.resume.content。
    wx.chooseMessageFile({
      count:     1,
      type:      'file',
      extension: ['docx', 'doc'],   // 暂时只允许 Word 格式
      success: (res) => {
        const file = res.tempFiles[0]
        if (!file) return
        const ext = file.name.split('.').pop().toLowerCase()
        if (!['docx', 'doc'].includes(ext)) { this.toast('仅支持 .docx / .doc 文件'); return }
        if (file.size > 10 * 1024 * 1024) { this.toast('Word 文件不能超过 10MB'); return }
        this._doSetFileAndUpload(file)
      },
      fail(err) {
        if (err.errMsg && err.errMsg.includes('cancel')) return
        wx.showToast({ title: '文件选择失败', icon: 'none' })
      },
    })
  },

  /** 设置文件信息并开始上传（chooseFile 的内部辅助，避免重复代码） */
  _doSetFileAndUpload(file) {
    this.setData({
      fileInfo:        { name: file.name, size: file.size, path: file.path },
      uploadedFileKey: '',
      uploadProgress:  0,
    })
    this.uploadFile(file)
  },

  async uploadFile(file) {
    getApp().ensureCloudInited()

    if (!wx.cloud) {
      wx.showModal({
        title:     '环境未就绪',
        content:   '请在微信开发者工具中开通云开发（CloudBase），详见配置指南',
        showCancel: false,
      })
      return
    }
    this.setData({ uploading: true, uploadProgress: 10 })
    try {
      const openid    = getApp().globalData.openid || 'guest'
      const cloudPath = `client_uploads/${openid}/${Date.now()}_${file.name}`
      this.setData({ uploadProgress: 30 })

      const uploadRes = await new Promise((resolve, reject) => {
        wx.cloud.uploadFile({
          cloudPath,
          filePath: file.path,
          success:  resolve,
          fail:     (err) => reject(new Error(err.errMsg || '上传失败')),
        })
      })

      this.setData({ uploadProgress: 100, uploadedFileKey: uploadRes.fileID, uploading: false })
      this._saveProgress()
    } catch (err) {
      this.setData({ uploading: false, uploadProgress: 0 })
      wx.showModal({ title: '上传失败', content: err.message || '网络异常，请重试', showCancel: false })
    }
  },

  // ── 表单验证 ─────────────────────────────────────────────────────────────────

  _validate() {
    const d = this.data

    if (!d.polishMode)         { this.toast('请选择润色模式');   return false }
    if (d.polishMode === 'position' && !d.targetPosition.trim()) {
      this.toast('岗位润色模式需填写目标岗位'); return false
    }
    if (!d.polishingIntensity) { this.toast('请选择润色强度');   return false }
    if (!d.userIdentity)       { this.toast('请选择求职者身份'); return false }
    if (!d.uploadedFileKey)    { this.toast('请上传简历文档');   return false }

    // 邮箱（处理全角字符）
    const email = d.email.trim()
      .replace(/＠/g, '@')
      .replace(/．/g, '.')
      .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    if (email !== d.email) this.setData({ email })
    if (email && (!email.includes('@') || email.split('@').length !== 2 || !email.split('@')[1].includes('.'))) {
      this.toast('邮箱格式不正确'); return false
    }

    return true
  },

  // ── 提交（点击按钮后先弹支付确认弹窗） ────────────────────────────────────────

  async submitOrder() {
    if (this.data.submitting || this.data.uploading) return

    // 在用户手势上下文中（tap 事件同步代码段内）先请求订阅消息授权
    // 必须在任何 await 之前调用，否则微信会拒绝弹窗
    if (!this.data.subscribed) {
      this._requestSubscribeSilent()
    }

    if (!this._validate()) return

    // 表单校验通过后展示支付确认弹窗，不直接提交
    const svc = PAYMENT_DISPLAY.resume_optimize
    this.setData({
      payVisible:      true,
      payServiceLabel: svc.label,
      payPriceDisplay: svc.priceDisplay,
    })
  },

  /** 关闭支付弹窗（支付进行中不可关闭） */
  closePayModal() {
    if (this.data.paying) return
    this.setData({ payVisible: false })
  },

  /** 用户在支付弹窗中点击"微信支付" */
  async handlePay() {
    if (this.data.paying) return
    this.setData({ paying: true })

    try {
      // 1. 调用 payment_web 云函数创建支付订单
      const payRes = await request.paymentPost('client_create_payment', {
        serviceType: 'resume_optimize',
      })

      // 支付开关关闭（PAYMENT_ENABLED=false）时，直接跳过支付提交工单
      if (payRes.skip) {
        this.setData({ payVisible: false, paying: false })
        await this._doSubmitOrder()
        return
      }

      // 2. 调起微信支付
      await new Promise((resolve, reject) => {
        wx.requestPayment({
          timeStamp: payRes.paymentParams.timeStamp,
          nonceStr:  payRes.paymentParams.nonceStr,
          package:   payRes.paymentParams.package,
          signType:  payRes.paymentParams.signType,
          paySign:   payRes.paymentParams.paySign,
          success:   resolve,
          fail(err) {
            // 用户主动取消支付时 errMsg 包含 "cancel"
            const msg = (err && err.errMsg) || ''
            reject(new Error(msg.includes('cancel') ? 'CANCEL' : (msg || '支付失败')))
          },
        })
      })

      // 3. 支付成功，执行实际工单提交
      this.setData({ payVisible: false, paying: false })
      await this._doSubmitOrder()

    } catch (err) {
      this.setData({ paying: false })
      if (err.message === 'CANCEL') return  // 用户取消，静默处理
      wx.showModal({
        title:      '支付失败',
        content:    err.message || '支付遇到问题，请重试',
        showCancel: false,
      })
    }
  },

  /** 实际创建工单（支付成功后调用，逻辑与原 submitOrder 完全一致） */
  async _doSubmitOrder() {
    this.setData({ submitting: true })
    try {
      const d   = this.data
      const res = await request.post('client_create_order', {
        email:              d.email.trim(),
        userIdentity:       d.userIdentity,
        polishMode:         d.polishMode,
        targetPosition:     d.targetPosition.trim(),
        polishingIntensity: d.polishingIntensity,
        jobDescription:     d.jobDescription.trim(),
        resumeFileKey:      d.uploadedFileKey,
        resumeFileName:     d.fileInfo ? d.fileInfo.name : '',
      })
      this._clearProgress()
      this.setData({ submitting: false, submitted: true, orderId: res.orderId, orderDbId: res._id })
    } catch (err) {
      this.setData({ submitting: false })
      wx.showModal({ title: '提交失败', content: err.message || '网络异常', showCancel: false })
    }
  },

  // ── 成功页跳转 ───────────────────────────────────────────────────────────────

  goOrderDetail() {
    wx.redirectTo({ url: `/pages/order-detail/index?orderId=${this.data.orderId}` })
  },

  /**
   * 静默请求订阅消息授权（在 submitOrder 手势上下文中自动调用）
   * 成功/拒绝均静默处理，不打断用户当前操作；
   * 仅当权限被全局关闭（ban）时才给出系统设置引导。
   */
  _requestSubscribeSilent() {
    const TMPL_ID = 'JjmTIHO6iRrDLfRkZNutEfmxo-eLabK5tFmJYVLX8IY'
    if (!wx.requestSubscribeMessage) return

    wx.requestSubscribeMessage({
      tmplIds: [TMPL_ID],
      success: (res) => {
        console.log('[subscribe] auto result:', JSON.stringify(res))
        const state = res[TMPL_ID]
        if (state === 'accept') {
          this.setData({ subscribed: true })
        } else if (state === 'ban') {
          wx.showModal({
            title:       '通知权限已关闭',
            content:     '请前往「微信 → 我 → 设置 → 隐私 → 订阅消息」开启，以便在成品完成时接收提醒',
            showCancel:  false,
            confirmText: '知道了',
          })
        }
      },
      fail: (err) => {
        console.warn('[subscribe] auto fail:', err.errCode || err.errMsg)
      },
    })
  },

  /**
   * 手动请求订阅消息授权（成功页「开启完成提醒」按钮调用）
   *
   * ⚠️  macOS 微信开发者工具对此 API 支持不完整，errCode 20004/20005 属正常现象。
   *     请在真机上测试，届时将出现原生底部弹窗供用户勾选。
   */
  requestNotification() {
    const TMPL_ID = 'JjmTIHO6iRrDLfRkZNutEfmxo-eLabK5tFmJYVLX8IY'

    if (!wx.requestSubscribeMessage) {
      wx.showToast({ title: '当前基础库版本不支持订阅通知', icon: 'none' })
      return
    }

    wx.requestSubscribeMessage({
      tmplIds: [TMPL_ID],
      success: (res) => {
        console.log('[subscribe] result:', JSON.stringify(res))
        const state = res[TMPL_ID]
        if (state === 'accept') {
          this.setData({ subscribed: true })
          wx.showToast({ title: '已开启完成提醒', icon: 'success' })
        } else if (state === 'reject' || state === 'dismiss') {
          wx.showToast({ title: '已跳过，制作完成后可在订单详情查看', icon: 'none' })
        } else if (state === 'ban') {
          wx.showModal({
            title:      '通知权限已关闭',
            content:    '请前往「微信 → 我 → 设置 → 隐私 → 订阅消息」开启后再试',
            showCancel: false,
            confirmText: '知道了',
          })
        }
      },
      fail: (err) => {
        const code = err.errCode || err.code || ''
        console.warn('[subscribe] fail:', JSON.stringify(err))
        if (code === 20004 || code === '20004') {
          wx.showModal({
            title:      '订阅消息权限未开启',
            content:    '请前往「微信 → 我 → 设置 → 隐私 → 订阅消息」开启后再试',
            showCancel: false,
            confirmText: '知道了',
          })
        } else if (code === 20005 || code === '20005') {
          wx.showToast({ title: '请先在 MP 平台配置订阅消息模板', icon: 'none' })
        } else {
          wx.showToast({ title: '开发者工具暂不支持，请在真机上测试', icon: 'none', duration: 3000 })
        }
      },
    })
  },

  goHome() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack({ delta: pages.length - 1 })
    } else {
      wx.reLaunch({ url: '/pages/index/index' })
    }
  },

  // ── 工具 ──────────────────────────────────────────────────────────────────────

  toast(msg) { wx.showToast({ title: msg, icon: 'none', duration: 2000 }) },

  noop() {},
})
