<template>
  <div class="app-shell">

    <!-- ─── Left Sidebar ─── -->
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="brand-text">
          <button
            type="button"
            class="brand-name-btn brand-logo-btn"
            aria-label="打开首页"
            @click="handleBrandHomeClick"
          >
            <img class="brand-logo-img" :src="brandLogoUrl" alt="天鹿品牌" />
          </button>
          <span class="brand-version">Ver. 1.1.5.2026.4</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <button
          v-for="item in navItems"
          :key="item.id"
          class="nav-item"
          :class="{
            'nav-item--active': activeNav === item.id,
            'nav-item--admin': item.adminOnly
          }"
          @click="handleNavClick(item)"
        >
          <span class="nav-item-text">
            <span class="nav-label">{{ item.label }}</span>
            <span class="nav-key">/{{ item.shortcut }}</span>
          </span>
          <span
            v-if="item.id === 'commission' && commissionStore.pendingCount > 0"
            class="nav-badge"
          >{{ commissionStore.pendingCount }}</span>
        </button>
      </nav>
    </aside>

    <!-- ─── Main Area ─── -->
    <div class="main-wrapper">

      <!-- Topbar -->
      <header class="topbar">
        <div class="topbar-left">
          <span class="topbar-title">{{ currentNav.label }}</span>
          <span v-if="activeNav === 'home'" class="topbar-byline">@月谱科技·天鹿文化工作室</span>
          <template v-if="activeNav === 'feature'">
            <span class="topbar-sep">/</span>
            <!-- 子模式切换：简历优化 / 识别创建 -->
            <div class="feature-mode-tabs">
              <button
                v-for="m in featureModes"
                :key="m.id"
                :class="['fmode-tab', { 'fmode-tab--active': featureMode === m.id }]"
                @click="switchFeatureMode(m.id)"
              >{{ m.label }}</button>
            </div>
          </template>
          <template v-else-if="activeNav === 'tools'">
            <span class="topbar-sep">/</span>
            <span
              :class="['topbar-sub', { 'topbar-sub--link': activeTool !== null }]"
              @click="activeTool !== null && backToToolsHub()"
            >工具箱</span>
            <template v-if="activeTool !== null">
              <span class="topbar-sep">/</span>
              <span class="topbar-sub">{{ toolLabels[activeTool] || activeTool }}</span>
            </template>
          </template>
          <template v-else-if="activeNav === 'home'">
            <!-- 首页壁纸：仅顶栏标题 -->
          </template>
          <template v-else>
            <span class="topbar-sep">/</span>
            <span class="topbar-sub">{{ currentNav.label }}</span>
          </template>
        </div>
        <div class="topbar-right">
          <!-- 任务工单来源标签：制作期间显示 -->
          <span
            v-if="activeNav === 'feature' && commissionStore.activeOrderId"
            class="commission-order-tag"
          >
            任务工单 {{ commissionStore.activeOrderData?.orderId || '' }}
          </span>
          <span class="topbar-user">{{ authStore.userName }}</span>
          <el-button size="small" text class="logout-btn" @click="handleLogout">退出登录</el-button>
        </div>
      </header>

      <!-- Content -->
      <main class="main-content">

        <!-- 功能 tab -->
        <template v-if="activeNav === 'feature'">
          <!-- 简历优化模式：完整流程 -->
          <template v-if="featureMode === 'optimize'">
            <UploadStage  v-if="store.stage === 'upload'" />
            <ResultStage  v-else-if="store.stage === 'result'" />
            <DoneStage    v-else-if="store.stage === 'done'" @save-and-exit="handleSaveAndExit" />
          </template>
          <!-- 简历定制模式（识别创建） -->
          <template v-else>
            <!-- 独立模式阶段 -->
            <RecognitionInputStage
              v-if="rStore.phase === 'template' || rStore.phase === 'recognizing'"
            />
            <RecognitionConfirmStage
              v-else-if="rStore.phase === 'confirm'"
            />
            <RecognitionSupplementStage
              v-else-if="rStore.phase === 'supplement'"
            />
            <RecognitionPreviewStage
              v-else-if="rStore.phase === 'preview'"
            />
            <!-- 委托工单模式阶段 -->
            <RecognitionReadyStage
              v-else-if="rStore.phase === 'ready'"
            />
            <!-- 润色进行中（两种模式共用） -->
            <RecognitionConfirmStage
              v-else-if="rStore.phase === 'polishing'"
            />
            <!-- 完成阶段：工单模式用 DoneStage，独立模式用 PreviewStage（已在上方） -->
            <RecognitionDoneStage
              v-else-if="rStore.phase === 'done'"
              @save-and-exit="handleRecognitionSaveAndExit"
            />
          </template>
        </template>

        <!-- 工具 tab -->
        <template v-else-if="activeNav === 'tools'">
          <!-- 九宫格入口 -->
          <ToolsHub
            v-if="activeTool === null"
            @select="onSelectTool"
          />
          <!-- 具体工具 -->
          <IDPhotoMaker v-else-if="activeTool === 'idphoto'" />
        </template>

        <!-- 工单 tab -->
        <WorkorderPage v-else-if="activeNav === 'workorder'" />

        <!-- 任务工单 tab -->
        <CommissionPage
          v-else-if="activeNav === 'commission'"
          :refresh-tick="commissionRefreshTick"
          @enter-manufacturing="handleEnterManufacturing"
        />

        <!-- 管理 tab （仅管理员） -->
        <AdminPage v-else-if="activeNav === 'admin'" />

        <!-- 首页 -->
        <div v-else-if="activeNav === 'home'" class="home-wallpaper-wrap">
          <!-- 壁纸 -->
          <div
            class="home-wallpaper"
            :style="{ backgroundImage: `url(${homeWallpaperUrl})` }"
            aria-hidden="true"
          />

          <!-- 仪表盘卡片行 -->
          <div class="dashboard-row" :class="{ 'dashboard-row--loading': dashboardLoading }">
            <!-- 待接任务（最左最显眼）-->
            <div class="dash-card dash-card--accent" @click="activeNav = 'commission'">
              <span class="dash-icon"></span>
              <div class="dash-body">
                <span class="dash-value">{{ commissionStore.pendingCount }}</span>
                <span class="dash-label">待接任务</span>
              </div>
            </div>
            <!-- 今日制作 -->
            <div class="dash-card">
              <span class="dash-icon"></span>
              <div class="dash-body">
                <span class="dash-value">{{ dashboard.todayMade }}</span>
                <span class="dash-label">今日制作</span>
              </div>
            </div>
            <!-- 今日导出 -->
            <div class="dash-card">
              <span class="dash-icon"></span>
              <div class="dash-body">
                <span class="dash-value">{{ dashboard.todayExported }}</span>
                <span class="dash-label">今日导出</span>
              </div>
            </div>
            <!-- 进行中任务 -->
            <div class="dash-card">
              <span class="dash-icon"></span>
              <div class="dash-body">
                <span class="dash-value">{{ dashboard.inProgress }}</span>
                <span class="dash-label">进展任务</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 其他导航：待开发占位 -->
        <div v-else class="placeholder-area">
          <div class="placeholder-icon"></div>
          <p class="placeholder-title">{{ currentNav.label }}功能开发中</p>
          <p class="placeholder-desc">敬请期待，后续版本将陆续上线</p>
        </div>

      </main>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useResumeEnhanceStore } from '@/stores/resumeEnhance'
