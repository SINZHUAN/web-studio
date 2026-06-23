/**
 * useRecognitionPolish
 *
 * 识别创建模式 — 润色 + 生成流水线（模板驱动版）：
 *   1. 按模板的 polishModules 构建润色列表
 *   2. 逐模块AI润色（仅对模板包含且有内容的模块执行）
 *   3. buildTemplateData（按 TEMPLATE_ACTUAL_RECORDS_COUNT 截断记录数）
 *   4. generateResume → docToImage → preview
 *
 * 本文件为独立新增，不影响任何现有功能。
 */
import { ElMessage } from 'element-plus'
import { useRecognitionStore } from '@/stores/recognition'
import { enhancePolishSection } from '@/api/ai'
import { generateResume, docToImage, getTempDownloadUrl } from '@/api/recognition'
import {
  getPolishModules,
  getActualRecordCounts,
  MODULE_LABELS,
} from '@/config/recognitionTemplateConfig'

/**
 * 根据原文字数估算 wordCountRange
 */
function calcWordCountRange(text, moduleType) {
  const len = (text || '').length
  if (moduleType === 'self_evaluation') {
    const base = Math.max(80, Math.min(len, 300))
    return { min: Math.round(base * 0.8), max: Math.round(base * 1.2) }
  }
  const base = Math.max(60, Math.min(len, 400))
  return { min: Math.round(base * 0.7), max: Math.round(base * 1.3) }
}

/**
 * 截断数组到 maxCount，并用空对象补齐到 maxCount 长度。
 * 补齐的意义：确保云函数为所有模板槽位写入空字符串，
 * 防止 docxtemplater 对未设置的键输出 "undefined" 字符串。
 */
function fillSlots(arr, maxCount) {
  if (!maxCount || maxCount <= 0) return []
  const base = Array.isArray(arr) ? arr.slice(0, maxCount) : []
  while (base.length < maxCount) base.push({})
  return base
}

/**
 * 将对象中所有字符串值为 "undefined" 或 "null" 的字段替换为 ""。
 * AI 偶尔会返回字面字符串 "undefined"，导致模板填充时显示该文字。
 */
function sanitizeStringFields(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const cleaned = { ...obj }
  for (const key of Object.keys(cleaned)) {
    if (cleaned[key] === 'undefined' || cleaned[key] === 'null') {
      cleaned[key] = ''
    }
  }
  return cleaned
}

/**
 * 将 extractedData + polishList 映射为 generateResume 所需的 userData
 * 严格按照 recordCounts 截断每个模块的记录数量，并补齐空槽位
 *
 * @param {object} extractedData  - AI提取的原始数据
 * @param {Array}  polishList     - 润色结果列表
 * @param {object} recordCounts   - { moduleKey: maxCount }
 */
