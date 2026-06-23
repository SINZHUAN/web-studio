<template>
  <div class="confirm-stage">

    <!-- 页头 -->
    <div class="confirm-header">
      <div class="confirm-title">识别结果确认</div>
      <div class="confirm-sub">请检查以下AI识别内容，确认无误后开始润色并生成简历</div>
    </div>

    <!-- 模块卡片区域 -->
    <div class="module-grid">

      <!-- 直接填充模块 -->
      <div v-if="directModules.length" class="module-group">
        <div class="group-label">
          <span class="group-badge group-badge--direct">直接填充</span>
          <span class="group-desc">以下模块将直接使用识别内容填充到简历中</span>
        </div>
        <div class="module-cards">
          <div
            v-for="mod in directModules"
            :key="mod.key"
            class="module-card module-card--direct"
          >
            <div class="module-card__head">
              <span class="mod-label">{{ mod.label }}</span>
              <span v-if="mod.count" class="mod-count">{{ mod.count }} 条</span>
            </div>
            <div class="module-card__body">{{ mod.summary }}</div>
          </div>
        </div>
      </div>

      <!-- AI润色模块 -->
      <div v-if="polishModules.length" class="module-group">
        <div class="group-label">
          <span class="group-badge group-badge--polish">AI润色</span>
          <span class="group-desc">以下模块将进行AI智能润色后填充到简历中</span>
        </div>
        <div class="module-cards">
          <div
            v-for="mod in polishModules"
            :key="mod.key"
            class="module-card module-card--polish"
          >
            <div class="module-card__head">
              <span class="mod-label">{{ mod.label }}</span>
              <span v-if="mod.count" class="mod-count">{{ mod.count }} 条</span>
              <span class="polish-badge">将进行AI润色</span>
            </div>
            <div class="module-card__body">{{ mod.summary }}</div>
          </div>
        </div>
      </div>

      <!-- 未识别到任何模块 -->
      <div v-if="!directModules.length && !polishModules.length" class="empty-hint">
        <p>未能识别到有效的简历内容，请返回检查简历文本是否完整</p>
      </div>

    </div>

    <!-- 底部操作栏 -->
    <div class="confirm-footer">
      <button class="back-btn" @click="store.phase = 'template'">
        ← 返回修改
      </button>
      <button
        class="confirm-btn"
        :class="{ 'confirm-btn--off': !canConfirm }"
        :disabled="!canConfirm"
        @click="handleConfirm"
      >
        确认，开始润色并生成简历
      </button>
    </div>

    <!-- 润色+生成加载弹窗 -->
    <Teleport to="body">
      <div v-if="store.phase === 'polishing'" class="polishing-overlay">
        <div class="polishing-modal">
          <!-- 进度头部 -->
          <div class="polishing-modal__header">
            <template v-if="store.isGenerating">
              <p class="polishing-modal__title">{{ store.generatingStatus }}</p>
            </template>
            <template v-else>
              <p class="polishing-modal__title">
                AI润色进行中
                <span class="polishing-modal__dots"><span>.</span><span>.</span><span>.</span></span>
              </p>
              <p class="polishing-modal__sub">
                已完成 {{ store.polishedCount }} / {{ store.totalPolishCount }} 个模块
              </p>
            </template>
          </div>

          <!-- 模块状态列表 -->
          <template v-if="!store.isGenerating && store.polishList.length">
            <div class="polishing-list">
              <div
                v-for="mod in store.polishList"
                :key="mod.moduleKey"
                class="polishing-item"
              >
                <span class="polishing-item__label">{{ mod.moduleLabel }}</span>
                <div class="polishing-item__status-wrap">
                  <!-- 所有子项状态 -->
                  <template v-if="mod.items.length > 1">
                    <div
                      v-for="(sub, si) in mod.items"
                      :key="si"
                      :class="['polishing-sub', `polishing-sub--${sub.status}`]"
                    >
                      <template v-if="sub.status === 'polishing'">
                        <svg class="polish-spin" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="8" r="6" stroke="#93c5fd" stroke-width="2"/>
                          <path d="M8 2 a6 6 0 0 1 6 6" stroke="#1565C0" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        <span>润色中</span>
                      </template>
                      <template v-else-if="sub.status === 'done'">
                        <span class="status-dot status-dot--done">✓</span>
                        <span>已完成</span>
                      </template>
                      <template v-else>
                        <span class="status-dot">·</span>
                        <span>等待中</span>
                      </template>
                    </div>
                  </template>
                  <!-- 单子项简化显示 -->
                  <template v-else-if="mod.items.length === 1">
                    <div :class="['polishing-sub', `polishing-sub--${mod.items[0].status}`]">
                      <template v-if="mod.items[0].status === 'polishing'">
                        <svg class="polish-spin" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="8" r="6" stroke="#93c5fd" stroke-width="2"/>
                          <path d="M8 2 a6 6 0 0 1 6 6" stroke="#1565C0" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        <span>润色中...</span>
                      </template>
                      <template v-else-if="mod.items[0].status === 'done'">
                        <span class="status-dot status-dot--done">✓</span>
                        <span>已完成</span>
                      </template>
                      <template v-else>
                        <span class="status-dot">·</span>
                        <span>等待中</span>
                      </template>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </template>

          <!-- 生成中进度条 -->
          <template v-if="store.isGenerating">
            <div class="generating-bar-wrap">
              <div class="generating-bar"></div>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRecognitionStore } from '@/stores/recognition'
