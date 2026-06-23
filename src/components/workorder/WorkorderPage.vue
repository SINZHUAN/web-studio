<template>
  <div class="workorder-page">

    <!-- ─── 顶栏 ─── -->
    <div class="wo-header">
      <div class="wo-header-left">
        <h2 class="wo-title">我的工单</h2>
        <div class="wo-stats">
          <span
            v-for="tab in statusTabs"
            :key="tab.value"
            :class="['stat-chip', `stat-chip--${tab.value}`, { 'stat-chip--active': filterStatus === tab.value }]"
            @click="filterStatus = tab.value; refresh()"
          >
            {{ tab.label }}
            <span class="stat-chip__count">{{ statusCount(tab.value) }}</span>
          </span>
        </div>
        <!-- 精确日期范围查询 -->
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
          <span v-if="dateRange && dateRange[0]" class="filter-count">{{ filteredList.length }} 条</span>
        </div>
      </div>
      <button class="wo-refresh-btn" :disabled="woStore.loading" @click="refresh">
        <img class="list-refresh-icon" src="@images/icons/chongxinkaishi.png" alt="" />
        刷新
      </button>
    </div>

    <!-- ─── 表格 ─── -->
    <div class="wo-table-wrap">
      <div v-if="woStore.loading" class="wo-loading">
        <span class="wo-spin"></span>加载中...
      </div>

      <template v-else-if="filteredList.length">
        <div class="wo-table">
          <!-- 表头 -->
          <div class="wo-row wo-row--header">
            <div class="wo-col wo-col--id">工单编号</div>
            <div class="wo-col wo-col--name">求职者</div>
            <div class="wo-col wo-col--biz">业务类型</div>
            <div class="wo-col wo-col--mode">润色模式</div>
            <div class="wo-col wo-col--position">目标岗位</div>
            <div class="wo-col wo-col--status">状态</div>
            <div class="wo-col wo-col--time">上传时间</div>
            <div class="wo-col wo-col--action">操作</div>
          </div>

          <!-- 数据行 -->
          <template v-for="wo in filteredList" :key="wo._id">
            <div
              class="wo-row wo-row--data"
              :class="{ 'wo-row--expanded': expandedId === wo._id, 'wo-row--delete-pending': wo.deleteRequested }"
            >
              <div class="wo-col wo-col--id">
                <span class="wo-id-text">{{ wo.workorderId }}</span>
                <span v-if="wo.deleteRequested" class="delete-badge">待删除</span>
              </div>
              <div class="wo-col wo-col--name">{{ wo.resumeName || '—' }}</div>
              <div class="wo-col wo-col--biz">
                <span class="biz-tag biz-tag--optimize">优化</span>
              </div>
              <div class="wo-col wo-col--mode">
                <span class="mode-tag">{{ wo.polishMode === 'position' ? '岗位润色' : '自身润色' }}</span>
              </div>
              <div class="wo-col wo-col--position">{{ wo.targetPosition || '—' }}</div>
              <div class="wo-col wo-col--status">
                <span :class="['status-badge', `status-badge--${wo.status}`]">
                  {{ statusLabel(wo.status) }}
                </span>
              </div>
              <div class="wo-col wo-col--time">{{ formatTime(wo.createdAt) }}</div>
              <div class="wo-col wo-col--action">
                <button class="action-link action-link--detail" @click="toggleExpand(wo._id)">
                  备注/详情
                </button>
                <button
                  v-if="!wo.deleteRequested"
                  class="action-link action-link--danger"
                  @click="onRequestDelete(wo)"
                >申请删除</button>
                <span v-else class="pending-text">审批中</span>
              </div>
            </div>

            <!-- 展开详情 -->
            <Transition name="wo-expand">
              <div v-if="expandedId === wo._id" class="wo-detail" @click.stop>

                <div class="wo-detail-grid">
                  <div class="detail-item">
                    <span class="detail-label">工单 ID</span>
                    <span class="detail-value detail-value--mono">{{ wo._id }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">员工</span>
                    <span class="detail-value">{{ wo.userName }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">润色强度</span>
                    <span class="detail-value">{{ wo.polishIntensity || '—' }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">最后更新</span>
                    <span class="detail-value">{{ formatTime(wo.updatedAt) }}</span>
                  </div>

                  <!-- 已导出：显示成品文件下载 -->
                  <template v-if="wo.status === 'exported'">
                    <div class="detail-item">
                      <span class="detail-label">成品文件</span>
                      <div class="detail-value detail-dl-row">
                        <a
                          v-if="wo.polishedFileKey"
                          class="dl-link"
                          @click.prevent="downloadFile(wo.polishedFileKey, wo.resumeName)"
                        >下载文档</a>
                        <a
                          v-if="wo.polishedPreviewUrls?.length"
                          class="dl-link"
                          @click.prevent="downloadImages(wo)"
                        >下载图片</a>
                        <span v-if="!wo.polishedFileKey && !wo.polishedPreviewUrls?.length" class="detail-value--muted">暂无</span>
                      </div>
                    </div>
                  </template>

                  <!-- 管理员备注（只读） -->
                  <div v-if="wo.adminNote" class="detail-item detail-item--full">
                    <span class="detail-label">管理员备注</span>
                    <span class="detail-value detail-value--note">{{ wo.adminNote }}</span>
                  </div>
                </div>

                <!-- 员工备注（可编辑） -->
                <div class="detail-note-row">
                  <span class="detail-label">我的备注</span>
                  <div class="note-edit-wrap">
                    <textarea
                      v-model="noteEdits[wo._id]"
                      class="note-textarea"
                      placeholder="可在此填写工单备注（500字以内）..."
                      maxlength="500"
                      rows="3"
                    ></textarea>
                    <button
                      class="note-save-btn"
                      :disabled="savingNote[wo._id]"
                      @click="saveNote(wo)"
                    >
                      {{ savingNote[wo._id] ? '保存中...' : '保存备注' }}
                    </button>
                  </div>
                </div>

              </div>
            </Transition>
          </template>
        </div>
      </template>

      <div v-else class="wo-empty">
        <div class="wo-empty__icon">📋</div>
        <p class="wo-empty__title">暂无工单记录</p>
        <p class="wo-empty__desc">上传简历后，工单将自动记录在此</p>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWorkorderStore } from '@/stores/workorder'
import { apiAdminListAllWorkorders } from '@/api/tools'
import { getFileBase64, getUrlBase64 } from '@/api/docProcessor'

const woStore = useWorkorderStore()

// ── 状态筛选 ──────────────────────────────────────────────────────────────────
const filterStatus = ref('all')

const statusTabs = [
  { value: 'all',      label: '全部' },
  { value: 'uploaded', label: '已上传' },
  { value: 'polished', label: '已润色' },
  { value: 'exported', label: '已导出' },
]

function statusCount(statusVal) {
  if (statusVal === 'all') return woStore.myList.length
  return woStore.myList.filter(w => w.status === statusVal).length
}

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
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 6)
      return [start, end]
    },
  },
  {
    text: '近一月',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setMonth(start.getMonth() - 1)
      return [start, end]
    },
  },
  {
    text: '近三月',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setMonth(start.getMonth() - 3)
      return [start, end]
    },
  },
]

