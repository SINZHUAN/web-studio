<template>
  <div class="done-stage">
    <div class="done-layout" :class="{ 'done-layout--compare-collapsed': compareCollapsed }">

      <!-- ─── 左侧：润色前后简历预览（双列） ─── -->
      <div class="preview-area" ref="previewAreaRef">

        <!-- 润色前 -->
        <div class="preview-col" :class="{ 'preview-col--compare-collapsed': compareCollapsed }">
          <div class="preview-col__label before-col-label">
            <template v-if="!compareCollapsed">
              <span>润色前</span>
              <button class="compare-toggle-btn" @click="compareCollapsed = true" title="收起对比">
                <svg class="compare-toggle-icon" viewBox="0 0 12 12" fill="none">
                  <path d="M8.5 2L4.5 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M12 2L8 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>收起</span>
              </button>
            </template>
            <button v-else class="compare-expand-btn" @click="compareCollapsed = false" title="展开对比">
              <svg class="compare-toggle-icon" viewBox="0 0 12 12" fill="none">
                <path d="M3.5 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M7 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="compare-strip-label">展开对比</span>
            </button>
          </div>
          <div class="preview-pages" ref="beforePagesRef" v-show="!compareCollapsed">
            <div
              v-for="(url, i) in store.originalPreviewUrls"
              :key="'before-' + i"
              class="preview-img-wrap"
              :style="{ width: `${previewZoom * 100}%` }"
            >
              <img :src="url" class="preview-img" @click="openImagePreview(url)" />
          </div>
            <div v-if="!store.originalPreviewUrls.length" class="preview-placeholder">
              暂无预览图
        </div>
      </div>
      </div>

        <!-- 润色后 -->
        <div class="preview-col">
          <div class="preview-col__label preview-col__label--after">润色后</div>
          <div class="preview-pages" ref="afterPagesRef">
            <div
              v-for="(url, i) in store.polishedPreviewUrls"
              :key="'after-' + i"
              class="preview-img-wrap"
              :style="{ width: `${previewZoom * 100}%` }"
            >
              <img :src="url" class="preview-img" @click="openImagePreview(url)" />
            </div>
            <div v-if="!store.polishedPreviewUrls.length" class="preview-placeholder">
          暂无预览图
        </div>
      </div>
    </div>

        <!-- 复制预览下拉按钮（浮动，右上角） -->
        <div class="copy-preview-wrap" v-click-outside="() => copyMenuVisible = false">
          <button
            class="copy-preview-btn"
            :class="{ 'copy-preview-btn--loading': copyingPreview }"
            :disabled="copyingPreview"
            @click="copyMenuVisible = !copyMenuVisible"
          >
            <svg v-if="!copyingPreview" viewBox="0 0 20 20" fill="none" class="copy-preview-icon">
              <rect x="7" y="2" width="11" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
              <rect x="2" y="5" width="11" height="13" rx="2" fill="white" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            <span v-else class="copy-preview-spin"></span>
            <span>{{ copyingPreview ? '生成中...' : '复制预览' }}</span>
            <svg v-if="!copyingPreview" class="copy-menu-arrow" :class="{ 'copy-menu-arrow--open': copyMenuVisible }" viewBox="0 0 10 6" fill="none">
              <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
      </button>
          <Transition name="copy-menu-fade">
            <div v-if="copyMenuVisible && !copyingPreview" class="copy-menu">
              <button class="copy-menu-item" @click="copyMenuVisible=false; copyPreview('both')">
                <span class="copy-menu-item__icon">◫</span>前后对比图
      </button>
              <button class="copy-menu-item" @click="copyMenuVisible=false; copyPreview('before')">
                <span class="copy-menu-item__icon">◧</span>仅润色前
              </button>
              <button class="copy-menu-item" @click="copyMenuVisible=false; copyPreview('after')">
                <span class="copy-menu-item__icon">◨</span>仅润色后
      </button>
            </div>
          </Transition>
    </div>

        <!-- 缩放控件 -->
        <div class="zoom-control">
          <span class="zoom-label">{{ Math.round(previewZoom * 100) }}%</span>
          <input
            v-model.number="previewZoom"
            type="range"
            min="0.3"
            max="1.5"
            step="0.05"
            class="zoom-slider"
          />
        </div>
    </div>

      <!-- ─── 右侧：内容面板（白底仅在主体区；底部操作栏透明） ─── -->
      <div class="right-panel">
        <div class="right-panel-body">

        <!-- Tab 切换 -->
        <div class="right-tabs" @click="footerCollapsed = true; compareCollapsed = true">
          <button
            class="right-tab"
            :class="{ 'right-tab--active': activeTab === 'compare' }"
            @click="activeTab = 'compare'"
          >润色对比</button>
          <button
            class="right-tab"
            :class="{ 'right-tab--active': activeTab === 'analysis' }"
            @click="activeTab = 'analysis'"
          >润色解析</button>
        </div>

        <!-- Tab 内容（底部留白为悬浮操作栏预留滚动空间） -->
        <div
          class="right-content"
          :class="{ 'right-content--footer-expanded': !footerCollapsed }"
          @click="footerCollapsed = true; compareCollapsed = true"
        >

          <!-- 润色对比 -->
          <div v-if="activeTab === 'compare'" class="compare-list">
        <div
          v-for="(item, i) in store.polishList"
          :key="i"
          class="compare-item"
              :class="{ 'compare-item--polishing': repolishingIndex === i }"
        >
          <div class="compare-item__header" @click="toggleCompare(i)">
            <span class="compare-item__label">{{ item.moduleLabel }}</span>
            <div class="compare-item__meta">
                  <span v-if="repolishingIndex === i" class="repolish-tag">生成中...</span>
                  <span v-else class="word-count">{{ item.polishedText?.length || 0 }} 字</span>
                  <span class="compare-arrow" :class="{ 'compare-arrow--open': expandedIndex === i }">›</span>
            </div>
          </div>
          <div v-show="expandedIndex === i" class="compare-item__body">
            <div class="compare-col">
              <div class="compare-col__label">润色前</div>
              <div class="compare-col__text">{{ item.originalText }}</div>
            </div>
            <div class="compare-col">
                  <div class="compare-col__label compare-col__label--after">
                    润色后
                    <span class="compare-col__chars">{{ item.polishedText?.length || 0 }} 字</span>
            </div>
                  <div class="compare-col__text compare-col__text--after" style="position:relative;">
                    <div v-if="repolishingIndex === i" class="repolishing-mask">
                      <span class="repolish-spinner"></span>
                      <span class="repolish-tip">AI 重新润色中...</span>
          </div>
                    <template v-else>{{ item.polishedText }}</template>
        </div>
      </div>
                <!-- 五档字数调节 -->
                <div class="wc-slider-wrap">
                  <div class="wc-slider-top">
                    <span class="wc-slider-label">字数调节</span>
                    <span class="wc-adjust-count" :class="{ 'wc-count-low': (7 - (item.adjustCount || 0)) <= 2 }">
                      剩余 <b>{{ 7 - (item.adjustCount || 0) }}</b>/7 次
          </span>
        </div>
                  <div class="wc-slider">
                    <div
                      v-for="(lvLabel, lv) in LEVEL_LABELS"
                      :key="lv"
                      class="wc-tab"
                      :class="{
                        'wc-tab--active': lv === item.wordCountLevel,
                        'wc-tab--pending': lv === item.pendingLevel && lv !== item.wordCountLevel,
                        'wc-tab--normal': lv === 2
                      }"
                      @click="onLevelSelect(i, lv)"
                    >{{ lvLabel }}</div>
                  </div>
                  <div class="wc-slider-footer">
                    <span class="wc-slider-range">
                      预计：{{ item.pendingWordCountRange ? item.pendingWordCountRange.min : item.wordCountRange?.min }}-{{ item.pendingWordCountRange ? item.pendingWordCountRange.max : item.wordCountRange?.max }} 字
                    </span>
                    <button
                      v-if="item.pendingLevel !== null && item.pendingLevel !== undefined"
                      class="wc-confirm-btn"
                      :class="{ 'wc-confirm-btn--loading': repolishingIndex === i }"
                      :disabled="repolishingIndex !== -1"
                      @click.stop="onConfirmRepolish(i)"
                    >
                      {{ repolishingIndex === i ? '润色中...' : '重新润色' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="!store.polishList.length" class="empty-hint">暂无润色数据</div>
          </div>

          <!-- 润色解析 -->
          <div v-else-if="activeTab === 'analysis'" class="analysis-wrap">

            <!-- 未生成：引导手动触发 -->
            <template v-if="!store.summaryData && !analysisLoading">
              <div class="analysis-entry">
                <div class="analysis-entry__icon">✦</div>
                <div class="analysis-entry__title">润色解析</div>
                <div class="analysis-entry__desc">
                  调整完各模块字数后，点击生成按钮，AI 将基于最终润色结果给出完整的策略解析与面试建议
                </div>
                <button class="analysis-generate-btn" @click="generateAnalysis">
                  生成润色解析
                </button>
              </div>
            </template>

            <!-- 生成中 -->
            <template v-else-if="analysisLoading">
              <div class="analysis-entry">
                <div class="analysis-loading-spinner"></div>
                <div class="analysis-entry__title" style="margin-top:12px">AI 解析生成中...</div>
                <div class="analysis-entry__desc">正在分析润色策略，请稍候</div>
              </div>
            </template>

            <!-- 已生成：展示内容 -->
            <template v-else>
              <!-- 岗位分析 -->
              <div v-if="summaryObj.position_analysis" class="summary-section">
                <div class="summary-section__title">岗位分析</div>
                <p class="summary-section__text">{{ summaryObj.position_analysis }}</p>
              </div>
              <!-- 整体策略 -->
              <div v-if="summaryObj.overall_strategy" class="summary-section">
                <div class="summary-section__title">整体润色策略</div>
                <p class="summary-section__text">{{ summaryObj.overall_strategy }}</p>
              </div>
              <!-- 各模块优化重点 -->
              <div v-if="summaryObj.key_improvements?.length" class="summary-section">
                <div class="summary-section__title">各模块优化重点</div>
                <div
                  v-for="(item, i) in summaryObj.key_improvements"
          :key="i"
                  class="summary-improvement"
                >
                  <span class="summary-improvement__idx">{{ i + 1 }}</span>
                  <p class="summary-improvement__text">{{ item }}</p>
                </div>
              </div>
              <!-- 核心竞争力 -->
              <div v-if="summaryObj.core_strengths" class="summary-section">
                <div class="summary-section__title">核心竞争力</div>
                <p class="summary-section__text">{{ summaryObj.core_strengths }}</p>
              </div>
              <!-- 面试建议（岗位润色时有） -->
              <div v-if="summaryObj.interview_suggestions" class="summary-section">
                <div class="summary-section__title">面试建议</div>
                <p class="summary-section__text">{{ summaryObj.interview_suggestions }}</p>
              </div>
              <!-- 底部重新生成 -->
              <div class="analysis-regenerate">
                <button
                  class="analysis-regenerate-btn"
                  :disabled="analysisLoading"
                  @click="generateAnalysis"
                >重新生成解析</button>
              </div>
            </template>

          </div>

        </div>

        <!-- 重新生成简历浮动栏（有字数调整时显示，悬浮于内容底部） -->
        <Transition name="reapply-bar-fade">
          <div v-if="hasPolishAdjustments && activeTab === 'compare'" class="reapply-bar">
            <span class="reapply-hint">字数已调整，点击应用到简历</span>
            <div class="reapply-actions">
              <button
                type="button"
                class="reapply-cancel-btn"
                :disabled="isReapplying"
                @click="onCancelReapplyPrompt"
              >
                取消
              </button>
              <button
                type="button"
                class="reapply-btn"
                :disabled="isReapplying"
                @click="onReapplyPolish"
              >
                重新生成简历
              </button>
            </div>
          </div>
        </Transition>

        <!-- 底部操作栏：绝对定位叠在内容上，不挤压上方滚动区 -->
        <div
          class="right-footer"
          :class="{ 'right-footer--collapsed': footerCollapsed }"
          @click.stop
        >
          <button
            v-show="!(hasPolishAdjustments && activeTab === 'compare')"
            type="button"
            class="footer-toggle-btn"
            :title="footerCollapsed ? '展开操作栏' : '收起操作栏'"
            @click="footerCollapsed = !footerCollapsed"
          >
            <span class="footer-toggle-arrow" :class="{ 'footer-toggle-arrow--up': footerCollapsed }">‹</span>
          </button>
          <Transition name="footer-btns-fade">
            <div v-if="!footerCollapsed" class="footer-btns">
              <button type="button" class="footer-btn edit-btn" @click="openWpsEditor">
                <img class="footer-btn__icon" src="@images/icons/zaixiaotiaozheng.png" alt="" />
                <span>在线编辑</span>
              </button>
              <!-- 任务工单专属操作 -->
              <template v-if="commissionStore.activeOrderId">
                <button
                  type="button"
                  class="footer-btn commission-send-btn"
                  :disabled="isSendingPreview"
                  @click="sendPreviewToMiniprogram"
                >
                  <img class="footer-btn__icon" src="@images/icons/huichuanyulan.png" alt="" />
                  <span>{{ previewSent ? '已回传' : (isSendingPreview ? '回传中…' : '预览回传') }}</span>
                </button>
                <button
                  type="button"
                  class="footer-btn commission-save-btn"
                  :disabled="isSavingProgress"
                  @click="saveProgress"
                >
                  <img class="footer-btn__icon" src="@images/icons/baocuntuichu.png" alt="" />
                  <span>{{ isSavingProgress ? '保存中…' : '保存进度' }}</span>
                </button>
              </template>
              <button type="button" class="footer-btn restart-btn" @click="handleRestart">
                <img class="footer-btn__icon" src="@images/icons/chongxinkaishi.png" alt="" />
                <span>重新开始</span>
              </button>
              <button type="button" class="footer-btn footer-btn--primary bundle-entry-btn" @click="openBundleDialog">
                <img class="footer-btn__icon footer-btn__icon--primary" src="@images/icons/dabaodaochu.png" alt="" />
                <span>打包导出</span>
              </button>
            </div>
          </Transition>
        </div>

        </div>
        <!-- /right-panel-body -->

      </div>
    </div>
  </div>

  <!-- 重新回填简历加载弹窗 -->
  <Teleport to="body">
    <div v-if="isReapplying" class="reapply-overlay">
      <div class="reapply-modal">
        <div class="reapply-ring-wrap">
          <svg class="reapply-ring-svg" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="27" fill="none" stroke="#e8f0fe" stroke-width="5"/>
            <circle
              cx="32" cy="32" r="27" fill="none"
              stroke="#1565C0" stroke-width="5"
              stroke-linecap="round"
              stroke-dasharray="169.6"
              stroke-dashoffset="42"
              transform="rotate(-90 32 32)"
            />
          </svg>
          <span class="reapply-ring-icon">↺</span>
        </div>
        <div class="reapply-modal__title">正在重新生成简历</div>
        <div class="reapply-modal__hint">AI润色内容回填中，请稍候...</div>
      </div>
    </div>
  </Teleport>

  <!-- 打包导出弹窗 -->
  <Teleport to="body">
    <Transition name="bundle-overlay-fade">
      <div v-if="bundleDialogVisible" class="bundle-overlay" @click.self="closeBundleDialog">
        <div class="bundle-modal">

          <!-- 标题栏 -->
          <div class="bundle-modal__header">
            <span class="bundle-modal__title">打包导出</span>
            <button class="bundle-modal__close" :disabled="isBundling" @click="closeBundleDialog">×</button>
          </div>

          <!-- 全选 -->
          <div class="bundle-select-all">
            <label class="bundle-check-label" @click.prevent="toggleSelectAll">
              <span class="bundle-checkbox" :class="{ 'bundle-checkbox--checked': isAllSelected }">
                <span v-if="isAllSelected" class="bundle-checkbox__tick">✓</span>
            </span>
              <span>全选</span>
            </label>
            <span class="bundle-select-hint">已选 {{ selectedExports.length }} / {{ bundleOptions.filter(o=>o.available).length }} 项</span>
          </div>

          <!-- 选项列表 -->
          <div class="bundle-options">
            <div
              v-for="opt in bundleOptions"
              :key="opt.id"
              class="bundle-option"
              :class="{
                'bundle-option--selected': selectedExports.includes(opt.id),
                'bundle-option--disabled': !opt.available && opt.id !== 'analysis' && opt.id !== 'idphoto',
                'bundle-option--making': (opt.id === 'analysis' && analysisLoading)
              }"
              @click="opt.available ? toggleOption(opt.id) : null"
            >
              <span class="bundle-checkbox" :class="{ 'bundle-checkbox--checked': selectedExports.includes(opt.id) && opt.available }">
                <span v-if="selectedExports.includes(opt.id) && opt.available" class="bundle-checkbox__tick">✓</span>
                <!-- 润色解析生成中 spinner -->
                <span v-else-if="opt.id === 'analysis' && analysisLoading" class="bundle-making-spin"></span>
              </span>
              <img :src="opt.iconSrc" class="bundle-option__icon-img" alt="" />
              <div class="bundle-option__text">
                <span class="bundle-option__name">{{ opt.name }}</span>
                <span class="bundle-option__desc">
                  {{ opt.available ? opt.desc : (opt.id === 'analysis' && analysisLoading) ? '正在生成解析，请稍候...' : opt.unavailableDesc }}
                </span>
        </div>
              <!-- 润色解析：开始制作 -->
              <button
                v-if="!opt.available && opt.id === 'analysis' && !analysisLoading"
                class="bundle-make-btn"
                @click.stop="bundleGenerateAnalysis"
              >开始制作</button>
              <!-- 证件照：开始制作 -->
              <button
                v-if="!opt.available && opt.id === 'idphoto'"
                class="bundle-make-btn"
                @click.stop="openIdPhotoSubDialog"
              >开始制作</button>
      </div>
          </div>

          <!-- 底部操作 -->
          <div class="bundle-modal__footer">

            <!-- 进度提示 -->
            <div v-if="isBundling || isSendingEmail || isSendingResult" class="bundle-progress">
              <div class="bundle-progress__bar-wrap">
                <div class="bundle-progress__bar"></div>
              </div>
              <span class="bundle-progress__text">
                {{ isBundling ? bundleStatusText : isSendingEmail ? emailStatusText : '正在回传成品...' }}
              </span>
            </div>

            <!-- 主导出按钮 -->
            <button
              class="bundle-confirm-btn"
              :disabled="!selectedExports.length || isBundling || isSendingEmail || isSendingResult || _inExportAll"
              @click="runExportAll"
            >
              {{ (isBundling || isSendingEmail || isSendingResult || _inExportAll) ? '导出中，请稍候...' : `一键打包导出（${selectedExports.length} 项）` }}
            </button>

            <!-- 导出方式选择（多选） -->
            <div class="bundle-divider">
              <span class="bundle-divider__text">导出方式</span>
            </div>

            <div class="bundle-modes">

              <!-- 打包下载 -->
              <label class="bundle-mode-item" @click.prevent="exportModes.download = !exportModes.download">
                <span class="bundle-checkbox bundle-checkbox--sm" :class="{ 'bundle-checkbox--checked': exportModes.download }">
                  <span v-if="exportModes.download" class="bundle-checkbox__tick">✓</span>
                </span>
                <span class="bundle-mode-label">打包下载</span>
                <span class="bundle-mode-desc">保存 ZIP 到本地</span>
              </label>

              <!-- 打包邮发 -->
              <label class="bundle-mode-item" @click.prevent="exportModes.email = !exportModes.email">
                <span class="bundle-checkbox bundle-checkbox--sm" :class="{ 'bundle-checkbox--checked': exportModes.email }">
                  <span v-if="exportModes.email" class="bundle-checkbox__tick">✓</span>
                </span>
                <span class="bundle-mode-label">打包邮发</span>
                <span class="bundle-mode-desc">发送到收件邮箱</span>
              </label>

              <!-- 邮箱输入（打包邮发勾选时展开） -->
              <div v-if="exportModes.email" class="bundle-email-row bundle-email-row--indent">
                <input
                  v-model="emailAddress"
                  class="bundle-email-input"
                  type="email"
                  placeholder="输入收件人邮箱"
                  :disabled="isBundling || isSendingEmail || _inExportAll"
                  @keydown.enter="runExportAll"
                />
              </div>

              <!-- 打包回传（仅代做工单模式下显示） -->
              <label v-if="commissionStore.activeOrderId" class="bundle-mode-item" @click.prevent="exportModes.sendback = !exportModes.sendback">
                <span class="bundle-checkbox bundle-checkbox--sm" :class="{ 'bundle-checkbox--checked': exportModes.sendback }">
                  <span v-if="exportModes.sendback" class="bundle-checkbox__tick">✓</span>
                </span>
                <span class="bundle-mode-label">打包回传</span>
                <span class="bundle-mode-desc">同步至小程序订单详情</span>
              </label>

            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 证件照制作子弹窗（嵌套在打包流程内） -->
  <Teleport to="body">
    <Transition name="bundle-overlay-fade">
      <div v-if="idPhotoSubDialogVisible" class="bundle-idphoto-overlay">
        <div class="bundle-idphoto-modal">

          <!-- 顶部栏 -->
          <div class="bundle-idphoto-header">
            <button class="bundle-idphoto-back" @click="idPhotoSubDialogVisible = false">
              <span>←</span> 返回打包列表
            </button>
            <span class="bundle-idphoto-title">制作证件照</span>
            <div style="width:90px"></div>
          </div>

          <!-- 内嵌证件照制作组件 -->
          <div class="bundle-idphoto-content">
            <IDPhotoMaker />
          </div>

          <!-- 完成时底部确认栏 -->
          <Transition name="footer-btns-fade">
            <div v-if="idPhotoStore.phase === 'done'" class="bundle-idphoto-footer">
              <div class="bundle-idphoto-footer__hint">证件照制作完成，加入打包导出？</div>
              <button class="bundle-idphoto-confirm-btn" @click="confirmIdPhotoIntoBundle">
                ✓ 完成，加入打包
              </button>
            </div>
          </Transition>

        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- WPS 在线编辑弹窗 -->
  <WpsEditorModal
    :visible="wpsModalVisible"
    :file-key="store.polishedFileKey"
    :file-name="`${store.resumeName || '简历'}_优化版.docx`"
    @close="onWpsModalClose"
    @saved="onWpsSaved"
  />
</template>

<script setup>
import { ref, computed, reactive, onMounted, watch } from 'vue'

// 点击外部关闭指令（用于复制预览下拉菜单）
const vClickOutside = {
  mounted(el, binding) {
    el._clickOutsideHandler = (e) => { if (!el.contains(e.target)) binding.value(e) }
    document.addEventListener('mousedown', el._clickOutsideHandler)
  },
  unmounted(el) { document.removeEventListener('mousedown', el._clickOutsideHandler) }
}
import { ElMessage, ElMessageBox } from 'element-plus'
import { useResumeEnhanceStore } from '@/stores/resumeEnhance'
import { downloadWordFile, replaceByParagraph } from '@/api/word'
import { enhancePolishSection, enhanceOptimizationSummary } from '@/api/ai'
import { levelToWordCountRange } from '@/composables/useResumePolish'
import WpsEditorModal from './WpsEditorModal.vue'
import IDPhotoMaker from '@/components/tools/IDPhotoMaker.vue'
import { preloadWpsSdk, preWarmWpsConfig, clearWpsConfigCache } from '@/utils/wpsSdk'
import { getFileBase64, getUrlBase64, wordToPdf } from '@/api/docProcessor'
import { sendBundleEmail as apiSendBundleEmail } from '@/api/tools'
import { useIDPhotoStore } from '@/stores/idPhoto'
import { useWorkorderStore }  from '@/stores/workorder'
import { useCommissionStore } from '@/stores/commission'
import { apiCompleteCommissionOrder, apiSaveCommissionProgress, apiSendCommissionPreview, apiSendCommissionResult } from '@/api/commission'

const emit = defineEmits(['save-and-exit'])

const store           = useResumeEnhanceStore()
const idPhotoStore    = useIDPhotoStore()
const workorderStore  = useWorkorderStore()
const commissionStore = useCommissionStore()

const LEVEL_LABELS = ['精简', '较短', '正常', '较长', '超长']
const ADJUST_LIMIT = 7

const activeTab = ref('compare')
const expandedIndex = ref(-1)
const previewZoom = ref(0.95)
const repolishingIndex = ref(-1)
const hasPolishAdjustments = ref(false)
const isReapplying = ref(false)
const analysisLoading = ref(false)
const footerCollapsed = ref(false)
const copyingPreview = ref(false)
const copyMenuVisible = ref(false)
const previewAreaRef = ref(null)
const compareCollapsed = ref(false)

// 任务工单：保存进度 / 回传小程序
const isSavingProgress  = ref(false)
const isSendingPreview  = ref(false)
const previewSent       = ref(false)   // 本次已回传过，按钮变为"已回传"

// 打包导出
const bundleDialogVisible = ref(false)
const isBundling = ref(false)
const bundleStatusText = ref('')
const selectedExports = ref([])
const idPhotoSubDialogVisible = ref(false)
const emailAddress = ref('')
const isSendingEmail = ref(false)
const emailStatusText = ref('')

// 回传成品到小程序
const isSendingResult = ref(false)

// ── 统一导出模式选项（三选多） ─────────────────────────────────────────────
const exportModes = reactive({ download: true, email: false, sendback: false })
// 内部标志：当前是否在 runExportAll 统一流程中执行（用于跳过各子函数的关闭/通知逻辑）
const _inExportAll = ref(false)

// 润色解析完成后自动勾选
watch(() => store.summaryData, (val) => {
  if (val && bundleDialogVisible.value && !selectedExports.value.includes('analysis')) {
    selectedExports.value.push('analysis')
  }
})

// 证件照完成后自动勾选
watch(() => idPhotoStore.phase, (phase) => {
  if (phase === 'done' && bundleDialogVisible.value && !selectedExports.value.includes('idphoto')) {
    selectedExports.value.push('idphoto')
  }
})

const bundleOptions = computed(() => {
  const hasWord   = !!store.polishedFileKey
  const hasImages = store.polishedPreviewUrls.length > 0
  const hasAnalysis = !!store.summaryData
  const hasIdPhoto = !!(idPhotoStore.resultImageUrl || idPhotoStore.downloadUrl)
  return [
    {
      id: 'word',
      name: '简历成品 Word',
      iconSrc: '/images/daochu_word.png',
      desc: '可二次编辑的 .docx 格式',
      unavailableDesc: '暂无润色文档',
      available: hasWord
    },
    {
      id: 'pdf',
      name: '简历成品 PDF',
      iconSrc: '/images/daochu_pdf.png',
      desc: '由预览图合成的 PDF（便于查阅）',
      unavailableDesc: '暂无预览图，无法生成 PDF',
      available: hasImages
    },
    {
      id: 'images',
      name: '简历成品图片',
      iconSrc: '/images/daochu_image.png',
      desc: `共 ${store.polishedPreviewUrls.length} 张 PNG 预览图`,
      unavailableDesc: '暂无预览图',
      available: hasImages
    },
    {
      id: 'analysis',
      name: '简历润色解析',
      iconSrc: '/images/daochu_baogao.png',
      desc: '润色策略 & 面试建议文本报告',
      unavailableDesc: '尚未生成润色解析，请先在"润色解析"页生成',
      available: hasAnalysis
    },
    {
      id: 'idphoto',
      name: '简历证件照',
      iconSrc: '/images/daochu_zhengjianzhao.png',
      desc: '由工具箱证件照功能制作的成品照',
      unavailableDesc: '尚未制作证件照，请先使用工具箱→证件照功能',
      available: hasIdPhoto
    }
  ]
})

const isAllSelected = computed(() => {
  const available = bundleOptions.value.filter(o => o.available).map(o => o.id)
  return available.length > 0 && available.every(id => selectedExports.value.includes(id))
})

function openBundleDialog() {
  selectedExports.value = bundleOptions.value.filter(o => o.available).map(o => o.id)
  bundleDialogVisible.value = true
  // 代做工单模式：自动预填客户收件邮箱 + 默认勾选邮发和回传
  if (commissionStore.activeOrderId) {
    if (!emailAddress.value && commissionStore.activeOrderData?.email) {
      emailAddress.value = commissionStore.activeOrderData.email
    }
    exportModes.email    = true
    exportModes.sendback = true
  }
}

function closeBundleDialog() {
  if (isBundling.value) return
  bundleDialogVisible.value = false
}

/** 在打包弹窗内触发润色解析生成 */
async function bundleGenerateAnalysis() {
  await generateAnalysis()
}

/** 证件照完成后确认加入打包 */
function confirmIdPhotoIntoBundle() {
  if (!selectedExports.value.includes('idphoto')) {
    selectedExports.value.push('idphoto')
  }
  idPhotoSubDialogVisible.value = false
}

/** 打开证件照子弹窗（若已有成品则不重置） */
function openIdPhotoSubDialog() {
  if (idPhotoStore.phase !== 'done') {
    idPhotoStore.reset()
  }
  idPhotoSubDialogVisible.value = true
}

function toggleSelectAll() {
  const available = bundleOptions.value.filter(o => o.available).map(o => o.id)
  selectedExports.value = isAllSelected.value ? [] : [...available]
}

function toggleOption(id) {
  const opt = bundleOptions.value.find(o => o.id === id)
  if (!opt?.available) return
  const idx = selectedExports.value.indexOf(id)
  if (idx >= 0) selectedExports.value.splice(idx, 1)
  else selectedExports.value.push(id)
}

/** 生成润色解析文本 */
function buildAnalysisText() {
  const d = store.summaryData
  if (!d) return ''
  const obj = typeof d === 'string' ? (() => { try { return JSON.parse(d) } catch { return { overall_strategy: d } } })() : d
  const lines = [`简历润色解析报告`, `生成时间：${new Date().toLocaleString('zh-CN')}`, '']
  if (obj.position_analysis)    lines.push('【岗位分析】', obj.position_analysis, '')
  if (obj.overall_strategy)     lines.push('【整体润色策略】', obj.overall_strategy, '')
  if (obj.key_improvements?.length) {
    lines.push('【各模块优化重点】')
    obj.key_improvements.forEach((item, i) => lines.push(`${i + 1}. ${item}`))
    lines.push('')
  }
  if (obj.core_strengths)       lines.push('【核心竞争力】', obj.core_strengths, '')
  if (obj.interview_suggestions) lines.push('【面试建议】', obj.interview_suggestions, '')
  return lines.join('\n')
}

/** base64 字符串 → Uint8Array */
function base64ToUint8Array(b64) {
  const binary = atob(b64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return arr
}

/** 主打包导出逻辑 */
async function runBundleExport() {
  if (!selectedExports.value.length || isBundling.value) return
  isBundling.value = true
  bundleStatusText.value = '初始化打包...'

  try {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const name = store.resumeName || '简历'
    const sel = selectedExports.value

    // ── Word ──────────────────────────────────────────────────────
    if (sel.includes('word') && store.polishedFileKey) {
      bundleStatusText.value = '正在获取 Word 文件...'
      const res = await getFileBase64({ fileKey: store.polishedFileKey })
      if (res?.success) zip.file(`${name}_成品.docx`, base64ToUint8Array(res.base64))
    }

    // ── 预览图 & PDF（共用同一批图片数据）────────────────────────
    const fetchImages = sel.includes('pdf') || sel.includes('images')
    const imageDataList = []   // [{ base64, mimeType }]

    if (fetchImages && store.polishedPreviewUrls.length) {
      for (let i = 0; i < store.polishedPreviewUrls.length; i++) {
        bundleStatusText.value = `正在获取预览图 ${i + 1}/${store.polishedPreviewUrls.length}...`
        const res = await getUrlBase64({ url: store.polishedPreviewUrls[i] })
        if (res?.success) imageDataList.push({ base64: res.base64, mimeType: res.mimeType })
      }
    }

    // ── 图片打包 ─────────────────────────────────────────────────
    if (sel.includes('images') && imageDataList.length) {
      bundleStatusText.value = '正在添加预览图...'
      const imgFolder = imageDataList.length > 1 ? zip.folder(`${name}_预览图`) : zip
      imageDataList.forEach((img, i) => {
        const ext = img.mimeType?.includes('png') ? 'png' : 'jpg'
        const fname = imageDataList.length > 1 ? `第${i + 1}页.${ext}` : `${name}_成品.${ext}`
        imgFolder.file(fname, base64ToUint8Array(img.base64))
      })
    }

    // ── PDF（用 jsPDF 将预览图组合为 PDF）───────────────────────
    if (sel.includes('pdf') && imageDataList.length) {
      bundleStatusText.value = '正在生成 PDF...'
      const { jsPDF } = await import('jspdf')
      // 先解析第一张图获取尺寸确定页面方向
      const firstImg = new Image()
      await new Promise(resolve => {
        firstImg.onload = resolve
        firstImg.src = `data:${imageDataList[0].mimeType};base64,${imageDataList[0].base64}`
      })
      const isLandscape = firstImg.width > firstImg.height
      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4'
      })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()

      for (let i = 0; i < imageDataList.length; i++) {
        if (i > 0) pdf.addPage()
        const { base64, mimeType } = imageDataList[i]
        const imgData = `data:${mimeType};base64,${base64}`
        pdf.addImage(imgData, mimeType.includes('png') ? 'PNG' : 'JPEG', 0, 0, pdfW, pdfH)
      }
      const pdfBytes = pdf.output('arraybuffer')
      zip.file(`${name}_成品.pdf`, pdfBytes)
    }

    // ── 润色解析文本 ──────────────────────────────────────────────
    if (sel.includes('analysis') && store.summaryData) {
      bundleStatusText.value = '正在生成润色解析...'
      zip.file(`${name}_润色解析.txt`, buildAnalysisText())
    }

    // ── 证件照 ────────────────────────────────────────────────────
    if (sel.includes('idphoto')) {
      const photoUrl = idPhotoStore.downloadUrl || idPhotoStore.resultImageUrl
      if (photoUrl) {
        bundleStatusText.value = '正在获取证件照...'
        const res = await getUrlBase64({ url: photoUrl })
        if (res?.success) {
          const ext = res.mimeType?.includes('png') ? 'png' : 'jpg'
          zip.file(`${name}_证件照.${ext}`, base64ToUint8Array(res.base64))
        }
      }
    }

    // ── 生成 ZIP ─────────────────────────────────────────────────
    bundleStatusText.value = '正在压缩打包...'
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    const dlUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = dlUrl
    a.download = `${name}_成品交付包.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(dlUrl)

    // 更新工单状态为"已导出"（静默）
    workorderStore.updateStatus({
      status:              'exported',
      polishedFileKey:     store.polishedFileKey,
      polishedPreviewUrls: store.polishedPreviewUrls,
    })

    // 单独调用时：提示成功 + 关闭弹窗
    // runExportAll 中调用时跳过（由 runExportAll 统一处理）
    if (!_inExportAll.value) {
      ElMessage.success('打包导出成功！')
      bundleDialogVisible.value = false
    }
  } catch (err) {
    console.error('[DoneStage] 打包导出失败:', err)
    ElMessage.error('打包失败：' + (err.message || '请重试'))
  } finally {
    isBundling.value = false
    bundleStatusText.value = ''
  }
}

// ── 任务工单：保存进度 ────────────────────────────────────────────────────────
async function saveProgress() {
  if (!commissionStore.activeOrderId || isSavingProgress.value) return
  try {
    await ElMessageBox.confirm(
      '保存当前润色对比页进度，退出后可在任务工单「制作中」列表点击「继续制作」恢复。',
      '保存进度',
      { confirmButtonText: '保存并退出', cancelButtonText: '取消', type: 'info' }
    )
  } catch { return }

  isSavingProgress.value = true
  try {
    const progressData = {
      stage:               'done',
      polishMode:          store.polishMode,
      targetPosition:      store.targetPosition,
      polishingIntensity:  store.polishingIntensity,
      userIdentity:        store.userIdentity,
      jobDescription:      store.jobDescription,
      resumeName:          store.resumeName,
      uploadedFileName:    store.uploadedFileName,
      uploadedFileKey:     store.uploadedFileKey,
      uploadedFileId:      store.uploadedFileId,
      analysisResult:      store.analysisResult,
      scoreLevel:          store.scoreLevel,
      scoreValue:          store.scoreValue,
      radarData:           store.radarData,
      radarIndustryAvg:    store.radarIndustryAvg,
      summaryData:         store.summaryData,
      polishList:          store.polishList,
      polishedCount:       store.polishedCount,
      originalPreviewUrls: store.originalPreviewUrls,
      polishedPreviewUrls: store.polishedPreviewUrls,
      polishedFileKey:     store.polishedFileKey,
      workorderId:         workorderStore.currentId || '',
    }
    await apiSaveCommissionProgress({ _id: commissionStore.activeOrderId, savedProgress: progressData })
    commissionStore.clearActiveOrder()
    ElMessage.success('进度已保存，可在任务工单中继续制作')
    emit('save-and-exit')
  } catch (err) {
    ElMessage.error('保存失败：' + (err.message || '请重试'))
  } finally {
    isSavingProgress.value = false
  }
}

// ── 任务工单：回传小程序 ──────────────────────────────────────────────────────
async function sendPreviewToMiniprogram() {
  if (!commissionStore.activeOrderId || isSendingPreview.value) return

  // Step 1: 询问是否附带润色解析报告
  let includeAnalysis = false
  try {
    await ElMessageBox.confirm(
      '是否将润色解析报告（整体润色策略、各模块优化重点、面试建议等）一起回传给客户？\n' +
      '点击「连同润色解析」将自动生成并回传；点击「仅回传预览图」则只发送对比预览图。',
      '回传小程序',
      {
        confirmButtonText:  '连同润色解析',
        cancelButtonText:   '仅回传预览图',
        distinguishCancelAndClose: true,
        type: 'info',
      }
    )
    includeAnalysis = true
  } catch (action) {
    if (action === 'cancel') {
      includeAnalysis = false   // 用户选了"仅回传预览图"
    } else {
      return   // 用户点了 × 关闭，不执行回传
    }
  }

  isSendingPreview.value = true
  try {
    // Step 2: 若需要润色解析且尚未生成，先调 AI 生成
    let analysisReport = null
    if (includeAnalysis) {
      if (!store.summaryData) {
        if (!store.polishList?.length) {
          ElMessage.warning('暂无润色数据，无法生成润色解析，将仅回传预览图')
          includeAnalysis = false
        } else {
          ElMessage.info('正在生成润色解析报告，请稍候…')
          await generateAnalysis()   // 等待 AI 生成完成
        }
      }
      if (store.summaryData) {
        analysisReport = store.summaryData  // 即 summaryObj（包含各分析章节）
      }
    }

    await apiSendCommissionPreview({
      _id:                commissionStore.activeOrderId,
      clientPreviewUrls:  store.polishedPreviewUrls  || [],
      clientOriginalUrls: store.originalPreviewUrls  || [],
      // 评分圈数据（始终回传，给客户看综合分）
      clientAnalysis: store.analysisResult
        ? { scoreValue: store.scoreValue, scoreLevel: store.scoreLevel }
        : null,
      // 润色解析报告（summaryData 对象）：仅在用户同意时包含
      clientAnalysisReport: analysisReport,
    })
    previewSent.value = true
    ElMessage.success(
      includeAnalysis && analysisReport
        ? '已回传预览图和润色解析报告，客户可在订单详情查看'
        : '已回传预览图，客户可在订单详情查看对比预览'
    )
  } catch (err) {
    ElMessage.error('回传失败：' + (err.message || '请重试'))
  } finally {
    isSendingPreview.value = false
  }
}

// WPS 在线编辑弹窗
const wpsModalVisible = ref(false)

// 组件挂载时立即预加载 WPS SDK（最高优先级 preload）
onMounted(() => { preloadWpsSdk() })

// 监听 polishedFileKey：润色完成后立即预取 WPS 打开配置，消除点击等待
watch(() => store.polishedFileKey, (fileKey) => {
  if (fileKey) preWarmWpsConfig(fileKey)
}, { immediate: true })

function openWpsEditor() {
  if (!store.polishedFileKey) {
    ElMessage.warning('暂无可编辑的文档，请先完成润色')
    return
  }
  wpsModalVisible.value = true
}

function onWpsModalClose() {
  wpsModalVisible.value = false
}

async function onWpsSaved({ fileKey }) {
  // 文档已被 WPS 保存更新，清除旧配置缓存，下次打开时重新预取
  clearWpsConfigCache()
  ElMessage.success('编辑已保存，正在更新预览...')
  // 异步刷新预览图（不阻塞 UI）
  try {
    const { getEditedPreview } = await import('@/api/docProcessor.js')
    const res = await getEditedPreview({ fileKey })
    if (res?.success) {
      if (res.previewImageUrls?.length) {
        store.polishedPreviewUrls = res.previewImageUrls
      } else if (res.previewImageUrl) {
        store.polishedPreviewUrls = [res.previewImageUrl]
      }
      if (store.polishedPreviewUrls.length) ElMessage.success('预览已更新')
    }
  } catch (err) {
    console.warn('[DoneStage] WPS 保存后预览刷新失败（不影响文档）:', err.message)
  }
}

const summaryObj = computed(() => {
  const d = store.summaryData
  if (!d) return {}
  if (typeof d === 'string') {
    try { return JSON.parse(d) } catch { return { overall_strategy: d } }
  }
  return d
})

/** 打包邮件发送 */
async function runEmailSend() {
  const email = emailAddress.value.trim()
  if (!email) { ElMessage.warning('请输入收件人邮箱'); return }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { ElMessage.warning('邮箱格式不正确'); return }
  if (!selectedExports.value.length) { ElMessage.warning('请至少选择一项导出内容'); return }
  if (isSendingEmail.value || isBundling.value) return

  isSendingEmail.value = true
  emailStatusText.value = '正在组装文件信息...'

  try {
    const sel = selectedExports.value
    const selectedItems = []

    if (sel.includes('word') && store.polishedFileKey) {
      selectedItems.push({ type: 'word', fileKey: store.polishedFileKey })
    }
    if (sel.includes('pdf') && store.polishedPreviewUrls.length) {
      selectedItems.push({ type: 'pdf', urls: store.polishedPreviewUrls })
    }
    if (sel.includes('images') && store.polishedPreviewUrls.length) {
      selectedItems.push({ type: 'images', urls: store.polishedPreviewUrls })
    }
    if (sel.includes('analysis') && store.summaryData) {
      selectedItems.push({ type: 'analysis', text: buildAnalysisText() })
    }
    if (sel.includes('idphoto')) {
      const photoUrl = idPhotoStore.downloadUrl || idPhotoStore.resultImageUrl
      if (photoUrl) selectedItems.push({ type: 'idphoto', url: photoUrl })
    }

    if (!selectedItems.length) {
      ElMessage.warning('所选内容暂无可发送的文件')
      return
    }

    emailStatusText.value = '云函数打包中，请稍候（可能需要30秒）...'
    const res = await apiSendBundleEmail({
      recipientEmail: email,
      resumeName: store.resumeName || '简历',
      selectedItems
    })

    if (res?.success) {
      // 更新工单状态（始终执行）
      workorderStore.updateStatus({
        status:              'exported',
        polishedFileKey:     store.polishedFileKey,
        polishedPreviewUrls: store.polishedPreviewUrls,
      })
      // 单独调用时提示+关闭；runExportAll 中由外层统一处理
      if (!_inExportAll.value) {
        ElMessage.success(`邮件已发送至 ${email}`)
        bundleDialogVisible.value = false
      }
    } else {
      ElMessage.error(res?.message || '发送失败，请重试')
    }
  } catch (err) {
    console.error('[DoneStage] 邮件发送失败:', err)
    ElMessage.error('发送失败：' + (err.message || '请重试'))
  } finally {
    isSendingEmail.value = false
    emailStatusText.value = ''
  }
}

/**
 * 调用 doc_processor_web word_to_pdf action 将 Word 转换为 PDF
 * 返回 COS 上公共可访问的 HTTPS URL（直接用于小程序下载，无需再兑换临时链接）
 */
async function convertWordToPdfUrl(wordFileKey, orderId) {
  if (!wordFileKey) return null
  try {
    const res = await wordToPdf({ wordFileKey, orderId })
    if (res?.success && res?.pdfUrl) {
      console.log('[DoneStage] Word→PDF 转换成功, pdfUrl:', res.pdfUrl)
      return res.pdfUrl
    }
    console.warn('[DoneStage] Word→PDF 返回异常:', res)
    return null
  } catch (e) {
    console.error('[DoneStage] Word→PDF 失败:', e?.message || e)
    return null
  }
}

/** 回传成品信息至小程序订单详情（在「成品下载」区域展示） */
async function runSendResult() {
  if (!commissionStore.activeOrderId || isSendingResult.value) return

  const sel = selectedExports.value
  const idPhotoUrl = idPhotoStore.downloadUrl || idPhotoStore.resultImageUrl || null

  // 构建回传的成品项列表（所有5个维度，available=是否被选中导出）
  const clientResultItems = bundleOptions.value.map(opt => ({
    id:        opt.id,
    label:     opt.name,
    available: sel.includes(opt.id) && opt.available,
  }))

  isSendingResult.value = true

  // PDF 文件：通过 word_to_pdf 云函数将 Word 直接转换为真实 PDF 文件（COS 公共 URL）
  let resultPdfUrl = null
  if (sel.includes('pdf') && store.polishedFileKey) {
    ElMessage.info('正在将 Word 转换为 PDF，请稍候…')
    resultPdfUrl = await convertWordToPdfUrl(store.polishedFileKey, commissionStore.activeOrderId)
    if (!resultPdfUrl) ElMessage.warning('PDF 转换失败，其他内容仍会正常回传')
  }

  try {
    await apiSendCommissionResult({
      _id:               commissionStore.activeOrderId,
      clientResultItems,
      clientIdPhotoUrl:  sel.includes('idphoto') ? idPhotoUrl : null,
      // Word 文件：优先传直接 HTTPS URL，再传 CloudBase 文件 ID（供小程序端 getTempFileURL 兑换）
      resultWordUrl:     sel.includes('word') ? (store.polishedDownloadUrl || null)  : null,
      resultWordFileKey: sel.includes('word') ? (store.polishedFileKey     || null)  : null,
      // PDF 文件：由 Word 转换而来的真实 PDF，COS 公共 HTTPS URL，供小程序直接下载
      resultPdfUrl:      resultPdfUrl,
      resultPdfFileKey:  null,
      // 预览图：images 选中时写入 clientPreviewUrls（供小程序端直接使用，无需单独回传对比图）
      resultPreviewUrls: sel.includes('images') ? (store.polishedPreviewUrls || [])  : null,
      resultAnalysisUrl: null,
    })
    if (!_inExportAll.value) {
      ElMessage.success('成品已回传至小程序，客户可在订单详情「成品下载」区查看')
      bundleDialogVisible.value = false
    }
  } catch (err) {
    console.error('[DoneStage] 回传成品失败:', err)
    ElMessage.error('回传失败：' + (err?.message || '请重试'))
  } finally {
    isSendingResult.value = false
  }
}

/**
 * 统一导出入口：按勾选的模式（下载 / 邮发 / 回传）依次执行，最后统一处理代做工单完成状态
 */
async function runExportAll() {
  if (!selectedExports.value.length) { ElMessage.warning('请至少选择一项内容'); return }
  const { download, email, sendback } = exportModes
  if (!download && !email && !sendback) { ElMessage.warning('请至少选择一种导出方式'); return }

  const emailVal = emailAddress.value.trim()
  if (email) {
    if (!emailVal) { ElMessage.warning('请输入收件人邮箱'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) { ElMessage.warning('邮箱格式不正确'); return }
  }

  _inExportAll.value = true
  // 保存代做工单 ID，runBundleExport 内部不再清除它
  const savedOrderId = commissionStore.activeOrderId

  const results = []    // 记录哪些步骤成功
  const errors  = []    // 记录哪些步骤失败

  try {
    // 1. 本地打包下载
    if (download) {
      try {
        await runBundleExport()
        results.push('打包下载')
      } catch { errors.push('打包下载') }
    }

    // 2. 邮件发送
    if (email) {
      try {
        await runEmailSend()
        results.push('邮件发送')
      } catch { errors.push('邮件发送') }
    }

    // 3. 回传小程序
    if (sendback && commissionStore.activeOrderId) {
      try {
        await runSendResult()
        results.push('回传小程序')
      } catch { errors.push('回传小程序') }
    }

    // 4. 代做工单：导出成功后自动标记完成（从「制作中」流转到「已完成」）
    if (results.length && savedOrderId) {
      try {
        await apiCompleteCommissionOrder({
          _id: savedOrderId,
          resultFileKey: store.polishedFileKey || '',
          resultPreviewUrls: store.polishedPreviewUrls || [],
          linkedWorkorderId: workorderStore.currentId || '',
        })
      } catch (e) {
        errors.push('工单完结')
        console.error('[DoneStage] 完结任务工单失败:', e)
      }
    }

    // 5. 汇总提示 + 关闭弹窗
    if (results.length) {
      const msg = results.join(' + ') + ' 完成' + (errors.length ? `，${errors.join('/')} 失败` : '')
      ElMessage.success(msg)
      bundleDialogVisible.value = false
    } else {
      ElMessage.error('所有导出方式均失败，请重试')
    }
  } finally {
    _inExportAll.value = false
  }
}

/** 手动生成润色解析（基于当前最终润色结果） */
async function generateAnalysis() {
  if (analysisLoading.value) return
  if (!store.polishList.length) {
    ElMessage.warning('暂无润色数据')
    return
  }
  analysisLoading.value = true
  store.summaryData = null
  try {
    const isSelfMode = store.polishMode === 'self'
    const res = await enhanceOptimizationSummary({
      polishedList: store.polishList.map(i => ({
        moduleType: i.moduleKey,
        moduleLabel: i.moduleLabel,
        originalText: i.originalText,
        polishedText: i.polishedText,
        status: 'done'
      })),
      polishMode: store.polishMode,
      targetPosition: isSelfMode ? '' : store.targetPosition,
      targetPositionJD: isSelfMode ? '' : store.jobDescription,
      polishingIntensity: store.polishingIntensity
    })
    if (res?.success) {
      store.summaryData = res.optimizationSummary || res.summary || null
      ElMessage.success('润色解析已生成')
    } else {
      ElMessage.error('生成失败，请重试')
    }
  } catch {
    ElMessage.error('网络错误，请稍后重试')
  } finally {
    analysisLoading.value = false
  }
}

/** 将图片 URL 通过代理获取并解码为 HTMLImageElement */
async function fetchProxiedImage(url) {
  const res = await getUrlBase64({ url })
  if (!res?.success) throw new Error('图片代理获取失败')
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = `data:${res.mimeType || 'image/jpeg'};base64,${res.base64}`
  })
}

/** 复制润色前后对比图（带水印）到剪贴板 */
/**
 * 复制预览图到剪贴板（含水印）
 * mode: 'both' 前后对比 | 'before' 仅润色前 | 'after' 仅润色后
 */
async function copyPreview(mode = 'both') {
  if (copyingPreview.value) return

  const needOrig    = mode === 'both' || mode === 'before'
  const needPolish  = mode === 'both' || mode === 'after'
  const hasOrig     = store.originalPreviewUrls.length > 0
  const hasPolished = store.polishedPreviewUrls.length > 0

  if (needOrig && !hasOrig)    { ElMessage.warning('暂无润色前预览图'); return }
  if (needPolish && !hasPolished) { ElMessage.warning('暂无润色后预览图'); return }

  const modeLabel = { both: '前后对比图', before: '润色前预览图', after: '润色后预览图' }[mode]

  copyingPreview.value = true
  ElMessage.info(`正在生成${modeLabel}，请稍候...`)

  try {
    // ── 获取所需图片 ──────────────────────────────────────────────────────
    const [origImgs, polishImgs] = await Promise.all([
      needOrig   ? Promise.all(store.originalPreviewUrls.map(fetchProxiedImage))  : Promise.resolve([]),
      needPolish ? Promise.all(store.polishedPreviewUrls.map(fetchProxiedImage)) : Promise.resolve([]),
    ])

    // ── 画布尺寸计算 ──────────────────────────────────────────────────────
    const COL_W   = 700
    const HDR_H   = 48
    const IMG_GAP = 10
    const PAD     = 20
    const COL_GAP = 20
    const COLS    = (needOrig && hasOrig ? 1 : 0) + (needPolish && hasPolished ? 1 : 0)

    const calcImgH    = (img) => img.naturalHeight * (COL_W / img.naturalWidth)
    const colContentH = (imgs) => imgs.length
      ? imgs.reduce((s, img) => s + calcImgH(img) + IMG_GAP, 0) - IMG_GAP
      : 0

    const maxContentH = Math.max(
      needOrig    && origImgs.length   ? colContentH(origImgs)   : 0,
      needPolish  && polishImgs.length ? colContentH(polishImgs) : 0,
    )

    const canvasW = PAD * 2 + COL_W * COLS + COL_GAP * (COLS - 1)
    const canvasH = PAD * 2 + HDR_H + maxContentH + 28

    const canvas = document.createElement('canvas')
    canvas.width  = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')

    // ── 背景 ──────────────────────────────────────────────────────────────
    ctx.fillStyle = '#f0f4f8'
    ctx.fillRect(0, 0, canvasW, canvasH)

    // ── 绘制单列 ─────────────────────────────────────────────────────────
    const drawCol = (imgs, x, label, isAfter) => {
      const bgColor = isAfter ? '#1565C0' : '#6b7280'
      ctx.fillStyle = bgColor
      ctx.beginPath()
      ctx.roundRect(x, PAD, COL_W, HDR_H, [8, 8, 0, 0])
      ctx.fill()
      ctx.fillStyle    = '#fff'
      ctx.font         = 'bold 16px "PingFang SC","Microsoft YaHei",Arial,sans-serif'
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, x + COL_W / 2, PAD + HDR_H / 2)

      // 白色底板
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.roundRect(x, PAD + HDR_H, COL_W, canvasH - PAD - HDR_H - PAD, [0, 0, 8, 8])
      ctx.fill()

      // 图片
      let y = PAD + HDR_H + IMG_GAP
      imgs.forEach(img => {
        const h = calcImgH(img)
        ctx.drawImage(img, x, y, COL_W, h)
        y += h + IMG_GAP
      })
    }

    let colX = PAD
    if (needOrig    && origImgs.length)   { drawCol(origImgs,   colX, '润色前', false); colX += COL_W + COL_GAP }
    if (needPolish  && polishImgs.length) { drawCol(polishImgs, colX, '润色后', true) }

    // ── 水印（对角重复）────────────────────────────────────────────────────
    const wText  = `天鹿文化工作室·${store.resumeName || ''}`
    const stepX  = 300, stepY = 155
    ctx.save()
    ctx.globalAlpha  = 0.09
    ctx.fillStyle    = '#1a1a2e'
    ctx.font         = 'bold 26px "PingFang SC","Microsoft YaHei",Arial,sans-serif'
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    for (let wy = 0; wy < canvasH + stepY; wy += stepY) {
      for (let wx = -stepX / 2; wx < canvasW + stepX; wx += stepX) {
        ctx.save()
        ctx.translate(wx, wy)
        ctx.rotate(-Math.PI / 7)
        ctx.fillText(wText, 0, 0)
        ctx.restore()
      }
    }
    ctx.restore()

    // ── 版权脚注 ─────────────────────────────────────────────────────────
    ctx.fillStyle    = 'rgba(0,0,0,0.22)'
    ctx.font         = '13px "PingFang SC",Arial,sans-serif'
    ctx.textAlign    = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText('天鹿文化工作室 出品', canvasW - PAD, canvasH - 7)

    // ── 写入剪贴板（不支持则降级下载）────────────────────────────────────
    const fileLabel = { both: '润色对比', before: '润色前', after: '润色后' }[mode]
    await new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          ElMessage.success(`✓ ${modeLabel}已复制到剪贴板，可直接粘贴分享`)
        } catch {
          const url = URL.createObjectURL(blob)
          const a   = document.createElement('a')
          a.href     = url
          a.download = `${store.resumeName || '简历'}_${fileLabel}.png`
          document.body.appendChild(a); a.click(); document.body.removeChild(a)
          URL.revokeObjectURL(url)
          ElMessage.success('剪贴板不可用，已自动下载图片')
        }
        resolve()
      }, 'image/png')
    })

  } catch (err) {
    console.error('[DoneStage] copyPreview 失败:', err)
    ElMessage.error('生成失败：' + (err.message || '请重试'))
  } finally {
    copyingPreview.value = false
  }
}

function toggleCompare(i) {
  expandedIndex.value = expandedIndex.value === i ? -1 : i
}

function openImagePreview(url) {
  window.open(url, '_blank')
}

/** 选择档位（仅标记待确认，不立即润色） */
function onLevelSelect(index, level) {
  const item = store.polishList[index]
  if (!item || item.status !== 'done' || repolishingIndex.value !== -1) return
  if ((item.adjustCount || 0) >= ADJUST_LIMIT) {
    ElMessage.warning('该模块本周期调整次数已用完，导出后可重置')
    return
  }
  const list = [...store.polishList]
  if (level === item.wordCountLevel) {
    // 点击当前已确认档位 → 取消待确认
    list[index] = { ...list[index], pendingLevel: null, pendingWordCountRange: null }
  } else {
    const previewRange = levelToWordCountRange(level, item.baseWordCountRange)
    const hints = ['精简：减少篇幅', '较短：缩短描述', '正常：系统推荐字数', '较长：扩充细节', '超长：充分展示']
    ElMessage({ message: `${hints[level]}（${previewRange.min}-${previewRange.max}字）`, type: 'info', duration: 1800 })
    list[index] = { ...list[index], pendingLevel: level, pendingWordCountRange: previewRange }
  }
  store.polishList = list
}

/** 确认字数调整，触发重新润色 */
function onConfirmRepolish(index) {
  const item = store.polishList[index]
  if (!item || item.pendingLevel === null || item.pendingLevel === undefined) return
  if (item.status !== 'done' || repolishingIndex.value !== -1) return
  const level = item.pendingLevel
  const newRange = levelToWordCountRange(level, item.baseWordCountRange)
  const list = [...store.polishList]
  list[index] = { ...list[index], pendingLevel: null, pendingWordCountRange: null }
  store.polishList = list
  repolishModule(index, newRange, level)
}

/** 重新润色单个模块 */
async function repolishModule(index, newWordCountRange, newLevel) {
  const item = store.polishList[index]
  if (!item) return
  repolishingIndex.value = index
  const updatedList = [...store.polishList]
  updatedList[index] = { ...item, wordCountRange: newWordCountRange, wordCountLevel: newLevel, status: 'polishing' }
  store.polishList = updatedList
  try {
    const isSelfMode = store.polishMode === 'self'
    const res = await enhancePolishSection({
      moduleType: item.moduleKey,
      originalText: item.originalText,
      polishMode: store.polishMode,
      polishingIntensity: store.polishingIntensity,
      targetPosition: isSelfMode ? '' : store.targetPosition,
      targetPositionJD: isSelfMode ? '' : store.jobDescription,
      contentFormat: item.contentFormat,
      userType: store.userIdentity,
      wordCountRange: newWordCountRange
    })
    const list = [...store.polishList]
    if (res?.success && res.polishedText) {
      list[index] = {
        ...list[index],
        polishedText: res.polishedText,
        status: 'done',
        wordCountRange: newWordCountRange,
        wordCountLevel: newLevel,
        pendingLevel: null,
        pendingWordCountRange: null,
        adjustCount: (list[index].adjustCount || 0) + 1
      }
    } else {
      list[index] = { ...list[index], status: 'done', pendingLevel: null, pendingWordCountRange: null }
    }
    store.polishList = list
    hasPolishAdjustments.value = true
  } catch (err) {
    console.error('[DoneStage] repolishModule 失败:', err)
    const list = [...store.polishList]
    list[index] = { ...list[index], status: 'done', pendingLevel: null, pendingWordCountRange: null }
    store.polishList = list
  } finally {
    repolishingIndex.value = -1
  }
}

/** 重新回填文档（字数调整后应用到简历） */
async function onReapplyPolish() {
  if (!store.uploadedFileKey && !store.uploadedFileId) {
    ElMessage.error('原文档信息丢失，请重新开始')
    return
  }
  isReapplying.value = true
  try {
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
    store.polishedFileKey = res.newFileKey || store.polishedFileKey
    store.polishedDownloadUrl = res.downloadUrl || store.polishedDownloadUrl
    if (res.previewImageUrls?.length) {
      store.polishedPreviewUrls = res.previewImageUrls
    } else if (res.previewImageUrl) {
      store.polishedPreviewUrls = [res.previewImageUrl]
    }
    hasPolishAdjustments.value = false
    ElMessage.success('简历已重新生成！')
  } catch (err) {
    console.error('[DoneStage] onReapplyPolish 失败:', err)
    ElMessage.error('重新生成失败，请稍后重试')
  } finally {
    isReapplying.value = false
  }
}

/** 关闭「应用到简历」提示条，不触发回填；润色结果仍保留在对比区 */
function onCancelReapplyPrompt() {
  if (isReapplying.value) return
  hasPolishAdjustments.value = false
}

async function handleExport() {
  const fileUrl = store.polishedDownloadUrl || store.polishedFileKey
  if (!fileUrl) {
    ElMessage.error('导出文件不存在，请重新润色')
    return
  }
  const filename = `${store.resumeName || '简历'}_优化版_${new Date().toLocaleDateString('zh')}.docx`
  const result = downloadWordFile(fileUrl, filename)
  if (!result.success) {
    ElMessage.error('下载链接无效，请重新润色')
    return
  }

  // 下载触发后，询问是否用 WPS 打开
  try {
    await ElMessageBox.confirm(
      '文件已开始下载，是否同时用 WPS 打开在线预览？',
      '用 WPS 打开',
      {
        confirmButtonText: '用 WPS 打开',
        cancelButtonText: '仅下载',
        type: 'info',
      }
    )
    // 尝试通过 WPS 协议打开文档（需本机已安装 WPS）
    window.open(`wps://d?url=${encodeURIComponent(fileUrl)}`, '_self')
  } catch {
    // 用户选择"仅下载"，无需处理
  }
}

