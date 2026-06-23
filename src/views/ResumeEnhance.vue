<template>
  <div class="enhance-page">
    <!-- 顶部导航 -->
    <header class="enhance-navbar">
      <el-button :icon="ArrowLeft" text @click="handleBack">返回</el-button>
      <span class="enhance-navbar__title">简历优化</span>
      <span />
    </header>

    <!-- 各阶段页面 -->
    <div class="enhance-body">
      <!-- 阶段一：上传与参数配置 -->
      <UploadStage v-if="store.stage === 'upload'" />

      <!-- 阶段二：分析加载中 -->
      <AnalyzingStage v-else-if="store.stage === 'analyzing'" />

      <!-- 阶段三：分析结果确认 -->
      <ResultStage v-else-if="store.stage === 'result'" />

      <!-- 阶段四：润色加载中 -->
      <PolishingStage v-else-if="store.stage === 'polishing'" />

      <!-- 阶段五：润色完成与对比 -->
      <DoneStage v-else-if="store.stage === 'done'" />
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { useResumeEnhanceStore } from '@/stores/resumeEnhance'

import UploadStage from '@/components/resume-enhance/UploadStage.vue'
import AnalyzingStage from '@/components/resume-enhance/AnalyzingStage.vue'
import ResultStage from '@/components/resume-enhance/ResultStage.vue'
import PolishingStage from '@/components/resume-enhance/PolishingStage.vue'
import DoneStage from '@/components/resume-enhance/DoneStage.vue'

const router = useRouter()
const store = useResumeEnhanceStore()

onMounted(() => {
  // 进入页面时重置状态，确保每次都是全新流程
  store.reset()
})

async function handleBack() {
  // 如果正在处理中，提示确认
  if (store.stage === 'analyzing' || store.stage === 'polishing') {
    try {
      await ElMessageBox.confirm('AI正在处理中，确认要退出吗？', '提示', {
        confirmButtonText: '确认退出',
        cancelButtonText: '继续等待',
        type: 'warning'
      })
    } catch {
      return
    }
  }
  store.reset()
  router.push('/')
}
</script>

<style scoped>
.enhance-page {
  min-height: 100vh;
  background: #f5f6f8;
  display: flex;
  flex-direction: column;
}

.enhance-navbar {
  background: #fff;
  border-bottom: 1px solid #eee;
  padding: 0 20px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 1px 6px rgba(0,0,0,0.06);
}

.enhance-navbar__title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.enhance-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>