import { useRecognitionStore } from '@/stores/recognition'

import UploadStage from '@/components/resume-enhance/UploadStage.vue'
import ResultStage from '@/components/resume-enhance/ResultStage.vue'
import DoneStage   from '@/components/resume-enhance/DoneStage.vue'

import RecognitionInputStage      from '@/components/recognition/RecognitionInputStage.vue'
import RecognitionConfirmStage    from '@/components/recognition/RecognitionConfirmStage.vue'
import RecognitionSupplementStage from '@/components/recognition/RecognitionSupplementStage.vue'
import RecognitionPreviewStage    from '@/components/recognition/RecognitionPreviewStage.vue'
import RecognitionReadyStage      from '@/components/recognition/RecognitionReadyStage.vue'
import RecognitionDoneStage       from '@/components/recognition/RecognitionDoneStage.vue'

import ToolsHub     from '@/components/tools/ToolsHub.vue'
import IDPhotoMaker from '@/components/tools/IDPhotoMaker.vue'
import { useIDPhotoStore } from '@/stores/idPhoto'
import AdminPage      from '@/components/admin/AdminPage.vue'
import WorkorderPage  from '@/components/workorder/WorkorderPage.vue'
import CommissionPage from '@/components/commission/CommissionPage.vue'
import { useWorkorderStore }  from '@/stores/workorder'
import { useCommissionStore } from '@/stores/commission'
import { apiListCommissionOrders } from '@/api/commission'
import { apiGetDashboard } from '@/api/tools'
import { useAntiCapture } from '@/composables/useAntiCapture'
import brandLogoUrl from '@images/logo-white.png'

