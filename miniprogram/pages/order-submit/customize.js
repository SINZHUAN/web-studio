/**
 * 简历定制工单提交页
 *
 * 流程（三步子页面）：
 *   step = 'template'    → 子页1：选择简历模板
 *   step = 'params'      → 子页2：填写参数 + 上传旧简历
 *   step = 'recognizing' → 子页3：AI 识别中
 *   step = 'review'      → 子页3：审阅识别结果
 *   step = 'supplement'  → 子页3：补填缺失内容
 *   step = 'submitting'  → 提交工单中
 *   step = 'done'        → 提交成功
 *
 * ⚠️  支付金额配置：实际收款在 payment_web/index.js SERVICE_PRICES.resume_customize
 */

const request = require('../../utils/request')

// ── 支付配置（与 payment_web/index.js 的 SERVICE_PRICES 保持一致）──────────────
// ⚠️  price 单位为"分"，测试阶段 price=1（0.01元），正式上线改为 price=1900（19.00元）
const PAYMENT_DISPLAY = {
  resume_customize: { label: '简历定制', priceDisplay: '0.01' },  // 测试用；正式上线改为 '19.00'
}
// ── 若需跳过支付（测试/免费），将下方改为 true ─────────────────────────────────
const SKIP_PAYMENT = true  // ⚠️ 支付已临时关闭，正式上线前改回 false
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 经历类（work / internship / project / school_experience）补全项在界面上的短标题。
 * 仅影响 gap item 的 label 展示；不参与 fieldKey、_mod、_field 及提交数据。
 */
function shortExpGapFieldLabel(moduleKey, field, fieldLabels) {
  const MAP = {
    work: {
      company: '工作公司',
      position: '工作职位',
      startDate: '开始时间',
      endDate: '结束时间',
      content: '描述内容',
    },
    internship: {
      company: '实习公司',
      position: '实习职位',
      startDate: '开始时间',
      endDate: '结束时间',
      content: '描述内容',
    },
    project: {
      projectName: '项目名称',
      role: '担任角色',
      startDate: '开始时间',
      endDate: '结束时间',
      content: '描述内容',
    },
    school_experience: {
      experienceName: '经历名称',
      role: '担任角色',
      startDate: '开始时间',
      endDate: '结束时间',
      content: '描述内容',
    },
  }
  const row = MAP[moduleKey]
  if (row && Object.prototype.hasOwnProperty.call(row, field)) return row[field]
  return (fieldLabels && fieldLabels[field]) || field
}

// ── 模板上线状态（available: 已上线可选；false: 即将上线，灰色禁用）────────────
// ⚠️  当新模板 Word + 预览图上传至云存储后，将对应条目改为 available: true
const TEMPLATE_OPTIONS = [
  { id: 'word_r_1', label: '模板 R1', previewUrl: '', available: true  },
  { id: 'word_r_2', label: '模板 R2', previewUrl: '', available: false },
  { id: 'word_r_3', label: '模板 R3', previewUrl: '', available: false },
  { id: 'word_r_4', label: '模板 R4', previewUrl: '', available: false },
  { id: 'word_r_5', label: '模板 R5', previewUrl: '', available: false },
]

