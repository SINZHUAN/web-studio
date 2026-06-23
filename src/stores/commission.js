/**
 * commission store — 代做工单状态管理
 *
 * 负责追踪：
 *   activeOrderId   — 当前正在制作的代做工单数据库 _id（制作过程中保持）
 *   activeOrderData — 工单完整数据（用于邮件预填、工单编号展示等）
 *   pendingCount    — 待接取工单数量（侧边栏红点）
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'studio_commission_active_order'

export const useCommissionStore = defineStore('commission', () => {
  // 尝试从 localStorage 恢复（应对页面刷新）
  let _savedOrder = null
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) _savedOrder = JSON.parse(saved)
  } catch { /* ignore */ }

  const activeOrderId   = ref(_savedOrder?._id   || null)
  const activeOrderData = ref(_savedOrder?.data   || null)
  const pendingCount    = ref(0)

  /** 进入代做工单制作流程时调用 */
  function setActiveOrder(id, data) {
    activeOrderId.value   = id
    activeOrderData.value = data
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ _id: id, data }))
    } catch { /* ignore */ }
  }

  /** 制作完成或取消时调用 */
  function clearActiveOrder() {
    activeOrderId.value   = null
    activeOrderData.value = null
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }

  function setPendingCount(n) {
    pendingCount.value = n
  }

  return {
    activeOrderId,
    activeOrderData,
    pendingCount,
    setActiveOrder,
    clearActiveOrder,
    setPendingCount,
  }
})