/** 首页壁纸：PNG 放在项目根目录 images/home-wallpaper.png */
import homeWallpaperUrl from '@images/home-wallpaper.png'

const router          = useRouter()
const authStore       = useAuthStore()
const store           = useResumeEnhanceStore()
const commissionStore = useCommissionStore()

// 全局屏幕保护（黑屏/右键禁用/选中禁用/日志上报）
useAntiCapture()
const rStore         = useRecognitionStore()
const idPhotoStore   = useIDPhotoStore()
const workorderStore = useWorkorderStore()

const activeNav   = ref('home')
const featureMode = ref('optimize')

// 仪表盘数据（首页展示）
const dashboard = ref({ todayMade: 0, todayExported: 0, inProgress: 0 })
const dashboardLoading = ref(false)
async function _fetchDashboard() {
  dashboardLoading.value = true
  try {
    const res = await apiGetDashboard()
    dashboard.value = {
      todayMade:     res.todayMade     ?? 0,
      todayExported: res.todayExported ?? 0,
      inProgress:    res.inProgress    ?? 0,
    }
  } catch (err) {
    console.warn('[Dashboard] 仪表盘数据加载失败:', err?.message || err)
  } finally {
    dashboardLoading.value = false
  }
}

// CommissionPage 轮询刷新计数
const commissionRefreshTick = ref(0)
// 工具区当前打开的工具（null = 九宫格入口）
const activeTool = ref(null)

const featureModes = [
  { id: 'optimize', label: '简历优化' },
  { id: 'create',   label: '简历定制' },
]

async function switchFeatureMode(id) {
  if (id === featureMode.value) return

  // ── 从「简历优化」切出 ──
  if (featureMode.value === 'optimize' && store.stage !== 'upload') {
    const result = await _guardLeaveOptimize()
    if (result === 'cancel') return
  }

  // ── 从「简历定制」委托模式切出 ──
  if (featureMode.value === 'create' && rStore.commissionOrderId) {
    if (rStore.phase === 'polishing' || rStore.isGenerating) {
      try {
        await ElMessageBox.confirm(
          'AI 正在制作简历，切换模式将中断当前任务，确认终止？',
          '提示',
          { confirmButtonText: '终止并切换', cancelButtonText: '继续等待', type: 'warning' }
        )
        rStore.reset()
        commissionStore.clearActiveOrder()
      } catch {
        return
      }
    } else if (rStore.phase === 'done') {
      try {
        await ElMessageBox.confirm(
          '当前简历定制尚未保存进度，切换模式将丢失当前状态，是否直接切换？',
          '提示',
          { confirmButtonText: '直接切换', cancelButtonText: '取消', type: 'warning' }
        )
        rStore.reset()
        commissionStore.clearActiveOrder()
      } catch {
        return
      }
    }
  }

  // ── 切入「简历优化」时检测草稿 ──
  if (id === 'optimize') {
    rStore.reset()
    await _checkAndRestoreDraft()
    featureMode.value = id
    return
  }

  rStore.reset()
  featureMode.value = id
}

const allNavItems = [
  { id: 'commission', label: '任务工单', shortcut: 'Task' },
  { id: 'feature',    label: '功能专区', shortcut: 'Feat' },
  { id: 'tools',      label: '扩展专区', shortcut: 'Ext' },
  { id: 'workorder',  label: '我的工单', shortcut: 'Tkt' },
  { id: 'settings',   label: '工具设置', shortcut: 'Set' },
  { id: 'admin',      label: '管理',     shortcut: 'Admin', adminOnly: true },
]

// 管理员可见全部，普通员工不显示管理入口
const navItems = computed(() =>
  allNavItems.filter(n => !n.adminOnly || authStore.isAdmin)
)

