<template>
  <div class="admin-page">

    <!-- ─── 顶栏：Tab 切换 ─── -->
    <div class="admin-tabs-bar">
      <button
        :class="['admin-tab', { 'admin-tab--active': activeAdminTab === 'users' }]"
        @click="activeAdminTab = 'users'"
      >员工管理</button>
      <button
        :class="['admin-tab', { 'admin-tab--active': activeAdminTab === 'workorders' }]"
        @click="switchToWorkorders"
      >工单管理</button>
      <button
        :class="['admin-tab', { 'admin-tab--active': activeAdminTab === 'security' }]"
        @click="switchToSecurity"
      >安全日志</button>
    </div>

    <!-- ════════════════ 员工管理 Tab ════════════════ -->
    <template v-if="activeAdminTab === 'users'">

    <!-- ─── 顶栏：标题 + 统计 + 操作 ─── -->
    <div class="admin-header">
      <div class="header-left">
        <h2 class="admin-title">团队成员管理</h2>
        <div class="stats-row">
          <span class="stat-chip">
            <span class="stat-num">{{ stats.total }}</span>全部
          </span>
          <span class="stat-chip stat-chip--active">
            <span class="stat-num">{{ stats.active }}</span>活跃
          </span>
          <span class="stat-chip stat-chip--disabled">
            <span class="stat-num">{{ stats.disabled }}</span>停用
          </span>
          <span class="stat-chip stat-chip--frozen">
            <span class="stat-num">{{ stats.frozen }}</span>冻结
          </span>
          <span v-if="isSuperAdmin" class="stat-chip stat-chip--superadmin">
            <span class="stat-num">{{ stats.admins }}</span>副管理员
          </span>
          <span v-if="isSuperAdmin" class="stat-chip stat-chip--admin">
            <span class="stat-num">{{ stats.superadmin }}</span>总管理员
          </span>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <el-button :loading="loading" @click="loadUsers">刷新</el-button>
        <el-button type="primary" @click="openCreateDialog">
          <el-icon style="margin-right:4px"><Plus /></el-icon>添加员工
        </el-button>
      </div>
    </div>

    <!-- ─── 员工表格 ─── -->
    <div class="table-wrap">
      <el-table
        v-loading="loading"
        :data="users"
        row-key="userId"
        stripe
        style="width:100%;height:100%"
        :header-cell-style="{ background: '#f7f9fc', color: '#555', fontWeight: 600, fontSize: '13px' }"
      >
        <!-- 姓名 + 头像 -->
        <el-table-column label="员工" min-width="140" align="left" header-align="left">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="user-avatar" :style="{ background: avatarColor(row.name) }">
                {{ row.name.charAt(0) }}
              </div>
              <div class="user-info">
                <span class="user-name">{{ row.name }}</span>
                <span class="user-email">{{ row.email }}</span>
              </div>
            </div>
          </template>
        </el-table-column>

        <!-- 角色 -->
        <el-table-column label="角色" width="130" align="center" header-align="center">
          <template #default="{ row }">
            <!-- 总管理员查看非 superadmin 行时，可编辑角色 -->
            <el-select
              v-if="isSuperAdmin && row.role !== 'superadmin' && row.userId !== currentUserId"
              :model-value="row.role"
              size="small"
              style="width:100px"
              @change="(val) => handleRoleChange(row, val)"
            >
              <el-option label="员工" value="editor" />
              <el-option label="副管理员" value="admin" />
            </el-select>
            <!-- 其他情况：只读标签 -->
            <el-tag v-else size="small" :type="roleTagType(row.role)" effect="light">
              {{ roleLabel(row.role) }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- 状态 -->
        <el-table-column label="状态" width="110" align="center" header-align="center">
          <template #default="{ row }">
            <el-tag
              v-if="row.frozen"
              type="danger"
              size="small"
              effect="dark"
              :title="row.frozenReason || '已被安全系统冻结'"
            >🔒 冻结</el-tag>
            <el-tag
              v-else
              :type="row.isActive ? 'success' : 'warning'"
              size="small"
              effect="light"
            >{{ row.isActive ? '活跃' : '停用' }}</el-tag>
          </template>
        </el-table-column>

        <!-- 注册时间 -->
        <el-table-column label="注册时间" width="150" align="left" header-align="left">
          <template #default="{ row }">
            <span class="date-text">{{ formatDate(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <!-- 最后登录 -->
        <el-table-column label="最后登录" width="150" align="left" header-align="left">
          <template #default="{ row }">
            <span class="date-text">{{ row.lastLoginAt ? formatDate(row.lastLoginAt) : '从未登录' }}</span>
          </template>
        </el-table-column>

        <!-- 操作 -->
        <el-table-column
          label="操作"
          width="310"
          fixed="right"
          align="right"
          header-align="right"
          class-name="admin-user-actions-col"
          header-class-name="admin-user-actions-col"
        >
          <template #default="{ row }">
            <div class="action-btns">
              <!-- superadmin 行：任何人不可操作（只读） -->
              <span v-if="row.role === 'superadmin'" class="role-locked-tip">总管理员不可操作</span>
              <template v-else>
                <!-- 解冻（仅冻结账号显示，且有权限） -->
                <el-button
                  v-if="row.frozen && canManage(row)"
                  size="small"
                  type="success"
                  text
                  @click="handleUnfreeze(row)"
                >解冻</el-button>

                <!-- 启用 / 停用 -->
                <el-button
                  v-if="canManage(row)"
                  size="small"
                  :type="row.isActive ? 'warning' : 'success'"
                  text
                  :disabled="row.userId === currentUserId"
                  @click="handleToggle(row)"
                >{{ row.isActive ? '停用' : '启用' }}</el-button>

                <!-- 重置密码 -->
                <el-button
                  v-if="canManage(row)"
                  size="small"
                  type="primary"
                  text
                  @click="openResetDialog(row)"
                >重置密码</el-button>

                <!-- 删除 -->
                <el-popconfirm
                  v-if="canManage(row)"
                  title="确认删除该账号？此操作不可恢复"
                  confirm-button-text="确认删除"
                  cancel-button-text="取消"
                  confirm-button-type="danger"
                  :disabled="row.userId === currentUserId"
                  @confirm="handleDelete(row)"
                >
                  <template #reference>
                    <el-button
                      size="small"
                      type="danger"
                      text
                      :disabled="row.userId === currentUserId"
                    >删除</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- ─── 创建员工弹窗 ─── -->
    <el-dialog
      v-model="createDialogVisible"
      title="添加员工账号"
      width="440px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-width="90px"
        style="margin-top:4px"
      >
        <el-form-item label="姓名" prop="name">
          <el-input v-model="createForm.name" placeholder="员工姓名（用于界面显示）" clearable />
        </el-form-item>
        <el-form-item label="登录账号" prop="email">
          <el-input v-model="createForm.email" placeholder="邮箱或自定义账号" clearable />
        </el-form-item>
        <el-form-item label="初始密码" prop="password">
          <el-input
            v-model="createForm.password"
            type="password"
            show-password
            placeholder="至少6位，员工可自行修改"
          />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-radio-group v-model="createForm.role">
            <el-radio value="editor">普通编辑</el-radio>
            <el-radio value="admin">管理员</el-radio>
          </el-radio-group>
          <div class="role-hint">管理员可访问此管理页面并管理其他员工</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleCreate">创建账号</el-button>
      </template>
    </el-dialog>

    <!-- ─── 重置密码弹窗 ─── -->
    <el-dialog
      v-model="resetDialogVisible"
      :title="`重置密码 · ${resetTarget?.name || ''}`"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="resetFormRef"
        :model="resetForm"
        :rules="resetRules"
        label-width="90px"
        style="margin-top:4px"
      >
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="resetForm.newPassword"
            type="password"
            show-password
            placeholder="至少6位"
          />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="resetForm.confirmPassword"
            type="password"
            show-password
            placeholder="再次输入新密码"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleReset">确认重置</el-button>
      </template>
    </el-dialog>

    </template><!-- end users tab -->

    <!-- ════════════════ 工单管理 Tab ════════════════ -->
    <template v-if="activeAdminTab === 'workorders'">
      <div class="wo-admin-wrap">

        <!-- 筛选栏 -->
        <div class="wo-admin-toolbar">
          <div class="wo-admin-filters">
            <!-- 精确日期范围查询 -->
            <el-date-picker
              v-model="woDateRange"
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
            <select v-model="woFilterUser" class="wo-filter-select" @change="loadAdminWorkorders">
              <option value="">全部员工</option>
              <option v-for="u in users" :key="u.userId" :value="u.userId">{{ u.name }}</option>
            </select>
            <select v-model="woFilterStatus" class="wo-filter-select" @change="loadAdminWorkorders">
              <option value="">全部状态</option>
              <option value="uploaded">已上传</option>
              <option value="polished">已润色</option>
              <option value="exported">已导出</option>
            </select>
            <span class="wo-filter-total">共 {{ filteredAdminWoList.length }} 条</span>
            <span v-if="filteredAdminWoList.some(w => w.deleteRequested)" class="wo-delete-pending-tip">
              ⚠ 有待审批的删除申请
            </span>
          </div>
          <button class="wo-refresh-btn" :disabled="adminWoLoading" @click="loadAdminWorkorders">
            <img class="list-refresh-icon" src="@images/icons/chongxinkaishi.png" alt="" />
            刷新
          </button>
        </div>

        <!-- 工单列表 -->
        <div class="wo-admin-list">
          <div v-if="adminWoLoading" class="wo-loading">
            <span class="wo-spin"></span>加载中...
          </div>

          <template v-else-if="filteredAdminWoList.length">
            <!-- 表头 -->
            <div class="woa-row woa-row--header">
              <div class="woa-col woa-col--id">工单编号</div>
              <div class="woa-col woa-col--user">承办员工</div>
              <div class="woa-col woa-col--name">求职者</div>
              <div class="woa-col woa-col--biz">业务类型</div>
              <div class="woa-col woa-col--mode">润色模式</div>
              <div class="woa-col woa-col--position">目标岗位</div>
              <div class="woa-col woa-col--status">状态</div>
              <div class="woa-col woa-col--time">上传时间</div>
              <div class="woa-col woa-col--action">操作</div>
            </div>

            <template v-for="wo in filteredAdminWoList" :key="wo._id">
              <div
                :class="['woa-row', 'woa-row--data', { 'woa-row--expanded': woExpandedId === wo._id, 'woa-row--delete-req': wo.deleteRequested }]"
              >
                <div class="woa-col woa-col--id">
                  <span class="woa-id">{{ wo.workorderId }}</span>
                  <span v-if="wo.deleteRequested" class="del-badge">申请删除</span>
                </div>
                <div class="woa-col woa-col--user">{{ wo.userName }}</div>
                <div class="woa-col woa-col--name">{{ wo.resumeName || '—' }}</div>
                <div class="woa-col woa-col--biz">
                  <span class="biz-tag biz-tag--optimize">优化</span>
                </div>
                <div class="woa-col woa-col--mode">
                  <span class="mode-chip">{{ wo.polishMode === 'position' ? '岗位润色' : '自身润色' }}</span>
                </div>
                <div class="woa-col woa-col--position">{{ wo.targetPosition || '—' }}</div>
                <div class="woa-col woa-col--status">
                  <select
                    :value="wo.status"
                    class="status-select"
                    :class="`status-select--${wo.status}`"
                    @change="onAdminStatusChange(wo, $event.target.value)"
                  >
                    <option value="uploaded">已上传</option>
                    <option value="polished">已润色</option>
                    <option value="exported">已导出</option>
                  </select>
                </div>
                <div class="woa-col woa-col--time">{{ formatWoTime(wo.createdAt) }}</div>
                <div class="woa-col woa-col--action">
                  <button class="act-btn act-btn--detail" @click="toggleWoExpand(wo)">备注/详情</button>
                  <button v-if="wo.deleteRequested" class="act-btn act-btn--confirm" @click="onApproveDelete(wo)">批准删除</button>
                  <button v-if="wo.deleteRequested" class="act-btn act-btn--reject" @click="onRejectDelete(wo)">驳回</button>
                  <button v-if="!wo.deleteRequested" class="act-btn act-btn--del" @click="onAdminForceDelete(wo)">删除</button>
                </div>
              </div>

              <!-- 展开：完整工单详情（与员工工单一致） -->
              <Transition name="woa-expand">
                <div v-if="woExpandedId === wo._id" class="woa-detail" @click.stop>

                  <!-- 基础信息网格 -->
                  <div class="woa-detail-grid">
                    <div class="woa-detail-item">
                      <span class="woa-detail-label">工单 ID</span>
                      <span class="woa-detail-value woa-detail-value--mono">{{ wo._id }}</span>
                    </div>
                    <div class="woa-detail-item">
                      <span class="woa-detail-label">员工</span>
                      <span class="woa-detail-value">{{ wo.userName }}</span>
                    </div>
                    <div class="woa-detail-item">
                      <span class="woa-detail-label">润色强度</span>
                      <span class="woa-detail-value">{{ wo.polishIntensity || '—' }}</span>
                    </div>
                    <div class="woa-detail-item">
                      <span class="woa-detail-label">最后更新</span>
                      <span class="woa-detail-value">{{ formatWoTime(wo.updatedAt) }}</span>
                    </div>

                    <!-- 已导出：成品文件下载 -->
                    <template v-if="wo.status === 'exported'">
                      <div class="woa-detail-item">
                        <span class="woa-detail-label">成品文件</span>
                        <div class="woa-detail-value woa-detail-dl-row">
                          <a v-if="wo.polishedFileKey" class="woa-dl-link" @click.prevent="adminDownloadFile(wo.polishedFileKey, wo.resumeName)">下载文档</a>
                          <a v-if="wo.polishedPreviewUrls?.length" class="woa-dl-link" @click.prevent="adminDownloadImages(wo)">下载图片</a>
                          <span v-if="!wo.polishedFileKey && !wo.polishedPreviewUrls?.length" class="woa-detail-value--muted">暂无</span>
                        </div>
                      </div>
                    </template>
                  </div>

                  <!-- 员工备注（只读）+ 管理员备注（可编辑） -->
                  <div class="woa-detail-notes">
                    <div class="woa-note-block">
                      <div class="woa-note-label">员工备注（只读）</div>
                      <div class="woa-note-readonly">{{ wo.employeeNote || '（员工未填写）' }}</div>
                    </div>
                    <div class="woa-note-block">
                      <div class="woa-note-label">管理员备注</div>
                      <div class="woa-note-edit">
                        <textarea
                          v-model="woAdminNoteEdits[wo._id]"
                          class="woa-note-textarea"
                          placeholder="填写管理员备注..."
                          maxlength="500"
                          rows="3"
                          @click.stop
                        ></textarea>
                        <button class="woa-note-save" :disabled="savingAdminNote[wo._id]" @click.stop="saveAdminNote(wo)">
                          {{ savingAdminNote[wo._id] ? '保存中...' : '保存备注' }}
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              </Transition>
            </template>
          </template>

          <div v-else class="wo-empty">
            <div class="wo-empty__icon">📋</div>
            <p class="wo-empty__title">暂无工单记录</p>
          </div>
        </div>
      </div>
    </template><!-- end workorders tab -->

    <!-- ════════════════ 安全日志 Tab ════════════════ -->
    <template v-if="activeAdminTab === 'security'">
      <div class="sec-wrap">

        <!-- 工具栏 -->
        <div class="sec-toolbar">
          <div class="sec-filters">
            <select v-model="secFilterUser" class="wo-filter-select">
              <option value="">全部员工</option>
              <option v-for="u in users" :key="u.userId" :value="u.userId">{{ u.name }}</option>
            </select>
            <select v-model="secFilterType" class="wo-filter-select">
              <option value="">全部类型</option>
              <option value="printscreen">PrintScreen</option>
              <option value="copy">复制内容</option>
              <option value="save_page">保存网页</option>
              <option value="print_page">打印/存PDF</option>
              <option value="view_source">查看源码</option>
              <option value="devtools">开发者工具</option>
              <option value="drag">拖拽内容</option>
            </select>
            <span class="wo-filter-total">共 {{ filteredSecLogs.length }} 条</span>
          </div>
          <div class="sec-toolbar-actions">
            <button
              :class="['high-risk-btn', { 'high-risk-btn--active': showHighRisk }]"
              @click="toggleHighRisk"
            >⚠ 高危提示</button>
            <button class="wo-refresh-btn" :disabled="secLoading" @click="loadSecurityLogs">
              <img class="list-refresh-icon" src="@images/icons/chongxinkaishi.png" alt="" />
              刷新
            </button>
          </div>
        </div>

        <!-- 高危提示面板 -->
        <div v-if="showHighRisk" class="high-risk-panel">
          <div class="high-risk-panel__header">
            <span class="high-risk-panel__title">⚠ 近1小时频繁截屏员工</span>
            <button class="high-risk-panel__refresh" :disabled="highRiskLoading" @click="loadHighRiskUsers">
              <img
                v-if="!highRiskLoading"
                class="list-refresh-icon list-refresh-icon--sm"
                src="@images/icons/chongxinkaishi.png"
                alt=""
              />
              {{ highRiskLoading ? '加载中…' : '刷新' }}
            </button>
          </div>
          <div v-if="highRiskLoading" class="high-risk-panel__empty">加载中…</div>
          <div v-else-if="highRiskList.length === 0" class="high-risk-panel__empty">近1小时内无截屏记录</div>
          <div v-else class="high-risk-panel__list">
            <div
              v-for="item in highRiskList"
              :key="item.userId"
              :class="['high-risk-item', { 'high-risk-item--danger': item.count >= 3 }]"
            >
              <span class="high-risk-item__name">{{ item.userName }}</span>
              <span class="high-risk-item__count">
                {{ item.count }} 次截屏
                <span v-if="item.count >= 3" class="high-risk-item__badge">已触发自动冻结</span>
              </span>
              <span class="high-risk-item__time">最近：{{ formatSecTime(item.lastAt) }}</span>
            </div>
          </div>
        </div>

        <!-- 日志列表 -->
        <div class="sec-table-wrap">
          <div v-if="secLoading" class="wo-loading"><span class="wo-spin"></span>加载中...</div>

          <template v-else-if="filteredSecLogs.length">
            <!-- 表头 -->
            <div class="sec-row sec-row--header">
              <div class="sec-col sec-col--time">时间</div>
              <div class="sec-col sec-col--user">员工</div>
              <div class="sec-col sec-col--type">事件类型</div>
              <div class="sec-col sec-col--detail">详情</div>
              <div class="sec-col sec-col--page">页面</div>
            </div>
            <div v-for="log in filteredSecLogs" :key="log._id" class="sec-row sec-row--data">
              <div class="sec-col sec-col--time">{{ formatSecTime(log.createdAt) }}</div>
              <div class="sec-col sec-col--user">{{ log.userName || '—' }}</div>
              <div class="sec-col sec-col--type">
                <span v-if="log.eventType" :class="['sec-type-badge', `sec-type-badge--${log.eventType}`]">
                  {{ secTypeLabel(log.eventType) }}
                </span>
                <span v-else class="sec-type-badge">—</span>
              </div>
              <div class="sec-col sec-col--detail" :title="log.detail">{{ log.detail || '—' }}</div>
              <div class="sec-col sec-col--page">{{ log.pageUrl || '—' }}</div>
            </div>
          </template>

          <div v-else class="wo-empty">
            <div class="wo-empty__icon">🛡️</div>
            <p class="wo-empty__title">暂无安全事件记录</p>
          </div>
        </div>

      </div>
    </template><!-- end security tab -->

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import {
  listUsers,
  createUser,
  toggleUser,
  deleteUser,
  adminResetPassword,
  changeUserRole,
  unfreezeUser
} from '@/api/auth'
import {
  apiAdminListAllWorkorders,
  apiAdminUpdateWorkorder,
  apiAdminDeleteWorkorder,
  apiAdminListSecurityLogs,
  apiAdminGetHighRiskUsers,
} from '@/api/tools'
import { getFileBase64, getUrlBase64 } from '@/api/docProcessor'

const authStore     = useAuthStore()
const currentUserId  = computed(() => authStore.userId || null)
const isSuperAdmin   = computed(() => authStore.isSuperAdmin)

// ── Tab 切换 ──────────────────────────────────────────────────────────────────
const activeAdminTab = ref('users')

async function switchToWorkorders() {
  activeAdminTab.value = 'workorders'
  await loadAdminWorkorders()
}

async function switchToSecurity() {
  activeAdminTab.value = 'security'
  await loadSecurityLogs()
}

// ── 数据 ─────────────────────────────────────────────────────────────────────

const loading = ref(false)
const users   = ref([])

const stats = computed(() => ({
  total:      users.value.length,
  active:     users.value.filter(u => u.isActive && !u.frozen).length,
  disabled:   users.value.filter(u => !u.isActive).length,
  frozen:     users.value.filter(u => u.frozen).length,
  superadmin: users.value.filter(u => u.role === 'superadmin').length,
  admins:     users.value.filter(u => u.role === 'admin').length,
}))

// ── 角色工具 ──────────────────────────────────────────────────────────────────

function roleLabel(role) {
  return { superadmin: '总管理员', admin: '副管理员', editor: '员工' }[role] || role
}

function roleTagType(role) {
  return { superadmin: 'danger', admin: 'warning', editor: 'success' }[role] || 'info'
}

// 当前登录者是否有权限操作该行账号
function canManage(row) {
  if (row.role === 'superadmin') return false
  // 副管理员只能操作 editor
  if (authStore.userRole === 'admin' && row.role !== 'editor') return false
  return true
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const hm  = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${ymd} ${hm}`
}

const AVATAR_COLORS = ['#1565C0', '#2e7d32', '#c62828', '#6a1b9a', '#00695c', '#e65100', '#ad1457']
function avatarColor(name) {
  let n = 0
  for (const ch of name) n += ch.charCodeAt(0)
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

async function loadUsers() {
  loading.value = true
  try {
    const res = await listUsers()
    if (res.success) users.value = res.list
    else ElMessage.error(res.message || '加载失败')
  } catch {
    ElMessage.error('网络错误，请稍后重试')
  } finally {
    loading.value = false
  }
}

onMounted(loadUsers)

// ══════════════════════════════════════════════════════════════════════════════
//  工单管理（管理员）
// ══════════════════════════════════════════════════════════════════════════════

const adminWoLoading   = ref(false)
const adminWoList      = ref([])
const woFilterUser     = ref('')
const woFilterStatus   = ref('')
const woExpandedId     = ref(null)
const woAdminNoteEdits = ref({})
const savingAdminNote  = ref({})

// ── 日期范围精确查询 ──────────────────────────────────────────────────────────
const woDateRange = ref(null)

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

function woToTs(v) {
  if (!v) return 0
  if (typeof v === 'number') return v
  return new Date(v).getTime()
}

const filteredAdminWoList = computed(() => {
  let list = adminWoList.value
  if (woDateRange.value && woDateRange.value[0] && woDateRange.value[1]) {
    const start = new Date(woDateRange.value[0]).getTime()
    const end   = new Date(woDateRange.value[1]).getTime() + 86399999
    list = list.filter(w => {
      const ts = woToTs(w.createdAt)
      return ts >= start && ts <= end
    })
  }
  return list
})

async function loadAdminWorkorders() {
  adminWoLoading.value = true
  try {
    const res = await apiAdminListAllWorkorders({
      userId: woFilterUser.value   || undefined,
      status: woFilterStatus.value || undefined,
      pageSize: 500,
    })
    if (res?.success) adminWoList.value = res.list || []
  } catch (e) {
    ElMessage.error('加载工单失败：' + e.message)
  } finally {
    adminWoLoading.value = false
  }
}

function toggleWoExpand(wo) {
  if (woExpandedId.value === wo._id) {
    woExpandedId.value = null
  } else {
    woExpandedId.value = wo._id
    if (woAdminNoteEdits.value[wo._id] === undefined) {
      woAdminNoteEdits.value[wo._id] = wo.adminNote || ''
    }
  }
}

async function onAdminStatusChange(wo, newStatus) {
  if (newStatus === wo.status) return
  try {
    const res = await apiAdminUpdateWorkorder({ _id: wo._id, status: newStatus })
    if (res?.success) {
      ElMessage.success('状态已更新')
      wo.status = newStatus
    } else {
      ElMessage.error(res?.message || '更新失败')
    }
  } catch (e) {
    ElMessage.error('更新失败：' + e.message)
  }
}

async function saveAdminNote(wo) {
  savingAdminNote.value[wo._id] = true
  try {
    const note = woAdminNoteEdits.value[wo._id] || ''
    const res = await apiAdminUpdateWorkorder({ _id: wo._id, adminNote: note })
    if (res?.success) {
      ElMessage.success('备注已保存')
      wo.adminNote = note
    } else {
      ElMessage.error(res?.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败：' + e.message)
  } finally {
    savingAdminNote.value[wo._id] = false
  }
}

async function onApproveDelete(wo) {
  try {
    await ElMessageBox.confirm(
      `确认批准删除工单 ${wo.workorderId}？此操作不可恢复。`,
      '批准删除',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'error' }
    )
    const res = await apiAdminDeleteWorkorder({ _id: wo._id })
    if (res?.success) {
      ElMessage.success('工单已删除')
      adminWoList.value = adminWoList.value.filter(w => w._id !== wo._id)
    } else {
      ElMessage.error(res?.message || '删除失败')
    }
  } catch { /* cancelled */ }
}

async function adminDownloadFile(fileKey, resumeName) {
  try {
    ElMessage.info('正在生成下载链接…')
    const res = await getFileBase64({ fileKey })
    if (!res?.success) { ElMessage.error('获取文件失败'); return }
    const blob = base64ToBlob(res.base64, res.mimeType || 'application/octet-stream')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (resumeName || '成品简历') + '.docx'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) { ElMessage.error('下载失败：' + e.message) }
}

async function adminDownloadImages(wo) {
  if (!wo.polishedPreviewUrls?.length) return
  try {
    ElMessage.info('正在下载预览图…')
    for (let i = 0; i < wo.polishedPreviewUrls.length; i++) {
      const res = await getUrlBase64({ url: wo.polishedPreviewUrls[i] })
      if (!res?.success) continue
      const blob = base64ToBlob(res.base64, 'image/jpeg')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${wo.resumeName || '预览'}_P${i + 1}.jpg`
      a.click()
      URL.revokeObjectURL(url)
    }
    ElMessage.success('图片下载完成')
  } catch (e) { ElMessage.error('下载失败：' + e.message) }
}

function base64ToBlob(b64, mime) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function onRejectDelete(wo) {
  const res = await apiAdminUpdateWorkorder({ _id: wo._id, deleteRequested: false })
  if (res?.success) {
    ElMessage.success('已驳回删除申请')
    wo.deleteRequested = false
  }
}

async function onAdminForceDelete(wo) {
  try {
    await ElMessageBox.confirm(
      `确认直接删除工单 ${wo.workorderId}？`,
      '删除确认',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' }
    )
    const res = await apiAdminDeleteWorkorder({ _id: wo._id })
    if (res?.success) {
      ElMessage.success('工单已删除')
      adminWoList.value = adminWoList.value.filter(w => w._id !== wo._id)
    } else {
      ElMessage.error(res?.message || '删除失败')
    }
  } catch { /* cancelled */ }
}

function formatWoTime(iso) {
  if (!iso) return '—'
  const d   = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── 角色修改 ─────────────────────────────────────────────────────────────────

async function handleRoleChange(row, newRole) {
  if (newRole === row.role) return
  try {
    const res = await changeUserRole({ userId: row.userId, role: newRole })
    if (res.success) {
      row.role = newRole
      ElMessage.success(res.message)
    } else {
      ElMessage.error(res.message || '修改失败')
    }
  } catch {
    ElMessage.error('网络错误')
  }
}

// ── 解冻 ──────────────────────────────────────────────────────────────────────

async function handleUnfreeze(row) {
  try {
    await ElMessageBox.confirm(
      `确认解冻账号「${row.name}」？解冻后该账号可正常登录。`,
      '解冻确认',
      { confirmButtonText: '确认解冻', cancelButtonText: '取消', type: 'warning' }
    )
    const res = await unfreezeUser({ userId: row.userId })
    if (res.success) {
      row.frozen       = false
      row.frozenAt     = null
      row.frozenReason = null
      ElMessage.success('账号已解冻')
    } else {
      ElMessage.error(res.message || '解冻失败')
    }
  } catch { /* 取消 */ }
}

// ── 启用 / 停用 ──────────────────────────────────────────────────────────────

async function handleToggle(row) {
  try {
    const res = await toggleUser({ userId: row.userId, isActive: !row.isActive })
    if (res.success) {
      row.isActive = !row.isActive
      ElMessage.success(res.message)
    } else {
      ElMessage.error(res.message || '操作失败')
    }
  } catch {
    ElMessage.error('网络错误')
  }
}

// ── 删除 ─────────────────────────────────────────────────────────────────────

async function handleDelete(row) {
  try {
    const res = await deleteUser({ userId: row.userId })
    if (res.success) {
      users.value = users.value.filter(u => u.userId !== row.userId)
      ElMessage.success('账号已删除')
    } else {
      ElMessage.error(res.message || '删除失败')
    }
  } catch {
    ElMessage.error('网络错误')
  }
}

// ── 创建账号 ─────────────────────────────────────────────────────────────────

const submitting          = ref(false)
const createDialogVisible = ref(false)
const createFormRef       = ref()
const createForm          = ref({ name: '', email: '', password: '', role: 'editor' })

const createRules = {
  name:     [{ required: true, message: '请输入员工姓名', trigger: 'blur' }],
  email:    [{ required: true, message: '请输入登录账号', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入初始密码', trigger: 'blur' },
    { min: 6, message: '密码不能少于6位',        trigger: 'blur' }
  ],
  role: [{ required: true }]
}

function openCreateDialog() {
  createForm.value = { name: '', email: '', password: '', role: 'editor' }
  createDialogVisible.value = true
  setTimeout(() => createFormRef.value?.clearValidate(), 50)
}

async function handleCreate() {
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const res = await createUser(createForm.value)
    if (res.success) {
      ElMessage.success('员工账号创建成功')
      createDialogVisible.value = false
      loadUsers()
    } else {
      ElMessage.error(res.message || '创建失败')
    }
  } catch {
    ElMessage.error('网络错误')
  } finally {
    submitting.value = false
  }
}

// ── 重置密码 ─────────────────────────────────────────────────────────────────

const resetDialogVisible = ref(false)
const resetFormRef       = ref()
const resetTarget        = ref(null)
const resetForm          = ref({ newPassword: '', confirmPassword: '' })

const resetRules = {
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码不能少于6位',      trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (_, val, cb) => {
        if (val !== resetForm.value.newPassword) cb(new Error('两次密码不一致'))
        else cb()
      },
      trigger: 'blur'
    }
  ]
}

