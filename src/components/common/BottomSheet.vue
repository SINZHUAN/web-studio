<template>
  <!-- 遮罩层 -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="modelValue" class="bs-mask" @click="closable && $emit('update:modelValue', false)" />
    </Transition>
    <Transition name="slide-up">
      <div v-if="modelValue" class="bs-panel" :style="{ maxHeight: maxHeight }">
        <!-- 顶部把手 + 标题 -->
        <div class="bs-header">
          <div class="bs-handle" />
          <div class="bs-title-row">
            <span class="bs-title">{{ title }}</span>
            <button v-if="showClose" class="bs-close" @click="$emit('update:modelValue', false)">✕</button>
          </div>
        </div>
        <!-- 内容区（可滚动） -->
        <div class="bs-body">
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  closable: { type: Boolean, default: true },   // 点击遮罩关闭
  showClose: { type: Boolean, default: true },   // 显示右上角 X 按钮
  maxHeight: { type: String, default: '90vh' }
})

defineEmits(['update:modelValue'])
</script>

<style scoped>
.bs-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 200;
}

.bs-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-radius: 20px 20px 0 0;
  z-index: 201;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.bs-header {
  flex-shrink: 0;
  padding: 12px 20px 0;
}

.bs-handle {
  width: 36px;
  height: 4px;
  background: #ddd;
  border-radius: 2px;
  margin: 0 auto 12px;
}

.bs-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 1px solid #f0f0f0;
}

.bs-title {
  font-size: 16px;
  font-weight: 700;
  color: #1a1a1a;
}

.bs-close {
  background: none;
  border: none;
  color: #999;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  line-height: 1;
}

.bs-close:hover {
  background: #f5f5f5;
  color: #333;
}

.bs-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 32px;
  -webkit-overflow-scrolling: touch;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

.slide-up-enter-active,
.slide-up-leave-active { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-up-enter-from,
.slide-up-leave-to { transform: translateY(100%); }
</style>
