const request = require('../../utils/request')
const { formatDate, STATUS_LABELS } = require('../../utils/util')

Page({
  data: {
    allOrders:    [],
    orders:       [],
    loading:      true,
    empty:        false,
    activeTab:    'all',
    tabEmpty:     false,
    tabEmptyHint: '',

    // ── 多选删除 ──
    selectMode:    false,   // 是否处于多选模式
    selectedIds:   [],      // 已选订单的 orderId 数组
    isAllSelected: false,   // 当前筛选列表是否已全选
    deleting:      false,   // 删除请求进行中
  },

  onLoad() { this.loadOrders() },
  onPullDownRefresh() {
    if (this.data.selectMode) this.cancelSelect()
    this.loadOrders()
  },
  onShow()  { this.loadOrders() },

  /** 待确认：有成品预览回传待用户确认；已完成：工单状态为 completed */
  _applyTabFilter() {
    const { allOrders, activeTab } = this.data
    let orders = allOrders
    if (activeTab === 'pending') {
      orders = allOrders.filter((o) => o.hasPreview)
    } else if (activeTab === 'completed') {
      orders = allOrders.filter((o) => o.status === 'completed')
    }
    const tabEmpty = allOrders.length > 0 && orders.length === 0
    let tabEmptyHint = ''
    if (tabEmpty) {
      tabEmptyHint = activeTab === 'pending' ? '暂无待确认订单' : '暂无已完成订单'
    }
    // 切换标签时清空选择（避免选中项不在当前视图）
    this.setData({ orders, tabEmpty, tabEmptyHint, selectedIds: [], isAllSelected: false })
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.activeTab) return
    if (this.data.selectMode) this.cancelSelect()
    this.setData({ activeTab: tab })
    this._applyTabFilter()
  },

  async loadOrders() {
    this.setData({ loading: true, empty: false })
    try {
      await request.ensureOpenid()
      const res = await request.post('client_get_orders', {})
      // read_order_times: { [orderId]: ISO时间戳 } — 记录用户最近一次打开该订单详情的时间
      // 若某进展事件的时间晚于该记录时间，则认为是"未读新进展"
      const readTimes = wx.getStorageSync('read_order_times') || {}
      const list = (res.list || []).map(o => {
        const lastRead = readTimes[o.orderId] || null
        // 有任一进展事件 且 该事件发生在用户最近一次查看之后
        const hasNewProgress = (
          (o.hasAnalysisReport && o.analysisSentAt  && (!lastRead || o.analysisSentAt  > lastRead)) ||
          (o.hasPreview        && o.previewSentAt   && (!lastRead || o.previewSentAt   > lastRead)) ||
          (o.hasResult         && o.resultSentAt    && (!lastRead || o.resultSentAt    > lastRead)) ||
          (o.completedAt       &&                       (!lastRead || o.completedAt    > lastRead))
        )
        return {
          ...o,
          statusLabel:     STATUS_LABELS[o.status] || o.status,
          dateLabel:       formatDate(o.createdAt),
          hasNewProgress: !!hasNewProgress,
        }
      })
      this.setData({
        allOrders: list,
        empty:     list.length === 0,
        loading:   false,
      })
      this._applyTabFilter()
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  // ── 普通点击 / 长按 ────────────────────────────────────────────────────────

  /** 点击订单卡片：普通模式 → 跳转详情；选择模式 → 切换勾选 */
  onTap(e) {
    const orderId = e.currentTarget.dataset.orderid
    if (this.data.selectMode) {
      this._toggleSelect(orderId)
    } else {
      // 记录本次查看时间，用于判断后续新进展是否已读
      const readTimes = wx.getStorageSync('read_order_times') || {}
      readTimes[orderId] = new Date().toISOString()
      wx.setStorageSync('read_order_times', readTimes)
      wx.navigateTo({ url: `/pages/order-detail/index?orderId=${orderId}` })
    }
  },

  /** 长按订单卡片：进入选择模式并勾选当前项 */
  onLongPress(e) {
    if (this.data.selectMode) return
    wx.vibrateShort({ type: 'light' })   // 轻触觉反馈
    const orderId = e.currentTarget.dataset.orderid
    this.setData({ selectMode: true, selectedIds: [orderId] })
    this._syncAllSelected()
  },

  // ── 多选模式 ───────────────────────────────────────────────────────────────

  /** 内部：切换某订单的勾选状态 */
  _toggleSelect(orderId) {
    const ids = [...this.data.selectedIds]
    const idx = ids.indexOf(orderId)
    if (idx >= 0) ids.splice(idx, 1)
    else          ids.push(orderId)
    this.setData({ selectedIds: ids })
    this._syncAllSelected()
  },

  /** 内部：同步 isAllSelected 标志 */
  _syncAllSelected() {
    const { orders, selectedIds } = this.data
    const isAllSelected = orders.length > 0 &&
      orders.every(o => selectedIds.includes(o.orderId))
    this.setData({ isAllSelected })
  },

  /** 全选 / 取消全选 */
  toggleSelectAll() {
    const { orders, isAllSelected } = this.data
    const selectedIds = isAllSelected ? [] : orders.map(o => o.orderId)
    this.setData({ selectedIds, isAllSelected: !isAllSelected })
  },

  /** 退出选择模式 */
  cancelSelect() {
    this.setData({ selectMode: false, selectedIds: [], isAllSelected: false })
  },

  /** 确认删除已选订单 */
  deleteSelected() {
    const { selectedIds, deleting } = this.data
    if (!selectedIds.length || deleting) return

    wx.showModal({
      title:       '确认删除',
      content:     `确定要删除已选的 ${selectedIds.length} 个订单吗？此操作不可恢复。`,
      confirmText: '删除',
      cancelText:  '取消',
      confirmColor: '#D32F2F',
      success: async (r) => {
        if (!r.confirm) return
        this.setData({ deleting: true })
        try {
          await request.ensureOpenid()
          const openid = wx.getStorageSync('openid')
          await request.post('client_delete_orders', { openid, orderIds: selectedIds })
          wx.showToast({ title: '删除成功', icon: 'success' })
          this.cancelSelect()
          await this.loadOrders()
        } catch (err) {
          wx.showModal({
            title:      '删除失败',
            content:    err.message || '请稍后重试',
            showCancel: false,
          })
        } finally {
          this.setData({ deleting: false })
        }
      },
    })
  },
})