function openResetDialog(row) {
  resetTarget.value = row
  resetForm.value   = { newPassword: '', confirmPassword: '' }
  resetDialogVisible.value = true
  setTimeout(() => resetFormRef.value?.clearValidate(), 50)
}

async function handleReset() {
  const valid = await resetFormRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const res = await adminResetPassword({
      userId:      resetTarget.value.userId,
      newPassword: resetForm.value.newPassword
    })
    if (res.success) {
      ElMessage.success('密码重置成功，请告知员工新密码')
      resetDialogVisible.value = false
    } else {
      ElMessage.error(res.message || '重置失败')
    }
  } catch {
    ElMessage.error('网络错误')
  } finally {
    submitting.value = false
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  安全日志（管理员）
// ══════════════════════════════════════════════════════════════════════════════

const secLoading    = ref(false)
const secLogs       = ref([])
const secFilterUser = ref('')
const secFilterType = ref('')

const SEC_TYPE_LABELS = {
  printscreen:         'PrintScreen',
  screenshot_mac:      'Mac 截图',
  screenshot_mac_blur: 'Safari 截图推断',
  copy:                '复制内容',
  save_page:           '保存网页',
  print_page:          '打印/存PDF',
  view_source:         '查看源码',
  devtools:            '开发者工具',
  drag:                '拖拽内容',
}

function secTypeLabel(t) {
  return SEC_TYPE_LABELS[t] || t
}

// 兼容 ISO 字符串、JS Date、CloudBase serverDate 对象 {$date:"..."} / {$numberLong:"..."}
function formatSecTime(val) {
  if (!val) return '—'
  let ts
  if (typeof val === 'string') {
    ts = Date.parse(val)
  } else if (val instanceof Date) {
    ts = val.getTime()
  } else if (typeof val === 'object') {
    // CloudBase serverDate 格式
    const raw = val.$date ?? val.$numberLong ?? val.value ?? null
    ts = raw ? Number(raw) : NaN
  } else {
    ts = Number(val)
  }
  if (!ts || isNaN(ts)) return '—'
  const d   = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const filteredSecLogs = computed(() => {
  let list = secLogs.value
  if (secFilterUser.value) list = list.filter(l => l.userId === secFilterUser.value)
  if (secFilterType.value) list = list.filter(l => l.eventType === secFilterType.value)
  return list
})

async function loadSecurityLogs() {
  secLoading.value = true
  try {
    const res = await apiAdminListSecurityLogs({ pageSize: 200 })
    if (res?.success) secLogs.value = res.list || []
    else ElMessage.error(res?.message || '加载安全日志失败')
  } catch (e) {
    ElMessage.error('加载安全日志失败：' + e.message)
  } finally {
    secLoading.value = false
  }
}

// ── 高危提示 ─────────────────────────────────────────────────────────────────

const showHighRisk      = ref(false)
const highRiskLoading   = ref(false)
const highRiskList      = ref([])

async function loadHighRiskUsers() {
  highRiskLoading.value = true
  try {
    const res = await apiAdminGetHighRiskUsers()
    if (res?.success) highRiskList.value = res.list || []
    else ElMessage.error(res?.message || '加载高危用户失败')
  } catch (e) {
    ElMessage.error('加载高危用户失败：' + e.message)
  } finally {
    highRiskLoading.value = false
  }
}

function toggleHighRisk() {
  showHighRisk.value = !showHighRisk.value
  if (showHighRisk.value) loadHighRiskUsers()
}
</script>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: #f0f4fc;
}

/* ─── 顶栏 ─── */
.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px 16px;
  background: #fff;
  border-bottom: 1px solid #e8ecf4;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.admin-title {
  font-size: 17px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
}