function buildTemplateData(extractedData, polishList, recordCounts) {
  // 构造润色结果索引 moduleKey → polishedText[]
  const polishedMap = {}
  polishList.forEach(mod => {
    if (!polishedMap[mod.moduleKey]) polishedMap[mod.moduleKey] = []
    mod.items.forEach(sub => {
      polishedMap[mod.moduleKey].push(sub.polishedText || sub.originalText || '')
    })
  })

  const rc = recordCounts || {}
  const MAX = key => rc[key] ?? 0

  // 教育经历
  const education = fillSlots(extractedData.education || [], MAX('education'))
    .map(item => ({
      school:    item.school    || '',
      college:   item.college   || '',
      major:     item.major     || '',
      degree:    item.degree    || '',
      startDate: item.startDate || '',
      endDate:   item.endDate   || '',
      courses:   item.courses   || item.mainCourses || '',
      gpa:       item.gpa       || '',
    }))

  // 工作经历：同时传 description(→ 工作_工作描述_*) 和 content(→ 工作_工作内容_*)
  const work = fillSlots(extractedData.work || [], MAX('work'))
    .map((item, i) => {
      const text = polishedMap.work?.[i] || item.content || ''
      return {
        company:     item.company    || '',
        department:  item.department || '',
        position:    item.position   || '',
        startDate:   item.startDate  || '',
        endDate:     item.endDate    || '',
        description: text,
        content:     text,
      }
    })

  // 实习经历：同时传 description(→ 实习_实习描述_*) 和 content(→ 实习_实习内容_*)
  const internship = fillSlots(extractedData.internship || [], MAX('internship'))
    .map((item, i) => {
      const text = polishedMap.internship?.[i] || item.content || ''
      return {
        company:     item.company   || '',
        position:    item.position  || '',
        startDate:   item.startDate || '',
        endDate:     item.endDate   || '',
        description: text,
        content:     text,
      }
    })

  // 项目经历：同时传 description 和 content
  const project = fillSlots(extractedData.project || [], MAX('project'))
    .map((item, i) => {
      const text = polishedMap.project?.[i] || item.content || ''
      return {
        projectName: item.projectName || '',
        role:        item.role        || '',
        startDate:   item.startDate   || '',
        endDate:     item.endDate     || '',
        description: text,
        content:     text,
      }
    })

  // 在校经历：同时传 description 和 content
  const school_experience = fillSlots(extractedData.school_experience || [], MAX('school_experience'))
    .map((item, i) => {
      const text = polishedMap.school_experience?.[i] || item.content || ''
      return {
        experienceName: item.experienceName || '',
        role:           item.role           || '',
        startDate:      item.startDate      || '',
        endDate:        item.endDate        || '',
        description:    text,
        content:        text,
      }
    })

  // 职业技能：补齐所有槽位为空对象，防止 undefined 显示
  const skill = fillSlots(extractedData.skill || [], MAX('skill'))
    .map(item => ({
      skillName:   item.skillName || '',
      level:       item.level     || '',
      description: item.description || '',
    }))

  // 奖项证书
  const certificate = fillSlots(extractedData.certificate || [], MAX('certificate'))
    .map(item => ({
      name:   item.name   || '',
      date:   item.date   || '',
      issuer: item.issuer || '',
    }))

  // 技能证书
  const skill_certificate = fillSlots(extractedData.skill_certificate || [], MAX('skill_certificate'))
    .map(item => ({
      name:   item.name   || '',
      date:   item.date   || '',
      issuer: item.issuer || '',
    }))

  // self_evaluation 是对象，不是数组
  const selfEvalText = polishedMap.self_evaluation?.[0]
    || extractedData.self_evaluation?.content
    || ''

  return {
    basic:   sanitizeStringFields(extractedData.basic  || {}),
    career:  sanitizeStringFields(extractedData.career || {}),

    education: { items: education },
    work:      { items: work },
    internship:{ items: internship },
    project:   { items: project },
    school_experience: { items: school_experience },

    self_evaluation: {
      content1: selfEvalText,
      content2: '',
      content3: '',
      content4: '',
    },

    skill: { items: skill },
    certificate: { items: certificate },
    skill_certificate: { skillCertificates: skill_certificate },

    hobby:     { items: [] },
    exam_info: { items: [] },
  }
}