async function handleRestart() {
  try {
    await ElMessageBox.confirm('重新开始将清空当前润色结果，确认吗？', '提示', {
      confirmButtonText: '确认重新开始',
      cancelButtonText: '取消',
      type: 'warning'
    })
    store.reset()
    workorderStore.resetCurrent()
    commissionStore.clearActiveOrder()
  } catch { /* 取消 */ }
}
</script>

<style scoped>
.done-stage {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ─── 整体布局 ─── */
.done-layout {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 12px 16px 16px;
  overflow: hidden;
  min-height: 0;
}

/* ─── 左侧预览区 ─── */
.preview-area {
  flex: 1;
  display: flex;
  gap: 12px;
  min-width: 0;
  position: relative;
  overflow: hidden;
}

.preview-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e8e8e8;
  overflow: hidden;
}

.preview-col__label {
  flex-shrink: 0;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #888;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
  letter-spacing: 0.5px;
}

.preview-col__label--after {
  color: #1565C0;
}

/* ─── 收起/展开对比 ─── */

/* 润色前标题行：flex 排列，右侧放收起按钮 */
.before-col-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

/* 收起按钮（展开状态，在润色前标题右侧） */
.compare-toggle-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px 2px 5px;
  background: rgba(255,255,255,0.92);
  border: 1px solid #d4ddf5;
  border-radius: 11px;
  font-size: 10px;
  font-weight: 600;
  color: #1565C0;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s, border-color 0.15s;
}
.compare-toggle-btn:hover {
  background: #e8f0fe;
  border-color: #90b4f5;
}