.stats-row {
  display: flex;
  gap: 8px;
}

.stat-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  background: #eef2ff;
  color: #555;
}
.stat-chip--active   { background: #e8f5e9; color: #2e7d32; }
.stat-chip--disabled { background: #fce4e4; color: #c62828; }
.stat-chip--frozen      { background: #1a1a2e; color: #ff6b6b; font-weight: 700; }
.stat-chip--superadmin  { background: #fff3e0; color: #e65100; font-weight: 700; }
.stat-chip--admin       { background: #e3f0ff; color: #1565C0; }

.role-locked-tip {
  font-size: 12px;
  color: #aaa;
  font-style: italic;
}

.stat-num {
  font-weight: 700;
  font-size: 14px;
  margin-right: 1px;
}

/* ─── 表格区 ─── */
.table-wrap {
  flex: 1;
  overflow: auto;
  padding: 20px 24px;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: #1a1a1a;
}

.user-email {
  font-size: 12px;
  color: #999;
}

.date-text {
  font-size: 12px;
  color: #666;
}

.action-btns {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  max-width: 100%;
}

/* 文字按钮略收紧；Popconfirm 与按钮均参与同一行 flex */
.action-btns > * {
  flex-shrink: 0;
}

.action-btns :deep(.el-button.is-text) {
  padding: 4px 6px;
  margin: 0;
}

.action-btns :deep(.el-popconfirm) {
  display: inline-flex;
  align-items: center;
}

/* ─── 弹窗 ─── */
.role-hint {
  font-size: 12px;
  color: #aaa;
  margin-top: 4px;
  line-height: 1.4;
}

:deep(.el-table) {
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 6px rgba(0,0,0,0.06);
}
:deep(.el-table td) {
  vertical-align: middle;
}

/* 操作列：少占左右内边距，把宽度留给按钮横排 */
:deep(.el-table .admin-user-actions-col) {
  padding-right: 10px !important;
  padding-left: 8px !important;
}

/* 强制「操作」列表头与内容统一右对齐（覆盖 Element 默认 cell 对齐） */
:deep(.el-table th.admin-user-actions-col .cell) {
  width: 100%;
  text-align: left !important;
  padding-left: 200px;
}

:deep(.el-table td.admin-user-actions-col .cell) {
  width: 100%;
  text-align: right !important;
}

/* ─── Admin Tab 切换栏 ─── */
.admin-tabs-bar {
  display: flex;
  gap: 0;
  background: #fff;
  border-bottom: 1px solid #e8ecf4;
  padding: 0 24px;
  flex-shrink: 0;
}

.admin-tab {
  padding: 13px 20px;
  border: none;
  border-bottom: 3px solid transparent;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  color: #888;
  cursor: pointer;
  transition: all 0.15s;
}

.admin-tab:hover { color: #1565C0; }
.admin-tab--active { color: #1565C0; border-bottom-color: #1565C0; font-weight: 700; }

/* ─── 工单管理区域 ─── */
.wo-admin-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px 24px;
  gap: 12px;
}

.wo-admin-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.wo-admin-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.wo-date-picker {
  width: 230px !important;
}

.wo-filter-select {
  padding: 6px 10px;
  border: 1.5px solid #d4daea;
  border-radius: 8px;
  font-size: 13px;
  color: #333;
  background: #fff;
  cursor: pointer;
  outline: none;
}

.wo-filter-select:focus { border-color: #1565C0; }

.wo-filter-total { font-size: 13px; color: #888; }

.wo-delete-pending-tip {
  font-size: 12px;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  padding: 3px 10px;
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

/* ─── 工单表格 ─── */
.wo-admin-list {
  flex: 1;
  overflow-y: auto;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #e8ecf4;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05);
}

/* 9 列：编号 / 员工 / 求职者 / 业务 / 模式 / 目标岗位 / 状态 / 上传时间 / 操作 */
.woa-row {
  display: grid;
  grid-template-columns:
    minmax(142px, 0.95fr)
    minmax(56px, 72px)
    minmax(64px, 84px)
    86px
    minmax(78px, 92px)
    minmax(64px, 1.1fr)
    minmax(88px, 100px)
    minmax(124px, 138px)
    minmax(188px, 1fr);
  align-items: center;
  border-bottom: 1px solid #f0f3fa;
  column-gap: 4px;
}

.woa-row--header {
  background: #f7f9fc;
  position: sticky;
  top: 0;
  z-index: 1;
}

.woa-row--data {
  transition: background 0.12s;
}

.woa-row--data:hover    { background: #f5f8ff; }
.woa-row--expanded      { background: #f0f5ff; }
.woa-row--delete-req    { background: #fffbeb; }

.woa-col {
  padding: 9px 8px;
  font-size: 12px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* 表头与数据列对齐一致 */
.woa-col--id,
.woa-col--user,
.woa-col--name { text-align: center; }

/* 工单编号列与其它关键列统一居中 */
.woa-col--id { text-align: center; }

.woa-col--biz  { text-align: center; }

/* 工单管理表头「业务类型」完整显示，避免被全局 ellipsis 截断 */
.woa-row--header .woa-col--biz {
  overflow: visible;
  text-overflow: clip;
}

.woa-col--mode {
  text-align: center;
  overflow: visible;
  text-overflow: clip;
  padding-left: 18px;
}

/* 统一业务类型标签（与 CommissionPage / WorkorderPage 相同 class） */
.biz-tag {
  display: inline-block;
  font-size: 11px; font-weight: 700;
  padding: 1px 10px; border-radius: 9999px;
  line-height: 1.15;
  white-space: nowrap;
}
.biz-tag--optimize    { background: #e3f2fd; color: #1565C0; border: 1px solid #90caf9; }
.biz-tag--recognition { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }

.woa-col--position {
  text-align: left;
  padding-left: 26px;
}

.woa-col--status {
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.woa-col--time { text-align: center; }

/* 时间列与表头对齐，避免横向挤出 */
.woa-row--data .woa-col--time {
  padding-right: 0;
  transform: none;
}

.woa-row--header .woa-col {
  font-size: 11px;
  font-weight: 600;
  color: #777;
  letter-spacing: 0.4px;
}

.woa-id { font-family: monospace; font-size: 11.5px; color: #1565C0; font-weight: 600; }

.del-badge {
  display: inline-block;
  margin-left: 5px;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 10px;
  background: #fef3cd;
  color: #b45309;
  border: 1px solid #fde68a;
}

.mode-chip {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
  background: #eff6ff;
  color: #1d4ed8;
}

/* ─── 状态下拉（管理员可直接改） ─── */
.status-select {
  border: 1.5px solid transparent;
  border-radius: 8px;
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  background: transparent;
}

.status-select--uploaded { background: #dbeafe; color: #1e40af; border-color: #93c5fd; }
.status-select--polished { background: #fef9c3; color: #92400e; border-color: #fcd34d; }
.status-select--exported { background: #dcfce7; color: #15803d; border-color: #86efac; }

/* ─── 操作列 ─── */
.woa-col--action {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
  overflow: visible;
  flex-wrap: nowrap;
  transform: none;
  padding-right: 8px;
}

/* ─── 操作按钮 ─── */
.act-btn {
  padding: 3px 6px;
  border-radius: 9999px;
  border: 1px solid;
  font-size: 11px;
  cursor: pointer;
  transition: opacity 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.act-btn--detail  { background: #eff6ff; color: #2563eb; border-color: #93c5fd; }
.act-btn--detail:hover  { opacity: 0.8; }
.act-btn--confirm { background: #dcfce7; color: #15803d; border-color: #86efac; }
.act-btn--confirm:hover { opacity: 0.8; }
.act-btn--reject  { background: #f3f4f6; color: #374151; border-color: #d1d5db; }
.act-btn--reject:hover  { opacity: 0.8; }
.act-btn--del     { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
.act-btn--del:hover     { opacity: 0.8; }

/* ─── 展开详情 ─── */
.woa-expand-enter-active, .woa-expand-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.woa-expand-enter-from, .woa-expand-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.woa-detail {
  grid-column: 1 / -1;
  padding: 14px 20px 18px;
  background: #fafbff;
  border-bottom: 1px solid #e8ecf4;
  border-top: 1px solid #dde8ff;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 基础信息网格 */
.woa-detail-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px 16px;
}

.woa-detail-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.woa-detail-item--full { grid-column: 1 / -1; }

.woa-detail-label {
  font-size: 11px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.woa-detail-value {
  font-size: 13px;
  color: #333;
}

.woa-detail-value--mono { font-family: monospace; font-size: 12px; color: #555; word-break: break-all; }
.woa-detail-value--muted { color: #bbb; font-size: 12px; }

.woa-detail-dl-row { display: flex; gap: 12px; align-items: center; }

.woa-dl-link {
  font-size: 12px;
  color: #1565C0;
  cursor: pointer;
  text-decoration: none;
  border-bottom: 1px solid transparent;
}
.woa-dl-link:hover { border-bottom-color: #1565C0; }

/* 备注区 */
.woa-detail-notes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  padding-top: 10px;
  border-top: 1px dashed #e0e8f8;
}

.woa-note-block { display: flex; flex-direction: column; gap: 7px; }

.woa-note-label {
  font-size: 11px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.woa-note-readonly {
  font-size: 13px;
  color: #666;
  font-style: italic;
  padding: 8px 10px;
  background: #f3f4f6;
  border-radius: 6px;
  min-height: 62px;
}

.woa-note-edit {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.woa-note-textarea {
  flex: 1;
  padding: 7px 10px;
  border: 1.5px solid #d4daea;
  border-radius: 7px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  min-height: 62px;
  outline: none;
  transition: border-color 0.15s;
}

.woa-note-textarea:focus { border-color: #1565C0; }

.woa-note-save {
  padding: 7px 14px;
  background: #1565C0;
  color: #fff;
  border: none;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  height: fit-content;
}

.woa-note-save:hover:not(:disabled) { background: #1251A3; }
.woa-note-save:disabled { opacity: 0.6; cursor: not-allowed; }

/* ─── 通用工单加载/空态 ─── */
.wo-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 180px;
  color: #999;
  font-size: 14px;
}

.wo-spin {
  display: block;
  width: 16px;
  height: 16px;
  border: 2px solid #e0e8ff;
  border-top-color: #1565C0;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.wo-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  gap: 10px;
  color: #aaa;
}

.wo-empty__icon  { font-size: 40px; }
.wo-empty__title { font-size: 15px; font-weight: 600; color: #666; margin: 0; }

/* ─── 安全日志 Tab ─── */
.sec-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  padding: 20px 24px 16px;
  overflow: hidden;
}

.sec-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.sec-filters {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sec-table-wrap {
  flex: 1;
  overflow-y: auto;
  border: 1px solid #e8ecf4;
  border-radius: 10px;
  background: #fff;
}

.sec-row {
  display: grid;
  grid-template-columns: 160px 90px 120px 1fr 120px;
  align-items: center;
  border-bottom: 1px solid #f0f3fa;
}

.sec-row--header {
  background: #f7f9fc;
  position: sticky;
  top: 0;
  z-index: 1;
}

.sec-row--data:nth-child(even) { background: #fafbff; }
.sec-row--data:hover { background: #f5f8ff; }

.sec-col {
  padding: 11px 16px;
  font-size: 13px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sec-row--header .sec-col {
  font-size: 12px;
  font-weight: 600;
  color: #666;
}

/* 安全日志：事件类型/详情两列各自居中（表头与内容一致） */
.sec-col--type,
.sec-col--detail {
  text-align: center;
}

.sec-col--page {
  text-align: center;
}

/* 事件类型徽章 */
.sec-type-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
}

.sec-type-badge--printscreen         { background: #fee2e2; color: #b91c1c; }
.sec-type-badge--screenshot_mac      { background: #fef3c7; color: #92400e; }
.sec-type-badge--screenshot_mac_blur { background: #fff3e0; color: #e65100; }
.sec-type-badge--copy                { background: #ede9fe; color: #5b21b6; }
.sec-type-badge--contextmenu         { background: #f3f4f6; color: #374151; }
.sec-type-badge--save_page           { background: #fef9c3; color: #854d0e; }
.sec-type-badge--print_page          { background: #fce7f3; color: #9d174d; }
.sec-type-badge--view_source         { background: #dbeafe; color: #1e40af; }
.sec-type-badge--devtools            { background: #1e1e2e; color: #f97316; }
.sec-type-badge--drag                { background: #f0fdf4; color: #166534; }

/* ─── 工具栏右侧操作区 ─── */
.sec-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ─── 高危提示按钮 ─── */
.high-risk-btn {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid #f59e0b;
  background: #fffbeb;
  color: #92400e;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.high-risk-btn:hover        { background: #fef3c7; }
.high-risk-btn--active      { background: #fef3c7; border-color: #d97706; color: #78350f; }

/* ─── 高危提示面板 ─── */
.high-risk-panel {
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 10px;
  padding: 14px 18px;
  margin-bottom: 10px;
  flex-shrink: 0;
}
.high-risk-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.high-risk-panel__title {
  font-size: 13px;
  font-weight: 700;
  color: #92400e;
}
.high-risk-panel__refresh {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid #d97706;
  background: #fff;
  color: #92400e;
  font-size: 12px;
  cursor: pointer;
}
.high-risk-panel__refresh:hover:not(:disabled) .list-refresh-icon { filter: grayscale(100%) brightness(0.5); }
.high-risk-panel__refresh:disabled { opacity: 0.5; cursor: not-allowed; }

.list-refresh-icon--sm {
  width: 12px;
  height: 12px;
}
.high-risk-panel__empty {
  font-size: 13px;
  color: #9ca3af;
  text-align: center;
  padding: 6px 0;
}
.high-risk-panel__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.high-risk-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 12px;
  border-radius: 7px;
  background: #fff;
  border: 1px solid #fde68a;
  font-size: 13px;
}
.high-risk-item--danger {
  background: #fff1f2;
  border-color: #fca5a5;
}
.high-risk-item__name  { font-weight: 600; color: #374151; min-width: 70px; }
.high-risk-item__count { color: #b91c1c; font-weight: 600; flex: 1; }
.high-risk-item__time  { color: #6b7280; font-size: 12px; }
.high-risk-item__badge {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 7px;
  border-radius: 10px;
  background: #fee2e2;
  color: #b91c1c;
  font-size: 11px;
  font-weight: 700;
}
</style>
