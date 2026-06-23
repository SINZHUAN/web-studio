import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  apiCreateWorkorder,
  apiUpdateWorkorderUpload,
  apiUpdateWorkorderStatus,
  apiUpdateEmployeeNote,
  apiRequestDeleteWorkorder,
  apiListMyWorkorders,
} from '@/api/tools'
import { useResumeEnhanceStore } from '@/stores/resumeEnhance'

const STORAGE_KEY = 'studio_workorder_current_id'

export const useWorkorderStore = defineStore('workorder', () => {
  // 当前会话正在处理的工单 _id（持久化到 localStorage，草稿恢复后仍可继续更新工单）
  const currentId = ref(localStorage.getItem(STORAGE_KEY) || '')

  // 员工工单列表页数据
  const myList    = ref([])
  const myTotal   = ref(0)
  const loading   = ref(false)

  function _setCurrentId(id) {
    currentId.value = id || ''
    if (id) {
      localStorage.setItem(STORAGE_KEY, id)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  // ── 创建工单（上传成功后调用）──────────────────────────────────────────────
  async function createWorkorder(params) {
    try {
      const res = await apiCreateWorkorder(params)
      if (res?.success) {
        _setCurrentId(res._id || '')
      }
      return res
    } catch (e) {
      console.warn('[workorder] createWorkorder 失败:', e.message)
      return { success: false }
    }
  }

  /**
   * 文件上传成功后的唯一入口：有 currentId 则覆盖同一条工单的元数据，否则新建一条。
   * 不得在「发起分析」等处创建工单。
   */
  async function syncWorkorderAfterUpload(meta) {
    try {
      if (currentId.value) {
        return await apiUpdateWorkorderUpload({ _id: currentId.value, ...meta })
      }
      const res = await apiCreateWorkorder(meta)
      if (res?.success && res._id) _setCurrentId(res._id)
      return res
    } catch (e) {
      console.warn('[workorder] syncWorkorderAfterUpload 失败:', e.message)
      return { success: false }
    }
  }

  // 仅覆盖当前工单的上传元数据（不创建新工单）
  async function syncCurrentUploadMeta(meta) {
    if (!currentId.value) return { success: false, skipped: true }
    try {
      return await apiUpdateWorkorderUpload({ _id: currentId.value, ...meta })
    } catch (e) {
      console.warn('[workorder] syncCurrentUploadMeta 失败:', e.message)
      return { success: false }
    }
  }

  // ── 更新工单状态（润色完成 / 打包导出后调用）──────────────────────────────
  async function updateStatus(params) {
    if (!currentId.value) return
    try {
      // 润色完成时同步写入 resumeName（此时 store.resumeName 已由 AI 解析填入）
      const enhanceStore = useResumeEnhanceStore()
      const resumeName   = enhanceStore.resumeName || enhanceStore.uploadedFileName || ''
      await apiUpdateWorkorderStatus({ _id: currentId.value, resumeName, ...params })
    } catch (e) {
      console.warn('[workorder] updateStatus 失败:', e.message)
    }
  }

  // ── 员工更新备注 ──────────────────────────────────────────────────────────
  async function updateNote(_id, note) {
    const res = await apiUpdateEmployeeNote({ _id, employeeNote: note })
    return res
  }

  // ── 员工申请删除 ──────────────────────────────────────────────────────────
  async function requestDelete(_id) {
    const res = await apiRequestDeleteWorkorder({ _id })
    return res
  }

  // ── 加载自己的工单列表 ────────────────────────────────────────────────────
  async function fetchMyList(params = {}) {
    loading.value = true
    try {
      const res = await apiListMyWorkorders(params)
      if (res?.success) {
        myList.value  = res.list  || []
        myTotal.value = res.total || 0
      }
    } catch (e) {
      console.warn('[workorder] fetchMyList 失败:', e.message)
    } finally {
      loading.value = false
    }
  }

  // ── 重置当前会话工单 ID（重新开始时调用）──────────────────────────────────
  function resetCurrent() {
    _setCurrentId('')
  }

  return {
    currentId,
    myList, myTotal, loading,
    createWorkorder, syncWorkorderAfterUpload, syncCurrentUploadMeta, updateStatus, updateNote, requestDelete, fetchMyList, resetCurrent,
    _setCurrentId,
  }
})
