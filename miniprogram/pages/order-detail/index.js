const request = require('../../utils/request')
const { STATUS_LABELS, MODE_LABELS, INTENSITY_LABELS, IDENTITY_LABELS, formatTime } = require('../../utils/util')

// 预生成水印格子，15个位置覆盖整张图
const WM_ITEMS = (function () {
  const cols = 2, rows = 7, w = 340, h = 200  // rpx 单位的格子大小
  const items = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      items.push({ top: r * h + (c % 2) * 100, left: c * w - 40 })
    }
  }
  return items
}())

Page({
  data: {
    orderId:      '',
    order:        null,
    loading:      true,
    steps:        [],
    infoExpanded:     false,  // 基本信息折叠状态，默认收起
    progressExpanded: true,   // 制作进度折叠状态，默认展开；完成后自动收起
    resultGrid:   [],         // 成品下载 3×2 网格数据
    // 润色成品弹窗（三栏：优化前 / 优化后 / 优化解析）
    modal: {
      visible: false,
      tab:     1,   // 0=优化前, 1=优化后, 2=优化解析
    },
    // 简历分析报告弹窗
    analysisMod: {
      visible:            false,
      items:              [],   // [{ title, content }] 各维度文字分析
      score:              0,
      level:              '',
      scoreLevel:         '',   // 'good' | 'mid' | 'low'（对应颜色，来自 level 字母等级）
      dimensionScores:    null, // { fit, highlight, star, core, quantify } 原始五维数据
      dimensionItems:     [],   // [{ label, score }] 数值说明条（展示用）
      radarIndustryAvg:   null, // 行业平均分（首次随机生成后缓存）
      radarCompareSummary:'',
      radarCompareType:   '',   // 'ahead' | 'behind' | 'equal'
    },
    wmItems: WM_ITEMS,
  },

  onLoad(query) {
    this.setData({ orderId: query.orderId || '' })
    if (query.orderId) this.loadDetail(query.orderId)
  },

  async loadDetail(orderId) {
    this.setData({ loading: true })
    try {
      await request.ensureOpenid()
      const res = await request.post('client_get_order_detail', { orderId })
      const o   = res
      const steps = this.buildSteps(o)
      this.setData({
        order: {
          ...o,
          statusLabel:    STATUS_LABELS[o.status]    || o.status,
          modeLabel:      MODE_LABELS[o.polishMode]  || o.polishMode,
          intensityLabel: INTENSITY_LABELS[o.polishingIntensity] || o.polishingIntensity,
          createdAtFmt:   formatTime(o.createdAt),
          claimedAtFmt:   formatTime(o.claimedAt),
          completedAtFmt: formatTime(o.completedAt),
        },
        steps,
        loading: false,
      })

      // 若有回传预览图，下载为本地临时路径（绕过域名白名单限制）
      if (o.clientPreviewUrls && o.clientPreviewUrls.length) {
        this._downloadPreviewImages(o.clientPreviewUrls, o.clientOriginalUrls || [])
      }
      // 若有分析报告，解析展示数据
      if (o.clientAnalysisData) {
        this._parseAnalysisItems(o.clientAnalysisData)
      }
      // 若有回传成品信息，构建成品下载网格
      if (o.clientResultItems && o.clientResultItems.length) {
        this._buildResultGrid(o)
      }
      // 所有进度步骤均已完成时，自动收起进度区域，为成品下载腾出空间
      const allDone = steps.length > 0 && steps.every(s => s.done)
      if (allDone) this.setData({ progressExpanded: false })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  /** 将 COS URL 批量下载为临时本地路径，更新到 order.clientPreviewUrls */
  _downloadPreviewImages(afterUrls, beforeUrls) {
    const download = (url) => new Promise((resolve) => {
      wx.downloadFile({
        url,
        success: (res) => resolve(res.statusCode === 200 ? res.tempFilePath : url),
        fail:    ()    => resolve(url),
      })
    })

    // 保留原始远程 URL（供 wx.previewImage 使用），本地临时路径供 <image> 展示
    this.setData({ 'order.clientPreviewUrlsRemote': afterUrls })
    Promise.all(afterUrls.map(download)).then(localAfter => {
      this.setData({ 'order.clientPreviewUrls': localAfter })
    })

    if (beforeUrls.length) {
      this.setData({ 'order.clientOriginalUrlsRemote': beforeUrls })
      Promise.all(beforeUrls.map(download)).then(localBefore => {
        this.setData({ 'order.clientOriginalUrls': localBefore })
      })
    }
  },

  buildSteps(order) {
    const hasPreview  = order.clientPreviewUrls && order.clientPreviewUrls.length > 0
    const hasAnalysis = !!(order.analysisSentAt && order.clientAnalysisData)

    // 步骤顺序：提交 → 简历分析（AI自动）→ 员工接单制作 → 预览成品 → 完成
    const steps = [
      {
        title: '工单已提交',
        time:  order.createdAt,
        done:  true,
      },
    ]

    // 简历分析完成放在接单之前（AI 自动分析阶段）
    if (hasAnalysis) {
      steps.push({
        title:           '简历分析完成',
        time:            order.analysisSentAt || '',
        done:            true,
        showAnalysisBtn: true,
      })
    }

    steps.push({
      title: order.claimedAt ? '导师已接单，优化中' : '等待导师优化',
      time:  order.claimedAt || '',
      done:  !!order.claimedAt,
    })

    // 导师回传预览图后，插入「优化完成，请查看」步骤
    if (hasPreview) {
      steps.push({
        title:          '优化完成，请查看',
        time:           order.previewSentAt || '',
        done:           true,
        showPreviewBtn: true,
      })
    }

    // 成品已回传（resultSentAt）或工单已完成（completedAt）都代表最终完成
    const finalTime = order.resultSentAt || order.completedAt || ''
    const finalDone = !!(order.resultSentAt || order.completedAt)
    steps.push({
      title: finalDone ? '工单已完成' : '等待完成',
      time:  finalTime,
      done:  finalDone,
    })

    // 添加序号和 isLast 标记
    return steps.map((s, i) => ({
      ...s,
      seq:     i + 1,
      isLast:  i === steps.length - 1,
      timeFmt: s.time ? formatTime(s.time) : '',
    }))
  },

  /** 将 clientAnalysisData 解析为 wxml 可直接渲染的数组 */
  _parseAnalysisItems(data) {
    if (!data) return
    const mode  = data.mode || 'position'
    const items = []
    const posLabels  = ['岗位契合', '共同亮点', 'STAR叙事', '核心要求', '结果量化', '身份用词']
    const selfLabels = ['STAR叙事', '结果量化', '技术栈补全', '身份用词']
    const labels = mode === 'position' ? posLabels : selfLabels
    labels.forEach((title, i) => {
      const content = data[`item${i + 1}`]
      if (content) items.push({ title, content })
    })
    const lastKey = mode === 'position' ? 'item7' : 'item6'
    if (data[lastKey]) items.push({ title: mode === 'position' ? '综合分析' : '综合评价', content: data[lastKey] })

    // 五维评分（仅岗位润色模式的 dimensionScores 有此数据）
    const DIMENSION_DEFS = [
      { key: 'fit',       label: '岗位契合' },
      { key: 'highlight', label: '共同亮点' },
      { key: 'star',      label: 'STAR叙事' },
      { key: 'core',      label: '核心要求' },
      { key: 'quantify',  label: '结果量化' },
    ]
    const dimensionItems = []
    if (data.dimensionScores) {
      DIMENSION_DEFS.forEach(({ key, label }) => {
        const s = data.dimensionScores[key]
        if (s != null) dimensionItems.push({ label, score: s })
      })
    }

    // 将字母等级转为颜色级别（good/mid/low）
    const levelColorMap = {
      'A+': 'good', 'A': 'good',
      'A-': 'mid',  'B+': 'mid', 'B': 'mid',
      'B-': 'low',  'C': 'low',
    }
    const scoreLevel = levelColorMap[data.level] || 'mid'

    this.setData({
      'analysisMod.items':           items,
      'analysisMod.score':           data.score || 0,
      'analysisMod.level':           data.level || '',
      'analysisMod.scoreLevel':      scoreLevel,
      'analysisMod.dimensionScores': data.dimensionScores || null,
      'analysisMod.dimensionItems':  dimensionItems,
    })
  },

  // ── 基本信息 / 制作进度 折叠 ──────────────────────────────────────────────
  toggleInfo() {
    this.setData({ infoExpanded: !this.data.infoExpanded })
  },

  toggleProgress() {
    this.setData({ progressExpanded: !this.data.progressExpanded })
  },

  // ── 弹窗控制 ──────────────────────────────────────────────────────────────
  openPreviewModal() {
    this.setData({ 'modal.visible': true, 'modal.tab': 1 })  // 默认打开「优化后」
  },

  closeModal() {
    this.setData({ 'modal.visible': false })
  },

  openAnalysisModal() {
    this.setData({ 'analysisMod.visible': true })
    // 等待 canvas 节点渲染后再绘制雷达图
    if (this.data.analysisMod.dimensionScores) {
      setTimeout(() => this._drawRadarChart(), 200)
    }
  },

  closeAnalysisModal() {
    this.setData({ 'analysisMod.visible': false })
  },

  /**
   * 绘制双五维雷达图（pentagon）
   * - 蓝色多边形：随机生成的行业平均水平（首次生成后缓存）
   * - 彩色多边形：用户简历，颜色跟随评分等级
   */
  _drawRadarChart() {
    const { analysisMod } = this.data
    const ds = analysisMod.dimensionScores
    if (!ds) return

    // ── 行业平均（随机生成并缓存；3=40%、4=40%、5=20%）────────────────
    let industryAvg = analysisMod.radarIndustryAvg
    if (!industryAvg) {
      const genScore = () => {
        const r = Math.random()
        if (r < 0.40) return 3
        if (r < 0.80) return 4
        return 5
      }
      industryAvg = {
        fit: genScore(), highlight: genScore(), star: genScore(),
        core: genScore(), quantify: genScore(),
      }
      this.setData({ 'analysisMod.radarIndustryAvg': industryAvg })
    }

    const userValues = [ds.fit, ds.highlight, ds.star, ds.core, ds.quantify]
    const indValues  = [
      industryAvg.fit, industryAvg.highlight, industryAvg.star,
      industryAvg.core, industryAvg.quantify,
    ]
    const labels = ['岗位契合', '共同亮点', 'STAR叙事', '核心要求', '结果量化']

    // ── 比较结论 ──────────────────────────────────────────────────────
    const userTotal = userValues.reduce((a, b) => a + b, 0)
    const indTotal  = indValues.reduce((a, b) => a + b, 0)
    const diff = userTotal - indTotal
    let radarCompareSummary = '', radarCompareType = 'equal'
    if (diff > 0) {
      radarCompareSummary = `您的简历综合得分超越行业平均水平 ${diff} 分`
      radarCompareType = 'ahead'
    } else if (diff < 0) {
      radarCompareSummary = `您的简历综合得分落后行业平均水平 ${Math.abs(diff)} 分`
      radarCompareType = 'behind'
    } else {
      radarCompareSummary = '您的简历综合得分与行业平均水平持平'
      radarCompareType = 'equal'
    }
    this.setData({ 'analysisMod.radarCompareSummary': radarCompareSummary, 'analysisMod.radarCompareType': radarCompareType })

    // ── 颜色配置 ──────────────────────────────────────────────────────
    const colorMap = {
      good: { stroke: '#4CAF50', fill: 'rgba(76,175,80,0.22)',  dot: '#4CAF50', score: '#2E7D32' },
      mid:  { stroke: '#FF9800', fill: 'rgba(255,152,0,0.22)',  dot: '#FF9800', score: '#E65100' },
      low:  { stroke: '#F44336', fill: 'rgba(244,67,54,0.22)',  dot: '#F44336', score: '#B71C1C' },
    }
    const userColor = colorMap[analysisMod.scoreLevel] || colorMap.mid
    const indStroke = '#2196F3', indFill = 'rgba(33,150,243,0.15)'

    const n = 5, W = 320, H = 300
    const cx = W / 2, cy = H / 2 + 8
    const maxR = 92, labelR = 118, maxScore = 5
    const startAngle = -Math.PI / 2

    const getPoint = (r, i) => {
      const angle = startAngle + i * (Math.PI * 2 / n)
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
    }

    const ctx = wx.createCanvasContext('am-radar', this)

    // ── 背景网格 ──────────────────────────────────────────────────────
    for (let lv = 5; lv >= 1; lv--) {
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const p = getPoint(maxR * lv / 5, i)
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
      }
      ctx.closePath()
      ctx.setFillStyle(lv % 2 === 0 ? 'rgba(230,240,255,0.7)' : 'rgba(248,251,255,0.9)')
      ctx.fill()
      ctx.setStrokeStyle('rgba(100,160,230,0.35)')
      ctx.setLineWidth(0.8)
      ctx.stroke()
    }

    // ── 轴线 ──────────────────────────────────────────────────────────
    for (let i = 0; i < n; i++) {
      const p = getPoint(maxR, i)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(p.x, p.y)
      ctx.setStrokeStyle('rgba(100,160,230,0.4)')
      ctx.setLineWidth(0.8)
      ctx.stroke()
    }

    // ── 行业平均多边形（蓝色，下层）─────────────────────────────────
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const p = getPoint(maxR * indValues[i] / maxScore, i)
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
    ctx.setFillStyle(indFill)
    ctx.fill()
    ctx.setStrokeStyle(indStroke)
    ctx.setLineWidth(1.5)
    ctx.stroke()

    // ── 用户简历多边形（上层）───────────────────────────────────────
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const p = getPoint(maxR * userValues[i] / maxScore, i)
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
    ctx.setFillStyle(userColor.fill)
    ctx.fill()
    ctx.setStrokeStyle(userColor.stroke)
    ctx.setLineWidth(2)
    ctx.stroke()

    // ── 顶点圆点 + 分数 ───────────────────────────────────────────────
    for (let i = 0; i < n; i++) {
      const p = getPoint(maxR * userValues[i] / maxScore, i)
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2)
      ctx.setFillStyle(userColor.dot)
      ctx.fill()
      ctx.setStrokeStyle('#ffffff')
      ctx.setLineWidth(1.5)
      ctx.stroke()
      ctx.setFillStyle(userColor.score)
      ctx.setFontSize(10)
      ctx.setTextAlign('center')
      ctx.fillText(String(userValues[i]), p.x, p.y - 8)
    }

    // ── 维度标签 ──────────────────────────────────────────────────────
    ctx.setFillStyle('#444444')
    ctx.setFontSize(11)
    ctx.setTextAlign('center')
    for (let i = 0; i < n; i++) {
      const lp = getPoint(labelR, i)
      ctx.fillText(labels[i], lp.x, lp.y + 4)
    }

    ctx.draw()
  },

  // ── 成品下载网格 ────────────────────────────────────────────────────────────

  /**
   * 将 clientResultItems 构建为 3×2 网格展示数据
   * 定义了 5 个固定槽位（不足 6 格的最后一格留空），给每个槽位标注图标字符、颜色等
   */
  _buildResultGrid(order) {
    console.log('[下载] _buildResultGrid 开始构建，clientResultItems:', JSON.stringify(order.clientResultItems || []))
    console.log('[下载] 订单关键字段 resultWordUrl:', order.resultWordUrl)
    console.log('[下载] 订单关键字段 resultWordFileKey:', order.resultWordFileKey)
    console.log('[下载] 订单关键字段 resultAnalysisUrl:', order.resultAnalysisUrl)
    console.log('[下载] 订单关键字段 clientPreviewUrls 数量:', (order.clientPreviewUrls || []).length)
    console.log('[下载] 订单关键字段 clientIdPhotoUrl:', order.clientIdPhotoUrl)

    const SLOT_DEFS = [
      { id: 'word',     label: 'Word版本', iconSrc: '/miniprogramImages/daochu_word.png',       action: 'word'     },
      { id: 'pdf',      label: 'PDF版本',   iconSrc: '/miniprogramImages/daochu_pdf.png',        action: 'pdf'      },
      { id: 'images',   label: '简历预览图', iconSrc: '/miniprogramImages/daochu_image.png',     action: 'images'   },
      { id: 'analysis', label: '润色解析',  iconSrc: '/miniprogramImages/daochu_baogao.png',    action: 'analysis' },
      { id: 'idphoto',  label: '证件照',    iconSrc: '/miniprogramImages/daochu_zhengjianzhao.png', action: 'idphoto' },
      { id: '__empty',  label: '',          iconSrc: '', action: '' },
    ]
    const itemsMap = {}
    ;(order.clientResultItems || []).forEach(it => { itemsMap[it.id] = it })

    const grid = SLOT_DEFS.map(def => {
      if (def.id === '__empty') {
        return { id: '__empty', label: '', available: false, empty: true, iconSrc: '', action: '' }
      }
      const stored = itemsMap[def.id] || {}
      const cell = {
        id:        def.id,
        label:     def.label,
        available: !!(stored.available),
        empty:     false,
        iconSrc:   def.iconSrc,
        action:    def.action,
      }
      console.log('[下载] 网格槽位:', def.id, '=> available:', cell.available)
      return cell
    })
    this.setData({ resultGrid: grid })
  },

  /** 用户点击成品下载网格中的某一项 */
  onResultItemTap(e) {
    const { action, available } = e.currentTarget.dataset
    console.log('[下载] onResultItemTap — action:', action, '| available:', available)
    if (!available) {
      console.log('[下载] 该项未导出，拦截')
      wx.showToast({ title: '该内容未导出，不可下载', icon: 'none' })
      return
    }
    const order = this.data.order
    switch (action) {
      case 'word':
        this._downloadAndOpenFile('word')
        break
      case 'pdf':
        console.log('[下载] PDF - clientPreviewUrls 数量:', (order.clientPreviewUrls || []).length)
        this._downloadAndOpenFile('pdf')
        break
      case 'images': {
        const remoteUrls = order.clientPreviewUrlsRemote || order.clientPreviewUrls || []
        const localUrls  = order.clientPreviewUrls       || []
        console.log('[下载] images - remoteUrls 数量:', remoteUrls.length, '| localUrls 数量:', localUrls.length)
        console.log('[下载] images - 第1张 remote:', remoteUrls[0] ? remoteUrls[0].substring(0, 80) : 'null')
        this._shareImages(remoteUrls, localUrls)
        break
      }
      case 'analysis':
        console.log('[下载] analysis - resultAnalysisUrl:', order.resultAnalysisUrl)
        if (order.resultAnalysisUrl) {
          this._downloadAndOpenFile('analysis')
        } else {
          console.log('[下载] analysis - 无PDF，打开分析报告弹窗')
          this.openAnalysisModal()
        }
        break
      case 'idphoto': {
        const idUrls = order.clientIdPhotoUrl ? [order.clientIdPhotoUrl] : []
        console.log('[下载] idphoto - clientIdPhotoUrl:', order.clientIdPhotoUrl)
        // 证件照是远程 URL，remote 与 local 相同（直接下载保存）
        this._shareImages(idUrls, idUrls)
        break
      }
      default:
        console.log('[下载] 未知 action:', action)
        break
    }
  },

  /**
   * 通用文件下载并打开（Word / PDF / Analysis）
   * 一比一复刻参考小程序：下载成功后弹 showModal，"查看文档" 或 "分享文档"
   * fileType: 'word' | 'pdf' | 'analysis'
   */
  _downloadAndOpenFile(fileType) {
    const order    = this.data.order
    const isWord   = fileType === 'word'
    const isPdf    = fileType === 'pdf'
    const ext      = (isPdf || fileType === 'analysis') ? 'pdf' : 'docx'
    const fileName = isWord ? '简历成品.docx' : (fileType === 'analysis' ? '润色解析.pdf' : '简历成品.pdf')
    const titleText = isWord ? 'Word文档下载成功' : (fileType === 'analysis' ? '润色解析下载成功' : 'PDF文档下载成功')

    console.log('[下载] _downloadAndOpenFile — fileType:', fileType)

    // 优先使用直接 HTTPS URL
    let directUrl = null
    if (isWord)                  directUrl = order.resultWordUrl     || null
    if (fileType === 'analysis') directUrl = order.resultAnalysisUrl || null

    // PDF 也支持直接 URL 和 CloudBase fileKey 两条路径（与 Word 完全一致）
    if (isPdf) directUrl = order.resultPdfUrl || null

    console.log('[下载] directUrl:', directUrl)
    console.log('[下载] order.resultWordUrl:', order.resultWordUrl)
    console.log('[下载] order.resultWordFileKey:', order.resultWordFileKey)
    console.log('[下载] order.resultPdfUrl:', order.resultPdfUrl)
    console.log('[下载] order.resultPdfFileKey:', order.resultPdfFileKey)

    // 若无直接 URL 但有 pdfFileKey，走云函数兑换（与 Word 兜底路径相同）
    // 若连 fileKey 都没有（旧订单），则降级为图片预览
    if (isPdf && !directUrl && !order.resultPdfFileKey) {
      const remoteUrls = order.clientPreviewUrlsRemote || order.clientPreviewUrls || []
      const localUrls  = order.clientPreviewUrls       || []
      console.log('[下载] PDF 无文件，降级为预览图 — remoteUrls 数量:', remoteUrls.length)
      if (!remoteUrls.length) {
        wx.showToast({ title: '暂无PDF内容', icon: 'none', duration: 2500 }); return
      }
      if (this._actionSheetShowing) return
      this._actionSheetShowing = true
      wx.showActionSheet({
        itemList: ['预览图片（可长按转发好友）', '保存到相册'],
        success: (res) => {
          this._actionSheetShowing = false
          console.log('[下载] PDF 降级 ActionSheet — tapIndex:', res.tapIndex)
          if (res.tapIndex === 0) wx.previewImage({ urls: remoteUrls, current: remoteUrls[0] })
          else this._saveImagesToAlbumWithPermission(localUrls.length ? localUrls : remoteUrls)
        },
        fail: () => { this._actionSheetShowing = false },
      })
      return
    }

    const doDownload = (url) => {
      console.log('[下载] doDownload — url:', url)
      wx.showLoading({ title: '正在下载…', mask: true })
      wx.downloadFile({
        url,
        success: (dlRes) => {
          wx.hideLoading()
          console.log('[下载] wx.downloadFile 回调 — statusCode:', dlRes.statusCode, '| tempFilePath:', dlRes.tempFilePath)
          if (dlRes.statusCode !== 200) {
            console.log('[下载] 下载失败，状态码:', dlRes.statusCode)
            wx.showToast({ title: '下载失败 (' + dlRes.statusCode + ')', icon: 'none' })
            return
          }
          const tempFilePath = dlRes.tempFilePath
          wx.showModal({
            title:       titleText,
            content:     '文档已下载到本地，您可以选择查看或分享',
            confirmText: '查看文档',
            cancelText:  '分享文档',
            success: (r) => {
              console.log('[下载] 文档弹窗选择 — confirm:', r.confirm, '| cancel:', r.cancel)
              if (r.confirm) {
                setTimeout(() => {
                  console.log('[下载] wx.openDocument — filePath:', tempFilePath, '| fileType:', ext)
                  wx.openDocument({
                    filePath: tempFilePath,
                    fileType: ext,
                    showMenu: true,
                    fail: (err) => {
                      console.log('[下载] wx.openDocument 失败:', JSON.stringify(err))
                      wx.showToast({ title: '无法打开文档', icon: 'none' })
                    },
                  })
                }, 300)
              } else if (r.cancel) {
                console.log('[下载] wx.shareFileMessage — filePath:', tempFilePath)
                wx.shareFileMessage({
                  filePath: tempFilePath,
                  fileName: fileName,
                  fail: (err) => {
                    console.log('[下载] wx.shareFileMessage 失败:', JSON.stringify(err))
                    wx.showToast({ title: '分享失败，请重试', icon: 'none' })
                  },
                })
              }
            },
          })
        },
        fail: (err) => {
          wx.hideLoading()
          console.log('[下载] wx.downloadFile 失败:', JSON.stringify(err))
          wx.showToast({ title: '下载失败，请重试', icon: 'none' })
        },
      })
    }

    if (directUrl) {
      console.log('[下载] 使用直接 HTTPS URL 下载')
      doDownload(directUrl)
      return
    }

    // 兜底：通过云函数获取临时链接（Word / PDF / Analysis）
    console.log('[下载] 无直接 URL，调用云函数 client_get_result_url — orderId:', this.data.orderId, '| fileType:', fileType)
    wx.showLoading({ title: '获取下载链接…', mask: true })
    const orderId = this.data.orderId
    // openid 由 request.post 自动从 globalData 注入，不要手动传递以免覆盖
    request.ensureOpenid()
      .then(() => request.post('client_get_result_url', { orderId, fileType }))
      .then(res => {
        wx.hideLoading()
        console.log('[下载] 云函数响应:', JSON.stringify(res))
        if (!res.downloadUrl) {
          console.log('[下载] 云函数未返回 downloadUrl')
          wx.showToast({ title: '获取链接失败', icon: 'none' }); return
        }
        doDownload(res.downloadUrl)
      })
      .catch(err => {
        wx.hideLoading()
        console.log('[下载] 云函数调用失败:', JSON.stringify(err))
        wx.showToast({ title: err.message || '获取链接失败', icon: 'none' })
      })
  },

  /**
   * 图片分享/保存（预览图 / 证件照）
   * remoteUrls: 网络 HTTPS URL（给 wx.previewImage 用）
   * localUrls:  本地 tmp 路径（给 saveImageToPhotosAlbum 用，可省略则退化用 remoteUrls）
   * 使用 wx.showActionSheet（底部弹出），避免与其他 showModal 竞争导致不显示
   */
  _shareImages(remoteUrls, localUrls) {
    if (!localUrls) localUrls = remoteUrls
    console.log('[下载] _shareImages — remoteUrls:', remoteUrls ? remoteUrls.length : 0, '| localUrls:', localUrls ? localUrls.length : 0)
    if (remoteUrls && remoteUrls.length) {
      console.log('[下载] _shareImages — 第1张 remote:', remoteUrls[0] ? remoteUrls[0].substring(0, 80) : 'null')
    }
    if (!remoteUrls || !remoteUrls.length) {
      console.log('[下载] 无图片可分享')
      wx.showToast({ title: '暂无图片', icon: 'none' }); return
    }
    if (this._actionSheetShowing) { console.log('[下载] ActionSheet 正在显示，跳过'); return }
    this._actionSheetShowing = true
    console.log('[下载] 弹出图片 ActionSheet')
    wx.showActionSheet({
      itemList: ['预览图片（可长按转发好友）', '保存到相册'],
      success: (res) => {
        this._actionSheetShowing = false
        console.log('[下载] 图片 ActionSheet 选择 — tapIndex:', res.tapIndex)
        if (res.tapIndex === 0) {
          console.log('[下载] wx.previewImage — 共', remoteUrls.length, '张, 第1张:', remoteUrls[0] ? remoteUrls[0].substring(0, 80) : 'null')
          wx.previewImage({
            urls: remoteUrls, current: remoteUrls[0],
            fail: (err) => console.log('[下载] wx.previewImage 失败:', JSON.stringify(err)),
          })
        } else {
          const saveUrls = (localUrls && localUrls.length) ? localUrls : remoteUrls
          console.log('[下载] 保存到相册 — 使用', (localUrls && localUrls.length) ? 'localUrls' : 'remoteUrls', '共', saveUrls.length, '张')
          this._saveImagesToAlbumWithPermission(saveUrls)
        }
      },
      fail: (err) => {
        this._actionSheetShowing = false
        console.log('[下载] 图片 ActionSheet 取消/失败:', JSON.stringify(err))
      },
    })
  },

  /**
   * 带权限检查的批量保存图片到相册（复刻参考小程序 saveToAlbumFixed）
   */
  async _saveImagesToAlbumWithPermission(urls) {
    console.log('[下载] _saveImagesToAlbumWithPermission — urls 数量:', urls.length)
    wx.showLoading({ title: '正在保存图片…', mask: true })
    try {
      // 检查相册权限
      const setting = await wx.getSetting()
      const albumAuth = setting.authSetting['scope.writePhotosAlbum']
      console.log('[下载] 相册权限状态:', albumAuth)
      if (albumAuth === false) {
        wx.hideLoading()
        wx.showModal({
          title:       '需要相册权限',
          content:     '请在设置中允许访问相册以保存图片',
          confirmText: '去设置',
          cancelText:  '取消',
          success: (r) => { if (r.confirm) wx.openSetting() },
        })
        return
      }
      // 尚未授权时先请求权限
      if (!albumAuth) {
        console.log('[下载] 尚未授权，请求相册权限')
        try {
          await wx.authorize({ scope: 'scope.writePhotosAlbum' })
          console.log('[下载] 相册权限授权成功')
        } catch (authErr) {
          console.log('[下载] 相册权限授权失败:', JSON.stringify(authErr))
          wx.hideLoading()
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许访问相册',
            showCancel: false,
          })
          return
        }
      }

      // 依次下载并保存每张图片
      let savedCount = 0
      for (let i = 0; i < urls.length; i++) {
        let imgPath = urls[i]
        console.log('[下载] 处理第', i + 1, '/' + urls.length, '张 — 前缀:', imgPath ? imgPath.substring(0, 60) : 'null')
        // http://tmp/ 是 wx.downloadFile 返回的本地临时路径，直接使用；不要再走 downloadFile
        const isLocalTmp = imgPath && imgPath.startsWith('http://tmp/')
        if (!isLocalTmp && (imgPath.startsWith('https://') || imgPath.startsWith('http://') || imgPath.startsWith('cloud://'))) {
          console.log('[下载] 需要先下载网络图片')
          const dlRes = await new Promise((resolve, reject) => {
            wx.downloadFile({ url: imgPath, success: resolve, fail: reject })
          })
          console.log('[下载] 图片下载结果 statusCode:', dlRes.statusCode)
          if (dlRes.statusCode === 200) {
            imgPath = dlRes.tempFilePath
          } else {
            console.log('[下载] 图片下载失败，跳过')
            continue
          }
        } else if (isLocalTmp) {
          console.log('[下载] 本地临时路径，直接保存')
        }
        const saveRes = await wx.saveImageToPhotosAlbum({ filePath: imgPath }).catch(e => {
          console.log('[下载] saveImageToPhotosAlbum 失败:', JSON.stringify(e))
          return null
        })
        if (saveRes !== null) {
          savedCount++
          console.log('[下载] 第', i + 1, '张保存成功，累计:', savedCount)
        }
      }

      wx.hideLoading()
      console.log('[下载] 保存完成，共保存:', savedCount, '/', urls.length)
      if (savedCount > 0) {
        wx.showToast({ title: `已保存 ${savedCount} 张图片`, icon: 'success' })
      } else {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      console.log('[下载] _saveImagesToAlbumWithPermission 异常:', JSON.stringify(err))
      if (err && err.errMsg && err.errMsg.includes('auth deny')) {
        wx.showModal({
          title:       '需要相册权限',
          content:     '请在设置中允许访问相册以保存图片',
          confirmText: '去设置',
          cancelText:  '取消',
          success: (r) => { if (r.confirm) wx.openSetting() },
        })
      } else {
        wx.showToast({ title: '保存失败: ' + (err.message || err.errMsg || '未知错误'), icon: 'none' })
      }
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ 'modal.tab': tab })
  },

  onSwiperChange(e) {
    this.setData({ 'modal.tab': e.detail.current })
  },

  stopPropagation() { /* 阻止弹窗内点击穿透 */ },
})