// 若当前激活的是 admin 但用户已不是管理员，重置到 feature
watch(() => authStore.isAdmin, (isAdmin) => {
  if (!isAdmin && activeNav.value === 'admin') activeNav.value = 'home'
})

// 切换到首页时立即刷新仪表盘
watch(activeNav, (nav) => {
  if (nav === 'home') _fetchDashboard()
})

const stageLabelMap = {
  upload:    '简历优化',
  analyzing: '分析中',
  result:    '分析结果',
  polishing: '润色中',
  done:      '润色完成',
}

/** 品牌名入口的「首页」视图（不在侧栏 navItems 中） */
const HOME_NAV_META = { id: 'home', label: '首页', shortcut: '' }

const currentNav = computed(() => {
  if (activeNav.value === 'home') return HOME_NAV_META
  return navItems.value.find(n => n.id === activeNav.value) || navItems.value[0]
})

// 工具ID → 显示名称（用于顶部面包屑）
const toolLabels = {
  idphoto: '证件照制作',
}

function onSelectTool(toolId) {
  idPhotoStore.reset()
  activeTool.value = toolId
}

function backToToolsHub() {
  idPhotoStore.reset()
  activeTool.value = null
}

// ── 定期校验账号状态（每 60 秒）─────────────────────────────────────────────
// 用于及时感知管理员手动冻结/停用，令当前会话失效并跳转登录页
let _sessionTimer     = null
let _pendingPollTimer = null

/** 静默拉取待接取工单数量，更新侧栏红点；同时触发 CommissionPage 刷新 */
async function _pollPendingCount() {
  if (!authStore.isLoggedIn) return
  try {
    const res       = await apiListCommissionOrders({ status: 'pending', pageSize: 1 })
    const newCount  = res.total || 0
    const prevCount = commissionStore.pendingCount
    commissionStore.setPendingCount(newCount)
    // 有新工单且当前不在任务工单页时，弹出提示
    if (newCount > prevCount && activeNav.value !== 'commission') {
      ElMessage({ type: 'info', message: `有 ${newCount} 个待接取工单`, duration: 3000 })
    }
  } catch { /* 静默失败，不影响主流程 */ }

  // 无论如何递增 tick，驱动 CommissionPage 静默刷新（它自己会防抖判断）
  commissionRefreshTick.value++

  // 首页仪表盘随轮询一起刷新
  if (activeNav.value === 'home') _fetchDashboard()
}
onMounted(async () => {
  rStore.reset()
  idPhotoStore.reset()
  // 应用启动时若处于功能 tab 且存在草稿，立即提示恢复
  if (activeNav.value === 'feature' && featureMode.value === 'optimize') {
    await _checkAndRestoreDraft()
  } else {
    store.reset()
    // 启动时不在功能专区，无论如何清除代做工单关联（防止 localStorage 残留导致工单标签空挂）
    commissionStore.clearActiveOrder()
  }

  _sessionTimer = setInterval(async () => {
    const valid = await authStore.checkToken()
    if (!valid) {
      ElMessage.error('账号状态异常，请重新登录')
      router.replace('/login')
    }
  }, 60000)

  // 立即拉取一次待接取工单数，随后每 30 秒轮询
  _pollPendingCount()
  _pendingPollTimer = setInterval(_pollPendingCount, 30000)

  // 首页直接拉取仪表盘
  _fetchDashboard()
})

onUnmounted(() => {
  if (_sessionTimer)     clearInterval(_sessionTimer)
  if (_pendingPollTimer) clearInterval(_pendingPollTimer)
})

// ══════════════════════════════════════════════════════════════════════════════
//  简历优化流程离开守卫
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 检查是否处于简历优化流程中（有需要保护的进度）
 */
const _isInOptimizeFlow = () =>
  activeNav.value === 'feature' &&
  featureMode.value === 'optimize' &&
  store.stage !== 'upload'

/**
 * AI 正在处理中（无法暂存，只能终止或等待）
 */
const _isProcessingNow = () =>
  store.stage === 'analyzing' || store.stage === 'polishing' ||
  rStore.phase === 'recognizing' || rStore.phase === 'polishing' || rStore.isGenerating