function toTs(v) {
  if (!v) return 0
  if (typeof v === 'number') return v
  return new Date(v).getTime()
}

const filteredList = computed(() => {
  let list = woStore.myList
  if (filterStatus.value !== 'all') {
    list = list.filter(w => w.status === filterStatus.value)
  }
  if (dateRange.value && dateRange.value[0] && dateRange.value[1]) {
    const start = new Date(dateRange.value[0]).getTime()
    const end   = new Date(dateRange.value[1]).getTime() + 86399999  // 截止日当天末尾
    list = list.filter(w => {
      const ts = toTs(w.createdAt)
      return ts >= start && ts <= end
    })
  }
  return list
})

// ── 展开/折叠 ─────────────────────────────────────────────────────────────────
const expandedId   = ref(null)
const noteEdits    = ref({})
const savingNote   = ref({})

function toggleExpand(id) {
  if (expandedId.value === id) {
    expandedId.value = null
  } else {
    expandedId.value = id
    // 初始化备注编辑值
    const wo = woStore.myList.find(w => w._id === id)
    if (wo && noteEdits.value[id] === undefined) {
      noteEdits.value[id] = wo.employeeNote || ''
    }
  }
}

// ── 保存备注 ──────────────────────────────────────────────────────────────────
async function saveNote(wo) {
  savingNote.value[wo._id] = true
  try {
    const res = await woStore.updateNote(wo._id, noteEdits.value[wo._id] || '')
    if (res?.success) {
      ElMessage.success('备注已保存')
      wo.employeeNote = noteEdits.value[wo._id] || ''
    } else {
      ElMessage.error(res?.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败：' + e.message)
  } finally {
    savingNote.value[wo._id] = false
  }
}

// ── 申请删除 ──────────────────────────────────────────────────────────────────
async function onRequestDelete(wo) {
  try {
    await ElMessageBox.confirm(
      `确认申请删除工单 ${wo.workorderId} 吗？\n申请后需管理员审批，审批通过后将永久删除。`,
      '申请删除工单',
      { confirmButtonText: '确认申请', cancelButtonText: '取消', type: 'warning' }
    )
    const res = await woStore.requestDelete(wo._id)
    if (res?.success) {
      ElMessage.success('已提交删除申请，等待管理员审批')
      wo.deleteRequested = true
    } else {
      ElMessage.error(res?.message || '申请失败')
    }
  } catch {
    // cancelled
  }
}

// ── 下载文件 ──────────────────────────────────────────────────────────────────
async function downloadFile(fileKey, resumeName) {
  ElMessage.info('正在准备下载...')
  try {
    const res = await getFileBase64({ fileKey })
    if (!res?.success) throw new Error(res?.message || '获取失败')
    const bytes = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0))
    const blob  = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    const url   = URL.createObjectURL(blob)
    const a     = document.createElement('a')
    a.href      = url
    a.download  = `${resumeName || '简历'}_成品.docx`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error('下载失败：' + e.message)
  }
}