/* 展开/收起按钮内的小图标 */
.compare-toggle-icon {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
}

/* 润色前列：收起状态 —— 极窄矩形 */
.preview-col--compare-collapsed {
  flex: 0 0 32px !important;
  min-width: 32px;
  max-width: 32px;
  overflow: hidden;
}

/* 收起状态下，标题区填满整列高度并居中展示展开按钮 */
.preview-col--compare-collapsed .before-col-label {
  flex: 1;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-bottom: none;
  padding: 12px 0;
  cursor: pointer;
}

/* 展开按钮（收起状态，居中在窄条内） */
.compare-expand-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  width: 100%;
  color: #1565C0;
  transition: opacity 0.15s;
}
.compare-expand-btn:hover {
  opacity: 0.65;
}

/* 展开按钮内垂直文字 */
.compare-strip-label {
  font-size: 9px;
  font-weight: 700;
  writing-mode: vertical-rl;
  letter-spacing: 1.5px;
  color: #1565C0;
}

/* 整体布局：收起对比时 preview-area 固定宽度，right-panel 自动扩展 */
.done-layout--compare-collapsed .preview-area {
  flex: none;
  width: 660px;
  transition: width 0.25s ease;
}
.done-layout--compare-collapsed .right-panel {
  flex: 1;
  width: auto;
  min-width: 320px;
  transition: flex 0.25s ease;
}