/**
 * 离开守卫：返回 'proceed'（可离开）或 'cancel'（留下）
 * 对于简历优化流程：
 *  - 若 AI 处理中 → 只提示终止/等待
 *  - 若稳定状态   → 提示 暂存/终止/取消
 */
async function _guardLeaveOptimize() {
  if (!_isInOptimizeFlow()) return 'proceed'

  if (_isProcessingNow()) {
    try {
      await ElMessageBox.confirm(
        'AI 正在处理中，离开将中断当前任务，确认终止并离开？',
        '提示',
        { confirmButtonText: '终止并离开', cancelButtonText: '继续等待', type: 'warning' }
      )
      store.reset()
      rStore.reset()
      commissionStore.clearActiveOrder()
      return 'proceed'
    } catch {
      return 'cancel'
    }
  }

  // 稳定状态：暂存 / 终止 / 取消
  // distinguishCancelAndClose：confirm=暂存, cancel=终止, close(X)=取消
  const name = store.resumeName || store.uploadedFileName || '未命名'
  try {
    await ElMessageBox.confirm(
      `当前有进行中的简历优化项目（${name}），离开前如何处理？`,
      '离开简历优化',
      {
        confirmButtonText:    '暂存并离开',
        cancelButtonText:     '终止并离开',
        distinguishCancelAndClose: true,
        type:                 'warning',
        closeOnClickModal:    false,
      }
    )
    // 点击"暂存并离开"
    store.saveDraft()
    rStore.reset()
    return 'proceed'
  } catch (action) {
    if (action === 'cancel') {
      // 点击"终止并离开"：同时清除代做工单关联，防止后续新项目误回传
      store.clearDraft()
      store.reset()
      rStore.reset()
      commissionStore.clearActiveOrder()
      return 'proceed'
    }
    // action === 'close' 或其他（点击 X / 遮罩）→ 取消
    return 'cancel'
  }
}

/**
 * 进入「简历优化」模式时检测草稿，提示恢复或重新开始
 */
async function _checkAndRestoreDraft() {
  if (!store.draftInfo) {
    store.reset()
    workorderStore.resetCurrent()
    commissionStore.clearActiveOrder()
    return
  }
  const info = store.draftInfo
  const savedDate = new Date(info.savedAt)
  const timeStr = `${savedDate.getMonth() + 1}/${savedDate.getDate()} ${String(savedDate.getHours()).padStart(2,'0')}:${String(savedDate.getMinutes()).padStart(2,'0')}`
  const stageLbl = { result: '分析结果页', done: '润色完成页' }[info.stage] || '处理中'
  try {
    await ElMessageBox.confirm(
      `找到暂存的简历优化项目：${info.resumeName || '未命名'}（${timeStr} · ${stageLbl}）\n是否恢复上次进度？`,
      '发现暂存项目',
      { confirmButtonText: '恢复项目', cancelButtonText: '重新开始', type: 'info' }
    )
    store.restoreDraft()
  } catch {
    store.clearDraft()
    store.reset()
    workorderStore.resetCurrent()
    commissionStore.clearActiveOrder()
  }
}

// ══════════════════════════════════════════════════════════════════════════════

/** 品牌名进入首页 */
async function handleBrandHomeClick() {
  if (activeNav.value === 'home') return

  if (_isInOptimizeFlow()) {
    const result = await _guardLeaveOptimize()
    if (result === 'cancel') return
  }

  if (activeNav.value === 'tools') {
    idPhotoStore.reset()
    activeTool.value = null
  }

  activeNav.value = 'home'
}

/** 代做工单「进入制作」回调 */
/** 保存进度后退出：切换到任务工单页 */
function handleSaveAndExit() {
  activeNav.value = 'commission'
}

function handleEnterManufacturing({ featureMode: mode }) {
  featureMode.value = mode || 'optimize'
  activeNav.value   = 'feature'
}

function handleRecognitionSaveAndExit() {
  rStore.reset()
  commissionStore.clearActiveOrder()
  activeNav.value = 'commission'
}

