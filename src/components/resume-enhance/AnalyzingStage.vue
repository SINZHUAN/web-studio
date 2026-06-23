<template>
  <div class="analyzing-stage">
    <div class="analyzing-container">

      <!-- 动画图标 -->
      <div class="analyzing-icon">
        <div class="icon-ring" />
        <span class="icon-emoji">🤖</span>
      </div>

      <!-- 状态文字 -->
      <h2 class="analyzing-title">{{ statusText }}</h2>
      <p class="analyzing-sub">请耐心等待，通常需要 15-30 秒</p>

      <!-- 进度条 -->
      <div class="progress-wrap">
        <el-progress
          :percentage="progress"
          :stroke-width="6"
          :show-text="false"
          color="linear-gradient(90deg, #667eea, #764ba2)"
        />
        <span class="progress-text">{{ progress }}%</span>
      </div>

      <!-- 步骤列表 -->
      <div class="steps-list">
        <div
          v-for="(step, i) in steps"
          :key="i"
          class="step-item"
          :class="{
            'step-item--done': step.status === 'done',
            'step-item--active': step.status === 'active',
            'step-item--pending': step.status === 'pending'
          }"
        >
          <span class="step-item__icon">
            <span v-if="step.status === 'done'">✓</span>
            <span v-else-if="step.status === 'active'" class="spinner" />
            <span v-else>○</span>
          </span>
          <span class="step-item__text">{{ step.text }}</span>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useResumeEnhanceStore } from '@/stores/resumeEnhance'
import { enhanceAnalyze, enhanceExtractSections } from '@/api/ai'
import { extractParagraphs, docPreview } from '@/api/word'

const store = useResumeEnhanceStore()

function convertScoreToGrade(score) {
  if (typeof score !== 'number' || isNaN(score)) return 'C'
  score = Math.max(0, Math.min(100, score))
  if (score >= 90) return 'A+'
  if (score >= 75) return 'A'
  if (score >= 65) return 'A-'
  if (score >= 50) return 'B+'
  if (score >= 40) return 'B'
  if (score >= 30) return 'B-'
  return 'C'
}

const progress = ref(0)
const statusText = ref('正在解析简历文件...')
let progressTimer = null

const steps = ref([
  { text: '解析简历文件', status: 'active' },
  { text: '提取简历段落', status: 'pending' },
  { text: 'AI多维度分析评分', status: 'pending' },
  { text: '识别各经历模块', status: 'pending' },
  { text: '生成预览图', status: 'pending' }
])

function setStep(index, status) {
  steps.value = steps.value.map((s, i) => ({
    ...s,
    status: i === index ? status : i < index ? 'done' : s.status
  }))
}

function advanceProgress(target, speed = 300) {
  clearInterval(progressTimer)
  progressTimer = setInterval(() => {
    if (progress.value < target) {
      progress.value = Math.min(progress.value + 1, target)
    } else {
      clearInterval(progressTimer)
    }
  }, speed)
}

onMounted(async () => {
  await runAnalysis()
})

onUnmounted(() => {
  clearInterval(progressTimer)
})