async function downloadImages(wo) {
  if (!wo.polishedPreviewUrls?.length) return
  ElMessage.info('正在准备图片下载...')
  try {
    for (let i = 0; i < wo.polishedPreviewUrls.length; i++) {
      const res = await getUrlBase64({ url: wo.polishedPreviewUrls[i] })
      if (!res?.success) continue
      const mime  = res.mimeType || 'image/png'
      const ext   = mime.split('/')[1] || 'png'
      const bytes = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0))
      const blob  = new Blob([bytes], { type: mime })
      const url   = URL.createObjectURL(blob)
      const a     = document.createElement('a')
      a.href      = url
      a.download  = `${wo.resumeName || '简历'}_预览图_${i + 1}.${ext}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
    ElMessage.success('图片下载完成')
  } catch (e) {
    ElMessage.error('下载失败：' + e.message)
  }
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────
const statusLabel = (s) => ({ uploaded: '已上传', polished: '已润色', exported: '已导出' }[s] || s)

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── 刷新 ──────────────────────────────────────────────────────────────────────
async function refresh() {
  await woStore.fetchMyList({ pageSize: 500 })
}

onMounted(() => refresh())
</script>

<style scoped>
.workorder-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 24px 32px 16px;
  gap: 16px;
}

/* ─── 顶栏 ─── */
.wo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 8px;
}

.wo-header-left {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.wo-title {
  font-size: 18px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
}

.wo-stats {
  display: flex;
  gap: 8px;
}

.date-filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 4px;
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

.stat-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1.5px solid transparent;
  color: #666;
  background: #f0f4fc;
  transition: all 0.15s;
  user-select: none;
}

.stat-chip:hover { background: #e0eaff; color: #1565C0; }

.stat-chip--active { background: #e8f0fe; border-color: #1565C0; color: #1565C0; }

.stat-chip__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(0,0,0,0.08);
}

.wo-refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid #d4daea;
  border-radius: 8px;
  background: #fff;
  color: #555;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.list-refresh-icon {
  width: 14px;
  height: 14px;
  display: block;
  object-fit: contain;
  flex-shrink: 0;
  filter: grayscale(100%) brightness(0.7);
}
.wo-refresh-btn:hover:not(:disabled) .list-refresh-icon { filter: grayscale(100%) brightness(0.5); }
.wo-refresh-btn:hover:not(:disabled) { border-color: #1565C0; color: #1565C0; }
.wo-refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ─── 表格容器 ─── */
.wo-table-wrap {
  flex: 1;
  overflow-y: auto;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e8ecf4;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

/* ─── 加载 ─── */
.wo-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 200px;
  color: #999;
  font-size: 14px;
}

.wo-spin {
  display: block;
  width: 18px;
  height: 18px;
  border: 2.5px solid #e0e8ff;
  border-top-color: #1565C0;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ─── 表格行 ─── */
.wo-table { width: 100%; }

/* 8 列：编号 / 求职者 / 业务 / 模式 / 目标岗位 / 状态 / 上传时间 / 操作
 * 编号列不抢 1fr，四列（求职者～目标岗位）更靠左；列间距略加大；余量给操作列 */
.wo-row {
  display: grid;
  grid-template-columns:
    minmax(148px, 188px)
    minmax(76px, 112px)
    88px
    minmax(90px, 108px)
    minmax(104px, 240px)
    minmax(76px, 92px)
    minmax(128px, 146px)
    minmax(152px, 1fr);
  align-items: center;
  border-bottom: 1px solid #f0f3fa;
  column-gap: 12px;
}

.wo-row--header {
  background: #f7f9fc;
  position: sticky;
  top: 0;
  z-index: 1;
  border-radius: 12px 12px 0 0;
}

.wo-row--data {
  cursor: pointer;
  transition: background 0.12s;
}

.wo-row--data:hover { background: #f5f8ff; }
.wo-row--expanded   { background: #f0f5ff; }
.wo-row--delete-pending { opacity: 0.65; }

.wo-col {
  padding: 10px 8px;
  font-size: 12px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* 表头与数据列同一套对齐，避免「标题偏左/偏右、内容不跟列」 */
.wo-col--id,
.wo-col--name { text-align: left; }

/* 任务工单页：工单编号与业务类型，表头+内容统一居中 */
.wo-col--id,
.wo-col--biz {
  text-align: center;
}

.wo-col--biz  { text-align: center; }
.wo-col--mode { text-align: center; }

/* 统一业务类型标签（与 CommissionPage / AdminPage 相同 class） */
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

.wo-col--position {
  text-align: left;
  padding-left: 20px;
}

.wo-col--status {
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.wo-col--time { text-align: center; }

/* 上传时间：表头/内容统一居中对齐 */
.wo-row--header .wo-col--time,
.wo-row--data .wo-col--time {
  text-align: center;
  padding-right: 0;
}

.wo-row--header .wo-col {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  letter-spacing: 0.3px;
}

/* 表头「业务类型」完整显示，避免被全局 .wo-col 的 ellipsis 截断 */
.wo-row--header .wo-col--biz {
  overflow: visible;
  text-overflow: clip;
}

.wo-id-text { font-family: monospace; font-size: 12px; color: #1565C0; font-weight: 600; }

.delete-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  background: #fef3cd;
  color: #b45309;
  border: 1px solid #fcd34d;
}

.mode-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 500;
  background: #eff6ff;
  color: #1d4ed8;
}

/* ─── 状态徽章 ─── */
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.status-badge--uploaded { background: #dbeafe; color: #1e40af; }
.status-badge--polished { background: #fef9c3; color: #92400e; }
.status-badge--exported { background: #dcfce7; color: #15803d; }

/* ─── 操作列 ─── */
.wo-col--action {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  overflow: visible;
  text-align: center;
  flex-wrap: nowrap;
}

/* 操作：表头/内容统一居中对齐 */
.wo-row--header .wo-col--action,
.wo-row--data .wo-col--action {
  justify-content: center;
  text-align: center;
  padding-right: 0;
}
.action-link {
  background: none;
  border: none;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 0;
  white-space: nowrap;
  flex-shrink: 0;
}
.action-link--detail { color: #3b82f6; }
.action-link--detail:hover { text-decoration: underline; }
.action-link--danger { color: #ef4444; }
.action-link--danger:hover { text-decoration: underline; }
.pending-text { font-size: 12px; color: #999; }

/* ─── 展开详情 ─── */
.wo-expand-enter-active,
.wo-expand-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.wo-expand-enter-from,
.wo-expand-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.wo-detail {
  grid-column: 1 / -1;
  padding: 16px 20px 20px;
  background: #fafbff;
  border-bottom: 1px solid #e8ecf4;
  border-top: 1px solid #dde8ff;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.wo-detail-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px 20px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-item--full { grid-column: 1 / -1; }

.detail-label {
  font-size: 11px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  font-size: 13px;
  color: #333;
}

.detail-value--mono { font-family: monospace; font-size: 11px; color: #666; }
.detail-value--note {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  color: #78350f;
}
.detail-value--muted { color: #aaa; }

.detail-dl-row { display: flex; gap: 12px; align-items: center; }

.dl-link {
  font-size: 13px;
  color: #1565C0;
  cursor: pointer;
  text-decoration: none;
  font-weight: 500;
  border-bottom: 1px solid #93c5fd;
  transition: color 0.15s;
}

.dl-link:hover { color: #0d47a1; border-bottom-color: #0d47a1; }

/* ─── 备注编辑 ─── */
.detail-note-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.note-edit-wrap {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.note-textarea {
  flex: 1;
  padding: 8px 10px;
  border: 1.5px solid #d4daea;
  border-radius: 8px;
  font-size: 13px;
  color: #333;
  resize: vertical;
  min-height: 62px;
  font-family: inherit;
  transition: border-color 0.15s;
  outline: none;
}

.note-textarea:focus { border-color: #1565C0; }

.note-save-btn {
  padding: 8px 18px;
  background: #1565C0;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
  height: fit-content;
}

.note-save-btn:hover:not(:disabled) { background: #1251A3; }
.note-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* ─── 空态 ─── */
.wo-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 300px;
  color: #aaa;
}

.wo-empty__icon { font-size: 48px; }
.wo-empty__title { font-size: 16px; font-weight: 600; color: #666; margin: 0; }
.wo-empty__desc  { font-size: 13px; margin: 0; }
</style>