async function handleNavClick(item) {
  if (item.id === activeNav.value) return

  // 从简历优化流程离开
  if (_isInOptimizeFlow()) {
    const result = await _guardLeaveOptimize()
    if (result === 'cancel') return
  }

  // 从简历定制（识别）委托工单流程离开
  if (
    activeNav.value === 'feature' &&
    featureMode.value === 'create' &&
    rStore.commissionOrderId
  ) {
    // AI 处理中：拦截并确认终止
    if (rStore.phase === 'polishing' || rStore.isGenerating) {
      try {
        await ElMessageBox.confirm(
          'AI 正在制作简历，离开将中断当前任务，确认终止并离开？',
          '提示',
          { confirmButtonText: '终止并离开', cancelButtonText: '继续等待', type: 'warning' }
        )
        rStore.reset()
        commissionStore.clearActiveOrder()
      } catch {
        return
      }
    }
    // done 阶段：提示保存进度
    else if (rStore.phase === 'done') {
      try {
        await ElMessageBox.confirm(
          '当前简历定制尚未保存进度，离开后可在任务工单「制作中」列表继续制作。是否保存进度后离开？',
          '保存进度',
          {
            confirmButtonText: '保存进度',
            cancelButtonText:  '直接离开',
            distinguishCancelAndClose: true,
            type: 'info',
          }
        )
        // 确认保存：触发子组件 saveProgress（通过事件），此处直接记录已保存标记
        // 实际保存操作依赖子组件；这里仅重置状态并跳转
        ElMessage.info('请在功能专区点击「保存进度」后再离开，或直接离开')
        return
      } catch (action) {
        if (action === 'cancel') {
          // 直接离开，不保存
          rStore.reset()
          commissionStore.clearActiveOrder()
        } else {
          return
        }
      }
    }
  }

  // 进入功能 tab（简历优化模式）时检测草稿
  if (item.id === 'feature') {
    rStore.reset()
    await _checkAndRestoreDraft()
    // 无论恢复还是重建，确保 featureMode = optimize
    featureMode.value = 'optimize'
    activeNav.value = item.id
    return
  }

  // 离开工具区时重置工具状态
  if (activeNav.value === 'tools' && item.id !== 'tools') {
    idPhotoStore.reset()
    activeTool.value = null
  }
  // 进入工具区时回到九宫格入口
  if (item.id === 'tools') {
    activeTool.value = null
  }

  activeNav.value = item.id
}

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确认退出登录？', '提示', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning'
    })
    authStore.logout()
    router.push('/login')
    ElMessage.success('已退出登录')
  } catch {
    // cancelled
  }
}
</script>

<style scoped>
/* ─── Shell Layout ─── */
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: #f0f4fc;
}

/* ─── Sidebar ─── */
.sidebar {
  width: 152px;
  flex-shrink: 0;
  background: #1565C0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  user-select: none;
}

.sidebar-brand {
  display: flex;
  align-items: flex-start;
  padding: 22px 18px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.12);
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

/* 用 scale 微调视觉字号：仅改 font-size 时，多数浏览器「最小字号」会把过小字号都渲染成 12px，看起来不变 */
.brand-version {
  display: inline-block;
  font-size: 15px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0.02em;
  line-height: 1.15;
  white-space: nowrap;
  transform: scale(0.86);
  transform-origin: left top;
  margin-top: 1px;
  margin-bottom: -0.26em;
}

/* 品牌名：与原先 span 时一致；勿对 button 使用 font: inherit，否则会盖住本块字号 */
.brand-name {
  font-size: 29px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 1.5px;
  line-height: 1.15;
}

.brand-name-btn {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  text-align: left;
  width: 100%;
  appearance: none;
  -webkit-appearance: none;
}

.brand-logo-btn {
  width: 100%;
  display: block;
}

.brand-logo-img {
  display: block;
  width: 100%;
  height: auto;
  max-width: 166px;
  object-fit: contain;
}

.brand-name-btn:hover {
  color: rgba(255, 255, 255, 0.92);
}

.brand-name--active {
  color: #fff;
  opacity: 1;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 10px;
  padding: 16px 10px;
}

.nav-item-text {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  min-width: 0;
  white-space: nowrap;
}

/* 代做工单侧栏红点 */
.nav-badge {
  position: absolute;
  top: 6px; right: 6px;
  background: #e53935;
  color: #fff;
  font-size: 10px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 10px;
  font-weight: 700;
}