/* 收起左侧对比时右栏变宽；按钮区宽度随 .right-footer left/right 自动拉满 */

.preview-pages {
  flex: 1;
  overflow: auto;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.preview-img-wrap {
  flex-shrink: 0;
  min-width: 80px;
}

.preview-img {
  width: 100%;
  display: block;
  border-radius: 6px;
  border: 1px solid #eee;
  cursor: zoom-in;
}

.preview-placeholder {
  width: 100%;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ccc;
  font-size: 13px;
  background: #f8f8f8;
  border-radius: 8px;
}

/* 复制预览下拉按钮（右上角浮动） */
.copy-preview-wrap {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
}

.copy-preview-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #d0d8f0;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: #1565C0;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  transition: background 0.15s, box-shadow 0.15s;
  backdrop-filter: blur(4px);
  white-space: nowrap;
}

.copy-preview-btn:hover:not(:disabled) {
  background: #e8f0fe;
  box-shadow: 0 3px 12px rgba(21, 101, 192, 0.18);
}

.copy-preview-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.copy-preview-btn--loading { color: #888; }

.copy-preview-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.copy-menu-arrow {
  width: 10px;
  height: 6px;
  flex-shrink: 0;
  transition: transform 0.2s;
}

.copy-menu-arrow--open { transform: rotate(180deg); }

.copy-preview-spin {
  display: block;
  width: 12px;
  height: 12px;
  border: 2px solid #d0d8f0;
  border-top-color: #1565C0;
  border-radius: 50%;
  animation: analysis-spin 0.75s linear infinite;
  flex-shrink: 0;
}

/* 下拉菜单 */
.copy-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: #fff;
  border: 1px solid #e0e8f8;
  border-radius: 10px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.13);
  padding: 4px;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.copy-menu-fade-enter-active,