import { useRecognitionPolish } from '@/composables/useRecognitionPolish'
import { POLISH_ELIGIBLE_MODULES, MODULE_LABELS, detectGaps } from '@/config/recognitionTemplateConfig'

const store = useRecognitionStore()
const { runPolishAndGenerate } = useRecognitionPolish()

/**
 * 按 store.templateModules 的顺序遍历，只显示模板要求的模块
 * 分为「直接填充」和「AI润色」两组
 */
const directModules = computed(() => {
  const data      = store.extractedData
  const tplModules = store.templateModules   // 有序 key 数组
  if (!data || !tplModules.length) return []
  return tplModules
    .filter(key => !POLISH_ELIGIBLE_MODULES.has(key))
    .map(key => {
      const raw = data[key]
      if (!raw || (Array.isArray(raw) && !raw.length)) return null
      return {
        key,
        label:   MODULE_LABELS[key] || key,
        count:   Array.isArray(raw) ? raw.length : null,
        summary: buildSummary(key, raw)
      }
    })
    .filter(Boolean)
})

const polishModules = computed(() => {
  const data      = store.extractedData
  const tplModules = store.templateModules
  if (!data || !tplModules.length) return []
  return tplModules
    .filter(key => POLISH_ELIGIBLE_MODULES.has(key))
    .map(key => {
      const raw = data[key]
      if (!raw) return null
      if (key === 'self_evaluation') {
        if (!raw.content?.trim()) return null
        return {
          key,
          label:   MODULE_LABELS[key] || key,
          count:   null,
          summary: raw.content.slice(0, 80) + (raw.content.length > 80 ? '...' : '')
        }
      }
      const arr = Array.isArray(raw) ? raw : []
      if (!arr.length) return null
      const first   = arr[0]
      const preview = first.content || first.description || ''
      return {
        key,
        label:   MODULE_LABELS[key] || key,
        count:   arr.length,
        summary: preview.slice(0, 80) + (preview.length > 80 ? '...' : '')
      }
    })
    .filter(Boolean)
})

const canConfirm = computed(() =>
  directModules.value.length + polishModules.value.length > 0
)

function buildSummary(key, raw) {
  if (key === 'basic') {
    const b = raw || {}
    const parts = [b.name, b.phone, b.email, b.gender].filter(Boolean)
    return parts.join(' | ') || '已识别'
  }
  if (key === 'career') {
    const c = raw || {}
    const parts = [c.position, c.city, c.salary].filter(Boolean)
    return parts.join(' | ') || '已识别'
  }
  if (Array.isArray(raw)) {
    const first = raw[0] || {}
    const hint = first.school || first.skillName || first.name || ''
    return hint ? `${hint}${raw.length > 1 ? ` 等 ${raw.length} 条` : ''}` : `共 ${raw.length} 条`
  }
  return '已识别'
}

function handleConfirm() {
  // 检测空缺：哪些模块记录数不足模板要求
  const foundGaps = detectGaps(store.extractedData, store.templateRecordCounts)
  store.gaps = foundGaps
  store.supplementData = {}

  if (foundGaps.length > 0) {
    // 有空缺 → 先补填
    store.phase = 'supplement'
  } else {
    // 无空缺 → 直接润色生成
    runPolishAndGenerate()
  }
}
</script>