Page({
  data: {
    // ── 当前步骤 ──────────────────────────────────────────────────────────────
    // 'template' | 'params' | 'recognizing' | 'review' | 'supplement' | 'submitting' | 'done'
    step: 'template',

    // ── 模板选择 ──────────────────────────────────────────────────────────────
    templateOptions: TEMPLATE_OPTIONS,
    templatePreviewLoading: false,
    selectedTemplateId: '',
    selectedTemplateLabel: '',

    // ── 求职者身份 ────────────────────────────────────────────────────────────
    identityLabels: ['全职', '实习', '在校'],
    identityValues: ['full', 'internship', 'student'],
    identityDisplayLabel: '请选择',
    userType: '',                // 内部值 'work' | 'internship' | 'student'

    // ── 润色参数 ──────────────────────────────────────────────────────────────
    modeLabels:    ['针对岗位润色', '依据自身润色'],
    modeValues:    ['position', 'self'],
    modeDisplayLabel: '请选择',
    polishMode:    '',

    intensityLabels: ['资深版', '标准版', '基础版'],
    intensityValues: ['senior', 'standard', 'basic'],
    intensityDisplayLabel: '请选择',
    polishingIntensity: '',

    targetPosition:  '',
    jobDescription:  '',
    showJdPanel:     false,

    // ── 邮箱 ──────────────────────────────────────────────────────────────────
    email:             '',
    emailPrefix:       '',
    showEmailDropdown: false,
    emailSuffixes: ['@qq.com', '@163.com', '@126.com', '@gmail.com', '@foxmail.com'],

    // ── 文件上传 ──────────────────────────────────────────────────────────────
    fileInfo:        null,
    uploadProgress:  0,
    uploading:       false,
    uploadedFileKey: '',     // CloudBase fileID

    // ── AI 识别 ───────────────────────────────────────────────────────────────
    recognizingStatus: 'AI 正在识别简历内容...',
    extractedData: null,

    // ── 识别结果预览（简化展示） ──────────────────────────────────────────────
    reviewSections: [],      // [{ label, fields: [{key, label, value}] }]

    // ── 模块总览（review 页顶部格子状态）────────────────────────────────────
    moduleOverview: [],      // [{ key, label, status: 'ok'|'gap' }]

    // ── 可折叠模块列表（review 合并页，排序后）──────────────────────────────
    // [{ key, label, status:'missing'|'partial'|'complete', statusText, sortOrder,
    //    fields:[{key,label,value}], count, hasFields, gapItemsFlat:[{...gapItem, gapModuleIdx, itemIdx}], hasGaps }]
    collapsedModules: [],
    expandedKeys: {},        // { moduleKey: true/false }

    // ── 补填表单 ──────────────────────────────────────────────────────────────
    gapModules: [],          // 检测到的空缺模块列表，用于渲染补填表单

    // ── 提交状态 ──────────────────────────────────────────────────────────────
    submitting:  false,
    orderId:     '',
    orderDbId:   '',
    subscribed:  false,

    // ── 支付弹窗 ──────────────────────────────────────────────────────────────
    payVisible:      false,
    paying:          false,
    payServiceLabel: '',
    payPriceDisplay: '',
  },

  // ── 生命周期 ──────────────────────────────────────────────────────────────────

  onLoad() {
    this._restoreDraft()
    // 恢复草稿后用已保存的 userType，若未选择则用 internship（当前有预览图的唯一身份）
    const restoredUserType = this.data.userType || 'internship'
    this._loadTemplatePreviews(restoredUserType)
  },

  // ── 模板预览图加载 ────────────────────────────────────────────────────────────
  // ⚠️  当前云存储只有 internship 版本的预览图（r_1.jpg）
  //     其余模板/身份的预览图上传后，此函数会自动使用对应图片

  async _loadTemplatePreviews(userType) {
    if (this.data.templatePreviewLoading) return
    this.setData({ templatePreviewLoading: true })
    try {
      // 优先尝试请求目标 userType 的预览图，云函数会自动降级到 internship
      const res = await request.wordPost('getRecognitionTemplateUrls', {
        userType: userType || 'internship',
      })
      if (res && res.urls && Object.keys(res.urls).length > 0) {
        const updated = this.data.templateOptions.map(tpl => ({
          ...tpl,
          previewUrl: res.urls[tpl.id] || '',
        }))
        this.setData({ templateOptions: updated })
        console.log('[简历定制] 模板预览图加载成功，数量:', Object.keys(res.urls).length)
      } else {
        console.warn('[简历定制] 模板预览图未返回，显示占位符')
      }
    } catch (e) {
      console.warn('[简历定制] 模板预览图加载失败:', e.message)
    } finally {
      this.setData({ templatePreviewLoading: false })
    }
  },

  // ── 草稿持久化 ───────────────────────────────────────────────────────────────

  _saveDraft() {
    if (this.data.step === 'done') return
    const d = this.data
    try {
      wx.setStorageSync('customize_draft', {
        selectedTemplateId:  d.selectedTemplateId,
        userType:            d.userType,
        polishMode:          d.polishMode,
        polishingIntensity:  d.polishingIntensity,
        targetPosition:      d.targetPosition,
        jobDescription:      d.jobDescription,
        email:               d.email,
        uploadedFileKey:     d.uploadedFileKey,
        fileInfo:            d.fileInfo,
      })
    } catch (e) { /* ignore */ }
  },

  _restoreDraft() {
    try {
      const draft = wx.getStorageSync('customize_draft')
      if (!draft) return
      const IDENTITY_MAP = { full: 0, internship: 1, student: 2 }
      const MODE_MAP     = { position: 0, self: 1 }
      const INTENSITY_MAP= { senior: 0, standard: 1, basic: 2 }
      const IDENTITY_LABELS = ['全职', '实习', '在校']
      const MODE_LABELS     = ['针对岗位润色', '依据自身润色']
      const INTENSITY_LABELS= ['资深版', '标准版', '基础版']

      // 草稿中的 fileId 必须属于 web-02 环境才能被 word_processor_web 正常访问
      // 如果是旧版上传到 jk3 环境的 fileId，直接丢弃，强制重新上传
      const WEB02_ENV    = 'jiandacom-prod-d2gnxqxs93455d5d7'
      const savedFileKey = draft.uploadedFileKey || ''
      const fileKeyValid = savedFileKey.includes(WEB02_ENV)
      if (savedFileKey && !fileKeyValid) {
        console.warn('[简历定制] 草稿中的 fileId 来自旧环境，已清除，需重新上传文件')
      }

      this.setData({
        selectedTemplateId:    draft.selectedTemplateId   || '',
        selectedTemplateLabel: TEMPLATE_OPTIONS.find(t => t.id === draft.selectedTemplateId)?.label || '',
        userType:              draft.userType             || '',
        identityDisplayLabel:  IDENTITY_LABELS[IDENTITY_MAP[draft.userType]] || '请选择',
        polishMode:            draft.polishMode           || '',
        modeDisplayLabel:      MODE_LABELS[MODE_MAP[draft.polishMode]] || '请选择',
        polishingIntensity:    draft.polishingIntensity   || '',
        intensityDisplayLabel: INTENSITY_LABELS[INTENSITY_MAP[draft.polishingIntensity]] || '请选择',
        targetPosition:        draft.targetPosition       || '',
        jobDescription:        draft.jobDescription       || '',
        email:                 draft.email                || '',
        // fileId 来自错误环境时清除，防止 -501001 跨环境访问失败
        uploadedFileKey:       fileKeyValid ? savedFileKey : '',
        fileInfo:              fileKeyValid ? (draft.fileInfo || null) : null,
      })
    } catch (e) { /* ignore */ }
  },

  _clearDraft() {
    try { wx.removeStorageSync('customize_draft') } catch (e) { /* ignore */ }
  },

  // ── 子页导航 ──────────────────────────────────────────────────────────────────

  /** 子页1 → 子页2：验证模板和身份已选，进入参数填写页 */
  goNextStep() {
    if (!this.data.userType) {
      this._toast('请先选择求职者身份')
      return
    }
    if (!this.data.selectedTemplateId) {
      this._toast('请先选择一个简历模板')
      return
    }
    this.setData({ step: 'params' })
  },

  /** 子页2 → 子页1：返回模板选择 */
  goPrevStep() {
    this.setData({ step: 'template' })
  },

  // ── 模板选择 ──────────────────────────────────────────────────────────────────

  selectTemplate(e) {
    const id        = e.currentTarget.dataset.id
    const label     = e.currentTarget.dataset.label
    const available = e.currentTarget.dataset.available
    if (!available) {
      wx.showToast({ title: '该模板即将上线，敬请期待', icon: 'none', duration: 2000 })
      return
    }
    this.setData({ selectedTemplateId: id, selectedTemplateLabel: label })
    this._saveDraft()
  },

  _openTemplatePreviewImage(url) {
    if (!url) return
    const urls = this.data.templateOptions.map(t => t.previewUrl).filter(Boolean)
    wx.previewImage({
      current: url,
      urls: urls.length ? urls : [url],
    })
  },

  /** 点击模板预览图：系统全屏预览，不影响选中状态与其它逻辑 */
  previewTemplateImage(e) {
    this._openTemplatePreviewImage(e.currentTarget.dataset.url)
  },

  /**
   * 不可用模板上的蒙层：有预览图则放大查看（与预览区一致）；无图则与点选卡片相同提示
   */
  onUnavailableTemplateOverlayTap(e) {
    const url = e.currentTarget.dataset.url
    if (url) {
      this._openTemplatePreviewImage(url)
      return
    }
    wx.showToast({ title: '该模板即将上线，敬请期待', icon: 'none', duration: 2000 })
  },

  // ── Picker 选择 ───────────────────────────────────────────────────────────────

  onIdentityChange(e) {
    const i = +e.detail.value
    const IDENTITY_MAP_TO_USERTYPE = { full: 'work', internship: 'internship', student: 'student' }
    const val = this.data.identityValues[i]
    const newUserType = IDENTITY_MAP_TO_USERTYPE[val] || val
    this.setData({
      identityDisplayLabel: this.data.identityLabels[i],
      userType: newUserType,
    })
    this._saveDraft()
    // 身份切换后刷新模板预览（当目标身份有独立预览图时会显示对应图；否则云函数自动降级）
    this._loadTemplatePreviews(newUserType)
  },

  onModeChange(e) {
    const i = +e.detail.value
    this.setData({
      modeDisplayLabel: this.data.modeLabels[i],
      polishMode: this.data.modeValues[i],
    })
    this._saveDraft()
  },

  onIntensityChange(e) {
    const i = +e.detail.value
    this.setData({
      intensityDisplayLabel: this.data.intensityLabels[i],
      polishingIntensity: this.data.intensityValues[i],
    })
    this._saveDraft()
  },

  onPositionInput(e) {
    this.setData({ targetPosition: e.detail.value })
    this._saveDraft()
  },

  toggleJdPanel() {
    this.setData({ showJdPanel: !this.data.showJdPanel })
  },

  onJdInput(e) {
    this.setData({ jobDescription: e.detail.value })
  },

  // ── 邮箱 ─────────────────────────────────────────────────────────────────────

  onEmailInput(e) {
    const val    = e.detail.value
    const atIdx  = val.indexOf('@')
    const prefix = atIdx >= 0 ? val.substring(0, atIdx) : val
    this.setData({
      email:             val,
      emailPrefix:       prefix,
      showEmailDropdown: atIdx < 0 && val.length > 0,
    })
    this._saveDraft()
  },

  onEmailSuffixTap(e) {
    const suffix   = e.currentTarget.dataset.suffix
    const email    = this.data.emailPrefix + suffix
    this.setData({ email, showEmailDropdown: false })
    this._saveDraft()
  },

  closeEmailDropdown() {
    this.setData({ showEmailDropdown: false })
  },

  // ── 文件上传 ──────────────────────────────────────────────────────────────────

  chooseFile() {
    if (this.data.uploading) return
    wx.chooseMessageFile({
      count: 1,
      type:  'file',
      extension: ['docx', 'doc', 'pdf'],
      success: (res) => {
        const file = res.tempFiles[0]
        this.setData({
          fileInfo:        { name: file.name, size: file.size, path: file.path },
          uploadedFileKey: '',
          uploadProgress:  0,
        })
        this.uploadFile(file)
      },
      fail: (err) => {
        if (!err.errMsg.includes('cancel')) {
          wx.showModal({ title: '选择失败', content: err.errMsg, showCancel: false })
        }
      },
    })
  },

  async uploadFile(file) {
    getApp().ensureCloudInited()
    if (!wx.cloud) {
      wx.showModal({ title: '环境未就绪', content: '请在微信开发者工具中开通云开发', showCancel: false })
      return
    }
    this.setData({ uploading: true, uploadProgress: 10 })
    try {
      const openid    = getApp().globalData.openid || ''
      const cloudPath = `recognition_uploads/${Date.now()}_${file.name}`
      this.setData({ uploadProgress: 30 })

      // ── 步骤 1：与 optimize.js 完全一致，先上传到小程序默认 jk3 环境 ──────
      const uploadRes = await new Promise((resolve, reject) => {
        wx.cloud.uploadFile({
          cloudPath,
          filePath: file.path,
          success:  resolve,
          fail: (err) => reject(new Error(err.errMsg || '上传失败')),
        })
      })
      const jk3FileId = uploadRes.fileID
      this.setData({ uploadProgress: 60 })
      console.log('[简历定制] 文件已上传到 jk3:', jk3FileId)

      // ── 步骤 2：通过 commission_web 桥接，将文件中转到 word_processor_web ──
      // 所在的 web-02 环境（跨环境直接 downloadFile 会报 -501001）
      const bridgeRes = await request.post('client_bridge_resume_file', {
        openid,
        fileID:   jk3FileId,
        fileName: file.name,
      })
      if (!bridgeRes || !bridgeRes.fileId) throw new Error('文件中转失败，请重试')

      this.setData({ uploadProgress: 100, uploadedFileKey: bridgeRes.fileId, uploading: false })
      this._saveDraft()
      console.log('[简历定制] 文件桥接成功，web-02 fileId:', bridgeRes.fileId)
    } catch (err) {
      this.setData({ uploading: false, uploadProgress: 0 })
      wx.showModal({ title: '上传失败', content: err.message || '网络异常，请重试', showCancel: false })
    }
  },

  // ── 表单验证 ──────────────────────────────────────────────────────────────────

  _validate() {
    const d = this.data
    if (!d.selectedTemplateId)   { this._toast('请选择简历模板');   return false }
    if (!d.userType)             { this._toast('请选择求职者身份'); return false }
    if (!d.polishMode)           { this._toast('请选择润色模式');   return false }
    if (!d.polishingIntensity)   { this._toast('请选择润色强度');   return false }
    if (d.polishMode === 'position' && !d.targetPosition.trim()) {
      this._toast('岗位润色需填写目标岗位'); return false
    }
    if (!d.uploadedFileKey)      { this._toast('请上传旧版简历文档'); return false }
    if (d.uploading)             { this._toast('文件上传中，请稍候'); return false }
    // 安全检查：确保文件上传到了 web-02 环境（防止旧缓存造成 -501001 错误）
    if (!d.uploadedFileKey.includes('jiandacom-prod-d2gnxqxs93455d5d7')) {
      this._toast('请重新上传简历文件')
      this.setData({ uploadedFileKey: '', fileInfo: null })
      return false
    }
    return true
  },

  // ── 识别 ──────────────────────────────────────────────────────────────────────

  /** 点击"开始识别"按钮 */
  async startRecognition() {
    if (!this._validate()) return

    if (SKIP_PAYMENT) {
      await this._doRecognize()
      return
    }

    // 弹出支付确认弹窗
    const svc = PAYMENT_DISPLAY.resume_customize
    this.setData({
      payVisible:      true,
      payServiceLabel: svc.label,
      payPriceDisplay: svc.priceDisplay,
    })
  },

  closePayModal() {
    if (this.data.paying) return
    this.setData({ payVisible: false })
  },

  /** 用户点击"微信支付"按钮 */
  async handlePay() {
    if (this.data.paying) return
    this.setData({ paying: true })
    try {
      // 1. 调用 payment_web 创建支付订单
      const payRes = await request.paymentPost('client_create_payment', {
        serviceType: 'resume_customize',
      })

      // 支付开关关闭时（PAYMENT_ENABLED=false），返回 skip 标记，直接跳过支付
      if (payRes.skip) {
        this.setData({ paying: false, payVisible: false })
        await this._doRecognize()
        return
      }

      // 2. 调起微信支付（参数在 paymentParams 字段下）
      const p = payRes.paymentParams
      await new Promise((resolve, reject) => {
        wx.requestPayment({
          timeStamp: p.timeStamp,
          nonceStr:  p.nonceStr,
          package:   p.package,
          signType:  p.signType || 'MD5',
          paySign:   p.paySign,
          success:   resolve,
          fail: (err) => {
            const msg = (err && err.errMsg) || ''
            reject(new Error(msg.includes('cancel') ? 'CANCEL' : (msg || '支付失败')))
          },
        })
      })

      this.setData({ paying: false, payVisible: false })
      await this._doRecognize()
    } catch (err) {
      this.setData({ paying: false })
      if (err.message !== 'CANCEL') {
        wx.showModal({ title: '支付失败', content: err.message || '支付遇到问题，请重试', showCancel: false })
      }
    }
  },

  /**
   * 执行 AI 识别（两步：段落提取 → 模板清单驱动采集）
   *
   * 业务含义（与网页识别模式一致）：并非「把旧简历全文结构化」，而是系统根据用户所选的
   * 目标模板（标识库 + 记录库）先构建唯一数据清单 moduleSpecs，再让 AI 仅按该清单从旧简历
   * 中逐项摘取；展示与补全（gap）均只围绕这份清单，不包含模板不需要的模块。
   */
  async _doRecognize() {
    this.setData({ step: 'recognizing', recognizingStatus: 'AI 正在提取简历段落...' })

    try {
      const d = this.data

      // ── 步骤 1：从上传的文件提取文字段落（word_processor_web）──────────────
      let textContent = ''
      try {
        const extractRes = await request.wordPost('extractParagraphs', { fileId: d.uploadedFileKey })
        if (extractRes && Array.isArray(extractRes.paragraphs)) {
          textContent = extractRes.paragraphs
            .map(p => (typeof p === 'string' ? p : (p && p.text) || ''))
            .filter(t => t.trim())
            .join('\n')
        }
      } catch (extractErr) {
        console.warn('[简历定制] 段落提取失败，将尝试使用 fileId 直接识别:', extractErr.message)
      }

      if (!textContent.trim()) {
        throw new Error('无法提取简历文字内容，请确认文件为 .docx / .doc 格式且内容不为空')
      }

      // ── 步骤 2：AI 识别（recognition_extract_all）──────────────────────────
      this.setData({ recognizingStatus: 'AI 正在分析识别内容...' })

      const moduleSpecs = this._buildModuleSpecs(d.selectedTemplateId, d.userType)

      const aiRes = await request.aiPost('recognition_extract_all', {
        textContent,
        userType:   d.userType,
        moduleSpecs,
        templateId: d.selectedTemplateId,
      }, 120000)

      let extractedData = aiRes.extractedData || {}
      extractedData = this._normalizeExtractedForTemplate(extractedData)

      const reviewSections   = this._buildReviewSections(extractedData)
      const gapModules       = this._detectGaps(extractedData)
      const moduleOverview   = this._buildModuleOverview(extractedData)
      const collapsedModules = this._buildCollapsedModules(reviewSections, gapModules, moduleOverview)

      // 缺失/部分缺失模块自动展开，完整模块默认收起
      const expandedKeys = {}
      collapsedModules.forEach(m => {
        if (m.status !== 'complete') expandedKeys[m.key] = true
      })

      this.setData({
        extractedData,
        reviewSections,
        gapModules,
        moduleOverview,
        collapsedModules,
        expandedKeys,
        step: 'review',
      })
    } catch (err) {
      wx.showModal({
        title: 'AI 识别失败',
        content: err.message || '识别过程出错，请重试',
        showCancel: true,
        confirmText: '重试',
        cancelText:  '返回',
        success: (r) => {
          if (r.confirm) {
            this._doRecognize()
          } else {
            this.setData({ step: 'params' })
          }
        },
      })
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 标识库（严格从 src/config/recognitionTemplateConfig.js 复制，保持完全一致）
  // 任何修改必须同步更新网页端配置文件
  // ═══════════════════════════════════════════════════════════════════════════

  /** 模块编号 → 模块 key */
  _MODULE_NUMBER_TO_KEY() {
    return {
      1: 'basic', 2: 'career', 3: 'work', 4: 'internship',
      5: 'education', 6: 'skill', 7: 'project', 8: 'certificate',
      9: 'skill_certificate', 10: 'self_evaluation', 11: 'hobby',
      12: 'exam_info', 13: 'school_experience',
    }
  },

  /** 模块中文标签 */
  _MODULE_LABELS() {
    return {
      basic: '基本信息', career: '求职意愿', education: '教育经历',
      work: '工作经历', internship: '实习经历', project: '项目经历',
      school_experience: '在校经历', skill: '职业技能',
      certificate: '奖项证书', skill_certificate: '技能证书',
      self_evaluation: '自我评价', hobby: '兴趣爱好', exam_info: '报考信息',
    }
  },

  /** 模板标识库（templateId_userType → 有序模块编号数组，严格对应网页端） */
  _TEMPLATE_REQUIRED_MODULES() {
    return {
      'word_r_1_work':        [1, 2, 5, 3, 7, 6, 9, 10],
      'word_r_1_internship':  [1, 5, 4, 7, 6],
      'word_r_1_student':     [1, 2, 5, 13, 7, 6, 8, 10],
      'word_r_2_work':        [1, 2, 5, 3, 6, 10],
      'word_r_2_internship':  [1, 2, 5, 4, 6, 10],
      'word_r_2_student':     [1, 2, 5, 13, 6, 10],
      'word_r_3_work':        [1, 2, 5, 3, 7, 6, 10],
      'word_r_3_internship':  [1, 2, 5, 4, 7, 6, 10],
      'word_r_3_student':     [1, 2, 5, 13, 7, 6, 10],
      'word_r_4_work':        [1, 2, 5, 3, 7, 6, 8, 9, 10],
      'word_r_4_internship':  [1, 2, 5, 4, 7, 6, 8, 9, 10],
      'word_r_4_student':     [1, 2, 5, 13, 7, 6, 8, 10],
      'word_r_5_work':        [1, 2, 5, 3, 7, 6, 8, 9, 10],
      'word_r_5_internship':  [1, 2, 5, 4, 7, 6, 8, 9, 10],
      'word_r_5_student':     [1, 2, 5, 13, 7, 6, 8, 9, 10],
    }
  },

  /** 记录库（templateId_userType → 每个模块条数，0 = 不含此模块，严格对应网页端） */
  _TEMPLATE_ACTUAL_RECORDS_COUNT() {
    return {
      'word_r_1_work': {
        basic:1, career:1, work:3, internship:0, education:2,
        skill:8, project:2, certificate:0, skill_certificate:3,
        self_evaluation:1, hobby:0, exam_info:0, school_experience:0,
      },
      'word_r_1_internship': {
        basic:1, career:0, work:0, internship:3, education:1,
        skill:2, project:1, certificate:0, skill_certificate:0,
        self_evaluation:0, hobby:0, exam_info:0, school_experience:0,
      },
      'word_r_1_student': {
        basic:1, career:1, work:0, internship:0, education:2,
        skill:8, project:2, certificate:3, skill_certificate:0,
        self_evaluation:1, hobby:0, exam_info:0, school_experience:3,
      },
      'word_r_2_work': {
        basic:1, career:1, work:2, internship:0, education:1,
        skill:5, project:0, certificate:0, skill_certificate:0,
        self_evaluation:1, hobby:0, exam_info:0, school_experience:0,
      },
      'word_r_2_internship': {
        basic:1, career:1, work:0, internship:2, education:1,
        skill:5, project:0, certificate:0, skill_certificate:0,
        self_evaluation:1, hobby:0, exam_info:0, school_experience:0,
      },
      'word_r_2_student': {
        basic:1, career:1, work:0, internship:0, education:1,
        skill:5, project:0, certificate:0, skill_certificate:0,
        self_evaluation:1, hobby:0, exam_info:0, school_experience:2,
      },
      'word_r_3_work': {
        basic:1, career:1, work:3, internship:0, education:2,
        skill:6, project:2, certificate:0, skill_certificate:0,
        self_evaluation:1, hobby:0, exam_info:0, school_experience:0,
      },
      'word_r_3_internship': {
        basic:1, career:1, work:0, internship:3, education:2,
        skill:6, project:2, certificate:0, skill_certificate:0,
        self_evaluation:1, hobby:0, exam_info:0, school_experience:0,
      },
      'word_r_3_student': {
        basic:1, career:1, work:0, internship:0, education:2,
        skill:6, project:2, certificate:0, skill_certificate:0,
        self_evaluation:1, hobby:0, exam_info:0, school_experience:2,
      },
      'word_r_4_work': {
        basic:1, career:1, work:3, internship:0, education:2,
        skill:8, project:3, certificate:3, skill_certificate:3,
        self_evaluation:1, hobby:0, exam_info:0, school_experience:0,
      },
      'word_r_4_internship': {
        basic:1, career:1, work:0, internship:3, education:2,
        skill:8, project:3, certificate:3, skill_certificate:3,
        self_evaluation:1, hobby:0, exam_info:0, school_experience:0,
      },
      'word_r_4_student': {
        basic:1, career:1, work:0, internship:0, education:2,
        skill:8, project:3, certificate:3, skill_certificate:0,
        self_evaluation:1, hobby:0, exam_info:0, school_experience:3,
      },
      'word_r_5_work': {
        basic:1, career:1, work:4, internship:0, education:2,
        skill:10, project:3, certificate:4, skill_certificate:4,
        self_evaluation:1, hobby:0, exam_info:0, school_experience:0,
      },
      'word_r_5_internship': {
        basic:1, career:1, work:0, internship:4, education:2,
        skill:10, project:3, certificate:4, skill_certificate:4,
        self_evaluation:1, hobby:0, exam_info:0, school_experience:0,
      },
      'word_r_5_student': {
        basic:1, career:1, work:0, internship:0, education:2,
        skill:10, project:3, certificate:4, skill_certificate:4,
        self_evaluation:1, hobby:0, exam_info:0, school_experience:4,
      },
    }
  },

  /**
   * 构建 moduleSpecs（对应网页端 buildModuleSpecList）
   * = 当前【模板标识库 + 记录库】合成的 AI 采集清单：模块顺序、模块 key、各模块 maxCount
   */
  /**
   * 按模板记录库截断数组模块条数，避免 AI 多拆条目导致「多条待填」与槽位错位
   * （与云函数提示「超过最大条数只保留 N 条」一致，前端再兜底）
   */
  _normalizeExtractedForTemplate(extractedData) {
    const templateId = this.data.selectedTemplateId
    const userType   = this.data.userType
    const configKey  = templateId + '_' + userType
    const counts     = this._TEMPLATE_ACTUAL_RECORDS_COUNT()[configKey] || {}
    const listKeys   = [
      'education', 'work', 'internship', 'project', 'school_experience',
      'skill', 'certificate', 'skill_certificate', 'hobby',
    ]
    const out = { ...extractedData }
    listKeys.forEach(key => {
      const max = counts[key]
      if (!max || max <= 0) return
      const raw = out[key]
      if (!Array.isArray(raw) || raw.length <= max) return
      out[key] = raw.slice(0, max)
    })
    return out
  },

  _buildModuleSpecs(templateId, userType) {
    const configKey   = templateId + '_' + userType
    const numToKey    = this._MODULE_NUMBER_TO_KEY()
    const labels      = this._MODULE_LABELS()
    const moduleNums  = this._TEMPLATE_REQUIRED_MODULES()[configKey] || []
    const counts      = this._TEMPLATE_ACTUAL_RECORDS_COUNT()[configKey] || {}

    return moduleNums
      .map(num => numToKey[num])
      .filter(key => key && (counts[key] || 0) > 0)
      .map(key => ({
        moduleKey: key,
        label:     labels[key] || key,
        maxCount:  counts[key],
      }))
  },

  /**
   * 将 extractedData 转换为可视化预览数组
   * 按模板标识库顺序渲染，只显示该模板实际包含的模块
   */
  _buildReviewSections(extractedData) {
    const templateId = this.data.selectedTemplateId
    const userType   = this.data.userType
    const specs      = this._buildModuleSpecs(templateId, userType)
    const labels     = this._MODULE_LABELS()

    const SINGLE_OBJECT_MODULES = new Set(['basic', 'career', 'self_evaluation', 'hobby', 'exam_info'])
    const sections = []

    for (const spec of specs) {
      const { moduleKey, label } = spec
      if (moduleKey === 'basic') {
        const basic = extractedData.basic || {}
        const fields = []
        if (basic.name)   fields.push({ key: 'name',  label: '姓名',   value: basic.name })
        if (basic.phone)  fields.push({ key: 'phone', label: '电话',   value: basic.phone })
        if (basic.email)  fields.push({ key: 'email', label: '邮箱',   value: basic.email })
        if (basic.gender) fields.push({ key: 'gender',label: '性别',   value: basic.gender })
        if (fields.length) sections.push({ label, count: 1, fields })
        continue
      }
      if (SINGLE_OBJECT_MODULES.has(moduleKey)) {
        const obj = extractedData[moduleKey]
        if (obj && obj.content) {
          sections.push({ label, count: 1, fields: [{ key: moduleKey, label, value: obj.content }] })
        }
        continue
      }
      // 列表类模块
      const items = extractedData[moduleKey]
      if (!Array.isArray(items) || items.length === 0) continue
      const summaries = items.map((item, i) => {
        const desc = item.company || item.school || item.projectName
          || item.skillName || item.experienceName || item.name || ('第 ' + (i + 1) + ' 条')
        const sub  = item.position || item.major || item.role || item.level || ''
        return {
          key:   moduleKey + '_' + i,
          label: (i + 1) + '. ' + desc + (sub ? ' · ' + sub : ''),
          value: item.content || item.description || '',
        }
      })
      sections.push({ label, count: items.length, fields: summaries })
    }

    return sections
  },

  /**
   * 检测 extractedData 相对于模板要求的空缺（严格按标识库/记录库）
   * 对应网页端 detectGaps() 逻辑
   */
  _detectGaps(extractedData) {
    const templateId = this.data.selectedTemplateId
    const userType   = this.data.userType
    const configKey  = templateId + '_' + userType
    const counts     = this._TEMPLATE_ACTUAL_RECORDS_COUNT()[configKey] || {}
    const labels     = this._MODULE_LABELS()

    const SINGLE_OBJECT_MODULES = new Set(['basic', 'career', 'self_evaluation', 'hobby', 'exam_info'])

    // 各模块的关键字段（对应网页端 MODULE_KEY_FIELDS）
    const KEY_FIELDS = {
      education:         ['school', 'major', 'startDate', 'endDate', 'courses'],
      work:              ['company', 'position', 'startDate', 'endDate', 'content'],
      internship:        ['company', 'position', 'startDate', 'endDate', 'content'],
      project:           ['projectName', 'role', 'startDate', 'endDate', 'content'],
      school_experience: ['experienceName', 'role', 'startDate', 'endDate', 'content'],
      skill:             ['skillName', 'level', 'description'],
      certificate:       ['name', 'date', 'issuer'],
      skill_certificate: ['name', 'date', 'issuer'],
    }

    // 字段友好名
    const FIELD_LABELS = {
      school: '学校名称', major: '专业', startDate: '开始时间', endDate: '结束时间',
      courses: '主修课程', company: '公司/单位名称', position: '职位', content: '描述内容',
      projectName: '项目名称', role: '担任角色', experienceName: '经历名称',
      skillName: '技能名称', level: '掌握程度', description: '描述',
      name: '名称', date: '获得时间', issuer: '颁发机构',
    }

    const gaps = []

    /**
     * 经历类列表模块：「第N条」在 review 页角标（cardTitle）展示；
     * 单行字段标题使用 shortExpGapFieldLabel（如实习公司/实习职位），不再拼接「实习经历·」前缀。
     */
    const EXPERIENCE_GAP_MODULE_KEYS = new Set(['work', 'internship', 'project', 'school_experience'])

    // ── 基本信息：仅姓名、电话、邮箱、性别四项；满足即视为无需再补其它 basic 字段 ──
    const basic = extractedData.basic || {}
    const basicMissing = []
    const pushBasic = (field, label, fieldKey) => {
      if (!basic[field] || !String(basic[field]).trim()) {
        basicMissing.push({
          fieldKey,
          label,
          value:     '',
          inputType: 'text',
          _mod:      'basic',
          _field:    field,
          _recIdx:   -1,
          _newIdx:   -1,
        })
      }
    }
    pushBasic('name',   '姓名', 'basic_name')
    pushBasic('phone',  '电话', 'basic_phone')
    pushBasic('email',  '邮箱', 'basic_email')
    pushBasic('gender', '性别', 'basic_gender')
    if (basicMissing.length > 0) {
      gaps.push({ moduleKey: 'basic', label: '基本信息（缺失字段）', gapType: 'fields', items: basicMissing })
    }

    // ── 按记录库检测各列表模块 ───────────────────────────────────────────────
    for (const [moduleKey, maxCount] of Object.entries(counts)) {
      if (!maxCount || maxCount <= 0) continue
      // basic 已在上方单独处理（四项字段），此处跳过，避免误判 .content 不存在而 push 假 gap
      if (moduleKey === 'basic') continue

      const modLabel  = labels[moduleKey] || moduleKey
      const keyFields = KEY_FIELDS[moduleKey] || []

      // 单对象模块（self_evaluation / career 等）：只检测 content 是否存在
      if (SINGLE_OBJECT_MODULES.has(moduleKey)) {
        const obj = extractedData[moduleKey]
        if (!obj || !String(obj.content || '').trim()) {
          gaps.push({
            moduleKey,
            label: modLabel + '（未填写）',
            gapType: 'module',
            items: [{
              fieldKey:  moduleKey + '_content',
              label:     modLabel + ' 内容',
              value:     '',
              inputType: 'textarea',
              _mod: moduleKey, _field: 'content', _recIdx: -1, _newIdx: 0,
            }],
          })
        }
        continue
      }

      const raw     = extractedData[moduleKey]
      const records = Array.isArray(raw) ? raw : []
      const missing = Math.max(0, maxCount - records.length)
      const isExpModule = EXPERIENCE_GAP_MODULE_KEYS.has(moduleKey)

      // 已识别记录中字段缺口（_recIdx = 已有记录下标）
      const fieldGapItems = []
      records.forEach((rec, i) => {
        keyFields.forEach(f => {
          if (!rec[f] || !String(rec[f]).trim()) {
            fieldGapItems.push({
              fieldKey:  moduleKey + '_r' + i + '_' + f,
              label:     isExpModule
                ? shortExpGapFieldLabel(moduleKey, f, FIELD_LABELS)
                : (modLabel + ' 第' + (i + 1) + '条·' + (FIELD_LABELS[f] || f)),
              value:     '',
              inputType: (f === 'content' || f === 'courses' || f === 'description') ? 'textarea' : 'text',
              _mod: moduleKey, _field: f, _recIdx: i, _newIdx: -1,
              _humanRow: i + 1,
            })
          }
        })
      })

      // 缺失整条记录（_newIdx = 新记录序号）
      const missingItems = []
      for (let i = 0; i < missing; i++) {
        keyFields.forEach(f => {
          missingItems.push({
            fieldKey:  moduleKey + '_n' + i + '_' + f,
            label:     isExpModule
              ? shortExpGapFieldLabel(moduleKey, f, FIELD_LABELS)
              : (modLabel + ' 第' + (records.length + i + 1) + '条·' + (FIELD_LABELS[f] || f)),
            value:     '',
            inputType: (f === 'content' || f === 'courses' || f === 'description') ? 'textarea' : 'text',
            _mod: moduleKey, _field: f, _recIdx: -1, _newIdx: i,
            _humanRow: records.length + i + 1,
          })
        })
      }

      // 合并为单条 gap，避免出现同一模块两次「项目经历」待填（字段缺口 + 记录缺口各 push 一次）
      const mergedItems = fieldGapItems.concat(missingItems)
      if (mergedItems.length > 0) {
        let sub = ''
        if (fieldGapItems.length && missingItems.length) sub = '（字段待补 + 缺 ' + missing + ' 条）'
        else if (missingItems.length) sub = '（记录缺失 ' + missing + '/' + maxCount + '）'
        else sub = '（字段待补）'
        gaps.push({ moduleKey, label: modLabel + sub, gapType: 'mixed', items: mergedItems })
      }
    }

    return gaps
  },

  /**
   * 构建模块总览列表（review 页顶部格子）
   * 按模板标识库顺序枚举所有必需模块，判断是否已成功识别
   */
  _buildModuleOverview(extractedData) {
    const templateId  = this.data.selectedTemplateId
    const userType    = this.data.userType
    const configKey   = templateId + '_' + userType
    const requiredNums = this._TEMPLATE_REQUIRED_MODULES()[configKey] || []
    const numToKey    = this._MODULE_NUMBER_TO_KEY()
    const labels      = this._MODULE_LABELS()
    const counts      = this._TEMPLATE_ACTUAL_RECORDS_COUNT()[configKey] || {}

    const SINGLE_OBJECT_MODULES = new Set(['basic', 'career', 'self_evaluation', 'hobby', 'exam_info'])

    const overview = []
    for (const num of requiredNums) {
      const moduleKey = numToKey[num]
      if (!moduleKey) continue
      const maxCount = counts[moduleKey]
      if (!maxCount || maxCount <= 0) continue

      const label = labels[moduleKey] || moduleKey
      let status  = 'gap'

      if (moduleKey === 'basic') {
        const b = extractedData.basic || {}
        const coreOk = ['name', 'phone', 'email', 'gender'].every(
          k => b[k] && String(b[k]).trim()
        )
        status = coreOk ? 'ok' : 'gap'
      } else if (SINGLE_OBJECT_MODULES.has(moduleKey)) {
        const obj = extractedData[moduleKey]
        if (obj && typeof obj === 'object' &&
            Object.values(obj).some(v => v && String(v).trim())) {
          status = 'ok'
        }
      } else {
        const arr = extractedData[moduleKey]
        if (Array.isArray(arr) && arr.length > 0) status = 'ok'
      }

      overview.push({ key: moduleKey, label, status })
    }
    return overview
  },

  /**
   * 构建可折叠模块列表（合并 review + supplement）
   * 将所有必需模块按缺失程度排序：整体缺失 → 部分缺失 → 完整
   * 同时为 gap 项目保留 gapModuleIdx / itemIdx 供 onSupplementInput 使用
   */
  _buildCollapsedModules(reviewSections, gapModules, moduleOverview) {
    const sectionByLabel = {}
    reviewSections.forEach(s => { sectionByLabel[s.label] = s })

    const gapsByKey = {}
    gapModules.forEach((gap, idx) => {
      if (!gapsByKey[gap.moduleKey]) gapsByKey[gap.moduleKey] = []
      gapsByKey[gap.moduleKey].push({ gapModuleIdx: idx, gap })
    })

    // experience 模块的首行字段（两列 grid）
    const EXP_FIRST_ROW = {
      work:              ['company', 'position'],
      internship:        ['company', 'position'],
      project:           ['projectName', 'role'],
      school_experience: ['experienceName', 'role'],
    }
    const EXP_TIME_KEYS  = new Set(['startDate', 'endDate'])
    const EXP_MODULE_KEYS = new Set(Object.keys(EXP_FIRST_ROW))

    const items = moduleOverview.map(m => {
      const section    = sectionByLabel[m.label] || null
      const gapEntries = gapsByKey[m.key] || []
      const hasGapData = gapEntries.length > 0

      // 展平 gap items，保留原始下标（先展平，再用于 statusText 计数）
      const TIME_FIELDS = new Set(['startDate', 'endDate'])
      const gapItemsFlat = []
      gapEntries.forEach(({ gapModuleIdx, gap }) => {
        gap.items.forEach((item, itemIdx) => {
          gapItemsFlat.push({
            fieldKey: item.fieldKey, label: item.label, value: item.value,
            inputType: item.inputType,
            isTime:    TIME_FIELDS.has(item._field),
            _mod: item._mod, _field: item._field, _recIdx: item._recIdx, _newIdx: item._newIdx,
            /** 简历中第几条（与 _detectGaps 一致），供角标 cardTitle，勿丢否则回退成第 1 条 */
            _humanRow: item._humanRow,
            gapModuleIdx, itemIdx,
          })
        })
      })

      // ── 计算 statusText（已识别X条，待补全Y条）──────────────────────────────
      // 已识别条数：取 section.count（_buildReviewSections 输出，0 则整体未识别）
      const recognizedCount = section ? (section.count || 0) : 0
      // 待补全"条数"：按记录维度去重（每条 record/field-group 算一条）
      const distinctGapKeys = new Set(gapItemsFlat.map(it =>
        it._recIdx >= 0 ? ('r' + it._recIdx) : ('n' + it._newIdx)
      ))
      const gapCount = distinctGapKeys.size

      let status, statusText, sortOrder
      if (m.status === 'gap') {
        // moduleOverview 标记整体未识别
        status    = 'missing'
        statusText = '已识别 0 条，待补全 ' + gapCount + ' 条'
        sortOrder = 0
      } else if (hasGapData) {
        status    = 'partial'
        statusText = '已识别 ' + recognizedCount + ' 条，待补全 ' + gapCount + ' 条'
        sortOrder = 1
      } else {
        status    = 'complete'
        statusText = '识别完全'
        sortOrder = 2
      }

      // ── experience 模块：按记录分组，构造卡片结构供 WXML 直接渲染 ──
      let gapRecords = null
      const isExp = EXP_MODULE_KEYS.has(m.key)
      if (isExp && gapItemsFlat.length > 0) {
        const firstRowKeys = EXP_FIRST_ROW[m.key] || []
        // 以 _recIdx / _newIdx 区分记录
        const recMap = {}
        gapItemsFlat.forEach(item => {
          const rk = item._recIdx >= 0 ? ('r' + item._recIdx) : ('n' + item._newIdx)
          if (!recMap[rk]) recMap[rk] = { rk, isNew: item._recIdx < 0, items: [] }
          recMap[rk].items.push(item)
        })
        const TIME_RANGE_TITLES = {
          internship:        '实习时间：',
          work:                '工作时间：',
          project:             '项目时间：',
          school_experience:   '在校时间：',
        }

        let fallbackRi = 0
        gapRecords = Object.values(recMap).map(rec => {
          const firstRow    = rec.items.filter(it => firstRowKeys.includes(it._field))
          const timeItems   = rec.items.filter(it => EXP_TIME_KEYS.has(it._field))
          const startItem   = timeItems.find(it => it._field === 'startDate') || null
          const endItem     = timeItems.find(it => it._field === 'endDate') || null
          const timeMerged  = (startItem || endItem) ? { start: startItem, end: endItem } : null
          const contentItem = rec.items.find(it => it._field === 'content') || null
          const otherItems  = rec.items.filter(it =>
            !firstRowKeys.includes(it._field) &&
            !EXP_TIME_KEYS.has(it._field) &&
            it._field !== 'content'
          )
          const hr = rec.items[0]._humanRow != null ? rec.items[0]._humanRow : (++fallbackRi)
          return {
            recKey:      rec.rk,
            isNew:       rec.isNew,
            cardTitle:   '第 ' + hr + ' 条' + (rec.isNew ? '（待填）' : '（补充字段）'),
            timeRangeTitle: TIME_RANGE_TITLES[m.key] || '起止时间：',
            firstRow,
            timeMerged,
            contentItem,
            otherItems,
            hasContent:  !!contentItem,
            hasFirstRow: firstRow.length > 0,
            hasTimeRow:  !!(startItem || endItem),
            hasOther:    otherItems.length > 0,
          }
        })
      }

      return {
        key:         m.key,
        label:       m.label,
        status,
        statusText,
        sortOrder,
        isExp,
        fields:      section ? (section.fields || []) : [],
        count:       section ? (section.count || 0) : 0,
        hasFields:   !!(section && section.fields && section.fields.length > 0),
        gapItemsFlat,
        hasGaps:     gapItemsFlat.length > 0,
        gapRecords,
      }
    })

    items.sort((a, b) => a.sortOrder - b.sortOrder)
    return items
  },

  /** 切换模块折叠/展开 */
  toggleModuleExpand(e) {
    const key     = e.currentTarget.dataset.key
    const current = this.data.expandedKeys[key] || false
    this.setData({ ['expandedKeys.' + key]: !current })
  },

  // ── 审阅页操作 ───────────────────────────────────────────────────────────────

  reRecognize() {
    this._doRecognize()
  },

  /** 阻止事件冒泡（支付弹窗蒙层用） */
  noop() {},

  /** 审阅页：确认，若有空缺则进入补填步骤，否则直接提交 */
  confirmAndSubmit() {
    if (this.data.gapModules && this.data.gapModules.length > 0) {
      this.setData({ step: 'supplement' })
    } else {
      this._doSubmitOrder()
    }
  },

  /** 补填页：更新表单中某个字段的值（文本输入） */
  onSupplementInput(e) {
    const { moduleIdx, itemIdx, colModIdx, colItemIdx } = e.currentTarget.dataset
    const value = e.detail.value
    this._updateSupplementField(moduleIdx, itemIdx, colModIdx, colItemIdx, value)
  },

  /**
   * 时间选择器回调（picker mode="date" fields="month"）
   * 原始值格式 YYYY-MM → 转换为 YYYY.MM 后写入对应补全字段
   */
  onTimePickerChange(e) {
    const raw = e.detail.value            // "2023-06"
    if (!raw) return
    const value = raw.replace('-', '.')   // "2023.06"
    const { moduleIdx, itemIdx, colModIdx, colItemIdx } = e.currentTarget.dataset
    this._updateSupplementField(moduleIdx, itemIdx, colModIdx, colItemIdx, value)
  },

  /** 公共：将 value 写入 gapModules[moduleIdx].items[itemIdx] 及 collapsedModules 镜像 */
  _updateSupplementField(moduleIdx, itemIdx, colModIdx, colItemIdx, value) {
    const gapModules = this.data.gapModules
    gapModules[moduleIdx].items[itemIdx].value = value
    const updates = { gapModules }

    if (colModIdx !== undefined && colItemIdx !== undefined) {
      const collapsedModules = this.data.collapsedModules
      collapsedModules[colModIdx].gapItemsFlat[colItemIdx].value = value
      updates.collapsedModules = collapsedModules
    }
    this.setData(updates)
  },

  /** 补填页：跳过补填，直接提交 */
  skipSupplement() {
    this._doSubmitOrder()
  },

  /** 补填页：将补填数据合并到 extractedData，然后提交 */
  confirmSupplement() {
    const { extractedData, gapModules } = this.data
    const merged = JSON.parse(JSON.stringify(extractedData || {}))

    // 通用合并：利用 _detectGaps 为每个 item 写入的元数据（_mod / _field / _recIdx / _newIdx）
    // 新记录先按 _newIdx 聚合，最后统一 push 到数组
    const newRecordMap = {} // { 'moduleKey': { 0: {...fields}, 1: {...fields} } }

    gapModules.forEach(gap => {
      gap.items.forEach(item => {
        const { _mod, _field, _recIdx, _newIdx, value } = item
        if (!_mod || !_field || value === undefined) return
        const v = value.trim ? value.trim() : value
        if (!v) return // 用户未填写则跳过

        if (_mod === 'basic') {
          // 基本信息：直接写对象字段
          merged.basic = merged.basic || {}
          merged.basic[_field] = v

        } else if (_recIdx >= 0) {
          // 已有记录的字段补填
          const arr = merged[_mod]
          if (Array.isArray(arr) && arr[_recIdx]) {
            arr[_recIdx][_field] = v
          }

        } else if (_newIdx >= 0) {
          // 新记录字段：按 newIdx 聚合
          const SINGLE_OBJECT_MODULES = new Set(['basic', 'career', 'self_evaluation', 'hobby', 'exam_info'])
          if (SINGLE_OBJECT_MODULES.has(_mod)) {
            // 单对象模块：直接写对象
            merged[_mod] = merged[_mod] || {}
            merged[_mod][_field] = v
          } else {
            if (!newRecordMap[_mod]) newRecordMap[_mod] = {}
            if (!newRecordMap[_mod][_newIdx]) newRecordMap[_mod][_newIdx] = {}
            newRecordMap[_mod][_newIdx][_field] = v
          }
        }
      })
    })

    // 将聚合的新记录按 _newIdx 顺序 push 到对应数组
    Object.entries(newRecordMap).forEach(([mod, indexMap]) => {
      merged[mod] = merged[mod] || []
      const sortedIndexes = Object.keys(indexMap).map(Number).sort((a, b) => a - b)
      sortedIndexes.forEach(idx => {
        const rec = indexMap[idx]
        if (Object.values(rec).some(v => v)) {
          merged[mod].push(rec)
        }
      })
    })

    this.setData({ extractedData: merged })
    this._doSubmitOrder()
  },

  // ── 提交工单 ──────────────────────────────────────────────────────────────────

  async _doSubmitOrder() {
    this.setData({ step: 'submitting' })
    try {
      const d = this.data
      const res = await request.post('client_create_recognition_order', {
        email:              d.email.trim(),
        userType:           d.userType,
        selectedTemplateId: d.selectedTemplateId,
        polishMode:         d.polishMode,
        polishingIntensity: d.polishingIntensity,
        targetPosition:     d.targetPosition.trim(),
        jobDescription:     d.jobDescription.trim(),
        clientResumeFileKey:  d.uploadedFileKey,
        clientResumeFileName: d.fileInfo ? d.fileInfo.name : '',
        extractedData:      d.extractedData || null,
      })
      this._clearDraft()
      this.setData({ step: 'done', orderId: res.orderId, orderDbId: res._id })
      this._requestSubscribeSilent()
    } catch (err) {
      wx.showModal({ title: '提交失败', content: err.message || '网络异常', showCancel: false })
      this.setData({ step: 'review' })
    }
  },

  // ── 订阅消息 ──────────────────────────────────────────────────────────────────

  _requestSubscribeSilent() {
    const TMPL_ID = 'JjmTIHO6iRrDLfRkZNutEfmxo-eLabK5tFmJYVLX8IY'
    if (!wx.requestSubscribeMessage) return
    wx.requestSubscribeMessage({
      tmplIds: [TMPL_ID],
      success: (res) => {
        if (res[TMPL_ID] === 'accept') this.setData({ subscribed: true })
      },
    })
  },

  requestNotification() {
    const TMPL_ID = 'JjmTIHO6iRrDLfRkZNutEfmxo-eLabK5tFmJYVLX8IY'
    if (!wx.requestSubscribeMessage) {
      wx.showModal({ title: '提示', content: '当前版本不支持订阅消息功能', showCancel: false })
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: [TMPL_ID],
      success: (res) => {
        if (res[TMPL_ID] === 'accept') {
          this.setData({ subscribed: true })
          wx.showToast({ title: '已开启通知', icon: 'success' })
        } else if (res[TMPL_ID] === 'ban') {
          wx.showModal({
            title: '通知权限已关闭',
            content: '请前往「微信 → 我 → 设置 → 隐私 → 订阅消息」开启',
            showCancel: false,
          })
        }
      },
    })
  },

  // ── 页面跳转 ──────────────────────────────────────────────────────────────────

  goOrderDetail() {
    wx.redirectTo({ url: `/pages/order-detail/index?orderId=${this.data.orderId}` })
  },

  goHome() {
    wx.navigateBack({ delta: 1 })
  },

  // ── 工具 ──────────────────────────────────────────────────────────────────────

  _toast(msg) {
    wx.showToast({ title: msg, icon: 'none', duration: 2000 })
  },
})