/* 顶栏代做工单来源标签 */
.commission-order-tag {
  font-size: 11px;
  font-weight: 700;
  color: #1565C0;
  background: #e8f0fe;
  border: 1px solid #c5d8f8;
  border-radius: 10px;
  padding: 3px 10px;
  margin-right: 8px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  padding: 15px 12px;
  border: none;
  border-radius: 9px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
  color: rgba(255,255,255,0.75);
}

.nav-item:hover {
  background: rgba(255,255,255,0.12);
  color: #fff;
}

.nav-item--active {
  background: rgba(255,255,255,0.18);
  color: #fff;
  /* 让选中背景与侧栏右边缘贴合（侧栏内边距为 10px） */
  margin-right: -10px;
  width: calc(100% + 10px);
  padding-right: calc(12px + 10px);
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.nav-item--admin {
  margin-top: auto;
  border-top: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.6);
}

.nav-label {
  font-size: 14px;
  font-weight: 500;
}

.nav-key {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  opacity: 0.88;
  line-height: 1.35;
}

/* ─── Main Wrapper ─── */
.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ─── Topbar ─── */
.topbar {
  height: 48px;
  flex-shrink: 0;
  background: #fff;
  border-bottom: 1px solid #e8ecf4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.topbar-title {
  font-size: 15px;
  font-weight: 700;
  color: #1a1a1a;
}

.topbar-byline {
  font-size: 13px;
  font-weight: 500;
  color: #9aa3af;
  margin-left: 6px;
  user-select: none;
  white-space: nowrap;
}

.topbar-sep {
  font-size: 14px;
  color: #ccc;
}

.topbar-sub {
  font-size: 14px;
  color: #1565C0;
  font-weight: 500;
}

.topbar-sub--link {
  cursor: pointer;
  color: #60a5fa;
  transition: color 0.15s;
}

.topbar-sub--link:hover { color: #1565C0; text-decoration: underline; }

/* Feature sub-mode tabs in topbar */
.feature-mode-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  background: #f0f4fc;
  border-radius: 8px;
  padding: 3px;
}

.fmode-tab {
  padding: 4px 14px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  color: #888;
  transition: all 0.15s;
}

.fmode-tab:hover { color: #1565C0; }

.fmode-tab--active {
  background: #fff;
  color: #1565C0;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.topbar-user {
  font-size: 13px;
  color: #666;
}

.logout-btn {
  font-size: 13px;
  color: #999;
}

/* ─── Main Content ─── */
.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 品牌名入口的首页：壁纸 + 蓝底兜底，外圈留白 */
.home-wallpaper-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 20px 20px;
  box-sizing: border-box;
}

.home-wallpaper {
  /* 不再铺满：高度缩小约 1/3 */
  flex: none;
  /* 再小 10 个点 */
  height: 83%;
  min-height: 220px;
  width: 100%;
  border-radius: 12px;
  background-color: #1565c0;
  /* 居中展示中间区域，避免裁切偏到底部 */
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
}

/* ─── Dashboard ─── */
.dashboard-row {
  display: flex;
  gap: 14px;
  /* 与上方壁纸保持更明显的间距 */
  padding: 19px 0 0;
  flex-shrink: 0;
  transition: opacity 0.3s;
}
.dashboard-row--loading { opacity: 0.5; pointer-events: none; }

.dash-card {
  flex: 1;
  background: #fff;
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.07);
  cursor: default;
  transition: box-shadow 0.2s;
}
.dash-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
.dash-card--accent {
  cursor: pointer;
  background: linear-gradient(135deg, #1565c0 0%, #1e88e5 100%);
  color: #fff;
}
.dash-icon { font-size: 26px; flex-shrink: 0; }
.dash-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dash-value {
  font-size: 26px;
  font-weight: 700;
  color: #1a1a2e;
  line-height: 1.1;
}
.dash-label {
  font-size: 12px;
  color: #888;
  white-space: nowrap;
}
.dash-card--accent .dash-value,
.dash-card--accent .dash-label { color: rgba(255,255,255,0.95); }

/* ─── Placeholder ─── */
.placeholder-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #aaa;
}

.placeholder-icon {
  font-size: 52px;
}

.placeholder-title {
  font-size: 17px;
  font-weight: 600;
  color: #666;
  margin: 0;
}

.placeholder-desc {
  font-size: 13px;
  color: #aaa;
  margin: 0;
}
</style>
