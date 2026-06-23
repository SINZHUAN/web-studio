<template>
  <div class="polishing-stage">
    <!-- 固定顶部进度区 -->
    <div class="polishing-header">
      <div class="polishing-header__text">
        AI正在润色 <strong>{{ store.polishList.length }}</strong> 个模块，已完成
        <strong>{{ doneCount }}</strong> 个模块
      </div>
      <el-progress
        :percentage="Math.round((doneCount / store.polishList.length) * 100) || 0"
        :stroke-width="4"
        :show-text="false"
        color="linear-gradient(90deg, #667eea, #764ba2)"
        style="margin-top: 8px;"
      />
    </div>

    <!-- 模块列表（自动滚动到当前） -->
    <div class="polishing-list" ref="listRef">
      <div
        v-for="(item, i) in store.polishList"
        :key="i"
        :id="`polish-item-${i}`"
        class="polish-item"
        :class="{
          'polish-item--done': item.status === 'done',
          'polish-item--active': item.status === 'polishing',
          'polish-item--pending': item.status === 'pending'
        }"
      >
        <div class="polish-item__left">
          <span class="polish-item__icon">
            <span v-if="item.status === 'done'">✓</span>
            <span v-else-if="item.status === 'polishing'" class="spinner" />
            <span v-else>○</span>
          </span>
          <div>
            <div class="polish-item__name">{{ item.moduleLabel }}</div>
            <div v-if="item.status === 'polishing'" class="polish-item__sub">AI正在润色中...</div>
            <div v-else-if="item.status === 'done'" class="polish-item__sub polish-item__sub--done">润色完成</div>
            <div v-else class="polish-item__sub">等待中</div>
          </div>
        </div>
        <div v-if="item.status === 'done'" class="polish-item__word-count">
          {{ item.polishedText?.length || 0 }} 字
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useResumeEnhanceStore } from '@/stores/resumeEnhance'
import { enhancePolishSection, enhanceOptimizationSummary } from '@/api/ai'
import { replaceByParagraph } from '@/api/word'

const store = useResumeEnhanceStore()
const listRef = ref(null)

const doneCount = computed(() => store.polishList.filter(i => i.status === 'done').length)

const moduleLabelMap = {
  work: '工作经历', internship: '实习经历', project: '项目经历',
  school_experience: '在校经历', self_evaluation: '自我评价'
}

onMounted(async () => {
  await buildPolishList()
  await runPolish()
})

function buildPolishList() {
  const sections = store.extractedSections
  const polishOrder = ['work', 'internship', 'project', 'school_experience', 'self_evaluation']
  const list = []

  polishOrder.forEach(key => {
    const items = sections[key]
    if (!items) return
    const arr = Array.isArray(items) ? items : [items]
    arr.forEach((item, idx) => {
      if (!item?.originalText) return
      const contentFormat = store.outputFormat === 'subtitle'
        ? (key === 'self_evaluation' ? 'paragraph' : 'subtitle')
        : 'paragraph'
      list.push({
        moduleKey: key,
        moduleLabel: `${moduleLabelMap[key]}${arr.length > 1 ? ` ${idx + 1}` : ''}`,
        originalText: item.originalText,
        sectionOrder: item.sectionOrder || idx,
        contentFormat,
        status: 'pending',
        polishedText: ''
      })
    })
  })

  store.polishList = list
}

async function runPolish() {
  for (let i = 0; i < store.polishList.length; i++) {
    store.polishList[i].status = 'polishing'
    store.polishScrollId = `polish-item-${i}`

    // 自动滚动到当前项
    await nextTick()
    const el = document.getElementById(`polish-item-${i}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    try {
      const item = store.polishList[i]
      const res = await enhancePolishSection({
        moduleType: item.moduleKey,
        originalText: item.originalText,
        polishMode: store.polishMode,
        polishingIntensity: store.polishingIntensity,
        targetPosition: store.targetPosition,
        jobDescription: store.jobDescription,
        contentFormat: item.contentFormat,
        userType: store.userIdentity
      })

      if (res?.success && res.polishedText) {
        store.polishList[i].polishedText = res.polishedText
        store.polishList[i].contentFormat = res.contentFormat || item.contentFormat
        store.polishList[i].status = 'done'
      } else {
        // 润色失败时保留原文
        store.polishList[i].polishedText = item.originalText
        store.polishList[i].status = 'done'
      }
    } catch {
      store.polishList[i].polishedText = store.polishList[i].originalText
      store.polishList[i].status = 'done'
    }
  }

  // 全部润色完成，执行回填
  await generatePolishedDoc()
}

async function generatePolishedDoc() {
  try {
    // 构建 replacements 数组
    const replacements = store.polishList.map(item => ({
      originalText: item.originalText,
      polishedText: item.polishedText,
      contentFormat: item.contentFormat
    }))

    const res = await replaceByParagraph({
      fileId: store.uploadedFileId,
      fileKey: store.uploadedFileKey,
      replacements
    })

    if (!res?.success) throw new Error(res?.message || '回填失败')

    store.polishedFileKey = res.newFileKey || ''
    store.polishedDownloadUrl = res.downloadUrl || ''

    // 润色后预览图：优先使用多页数组，再回退单张字段
    if (res.previewImageUrls?.length) {
      store.polishedPreviewUrls = res.previewImageUrls
    } else if (res.previewImageUrl) {
      store.polishedPreviewUrls = [res.previewImageUrl]
    }

    // 生成优化总结
    try {
      const summaryRes = await enhanceOptimizationSummary({
        polishedList: store.polishList.map(i => ({
          moduleKey: i.moduleKey,
          moduleLabel: i.moduleLabel,
          originalText: i.originalText,
          polishedText: i.polishedText,
          status: 'done'
        })),
        polishMode: store.polishMode,
        targetPosition: store.targetPosition,
        polishingIntensity: store.polishingIntensity
      })
      if (summaryRes?.success) store.summaryData = summaryRes.optimizationSummary || summaryRes.summary || null
    } catch { /* 总结生成失败不影响主流程 */ }

    store.stage = 'done'
  } catch (err) {
    ElMessage.error('简历回填失败：' + err.message)
    store.stage = 'result'
  }
}
</script>

<style scoped>
.polishing-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 固定顶部 */
.polishing-header {
  flex-shrink: 0;
  background: #fff;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.polishing-header__text {
  font-size: 15px;
  color: #333;
}

.polishing-header__text strong {
  color: #667eea;
  font-size: 18px;
}

/* 滚动列表 */
.polishing-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 40px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 640px;
  margin: 0 auto;
  width: 100%;
}

.polish-item {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1.5px solid #e8e8e8;
  transition: border-color 0.3s;
}

.polish-item--active {
  border-color: #667eea;
  box-shadow: 0 2px 12px rgba(102,126,234,0.15);
}

.polish-item--done {
  border-color: #52c41a;
  opacity: 0.85;
}

.polish-item__left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.polish-item__icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #52c41a;
  flex-shrink: 0;
}

.polish-item--active .polish-item__icon { color: #667eea; }
.polish-item--pending .polish-item__icon { color: #ccc; }

.polish-item__name {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
}

.polish-item__sub {
  font-size: 12px;
  color: #aaa;
  margin-top: 2px;
}

.polish-item__sub--done { color: #52c41a; }

.polish-item--active .polish-item__sub { color: #667eea; }

.polish-item__word-count {
  font-size: 12px;
  color: #888;
  background: #f5f5f5;
  padding: 2px 8px;
  border-radius: 20px;
}

.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid #667eea;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }
</style>