<style scoped>
/* ── Shell ── */
.confirm-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Header ── */
.confirm-header {
  padding: 24px 36px 16px;
  border-bottom: 1px solid #e8f0fe;
  flex-shrink: 0;
}

.confirm-title {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a1a;
  margin-bottom: 4px;
}

.confirm-sub {
  font-size: 13px;
  color: #888;
}

/* ── Module grid ── */
.module-grid {
  flex: 1;
  overflow-y: auto;
  padding: 20px 36px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.module-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 20px;
  letter-spacing: 0.3px;
}

.group-badge--direct {
  background: #f0f4fc;
  color: #64748b;
}

.group-badge--polish {
  background: #dbeafe;
  color: #1565C0;
}

.group-desc {
  font-size: 12px;
  color: #aaa;
}

.module-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

/* ── Module card ── */
.module-card {
  background: #fff;
  border: 1.5px solid #e8f0fe;
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.module-card--polish {
  border-color: #bfdbfe;
  background: #f7fbff;
}

.module-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mod-label {
  font-size: 13px;
  font-weight: 700;
  color: #1a1a1a;
}

.mod-count {
  font-size: 11px;
  background: #f0f4fc;
  color: #64748b;
  padding: 2px 7px;
  border-radius: 10px;
}

.polish-badge {
  font-size: 11px;
  background: #dbeafe;
  color: #1565C0;
  padding: 2px 7px;
  border-radius: 10px;
  font-weight: 600;
}

.module-card__body {
  font-size: 12px;
  color: #666;
  line-height: 1.5;
  word-break: break-all;
}

.empty-hint {
  text-align: center;
  padding: 60px 0;
  color: #aaa;
  font-size: 14px;
}

/* ── Footer ── */
.confirm-footer {
  padding: 16px 36px;
  border-top: 1px solid #e8f0fe;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  background: #fff;
}

.back-btn {
  padding: 11px 22px;
  background: #f0f4fc;
  color: #64748b;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.back-btn:hover { background: #dbeafe; color: #1565C0; }

.confirm-btn {
  padding: 13px 36px;
  background: linear-gradient(135deg, #1565C0, #1976D2);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.5px;
  transition: opacity 0.15s, transform 0.1s;
  box-shadow: 0 4px 12px rgba(21,101,192,0.35);
}

.confirm-btn:hover:not(.confirm-btn--off) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.confirm-btn--off {
  background: #e2e8f0;
  color: #aaa;
  box-shadow: none;
  cursor: not-allowed;
}

/* ── Polishing overlay ── */
.polishing-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15,40,80,0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
}

.polishing-modal {
  background: #fff;
  border-radius: 20px;
  padding: 28px 32px;
  width: 380px;
  max-width: 90vw;
  max-height: 70vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
}

.polishing-modal__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.polishing-modal__title {
  font-size: 16px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.polishing-modal__dots { display: flex; gap: 2px; }
.polishing-modal__dots span {
  animation: dot-pulse 1.4s ease-in-out infinite;
  color: #1565C0;
  font-weight: 700;
}
.polishing-modal__dots span:nth-child(2) { animation-delay: 0.2s; }
.polishing-modal__dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-pulse {
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
}

.polishing-modal__sub {
  font-size: 13px;
  color: #1565C0;
  margin: 0;
}

/* ── Polish list ── */
.polishing-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.polishing-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  background: #f7fbff;
  border-radius: 8px;
}

.polishing-item__label {
  font-size: 13px;
  font-weight: 600;
  color: #1a1a1a;
  flex-shrink: 0;
  min-width: 70px;
}

.polishing-item__status-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  align-items: flex-end;
}

.polishing-sub {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #888;
}

.polishing-sub--polishing { color: #1565C0; }
.polishing-sub--done { color: #22c55e; }

.polish-spin {
  width: 14px;
  height: 14px;
  animation: spin 1s linear infinite;
  flex-shrink: 0;
}

@keyframes spin { to { transform: rotate(360deg); } }

.status-dot { font-size: 14px; }
.status-dot--done { color: #22c55e; font-weight: 700; }

/* ── Generating bar ── */
.generating-bar-wrap {
  height: 4px;
  background: #e8f0fe;
  border-radius: 2px;
  overflow: hidden;
}

.generating-bar {
  height: 100%;
  width: 40%;
  background: linear-gradient(90deg, #1565C0, #42A5F5);
  border-radius: 2px;
  animation: progress-indeterminate 1.5s ease-in-out infinite;
}

@keyframes progress-indeterminate {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
</style>