.copy-menu-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.copy-menu-fade-enter-from,
.copy-menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.copy-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 7px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}

.copy-menu-item:hover { background: #f0f5ff; color: #1565C0; }

.copy-menu-item__icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
  color: #1565C0;
  flex-shrink: 0;
}

/* 缩放控件（右下角浮动） */
.zoom-control {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #e0e0e0;
  border-radius: 20px;
  padding: 5px 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 10;
}

.zoom-label {
  font-size: 11px;
  color: #666;
  min-width: 34px;
  text-align: right;
}

.zoom-slider {
  width: 80px;
  accent-color: #1565C0;
  cursor: pointer;
}

/* ─── 右侧面板 ─── */
.right-panel {
  width: 328px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  border: none;
  border-radius: 0;
  overflow: visible;
  min-height: 0;
}

/* 对比/解析内容白卡片；底部操作栏 position:absolute 叠在此区域内 */
.right-panel-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e8e8e8;
  overflow: hidden;
}

/* Tab 切换 */
.right-tabs {
  flex-shrink: 0;
  display: flex;
  padding: 10px 10px 0;
  gap: 4px;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
}

.right-tab {
  flex: 1;
  padding: 8px 0;
  border: none;
  background: transparent;
  border-radius: 8px 8px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: #999;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.right-tab--active {
  color: #1565C0;
  font-weight: 700;
  background: #fff;
}