async function runAnalysis() {
  try {
    // Step 0: 提取段落
    advanceProgress(20)
    setStep(0, 'active')
    statusText.value = '正在解析简历文件...'

    console.log('[分析] 开始提取段落, fileId:', store.uploadedFileId, 'fileKey:', store.uploadedFileKey)
    const extractRes = await extractParagraphs({
      fileId: store.uploadedFileId,
      fileKey: store.uploadedFileKey
    })
    console.log('[分析] 段落提取响应:', extractRes)
    if (!extractRes?.success) throw new Error('段落提取失败：' + (extractRes?.message || extractRes?.error || JSON.stringify(extractRes)))
    const paragraphs = extractRes.paragraphs || []
    console.log('[分析] 提取段落数:', paragraphs.length)

    setStep(0, 'done')
    setStep(1, 'active')
    advanceProgress(35)
    statusText.value = '正在分析简历内容...'

    // Step 1: AI分析
    console.log('[分析] 开始AI分析, polishMode:', store.polishMode)
    const analyzeRes = await enhanceAnalyze({
      paragraphs,
      polishMode: store.polishMode,
      targetPosition: store.targetPosition,
      jobDescription: store.jobDescription,
      userType: store.userIdentity
    })
    console.log('[分析] AI分析响应:', analyzeRes)
    if (!analyzeRes?.success) throw new Error('分析失败：' + (analyzeRes?.message || analyzeRes?.error || JSON.stringify(analyzeRes)))

    const analysis = analyzeRes.analysis || {}
    store.analysisResult = analysis
    store.scoreValue = analysis.score || 0
    store.scoreLevel = convertScoreToGrade(analysis.score || 0)
    // 五维雷达数据（仅岗位润色模式有）
    const ds = analysis.dimensionScores
    store.radarData = ds
      ? [ds.fit, ds.highlight, ds.star, ds.core, ds.quantify]
      : []
    store.radarIndustryAvg = []

    setStep(1, 'done')
    setStep(2, 'active')
    advanceProgress(60)
    statusText.value = '正在识别各经历模块...'

    // Step 2: 识别提取
    console.log('[分析] 开始识别模块')
    const extractSectRes = await enhanceExtractSections({ paragraphs })
    console.log('[分析] 模块识别响应:', extractSectRes)
    if (!extractSectRes?.success) throw new Error('模块识别失败：' + (extractSectRes?.message || extractSectRes?.error || JSON.stringify(extractSectRes)))
    store.extractedSections = extractSectRes.sections || []
    store.resumeName = extractSectRes.resumeName || ''

    setStep(2, 'done')
    setStep(3, 'active')
    advanceProgress(80)
    statusText.value = '正在生成简历预览图...'

    // Step 3: 生成预览图
    console.log('[分析] 开始生成预览图')
    const previewRes = await docPreview({
      fileId: store.uploadedFileId,
      fileKey: store.uploadedFileKey
    })
    console.log('[分析] 预览图响应:', previewRes)
    if (previewRes?.success) {
      // 优先使用多页数组，回退到单张字段
      if (previewRes.previewImageUrls?.length) {
        store.originalPreviewUrls = previewRes.previewImageUrls
      } else if (previewRes.previewImageUrl) {
        store.originalPreviewUrls = [previewRes.previewImageUrl]
      }
    }

    setStep(3, 'done')
    setStep(4, 'done')
    advanceProgress(100)
    statusText.value = '分析完成！'

    setTimeout(() => {
      store.stage = 'result'
    }, 600)

  } catch (err) {
    clearInterval(progressTimer)
    console.error('[分析] 流程出错:', err)
    ElMessage.error('分析失败：' + (err.message || '请重试'))
    store.stage = 'upload'
  }
}
</script>

<style scoped>
.analyzing-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.analyzing-container {
  text-align: center;
  max-width: 440px;
  width: 100%;
}

/* 动画图标 */
.analyzing-icon {
  position: relative;
  width: 80px;
  height: 80px;
  margin: 0 auto 28px;
}

.icon-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: #667eea;
  border-right-color: #764ba2;
  animation: spin 1s linear infinite;
}

.icon-emoji {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.analyzing-title {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 8px;
}

.analyzing-sub {
  font-size: 13px;
  color: #999;
  margin: 0 0 28px;
}

.progress-wrap {
  margin-bottom: 32px;
  position: relative;
}

.progress-text {
  display: block;
  margin-top: 8px;
  font-size: 13px;
  color: #888;
}

/* 步骤列表 */
.steps-list {
  text-align: left;
  background: #fff;
  border-radius: 14px;
  padding: 20px 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: #bbb;
  transition: color 0.3s;
}

.step-item--done {
  color: #52c41a;
}

.step-item--active {
  color: #667eea;
  font-weight: 600;
}

.step-item__icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #667eea;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
</style>