export function useRecognitionPolish() {
  const store = useRecognitionStore()

  /**
   * 主流程：
   *  1. 按模板的 polishModules 构建润色列表（只润色模板有且有内容的模块）
   *  2. 逐项调用AI润色
   *  3. buildTemplateData（按记录数截断）
   *  4. generateResume → docToImage → preview
   */
  async function runPolishAndGenerate() {
    if (!store.extractedData) {
      ElMessage.error('识别数据不存在，请重新识别')
      return
    }
    if (!store.selectedTemplateId) {
      ElMessage.error('未选择模板，请返回重新选择')
      return
    }

    // ── 合并 AI 识别数据 + 用户补填数据（不修改 store 原始数据）────────────
    // supplementData[key] 存储的是该模块的「全量」记录（AI预填 + 用户修改 + 新增）
    // 因此直接替换对应模块，而非追加
    const mergedData = { ...store.extractedData }
    const supplement = store.supplementData || {}
    for (const [key, records] of Object.entries(supplement)) {
      if (!Array.isArray(records)) continue
      // 用补填后的全量记录替换 AI 原始数据
      mergedData[key] = records
    }

    store.phase = 'polishing'

    // 从模板配置获取：需要润色的模块列表 + 每模块记录数
    const polishModuleKeys = getPolishModules(store.selectedTemplateId, store.userType)
    const recordCounts     = getActualRecordCounts(store.selectedTemplateId, store.userType)

    // ── 1. 构建润色列表（只处理模板要求且有内容的模块）────────────────────
    const polishList = []

    for (const key of polishModuleKeys) {
      const raw = mergedData[key]
      if (!raw) continue
      const maxCount = recordCounts[key] || 0
      if (maxCount === 0) continue  // 模板不含此模块，跳过

      if (key === 'self_evaluation') {
        const text = raw.content || ''
        if (!text.trim()) continue
        polishList.push({
          moduleKey:   key,
          moduleLabel: MODULE_LABELS[key] || key,
          items: [{ idx: 0, originalText: text, polishedText: '', status: 'pending' }]
        })
      } else {
        const arr = Array.isArray(raw) ? raw.slice(0, maxCount) : []
        if (!arr.length) continue
        const validItems = arr
          .map((item, i) => ({
            idx:          i,
            originalText: item.content || '',
            polishedText: '',
            status:       'pending'
          }))
          .filter(sub => sub.originalText.trim())
        if (!validItems.length) continue
        polishList.push({
          moduleKey:   key,
          moduleLabel: MODULE_LABELS[key] || key,
          items: validItems
        })
      }
    }

    store.polishList       = polishList
    store.totalPolishCount = polishList.reduce((sum, m) => sum + m.items.length, 0)
    store.polishedCount    = 0

    // ── 2. 逐项AI润色 ────────────────────────────────────────────────────────
    for (const mod of store.polishList) {
      for (const sub of mod.items) {
        sub.status = 'polishing'
        try {
          const res = await enhancePolishSection({
            moduleType:         mod.moduleKey,
            originalText:       sub.originalText,
            polishMode:         store.polishMode,
            polishingIntensity: store.polishingIntensity,
            targetPosition:     store.targetPosition,
            jobDescription:     store.jobDescription,
            contentFormat:      'paragraph',
            userIdentity:       store.userType,
            wordCountRange:     calcWordCountRange(sub.originalText, mod.moduleKey)
          })
          sub.polishedText = (res && res.success)
            ? (res.polishedText || sub.originalText)
            : sub.originalText
        } catch {
          sub.polishedText = sub.originalText
        }
        sub.status = 'done'
        store.polishedCount++
      }
    }

    // ── 3. 构造模板数据（按记录数截断）───────────────────────────────────────
    store.isGenerating     = true
    store.generatingStatus = '正在生成简历文档...'

    try {
      const userData = buildTemplateData(mergedData, store.polishList, recordCounts)

      // ── 4. 生成Word文档 ───────────────────────────────────────────────────
      store.generatingStatus = '正在填充模板...'
      const genRes = await generateResume({
        templateId: store.selectedTemplateId,
        userType:   store.userType,
        userData,
      })
      if (!genRes || !genRes.success) {
        throw new Error(genRes?.error || genRes?.message || '简历生成失败')
      }
      store.wordFileKey = genRes.wordFileKey || ''

      // ── 5. 生成预览图 ─────────────────────────────────────────────────────
      store.generatingStatus = '正在生成预览图...'
      if (genRes.previewImages && genRes.previewImages.length) {
        store.previewImages = genRes.previewImages
      } else if (store.wordFileKey) {
        const imgRes = await docToImage({ fileKey: store.wordFileKey })
        if (imgRes && imgRes.success) {
          // 云函数返回字段为 previewImageUrls（数组）或 previewImageUrl（单张），兼容两种格式
          store.previewImages = imgRes.previewImageUrls
            || (imgRes.previewImageUrl ? [imgRes.previewImageUrl] : [])
            || imgRes.images || imgRes.previewImages || []
        }
      }

      // ── 6. 获取下载链接 ───────────────────────────────────────────────────
      // genRes.downloadUrl 有时只是 COS 路径（非完整 URL），需判断后才可使用
      if (genRes.downloadUrl && genRes.downloadUrl.startsWith('http')) {
        store.wordDownloadUrl = genRes.downloadUrl
      } else if (store.wordFileKey) {
        const urlRes = await getTempDownloadUrl({ fileKey: store.wordFileKey })
        if (urlRes && urlRes.success) {
          store.wordDownloadUrl = urlRes.downloadUrl || ''
        }
      }

      // ── 7. 委托工单模式：存储生成产物，进入 done 阶段；独立模式进入 preview ──
      if (store.commissionOrderId) {
        // Store polished file info for RecognitionDoneStage (export + send-back)
        store.polishedFileKey     = genRes.wordFileKey || store.wordFileKey || ''
        store.polishedDownloadUrl = store.wordDownloadUrl
        store.phase = 'done'
      } else {
        store.phase = 'preview'
      }
    } catch (err) {
      ElMessage.error('生成失败：' + (err.message || '请重试'))
      // 委托工单模式回到 ready，独立模式回到 confirm
      store.phase = store.commissionOrderId ? 'ready' : 'confirm'
    } finally {
      store.isGenerating = false
    }
  }

  return { runPolishAndGenerate }
}