.right-tab--active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: #1565C0;
  border-radius: 2px 2px 0 0;
}

/* 内容区 */
.right-content {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  /* 为底部悬浮操作栏（收起态≈仅箭头）预留，避免最后一段被挡 */
  padding-bottom: 64px;
}

.right-content.right-content--footer-expanded {
  padding-bottom: 200px;
}

/* 润色对比 */
.compare-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.compare-item {
  background: #f8f9ff;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #e8ecf8;
}

.compare-item__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 11px 13px;
  cursor: pointer;
  user-select: none;
}

.compare-item__label {
  font-size: 13px;
  font-weight: 600;
  color: #1a1a1a;
}

.compare-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.word-count {
  font-size: 11px;
  color: #888;
  background: #e8ecf8;
  padding: 2px 6px;
  border-radius: 20px;
}

.compare-arrow {
  color: #aaa;
  font-size: 16px;
  transition: transform 0.2s;
  display: inline-block;
}

.compare-arrow--open {
  transform: rotate(90deg);
}

.compare-item__body {
  padding: 0 13px 13px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.compare-col__label {
  font-size: 10px;
  font-weight: 700;
  color: #aaa;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
  text-transform: uppercase;
}

.compare-col__label--after {
  color: #1565C0;
}

.compare-col__chars {
  margin-left: 6px;
  font-size: 10px;
  font-weight: 500;
  color: #1565C0;
  opacity: 0.8;
}

.compare-col__text {
  font-size: 12px;
  color: #555;
  line-height: 1.7;
  background: #fff;
  padding: 8px 10px;
  border-radius: 7px;
  border: 1px solid #eee;
}

.compare-col__text--after {
  border-color: #d0e3ff;
  background: #f5f9ff;
  color: #1a1a1a;
}

/* 润色中标签 */
.repolish-tag {
  font-size: 11px;
  color: #f59e0b;
  background: #fef3c7;
  padding: 2px 7px;
  border-radius: 20px;
  font-weight: 500;
}

/* 润色中遮罩 */
.repolishing-mask {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  padding: 20px 0;
  color: #1565C0;
  font-size: 12px;
}

.repolish-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #d0e3ff;
  border-top-color: #1565C0;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.repolish-tip {
  font-size: 12px;
  color: #1565C0;
}

