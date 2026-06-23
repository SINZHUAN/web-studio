<template>
  <div class="tools-hub">

    <div class="hub-header">
      <div class="hub-title">工具箱</div>
      <div class="hub-sub">选择需要使用的工具</div>
    </div>

    <div class="tools-grid">

      <!-- 已上线工具 -->
      <div
        v-for="tool in availableTools"
        :key="tool.id"
        class="tool-card"
        @click="$emit('select', tool.id)"
      >
        <div class="tool-card__icon">{{ tool.icon }}</div>
        <div class="tool-card__name">{{ tool.name }}</div>
        <div class="tool-card__desc">{{ tool.desc }}</div>
      </div>

      <!-- 待上线占位格 -->
      <div
        v-for="n in placeholderCount"
        :key="'ph_' + n"
        class="tool-card tool-card--placeholder"
      >
        <div class="tool-card__icon">🔧</div>
        <div class="tool-card__name">敬请期待</div>
        <div class="tool-card__desc">更多工具陆续上线</div>
      </div>

    </div>

  </div>
</template>

<script setup>
import { computed } from 'vue'

defineEmits(['select'])

const availableTools = [
  {
    id:   'idphoto',
    icon: '🪪',
    name: '证件照制作',
    desc: '一键抠图 + 背景替换 + 规格裁剪',
  },
  // 后续工具在此追加
]

// 九宫格固定9格，减去已上线数量得到占位格数量
const GRID_TOTAL    = 9
const placeholderCount = computed(() => GRID_TOTAL - availableTools.length)
</script>

<style scoped>
.tools-hub {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 36px 48px;
  overflow-y: auto;
  gap: 28px;
}

/* ── Header ── */
.hub-header { display: flex; flex-direction: column; gap: 6px; }

.hub-title {
  font-size: 20px;
  font-weight: 800;
  color: #1565C0;
  letter-spacing: 0.4px;
}

.hub-sub {
  font-size: 13px;
  color: #93c5fd;
}

/* ── Grid ── */
.tools-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  max-width: 960px;
}

/* ── Card ── */
.tool-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px 16px;
  background: #eff6ff;
  border: 2px solid #dbeafe;
  border-radius: 18px;
  cursor: pointer;
  transition: all 0.18s;
  text-align: center;
  user-select: none;
  aspect-ratio: 1 / 1;
}

.tool-card:hover {
  background: #dbeafe;
  border-color: #1565C0;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(21, 101, 192, 0.15);
}

.tool-card:active {
  transform: translateY(0);
  box-shadow: none;
}

.tool-card__icon {
  font-size: 32px;
  line-height: 1;
}

.tool-card__name {
  font-size: 14px;
  font-weight: 700;
  color: #1565C0;
}

.tool-card__desc {
  font-size: 11px;
  color: #60a5fa;
  line-height: 1.4;
}

/* ── Placeholder card ── */
.tool-card--placeholder {
  background: #f8fbff;
  border-color: #e8f0fe;
  cursor: default;
  opacity: 0.55;
}

.tool-card--placeholder:hover {
  background: #f8fbff;
  border-color: #e8f0fe;
  transform: none;
  box-shadow: none;
}

.tool-card--placeholder .tool-card__icon { filter: grayscale(1); }
.tool-card--placeholder .tool-card__name { color: #93c5fd; }
</style>
