<template>
  <div class="commission-page">

    <!-- 顶部工具栏 -->
    <div class="commission-header">
      <div class="commission-header__left">
        <div class="commission-header__tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="ctab"
            :class="{ 'ctab--active': activeTab === tab.id }"
            @click="switchTab(tab.id)"
          >
            {{ tab.label }}
            <span v-if="tab.id === 'pending' && pendingTotal > 0" class="ctab__badge">{{ pendingTotal }}</span>
          </button>
        </div>
        <!-- 精确日期范围查询（与 Tab 同列左对齐，避免被撑到中间） -->
        <div class="date-filter-group">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            unlink-panels
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="截止日期"
            :shortcuts="dateShortcuts"
            format="YYYY/MM/DD"
            value-format="YYYY-MM-DD"
            size="small"
            clearable
            class="wo-date-picker"
          />
          <span v-if="dateRange && dateRange[0]" class="filter-count">{{ filteredOrders.length }} 条</span>
        </div>
      </div>
      <button class="refresh-btn" :disabled="loading" @click="loadOrders" title="刷新">
        <img class="list-refresh-icon" src="@images/icons/chongxinkaishi.png" alt="" />
        刷新
      </button>
    </div>

    <!-- 表格 -->
    <div class="commission-table-wrap">
      <div v-if="loading" class="table-loading">加载中…</div>
      <div v-else-if="!filteredOrders.length" class="table-empty">
        {{ dateRange ? '该时间段内暂无工单' : (activeTab === 'pending' ? '暂无待接取工单' : activeTab === 'claimed' ? '暂无制作中工单' : '暂无已完成工单') }}
      </div>
      <table v-else class="commission-table">
        <thead>
          <tr>
            <th>工单编号</th>
            <th>业务类型</th>
            <th>润色模式</th>
            <th>目标岗位</th>
            <th>身份</th>
            <th>强度</th>
            <th>文件名</th>
            <th>提交时间</th>
            <th v-if="activeTab !== 'pending'">接单人</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in filteredOrders" :key="order._id" @click="openDetail(order)" class="order-row">
            <td class="td-id">{{ order.orderId }}</td>
            <td class="td-biz" @click.stop>
              <span :class="['biz-tag', order.businessType === 'recognition' ? 'biz-tag--recognition' : 'biz-tag--optimize']">
                {{ order.businessType === 'recognition' ? '定制' : '优化' }}
              </span>
            </td>
            <td>{{ polishModeLabel(order.polishMode) }}</td>
            <td class="td-pos">{{ order.targetPosition || '—' }}</td>
            <td>{{ identityLabel(order.userIdentity || order.userType) }}</td>
            <td>{{ intensityLabel(order.polishingIntensity) }}</td>
            <td class="td-file">{{ order.resumeFileName || '—' }}</td>
            <td class="td-time">{{ formatTime(order.createdAt) }}</td>
            <td v-if="activeTab !== 'pending'">{{ resolveClaimedName(order) }}</td>
            <td class="td-actions" @click.stop>
              <!-- 待接取：接取后直接进入制作 -->
              <template v-if="activeTab === 'pending'">
                <button
                  class="action-btn action-btn--claim"
                  @click="claimOrder(order)"
                  :disabled="claiming === order._id || enteringManufacturing"
                >{{ claiming === order._id ? '接取中…' : '接取' }}</button>
                <button v-if="isAdmin" class="action-btn action-btn--assign" @click="openAssignDialog(order)">指定</button>
              </template>
              <!-- 制作中：继续制作 -->
              <template v-else-if="activeTab === 'claimed'">
                <button
                  v-if="order.claimedBy === authStore.userId"
                  class="action-btn action-btn--enter"
                  :disabled="enteringManufacturing"
                  @click="enterManufacturing(order)"
                >{{ enteringManufacturing ? '进入中…' : '继续制作' }}</button>
                <span v-else class="order-owner-badge">
                  <span class="order-owner-badge__name">{{ resolveClaimedName(order) }}</span>
                  <span class="order-owner-badge__tag">制作中</span>
                </span>
              </template>
              <!-- 已完成 -->
              <template v-else>
                <span class="done-label">已完成</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 工单详情弹窗 -->
    <Teleport to="body">
      <Transition name="overlay-fade">
        <div v-if="detailOrder" class="detail-overlay" @click.self="detailOrder = null">
          <div class="detail-modal">
            <div class="detail-modal__header">
              <span class="detail-modal__title">工单详情 · {{ detailOrder.orderId }}</span>
              <button class="detail-modal__close" @click="detailOrder = null">×</button>
            </div>
            <div class="detail-body">
              <div class="detail-row"><span class="detail-key">收件邮箱</span><span class="detail-val">{{ detailOrder.email }}</span></div>
              <div class="detail-row"><span class="detail-key">求职身份</span><span class="detail-val">{{ identityLabel(detailOrder.userIdentity) }}</span></div>
              <div class="detail-row"><span class="detail-key">润色模式</span><span class="detail-val">{{ polishModeLabel(detailOrder.polishMode) }}</span></div>
              <div class="detail-row" v-if="detailOrder.targetPosition"><span class="detail-key">目标岗位</span><span class="detail-val">{{ detailOrder.targetPosition }}</span></div>
              <div class="detail-row"><span class="detail-key">润色强度</span><span class="detail-val">{{ intensityLabel(detailOrder.polishingIntensity) }}</span></div>
              <div class="detail-row">
                <span class="detail-key">原始文件</span>
                <span class="detail-val">{{ detailOrder.resumeFileName || '—' }}</span>
                <button
                  v-if="detailOrder.resumeFileKey"
                  class="dl-btn"
                  :disabled="fileUrlLoading"
                  @click="downloadFile(detailOrder)"
                >{{ fileUrlLoading ? '获取中…' : '下载文件' }}</button>
              </div>
              <div class="detail-row" v-if="detailOrder.jobDescription"><span class="detail-key">岗位 JD</span><span class="detail-val detail-val--pre">{{ detailOrder.jobDescription }}</span></div>
              <div class="detail-row"><span class="detail-key">提交时间</span><span class="detail-val">{{ formatTime(detailOrder.createdAt) }}</span></div>
              <div class="detail-row" v-if="detailOrder.claimedAt"><span class="detail-key">接单时间</span><span class="detail-val">{{ formatTime(detailOrder.claimedAt) }}</span></div>
              <div class="detail-row" v-if="detailOrder.completedAt"><span class="detail-key">完成时间</span><span class="detail-val">{{ formatTime(detailOrder.completedAt) }}</span></div>
              <div class="detail-row" v-if="detailOrder.claimedByName"><span class="detail-key">接单员工</span><span class="detail-val">{{ resolveClaimedName(detailOrder) }}</span></div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 指定分配弹窗（管理员） -->
    <Teleport to="body">
      <Transition name="overlay-fade">
        <div v-if="assignDialog.visible" class="detail-overlay" @click.self="assignDialog.visible = false">
          <div class="detail-modal assign-modal">
            <div class="detail-modal__header">
              <span class="detail-modal__title">指定分配 · {{ assignDialog.order?.orderId }}</span>
              <button class="detail-modal__close" @click="assignDialog.visible = false">×</button>
            </div>
            <div class="detail-body">
              <div class="assign-hint">选择要分配的员工：</div>
              <div
                v-for="u in staffList"
                :key="u.userId"
                class="assign-user"
                :class="{ 'assign-user--selected': assignDialog.targetUserId === u.userId }"
                @click="assignDialog.targetUserId = u.userId; assignDialog.targetUserName = u.userName"
              >
                <span class="assign-user__name">{{ u.userName }}</span>
                <span class="assign-user__id">{{ u.userId }}</span>
              </div>
              <button class="assign-confirm-btn" :disabled="!assignDialog.targetUserId || assigning" @click="confirmAssign">
                {{ assigning ? '分配中…' : '确认分配' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useCommissionStore } from '@/stores/commission'
import { useResumeEnhanceStore } from '@/stores/resumeEnhance'
import { useWorkorderStore } from '@/stores/workorder'
import { useRecognitionStore } from '@/stores/recognition'
import {
  apiListCommissionOrders,
  apiClaimOrder,
  apiAdminAssignOrder,
  apiGetCommissionFileUrl,
  apiBridgeCommissionFile,
} from '@/api/commission'

const authStore       = useAuthStore()
const commissionStore = useCommissionStore()
const rStore          = useRecognitionStore()
const resumeStore     = useResumeEnhanceStore()
const workorderStore  = useWorkorderStore()

const props = defineProps({
  /** 每次轮询递增，CommissionPage 监听后自动静默刷新 */
  refreshTick: { type: Number, default: 0 },
})
const emit = defineEmits(['enter-manufacturing'])

// ── 状态 ──────────────────────────────────────────────────────────────────────
const activeTab   = ref('pending')
const orders      = ref([])
const loading     = ref(false)
const pendingTotal = ref(0)

// ── 日期范围精确查询 ──────────────────────────────────────────────────────────
const dateRange = ref(null)

const dateShortcuts = [
  {
    text: '今天',
    value: () => { const d = new Date(); return [d, d] },
  },
  {
    text: '近一周',
    value: () => {
      const end = new Date(); const start = new Date()
      start.setDate(start.getDate() - 6); return [start, end]
    },
  },
  {
    text: '近一月',
    value: () => {
      const end = new Date(); const start = new Date()
      start.setMonth(start.getMonth() - 1); return [start, end]
    },
  },
  {
    text: '近三月',
    value: () => {
      const end = new Date(); const start = new Date()
      start.setMonth(start.getMonth() - 3); return [start, end]
    },
  },
]

const filteredOrders = computed(() => {
  if (!dateRange.value || !dateRange.value[0] || !dateRange.value[1]) return orders.value
  const start = new Date(dateRange.value[0]).getTime()
  const end   = new Date(dateRange.value[1]).getTime() + 86399999
  return orders.value.filter(o => {
    const ts = o.createdAt ? new Date(o.createdAt).getTime() : 0
    return ts >= start && ts <= end
  })
})
const claiming    = ref(null)
const assigning   = ref(false)
const detailOrder = ref(null)
const staffList   = ref([])

const assignDialog   = ref({ visible: false, order: null, targetUserId: '', targetUserName: '' })
const fileUrlLoading = ref(false)

const tabs = [
  { id: 'pending',   label: '待接取' },
  { id: 'claimed',   label: '制作中' },
  { id: 'completed', label: '已完成' },
]

const isAdmin = computed(() => authStore.isAdmin)

// ── 数据加载 ──────────────────────────────────────────────────────────────────
async function loadOrders() {
  loading.value = true
  try {
    const res = await apiListCommissionOrders({ status: activeTab.value, pageSize: 200 })
    orders.value = res.list || []

    // 同时刷新待接取计数（用于侧边栏徽标）
    if (activeTab.value !== 'pending') {
      const countRes = await apiListCommissionOrders({ status: 'pending', pageSize: 1 })
      pendingTotal.value = countRes.total || 0
    } else {
      pendingTotal.value = res.total || 0
    }
    commissionStore.setPendingCount(pendingTotal.value)
  } catch (err) {
    ElMessage.error(err.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function switchTab(id) {
  activeTab.value = id
  loadOrders()
}

onMounted(loadOrders)

// 轮询刷新：refreshTick 变化时静默重新加载（不 loading 遮罩，防抖 300ms）
let _refreshDebounce = null
watch(() => props.refreshTick, () => {
  if (_refreshDebounce) clearTimeout(_refreshDebounce)
  _refreshDebounce = setTimeout(() => {
    if (!loading.value) loadOrders()
  }, 300)
})

// ── 接取工单（接取后直接进入制作） ────────────────────────────────────────────
async function claimOrder(order) {
  claiming.value = order._id
  try {
    await apiClaimOrder({ _id: order._id })
    ElMessage.success('接取成功，正在进入制作...')
    // 接取成功后直接进入制作流程，无需二次点击
    await enterManufacturing(order)
  } catch (err) {
    ElMessage.error(err.message || '接取失败')
    loadOrders()
  } finally {
    claiming.value = null
  }
}

// ── 进入制作 ──────────────────────────────────────────────────────────────────
const enteringManufacturing = ref(false)

// 小程序端 identity 用 'full'，网页工具（UploadStage / AI 云函数）统一用 'work'
const MINIPROGRAM_IDENTITY_MAP = { full: 'work', internship: 'internship', student: 'student' }

async function enterManufacturing(order) {
  if (enteringManufacturing.value) return
  enteringManufacturing.value = true
  try {
    // ── 简历定制模式（识别模式工单）──────────────────────────────────────────
    if (order.businessType === 'recognition') {
      // 恢复已保存的进度到 done 阶段
      if (order.savedProgress?.stage === 'done') {
        const p = order.savedProgress
        rStore.$patch({
          selectedTemplateId:       p.selectedTemplateId       || '',
          userType:                 p.userType                 || 'work',
          polishMode:               p.polishMode               || 'self',
          polishingIntensity:       p.polishingIntensity       || 'standard',
          targetPosition:           p.targetPosition           || '',
          jobDescription:           p.jobDescription           || '',
          polishList:               p.polishList               || [],
          polishedCount:            p.polishedCount            ?? 0,
          previewImages:            p.previewImages            || [],
          wordDownloadUrl:          p.wordDownloadUrl          || '',
          polishedFileKey:          p.polishedFileKey          || '',
          polishedDownloadUrl:      p.polishedDownloadUrl      || '',
          clientResumeFileKey:      p.clientResumeFileKey      || '',
          clientResumeFileName:     p.clientResumeFileName     || '',
          clientResumePreviewUrls:  p.clientResumePreviewUrls  || [],
          summaryData:              p.summaryData              || null,
          extractedData:            p.extractedData            || null,
          commissionOrderId:        order._id,
          commissionOrderData:      order,
          phase:                    'done',
        })
        commissionStore.setActiveOrder(order._id, order)
        emit('enter-manufacturing', { featureMode: 'create' })
        ElMessage.success('已恢复上次保存的简历定制进度')
        return
      }

      // 常规流程：从 ready 阶段开始（客户在小程序已完成识别+补填）
      rStore.$patch({
        selectedTemplateId:   order.selectedTemplateId   || '',
        userType:             order.userType             || 'work',
        polishMode:           order.polishMode           || 'self',
        polishingIntensity:   order.polishingIntensity   || 'standard',
        targetPosition:       order.targetPosition       || '',
        jobDescription:       order.jobDescription       || '',
        extractedData:        order.extractedData        || null,
        clientResumeFileKey:  order.clientResumeFileKey  || order.resumeFileKey  || '',
        clientResumeFileName: order.clientResumeFileName || order.resumeFileName || '',
        commissionOrderId:    order._id,
        commissionOrderData:  order,
        phase:                'ready',
      })
      commissionStore.setActiveOrder(order._id, order)
      emit('enter-manufacturing', { featureMode: 'create' })
      return
    }

    // ── 若有保存的进度快照，直接恢复到润色对比页（DoneStage）──────────────
    if (order.savedProgress?.stage === 'done') {
      const p = order.savedProgress
      resumeStore.$patch({
        polishMode:          p.polishMode          || 'position',
        targetPosition:      p.targetPosition      || '',
        polishingIntensity:  p.polishingIntensity  || 'standard',
        userIdentity:        p.userIdentity        || 'work',
        jobDescription:      p.jobDescription      || '',
        resumeName:          p.resumeName          || '',
        uploadedFileName:    p.uploadedFileName    || '',
        uploadedFileKey:     p.uploadedFileKey     || '',
        uploadedFileId:      p.uploadedFileId      || '',
        analysisResult:      p.analysisResult      || null,
        scoreLevel:          p.scoreLevel          || '',
        scoreValue:          p.scoreValue          ?? 0,
        radarData:           p.radarData           || [],
        radarIndustryAvg:    p.radarIndustryAvg    || [],
        summaryData:         p.summaryData         || null,
        polishList:          p.polishList          || [],
        polishedCount:       p.polishedCount       ?? 0,
        originalPreviewUrls: p.originalPreviewUrls || [],
        polishedPreviewUrls: p.polishedPreviewUrls || [],
        polishedFileKey:     p.polishedFileKey     || '',
        stage:               'done',
      })
      if (p.workorderId) workorderStore._setCurrentId(p.workorderId)
      commissionStore.setActiveOrder(order._id, order)
      emit('enter-manufacturing', { featureMode: 'optimize' })
      ElMessage.success('已恢复上次保存的制作进度')
      return
    }

    // 新一次「进入制作」：清空旧会话绑定的员工工单 ID，避免沿用 localStorage 误更新上一条
    workorderStore.resetCurrent()

    // ── 常规流程：从上传页开始 ─────────────────────────────────────────────
    // 1. 预填制作参数（身份值从小程序约定转换为网页工具约定）
    resumeStore.polishMode           = order.polishMode         || 'position'
    resumeStore.targetPosition       = order.targetPosition     || ''
    resumeStore.polishingIntensity   = order.polishingIntensity || 'standard'
    resumeStore.userIdentity         = MINIPROGRAM_IDENTITY_MAP[order.userIdentity] || order.userIdentity || 'work'
    resumeStore.jobDescription       = order.jobDescription     || ''
    resumeStore.uploadedFileName     = order.resumeFileName     || ''
    resumeStore.resumeName           = (order.resumeFileName    || '').replace(/\.[^.]+$/, '')
    resumeStore.uploadedFileKey      = ''
    resumeStore.uploadedFileId       = ''
    resumeStore.stage                = 'upload'

    // 2. 记录当前代做工单并跳转到功能区（先跳，后台再完成文件处理）
    commissionStore.setActiveOrder(order._id, order)
    emit('enter-manufacturing', { featureMode: 'optimize' })

    // 3. 服务端中转：云函数从 jk3 下载文件并转存到制作环境（绕过浏览器 CORS）
    if (order.resumeFileKey) {
      try {
        ElMessage.info('正在从云端获取客户简历，请稍候...')
        const bridgeRes = await apiBridgeCommissionFile({
          fileID:   order.resumeFileKey,
          fileName: order.resumeFileName || 'resume.docx',
        })
        let finalFileId   = bridgeRes.fileId  || ''
        let finalFileKey  = bridgeRes.fileKey || ''
        let finalFileName = bridgeRes.fileName || order.resumeFileName || ''

        // PDF 文件无需在此处转换，extractParagraphs 云函数内会自动检测并转换
        // 直接将 PDF fileId 写入 store，点击"发起分析"时在云端完成转换
        const isPdf = finalFileName.toLowerCase().endsWith('.pdf')
        if (isPdf) {
          ElMessage.info('检测到 PDF 简历，点击"发起分析"后将自动转换为 Word 并开始处理')
        }

        resumeStore.uploadedFileId   = finalFileId
        resumeStore.uploadedFileKey  = finalFileKey
        resumeStore.uploadedFileName = finalFileName
        resumeStore.resumeName       = finalFileName.replace(/\.[^.]+$/, '')
        ElMessage.success('客户简历已就绪，可直接点击"发起分析"')
      } catch (e) {
        ElMessage.warning('自动获取文件失败，请手动上传简历：' + (e.message || ''))
      }
    }

    // 4. 仅在云端简历已就绪时创建员工工单（与 UploadStage 上传成功共用 syncWorkorderAfterUpload，不重复插入）
    if (resumeStore.uploadedFileKey) {
      try {
        await workorderStore.syncWorkorderAfterUpload({
          resumeName:      resumeStore.resumeName,
          uploadedFileKey: resumeStore.uploadedFileKey,
          polishMode:      order.polishMode,
          targetPosition:  order.targetPosition || '',
          polishIntensity: order.polishingIntensity,
        })
      } catch { /* 工单记录失败不影响主流程 */ }
    }

  } catch (err) {
    ElMessage.error('进入制作失败：' + (err.message || '请重试'))
  } finally {
    enteringManufacturing.value = false
  }
}

// ── 详情 ──────────────────────────────────────────────────────────────────────
function openDetail(order) {
  detailOrder.value = order
}

// ── 管理员指定分配 ────────────────────────────────────────────────────────────
function openAssignDialog(order) {
  assignDialog.value = { visible: true, order, targetUserId: '', targetUserName: '' }
  loadStaffList()
}

async function loadStaffList() {
  try {
    const { listUsers } = await import('@/api/auth')
    const res = await listUsers()
    staffList.value = (res.users || []).filter(u => u.role === 'editor')
  } catch { /* ignore */ }
}

async function confirmAssign() {
  const d = assignDialog.value
  if (!d.targetUserId || !d.order) return
  assigning.value = true
  try {
    await apiAdminAssignOrder({
      _id: d.order._id,
      targetUserId:   d.targetUserId,
      targetUserName: d.targetUserName,
    })
    ElMessage.success('分配成功')
    assignDialog.value.visible = false
    loadOrders()
  } catch (err) {
    ElMessage.error(err.message || '分配失败')
  } finally {
    assigning.value = false
  }
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────
function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const IDENTITY_MAP  = { full: '全职', internship: '实习', student: '在校' }
const INTENSITY_MAP = { basic: '基础', standard: '标准', senior: '深度' }
const MODE_MAP      = { position: '岗位润色', self: '自身润色' }

function identityLabel(id)  { return IDENTITY_MAP[id]  || id || '—' }
function intensityLabel(id) { return INTENSITY_MAP[id] || id || '—' }
function polishModeLabel(id){ return MODE_MAP[id]      || id || '—' }

/**
 * 解析订单的接单员工显示名
 * - 若是当前登录用户接的单，直接用 authStore.userName（避免旧数据中存的是原始 ID）
 * - 否则用数据库中的 claimedByName；若仍像 ID（纯32位hex），显示 '未知员工'
 */
function resolveClaimedName(order) {
  if (!order?.claimedBy) return '—'
  // 当前用户自己接的单，直接用本地登录名（防止旧数据未补全时也能正确显示）
  if (order.claimedBy === authStore.userId) return authStore.userName || '当前用户'
  const name = order.claimedByName
  if (!name) return '员工'
  // 若云函数补全后仍是原始 hex ID（兜底显示员工，不显示乱码）
  if (/^[0-9a-f]{20,}$/i.test(name)) return '员工'
  return name
}

async function downloadFile(order) {
  if (!order?.resumeFileKey) {
    ElMessage.warning('该工单暂无上传文件'); return
  }
  fileUrlLoading.value = true
  try {
    const res = await apiGetCommissionFileUrl({ fileID: order.resumeFileKey })
    const a   = document.createElement('a')
    a.href     = res.downloadUrl
    a.download = order.resumeFileName || 'resume.docx'
    a.target   = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch (e) {
    ElMessage.error('获取下载链接失败：' + (e.message || '网络异常'))
  } finally {
    fileUrlLoading.value = false
  }
}
</script>

<style scoped>
.commission-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f7f9fc;
  overflow: hidden;
}

/* 顶部 */
.commission-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 24px 0;
  background: #fff;
  border-bottom: 1px solid #eef1f8;
  flex-shrink: 0;
}

.commission-header__left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 16px;
  min-width: 0;
  flex: 1;
}

.date-filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.wo-date-picker {
  width: 196px !important;
  flex-shrink: 0;
}

/* 覆盖 el-date-editor 内部宽度 */
.wo-date-picker.el-date-editor,
.wo-date-picker.el-range-editor {
  width: 196px !important;
}

.filter-count {
  font-size: 12px;
  color: #1565C0;
  font-weight: 600;
  white-space: nowrap;
  background: #e8f0fe;
  border-radius: 10px;
  padding: 2px 8px;
}
.commission-header__tabs { display: flex; gap: 4px; }
.ctab {
  position: relative;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #888;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}
.ctab--active { color: #1565C0; border-bottom-color: #1565C0; }
.ctab__badge {
  position: absolute;
  top: 6px; right: 4px;
  background: #e53935;
  color: #fff;
  font-size: 10px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 10px;
  font-weight: 700;
}

.refresh-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 14px;
  font-size: 13px;
  color: #555;
  background: #f5f7fa;
  border: 1px solid #e0e6f5;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 10px;
}
.list-refresh-icon {
  width: 14px;
  height: 14px;
  display: block;
  object-fit: contain;
  flex-shrink: 0;
  filter: grayscale(100%) brightness(0.7);
}
.refresh-btn:hover .list-refresh-icon { filter: grayscale(100%) brightness(0.5); }
.refresh-btn:hover { background: #e8f0fe; color: #1565C0; }
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 表格区域 */
.commission-table-wrap {
  flex: 1;
  overflow: auto;
  padding: 16px 20px;
}

.table-loading, .table-empty {
  text-align: center;
  padding: 60px;
  color: #aaa;
  font-size: 14px;
}

.commission-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 8px rgba(21,101,192,0.06);
  font-size: 13px;
}
.commission-table thead { background: #f0f4fb; }
.commission-table th {
  padding: 12px 14px;
  text-align: left;
  font-weight: 600;
  color: #666;
  font-size: 12px;
  white-space: nowrap;
  border-bottom: 1px solid #e8ecf4;
}
/* 工单编号、业务类型：表头居中 */
.commission-table thead th:nth-child(1),
.commission-table thead th:nth-child(2) {
  text-align: center;
}
.commission-table td {
  padding: 11px 14px;
  color: #333;
  border-bottom: 1px solid #f4f6fa;
  vertical-align: middle;
}
.order-row { cursor: pointer; transition: background 0.15s; }
.order-row:hover { background: #f7f9ff; }
.order-row:last-child td { border-bottom: none; }

.td-id   { font-weight: 700; color: #1565C0; font-size: 12px; min-width: 140px; text-align: center; }
.td-biz  { text-align: center; white-space: nowrap; }

/* 统一业务类型标签（与 WorkorderPage / AdminPage 保持相同 class 名） */
.biz-tag {
  display: inline-block;
  font-size: 11px; font-weight: 700;
  padding: 1px 10px;
  line-height: 1.15;
  border-radius: 9999px;
  white-space: nowrap;
}
.biz-tag--optimize    { background: #e3f2fd; color: #1565C0; border: 1px solid #90caf9; }
.biz-tag--recognition { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }
.td-pos  { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-file { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: #888; }
.td-time { white-space: nowrap; font-size: 12px; color: #aaa; min-width: 120px; }
.td-actions { white-space: nowrap; }

/* 操作按钮 */
.action-btn {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  margin-right: 6px;
  transition: opacity 0.15s;
}
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.action-btn--claim  { background: #1565C0; color: #fff; }
.action-btn--assign { background: #e8f0fe; color: #1565C0; border: 1px solid #c5d8f8; }
.action-btn--enter  { background: #1b5e20; color: #fff; }
.action-btn:hover:not(:disabled) { opacity: 0.85; }
.order-owner { font-size: 12px; color: #aaa; }

.order-owner-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.order-owner-badge__name {
  font-size: 12px;
  font-weight: 600;
  color: #37474f;
}
.order-owner-badge__tag {
  font-size: 11px;
  font-weight: 500;
  color: #e65100;
  background: #fff3e0;
  border: 1px solid #ffcc80;
  border-radius: 4px;
  padding: 1px 5px;
  line-height: 1.4;
}
.done-label  { font-size: 12px; color: #4caf50; font-weight: 600; }

/* 详情弹窗 */
.detail-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}
.detail-modal {
  background: #fff;
  border-radius: 16px;
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 40px rgba(21,101,192,0.15);
}
.detail-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid #eef1f8;
}
.detail-modal__title { font-size: 15px; font-weight: 700; color: #1a1a2e; }
.detail-modal__close {
  font-size: 22px; color: #aaa; background: none;
  border: none; cursor: pointer; line-height: 1;
}
.detail-body { padding: 20px 24px; }
.detail-row {
  display: flex; align-items: flex-start;
  padding: 10px 0;
  border-bottom: 1px solid #f4f6fa;
  font-size: 13px;
}
.detail-row:last-child { border-bottom: none; }
.detail-key { color: #888; min-width: 80px; flex-shrink: 0; margin-right: 12px; }
.detail-val { color: #1a1a2e; font-weight: 500; flex: 1; }
.detail-val--pre { white-space: pre-wrap; font-size: 12px; color: #555; }
.dl-btn {
  margin-left: 8px; padding: 2px 10px; border-radius: 4px; border: 1px solid #3b82f6;
  color: #3b82f6; background: #fff; cursor: pointer; font-size: 12px; flex-shrink: 0;
}
.dl-btn:hover:not(:disabled) { background: #eff6ff; }
.dl-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 分配弹窗 */
.assign-modal { width: 360px; }
.assign-hint { font-size: 13px; color: #888; margin-bottom: 12px; }
.assign-user {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-radius: 8px;
  cursor: pointer; margin-bottom: 8px;
  border: 1px solid #e8ecf4;
  transition: background 0.15s;
}
.assign-user:hover { background: #f0f6ff; }
.assign-user--selected { background: #e8f0fe; border-color: #1565C0; }
.assign-user__name { font-weight: 600; font-size: 14px; }
.assign-user__id   { font-size: 12px; color: #aaa; }
.assign-confirm-btn {
  width: 100%; margin-top: 16px;
  padding: 11px; background: #1565C0;
  color: #fff; border: none; border-radius: 10px;
  font-size: 14px; font-weight: 600; cursor: pointer;
}
.assign-confirm-btn:disabled { background: #b0bec5; cursor: not-allowed; }

/* 弹窗动画 */
.overlay-fade-enter-active, .overlay-fade-leave-active { transition: opacity 0.2s; }
.overlay-fade-enter-from, .overlay-fade-leave-to { opacity: 0; }
</style>