/* 五档字数调节 */
.wc-slider-wrap {
  margin-top: 10px;
  padding: 10px 12px;
  background: #f0f4ff;
  border-radius: 9px;
  border: 1px solid #d6e4ff;
}

.wc-slider-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.wc-slider-label {
  font-size: 11px;
  font-weight: 600;
  color: #555;
  letter-spacing: 0.5px;
}

.wc-adjust-count {
  font-size: 10px;
  color: #888;
}

.wc-adjust-count b {
  color: #1565C0;
  font-weight: 700;
}

.wc-count-low .wc-adjust-count b,
.wc-count-low b {
  color: #ef4444;
}

.wc-slider {
  display: flex;
  gap: 4px;
}

.wc-tab {
  flex: 1;
  padding: 5px 2px;
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  color: #888;
  background: #fff;
  border: 1px solid #e0e7ff;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.wc-tab:hover {
  border-color: #93c5fd;
  color: #1565C0;
}

.wc-tab--active {
  background: #1565C0;
  color: #fff;
  border-color: #1565C0;
  font-weight: 600;
}

.wc-tab--pending {
  background: #dbeafe;
  color: #1565C0;
  border-color: #93c5fd;
  font-weight: 600;
}

.wc-tab--normal {
  /* 正常档位下划线标记 */
  position: relative;
}

.wc-slider-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.wc-slider-range {
  font-size: 10px;
  color: #888;
}

.wc-confirm-btn {
  padding: 4px 12px;
  background: #1565C0;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.wc-confirm-btn:hover:not(:disabled) {
  background: #1251A3;
}

.wc-confirm-btn:disabled,
.wc-confirm-btn--loading {
  background: #93c5fd;
  cursor: not-allowed;
}

