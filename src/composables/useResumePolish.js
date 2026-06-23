import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useResumeEnhanceStore } from '@/stores/resumeEnhance'
import { useWorkorderStore } from '@/stores/workorder'
import { enhancePolishSection } from '@/api/ai'
import { replaceByParagraph } from '@/api/word'

const moduleLabelMap = {
  work: '工作经历', internship: '实习经历', project: '项目经历',
  school_experience: '在校经历', self_evaluation: '自我评价'
}

function calcWordCountRange(originalText, moduleType) {
  const len = (originalText || '').length
  if (moduleType === 'self_evaluation') {
    if (len < 80)   return { min: 100, max: 140 }
    if (len <= 200) return { min: 130, max: 170 }
    return { min: 160, max: 210 }
  }
  if (len < 60)   return { min: 80,  max: 110 }
  if (len <= 150) return { min: 100, max: 140 }
  return { min: 140, max: 190 }
}

export function levelToWordCountRange(level, baseRange) {
  const offsets = [-60, -30, 0, 50, 100]
  const offset = offsets[level] ?? 0
  return {
    min: Math.max(40, baseRange.min + offset),
    max: Math.max(60, baseRange.max + offset)
  }
}

export function useResumePolish() {
  const store = useResumeEnhanceStore()
  const progress = ref(0)
  const statusText = ref('正在润色...')

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
        let contentFormat
        if (key === 'self_evaluation') {
          contentFormat = 'paragraph'
        } else if (store.outputFormat === 'subtitle' || store.outputFormat === 'subtitle_compact') {
          // 全局小标题：靠左对齐('subtitle') 或 有序排列('subtitle_compact')
          contentFormat = store.outputFormat
        } else if (store.outputFormat === 'custom') {
          const customItem = (store.customModuleItems || []).find(i => i.moduleType === key)
          // custom 中每个模块可独立为 'paragraph'/'subtitle'/'subtitle_compact'
          contentFormat = customItem ? customItem.format : 'paragraph'
        } else {
          contentFormat = 'paragraph'
        }
        const baseWordCountRange = calcWordCountRange(item.originalText, key)
        list.push({
          moduleKey: key,
          moduleLabel: `${moduleLabelMap[key]}${arr.length > 1 ? ` ${idx + 1}` : ''}`,
          originalText: item.originalText,
          sectionOrder: item.sectionOrder || idx,
          contentFormat,
          status: 'pending',
          polishedText: '',
          baseWordCountRange,
          wordCountRange: { ...baseWordCountRange },
          wordCountLevel: 2,
          pendingLevel: null,
          pendingWordCountRange: null,
          adjustCount: 0
        })
      })
    })
    store.polishList = list
  }

  async function runPolish() {
    buildPolishList()
    const total = store.polishList.length
    const isSelfMode = store.polishMode === 'self'
    progress.value = 0
    statusText.value = '准备开始润色...'

    try {
      for (let i = 0; i < total; i++) {
        store.polishList[i].status = 'polishing'
        statusText.value = `润色中 ${i + 1}/${total}：${store.polishList[i].moduleLabel}`

        try {
          const item = store.polishList[i]
          const res = await enhancePolishSection({
            moduleType: item.moduleKey,
            originalText: item.originalText,
            polishMode: store.polishMode,
            polishingIntensity: store.polishingIntensity,
            targetPosition: isSelfMode ? '' : store.targetPosition,
            targetPositionJD: isSelfMode ? '' : store.jobDescription,
            contentFormat: item.contentFormat,
            userType: store.userIdentity,
            wordCountRange: item.wordCountRange
          })
          if (res?.success && res.polishedText) {
            store.polishList[i].polishedText = res.polishedText
            // 保留前端设定的 contentFormat（如 subtitle_compact），AI 返回值仅作兜底
            store.polishList[i].contentFormat = item.contentFormat || res.contentFormat
            store.polishList[i].status = 'done'
          } else {
            store.polishList[i].polishedText = item.originalText
            store.polishList[i].status = 'done'
          }
        } catch {
          store.polishList[i].polishedText = store.polishList[i].originalText
          store.polishList[i].status = 'done'
        }

        progress.value = Math.round(((i + 1) / total) * 70)
      }

      statusText.value = '正在回填简历文档...'
      progress.value = 80

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

      if (res.previewImageUrl) {
        store.polishedPreviewUrls = [res.previewImageUrl]
      } else if (res.previewImageUrls?.length) {
        store.polishedPreviewUrls = res.previewImageUrls
      }

      progress.value = 100
      statusText.value = '润色完成！'
      store.stage = 'done'

      // 更新工单状态为"已润色"（静默，不影响主流程）
      try {
        const workorderStore = useWorkorderStore()
        workorderStore.updateStatus({ status: 'polished' })
        // 补充 resumeName（通过 adminUpdateWorkorder 在云端更新会更准确，
        // 但此处先在本地缓存，待工单状态首次更新时随同提交）
      } catch { /* 忽略 */ }

      return { success: true }

    } catch (err) {
      ElMessage.error('润色失败：' + (err.message || '请重试'))
      return { success: false, error: err }
    }
  }

  return { progress, statusText, runPolish }
}