/* 字数调整后重新生成浮动栏（悬浮在 right-panel 内容底部） */
.reapply-bar {
  position: relative;
  z-index: 40;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: linear-gradient(135deg, #eff6ff, #dbeafe);
  border-top: 1px solid #bfdbfe;
  border-bottom: 1px solid #bfdbfe;
}

.reapply-bar-fade-enter-active,
.reapply-bar-fade-leave-active {
  transition: opacity 0.25s, max-height 0.25s;
  max-height: 80px;
  overflow: hidden;
}

.reapply-bar-fade-enter-from,
.reapply-bar-fade-leave-to {
  opacity: 0;
  max-height: 0;
}

.reapply-hint {
  font-size: 12px;
  color: #1565C0;
  font-weight: 500;
  padding-right: 8px;
  min-width: 0;
}

.reapply-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.reapply-cancel-btn {
  padding: 6px 12px;
  background: transparent;
  color: #64748b;
  border: none;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.reapply-cancel-btn:hover:not(:disabled) {
  color: #1565c0;
  background: rgba(21, 101, 192, 0.08);
}

.reapply-cancel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.reapply-btn {
  padding: 6px 14px;
  background: #1565C0;
  color: #fff;
  border: none;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}

.reapply-btn:hover:not(:disabled) {
  background: #1251A3;
}

.reapply-btn:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}

/* 重新生成简历加载弹窗 */
.reapply-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.reapply-modal {
  background: #fff;
  border-radius: 20px;
  padding: 36px 44px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
  min-width: 260px;
  text-align: center;
}

.reapply-ring-wrap {
  position: relative;
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reapply-ring-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  animation: spin 1.4s linear infinite;
}

.reapply-ring-icon {
  position: relative;
  z-index: 1;
  font-size: 22px;
  color: #1565C0;
  font-weight: 700;
}

.reapply-modal__title {
  font-size: 16px;
  font-weight: 700;
  color: #1a1a1a;
}

.reapply-modal__hint {
  font-size: 12px;
  color: #aaa;
}

/* 正在重新润色时条目样式 */
.compare-item--polishing {
  opacity: 0.85;
}

/* 润色解析 */
.analysis-wrap {
  padding: 0;
}

.summary-content {
  padding: 0;
}

.summary-text {
  font-size: 12px;
  color: #444;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  font-family: inherit;
}

.empty-hint {
  text-align: center;
  color: #bbb;
  font-size: 13px;
  padding: 40px 0;
}

/* 润色解析分段展示 */
.analysis-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.summary-section {
  background: #f8f9ff;
  border-radius: 10px;
  border-left: 3px solid #1565C0;
  padding: 11px 13px;
}

.summary-section__title {
  font-size: 12px;
  font-weight: 700;
  color: #1565C0;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.summary-section__text {
  font-size: 12px;
  color: #444;
  line-height: 1.75;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.summary-improvement {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-top: 7px;
}

.summary-improvement:first-of-type {
  margin-top: 4px;
}

.summary-improvement__idx {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #1565C0;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
}

.summary-improvement__text {
  flex: 1;
  font-size: 12px;
  color: #444;
  line-height: 1.7;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 润色解析入口（未生成状态） */
.analysis-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.analysis-entry__icon {
  font-size: 28px;
  color: #1565C0;
  margin-bottom: 10px;
  opacity: 0.7;
}

.analysis-entry__title {
  font-size: 14px;
  font-weight: 700;
  color: #1a1a2e;
  margin-bottom: 8px;
}

.analysis-entry__desc {
  font-size: 12px;
  color: #888;
  line-height: 1.7;
  max-width: 220px;
  margin-bottom: 20px;
}

.analysis-generate-btn {
  padding: 10px 28px;
  background: #1565C0;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s;
}

.analysis-generate-btn:hover {
  background: #1a7fdb;
}

/* 加载中 spinner */
.analysis-loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e8f0fe;
  border-top-color: #1565C0;
  border-radius: 50%;
  animation: analysis-spin 0.8s linear infinite;
}

@keyframes analysis-spin {
  to { transform: rotate(360deg); }
}

/* 底部重新生成 */
.analysis-regenerate {
  margin-top: 4px;
  display: flex;
  justify-content: flex-end;
}

.analysis-regenerate-btn {
  padding: 6px 16px;
  background: transparent;
  color: #1565C0;
  border: 1px solid #90b4f5;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.analysis-regenerate-btn:hover:not(:disabled) {
  background: #e8f0fe;
}

.analysis-regenerate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 底部按钮：叠在内容上方；左右留白小，白底衬板尽量占满侧栏 */
.right-footer {
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: 8px;
  z-index: 32;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background: transparent;
  border: none;
  padding: 0;
  pointer-events: none;
  box-sizing: border-box;
}

.right-footer .footer-toggle-btn,
.right-footer .footer-btns {
  pointer-events: auto;
}

/* 收起/展开切换：展开态中性；仅收起待展开时为品牌蓝 */
.footer-toggle-btn {
  align-self: flex-end;
  width: 36px;
  height: 22px;
  border: 1px solid #d0d8e8;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.95);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  flex-shrink: 0;
}

.right-footer--collapsed .footer-toggle-btn {
  margin-bottom: 0;
  border: 1px solid #1251a3;
  background: #1565c0;
  box-shadow: 0 2px 8px rgba(21, 101, 192, 0.25);
}

.footer-toggle-btn:hover {
  background: #e8f0fe;
  border-color: #90b4f5;
}

.right-footer--collapsed .footer-toggle-btn:hover {
  background: #1251a3;
  border-color: #0d47a1;
}

.footer-toggle-arrow {
  font-size: 18px;
  color: #666;
  line-height: 1;
  display: block;
  /* 默认：朝下箭头（收起状态下箭头朝上） */
  transform: rotate(-90deg);
  transition: transform 0.25s ease;
}

.footer-toggle-arrow--up {
  transform: rotate(90deg);
}

.right-footer--collapsed .footer-toggle-arrow {
  color: #fff;
}

/* 按钮列表：白底衬板，与 .right-footer 同宽 */
.footer-btns {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 12px;
  box-sizing: border-box;
  width: 100%;
  padding: 16px 18px 18px;
  background: #fff;
  border: 1px solid #e8ecf4;
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(21, 101, 192, 0.1), 0 2px 10px rgba(0, 0, 0, 0.06);
}

/* 展开/收起动画 */
.footer-btns-fade-enter-active,
.footer-btns-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.22s ease;
}

.footer-btns-fade-enter-from,
.footer-btns-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* 右下操作区统一按钮样式 */
.footer-btn {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 20px;
  background: #e8f0fe;
  color: #1565C0;
  border: 1.5px solid #90b4f5;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.08s;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.footer-btn__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-left: -10px; /* 再向左微移，形成更明显的纵向对齐列 */
  /* 将原始蓝色图标统一调成与文字接近的深蓝色 */
  filter: brightness(0) saturate(100%) invert(23%) sepia(76%) saturate(1624%) hue-rotate(199deg) brightness(93%) contrast(96%);
}

.footer-btn:hover {
  background: #d3e3ff;
  border-color: #1565C0;
  box-shadow: 0 0 0 1px rgba(21, 101, 192, 0.16);
}

.footer-btn:active {
  transform: translateY(1px);
}

.footer-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

/* 主操作：打包导出（蓝底白字） */
.footer-btn--primary {
  background: linear-gradient(135deg, #1565C0 0%, #0d47a1 100%);
  color: #fff;
  border-color: transparent;
}

.footer-btn--primary:hover {
  background: linear-gradient(135deg, #1257c8 0%, #0b3c8a 100%);
  border-color: transparent;
  box-shadow: 0 0 0 1px rgba(21, 101, 192, 0.25);
}

.footer-btn__icon--primary {
  /* 将蓝色图标近似反相为白色，以匹配文字颜色 */
  filter: brightness(0) invert(1);
}

/* ── 打包导出弹窗 ──────────────────────────────────────── */

.bundle-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}

.bundle-overlay-fade-enter-active,
.bundle-overlay-fade-leave-active {
  transition: opacity 0.22s ease;
}

.bundle-overlay-fade-enter-from,
.bundle-overlay-fade-leave-to {
  opacity: 0;
}

.bundle-modal {
  width: 690px;
  max-width: calc(100vw - 32px);
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.bundle-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid #f0f0f0;
}

.bundle-modal__title {
  font-size: 15px;
  font-weight: 700;
  color: #1a1a2e;
}

.bundle-modal__close {
  width: 28px;
  height: 28px;
  border: none;
  background: #f5f5f5;
  border-radius: 50%;
  font-size: 16px;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.bundle-modal__close:hover:not(:disabled) {
  background: #e8e8e8;
}

.bundle-modal__close:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 全选行 */
.bundle-select-all {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 18px 8px;
  border-bottom: 1px solid #f5f5f5;
}

.bundle-check-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: #333;
  user-select: none;
}

.bundle-select-hint {
  font-size: 12px;
  color: #999;
}

/* 自定义 checkbox */
.bundle-checkbox {
  width: 18px;
  height: 18px;
  border: 1.5px solid #d0d0d0;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s, border-color 0.15s;
  background: #fff;
}

.bundle-checkbox--checked {
  background: #1565C0;
  border-color: #1565C0;
}

.bundle-checkbox__tick {
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

/* 选项列表 */
.bundle-options {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 420px;
  overflow-y: auto;
}

.bundle-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
  border: 1.5px solid transparent;
}

.bundle-option:hover:not(.bundle-option--disabled) {
  background: #f0f5ff;
}

.bundle-option--selected:not(.bundle-option--disabled) {
  background: #eef3ff;
  border-color: #c2d4f8;
}

.bundle-option--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bundle-option__icon-img {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  object-fit: contain;
  opacity: 1;
  transition: opacity 0.15s;
}

.bundle-option--disabled .bundle-option__icon-img {
  opacity: 0.35;
  filter: grayscale(60%);
}

.bundle-option__text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bundle-option__name {
  font-size: 13px;
  font-weight: 600;
  color: #1a1a1a;
}

.bundle-option__desc {
  font-size: 11px;
  color: #888;
  line-height: 1.4;
}

/* 底部 footer */
.bundle-modal__footer {
  padding: 12px 16px 16px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bundle-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bundle-progress__bar-wrap {
  height: 3px;
  background: #e8f0fe;
  border-radius: 2px;
  overflow: hidden;
}

.bundle-progress__bar {
  height: 100%;
  width: 100%;
  background: linear-gradient(90deg, #1565C0 0%, #42a5f5 50%, #1565C0 100%);
  background-size: 200% 100%;
  animation: bundle-bar-slide 1.2s linear infinite;
  border-radius: 2px;
}

@keyframes bundle-bar-slide {
  0%   { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

.bundle-progress__text {
  font-size: 12px;
  color: #666;
  text-align: center;
}

.bundle-confirm-btn {
  width: 100%;
  padding: 12px 0;
  background: linear-gradient(135deg, #1565C0 0%, #0d47a1 100%);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
  letter-spacing: 0.3px;
}

.bundle-confirm-btn:hover:not(:disabled) {
  opacity: 0.88;
}

.bundle-confirm-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 分隔线 */
.bundle-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 2px 0;
}

.bundle-divider::before,
.bundle-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e8e8e8;
}

.bundle-divider__text {
  font-size: 12px;
  color: #aaa;
  white-space: nowrap;
}

/* 邮件发送行 */
.bundle-email-row {
  display: flex;
  gap: 8px;
}

.bundle-email-input {
  flex: 1;
  padding: 10px 12px;
  border: 1.5px solid #d8e4f8;
  border-radius: 8px;
  font-size: 13px;
  color: #333;
  background: #fafcff;
  outline: none;
  transition: border-color 0.15s;
}

.bundle-email-input:focus {
  border-color: #1565C0;
  background: #fff;
}

.bundle-email-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bundle-email-btn {
  padding: 10px 18px;
  background: #1565C0;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;
}

.bundle-email-btn:hover:not(:disabled) {
  opacity: 0.86;
}

.bundle-email-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── 导出方式多选列表 ───────────────────────────────────────────────────────── */
.bundle-modes {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bundle-mode-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 4px;
  cursor: pointer;
  border-radius: 6px;
  user-select: none;
  transition: background 0.12s;
}

.bundle-mode-item:hover {
  background: #f5f8ff;
}

.bundle-checkbox--sm {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  flex-shrink: 0;
}

.bundle-mode-label {
  font-size: 13px;
  font-weight: 600;
  color: #222;
  min-width: 60px;
}

.bundle-mode-desc {
  font-size: 12px;
  color: #999;
}

.bundle-email-row--indent {
  margin-left: 28px;
  margin-bottom: 4px;
}

/* 开始制作按钮（选项行内） */
.bundle-make-btn {
  flex-shrink: 0;
  padding: 5px 12px;
  background: #1565C0;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;
  margin-left: auto;
}

.bundle-make-btn:hover {
  opacity: 0.85;
}

/* 润色解析生成中 spinner（内嵌于 checkbox 位置） */
.bundle-making-spin {
  display: block;
  width: 10px;
  height: 10px;
  border: 2px solid #c2d4f8;
  border-top-color: #1565C0;
  border-radius: 50%;
  animation: analysis-spin 0.8s linear infinite;
}

/* 生成中状态行 */
.bundle-option--making {
  opacity: 0.75;
  cursor: default;
}

/* ── 证件照子弹窗 ──────────────────────────────────────── */

.bundle-idphoto-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3100;
}

.bundle-idphoto-modal {
  width: 780px;
  max-width: calc(100vw - 32px);
  height: 92vh;
  max-height: 92vh;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 16px 50px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.bundle-idphoto-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
  background: #fafafa;
}

.bundle-idphoto-back {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: transparent;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 13px;
  color: #555;
  cursor: pointer;
  transition: all 0.15s;
}

.bundle-idphoto-back:hover {
  background: #f0f0f0;
  border-color: #bbb;
}

.bundle-idphoto-title {
  font-size: 15px;
  font-weight: 700;
  color: #1a1a2e;
}

.bundle-idphoto-content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

/* 让 IDPhotoMaker 在子弹窗内填满 */
.bundle-idphoto-content .id-photo-maker {
  min-height: 100%;
}

.bundle-idphoto-footer {
  flex-shrink: 0;
  padding: 14px 18px;
  border-top: 1px solid #f0f0f0;
  background: #f8fff8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.bundle-idphoto-footer__hint {
  font-size: 13px;
  color: #555;
}

.bundle-idphoto-confirm-btn {
  padding: 10px 24px;
  background: #1565C0;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.2s;
}

.bundle-idphoto-confirm-btn:hover {
  opacity: 0.87;
}
</style>
