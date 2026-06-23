/**
 * 识别创建模式 — 模板标识库 & 记录库
 *
 * 对应原小程序 template_config.js 中的：
 *   TEMPLATE_REQUIRED_MODULES  → 模板标识库（模板需要哪些模块、按什么顺序）
 *   TEMPLATE_ACTUAL_RECORDS_COUNT → 记录库（每个模块填几条）
 *   MODULE_NUMBER_TO_TYPE      → 模块编号映射
 *
 * 本文件只包含识别模式专属 r_* 系列模板，不影响现有功能。
 * ⚠️ r_2 ~ r_5 的配置待你根据实际模板设计后填入。
 */

// ── 模块编号 → 模块key（与原小程序完全一致）───────────────────────────────
export const MODULE_NUMBER_TO_TYPE = {
  1:  'basic',
  2:  'career',
  3:  'work',
  4:  'internship',
  5:  'education',
  6:  'skill',
  7:  'project',
  8:  'certificate',
  9:  'skill_certificate',
  10: 'self_evaluation',
  11: 'hobby',
  12: 'exam_info',
  13: 'school_experience',
}

// ── 模块中文标签──────────────────────────────────────────────────────────────
export const MODULE_LABELS = {
  basic:            '基本信息',
  career:           '求职意愿',
  education:        '教育经历',
  work:             '工作经历',
  internship:       '实习经历',
  project:          '项目经历',
  school_experience:'在校经历',
  skill:            '职业技能',
  certificate:      '奖项证书',
  skill_certificate:'技能证书',
  self_evaluation:  '自我评价',
  hobby:            '兴趣爱好',
  exam_info:        '报考信息',
}

// ── 需要AI润色的模块（固定，与模板无关）────────────────────────────────────
export const POLISH_ELIGIBLE_MODULES = new Set([
  'work', 'internship', 'project', 'school_experience', 'self_evaluation'
])

// ── 模板标识库（templateId_userType → 有序模块编号数组）────────────────────
// 编号含义：1=基本 2=求职 3=工作 4=实习 5=教育 6=技能 7=项目
//           8=奖项证书 9=技能证书 10=自评 13=在校经历
// ⚠️ 顺序决定AI识别归纳时的模块优先级，以及确认页的展示顺序
export const TEMPLATE_REQUIRED_MODULES = {
  // ── R1 ─────────────────────────────────────────────────────────────────────
  'word_r_1_work':        [1, 2, 5, 3, 7, 6, 9, 10],
  'word_r_1_internship':  [1, 5, 4, 7, 6],  //已校准
  'word_r_1_student':     [1, 2, 5, 13, 7, 6, 8, 10],

  // ── R2 ─────────────────────────────────────────────────────────────────────
  // ⚠️ TODO: 根据实际模板设计填写
  'word_r_2_work':        [1, 2, 5, 3, 6, 10],
  'word_r_2_internship':  [1, 2, 5, 4, 6, 10],
  'word_r_2_student':     [1, 2, 5, 13, 6, 10],

  // ── R3 ─────────────────────────────────────────────────────────────────────
  // ⚠️ TODO: 根据实际模板设计填写
  'word_r_3_work':        [1, 2, 5, 3, 7, 6, 10],
  'word_r_3_internship':  [1, 2, 5, 4, 7, 6, 10],
  'word_r_3_student':     [1, 2, 5, 13, 7, 6, 10],

  // ── R4 ─────────────────────────────────────────────────────────────────────
  // ⚠️ TODO: 根据实际模板设计填写
  'word_r_4_work':        [1, 2, 5, 3, 7, 6, 8, 9, 10],
  'word_r_4_internship':  [1, 2, 5, 4, 7, 6, 8, 9, 10],
  'word_r_4_student':     [1, 2, 5, 13, 7, 6, 8, 10],

  // ── R5 ─────────────────────────────────────────────────────────────────────
  // ⚠️ TODO: 根据实际模板设计填写
  'word_r_5_work':        [1, 2, 5, 3, 7, 6, 8, 9, 10],
  'word_r_5_internship':  [1, 2, 5, 4, 7, 6, 8, 9, 10],
  'word_r_5_student':     [1, 2, 5, 13, 7, 6, 8, 9, 10],
}

// ── 记录库（templateId_userType → 每个模块可填条数）─────────────────────────
// 0 = 该模板不含此模块；AI提取时忽略，generateResume时传空数组
// ⚠️ 数值与Word模板中实际占位符槽位数必须一致，否则会产生填充错位
export const TEMPLATE_ACTUAL_RECORDS_COUNT = {
  // ── R1 ─────────────────────────────────────────────────────────────────────
  'word_r_1_work': {
    basic:1, career:1, work:3, internship:0, education:2,
    skill:8, project:2, certificate:0, skill_certificate:3,
    self_evaluation:1, hobby:0, exam_info:0, school_experience:0
  },
  //已校准
  'word_r_1_internship': {
    basic:1, career:0, work:0, internship:3, education:1,
    skill:2, project:1, certificate:0, skill_certificate:0,
    self_evaluation:0, hobby:0, exam_info:0, school_experience:0
  },
  'word_r_1_student': {
    basic:1, career:1, work:0, internship:0, education:2,
    skill:8, project:2, certificate:3, skill_certificate:0,
    self_evaluation:1, hobby:0, exam_info:0, school_experience:3
  },

  // ── R2 ─────────────────────────────────────────────────────────────────────
  // ⚠️ TODO: 根据实际模板占位符数量填写
  'word_r_2_work': {
    basic:1, career:1, work:2, internship:0, education:1,
    skill:5, project:0, certificate:0, skill_certificate:0,
    self_evaluation:1, hobby:0, exam_info:0, school_experience:0
  },
  'word_r_2_internship': {
    basic:1, career:1, work:0, internship:2, education:1,
    skill:5, project:0, certificate:0, skill_certificate:0,
    self_evaluation:1, hobby:0, exam_info:0, school_experience:0
  },
  'word_r_2_student': {
    basic:1, career:1, work:0, internship:0, education:1,
    skill:5, project:0, certificate:0, skill_certificate:0,
    self_evaluation:1, hobby:0, exam_info:0, school_experience:2
  },

  // ── R3 ─────────────────────────────────────────────────────────────────────
  // ⚠️ TODO
  'word_r_3_work': {
    basic:1, career:1, work:3, internship:0, education:2,
    skill:6, project:2, certificate:0, skill_certificate:0,
    self_evaluation:1, hobby:0, exam_info:0, school_experience:0
  },
  'word_r_3_internship': {
    basic:1, career:1, work:0, internship:3, education:2,
    skill:6, project:2, certificate:0, skill_certificate:0,
    self_evaluation:1, hobby:0, exam_info:0, school_experience:0
  },
  'word_r_3_student': {
    basic:1, career:1, work:0, internship:0, education:2,
    skill:6, project:2, certificate:0, skill_certificate:0,
    self_evaluation:1, hobby:0, exam_info:0, school_experience:2
  },

  // ── R4 ─────────────────────────────────────────────────────────────────────
  // ⚠️ TODO
  'word_r_4_work': {
    basic:1, career:1, work:3, internship:0, education:2,
    skill:8, project:3, certificate:3, skill_certificate:3,
    self_evaluation:1, hobby:0, exam_info:0, school_experience:0
  },
  'word_r_4_internship': {
    basic:1, career:1, work:0, internship:3, education:2,
    skill:8, project:3, certificate:3, skill_certificate:3,
    self_evaluation:1, hobby:0, exam_info:0, school_experience:0
  },
  'word_r_4_student': {
    basic:1, career:1, work:0, internship:0, education:2,
    skill:8, project:3, certificate:3, skill_certificate:0,
    self_evaluation:1, hobby:0, exam_info:0, school_experience:3
  },

  // ── R5 ─────────────────────────────────────────────────────────────────────
  // ⚠️ TODO
  'word_r_5_work': {
    basic:1, career:1, work:4, internship:0, education:2,
    skill:10, project:3, certificate:4, skill_certificate:4,
    self_evaluation:1, hobby:0, exam_info:0, school_experience:0
  },
  'word_r_5_internship': {
    basic:1, career:1, work:0, internship:4, education:2,
    skill:10, project:3, certificate:4, skill_certificate:4,
    self_evaluation:1, hobby:0, exam_info:0, school_experience:0
  },
  'word_r_5_student': {
    basic:1, career:1, work:0, internship:0, education:2,
    skill:10, project:3, certificate:4, skill_certificate:4,
    self_evaluation:1, hobby:0, exam_info:0, school_experience:4
  },
}

// ── 辅助函数 ─────────────────────────────────────────────────────────────────

/**
 * 获取指定模板+身份的有序模块key列表
 * @returns {string[]} e.g. ['basic','career','education','internship',...]
 */
export function getRequiredModules(templateId, userType) {
  const key = `${templateId}_${userType}`
  const nums = TEMPLATE_REQUIRED_MODULES[key] || []
  return nums.map(n => MODULE_NUMBER_TO_TYPE[n]).filter(Boolean)
}

/**
 * 获取指定模板+身份的每模块记录数
 * @returns {{ [moduleKey]: number }} e.g. { basic:1, internship:3, ... }
 */
export function getActualRecordCounts(templateId, userType) {
  return TEMPLATE_ACTUAL_RECORDS_COUNT[`${templateId}_${userType}`] || {}
}

/**
 * 获取该模板+身份中需要AI润色的模块列表（按模板顺序）
 * @returns {string[]} e.g. ['internship','project','self_evaluation']
 */
export function getPolishModules(templateId, userType) {
  return getRequiredModules(templateId, userType).filter(m => POLISH_ELIGIBLE_MODULES.has(m))
}

/**
 * 构建「目标模板唯一数据采集清单」供 recognition_extract_all 使用：
 * 顺序与模块种类来自标识库 TEMPLATE_REQUIRED_MODULES，条数上限来自记录库 TEMPLATE_ACTUAL_RECORDS_COUNT。
 * AI 与用户补全均只应围绕本清单，不扩展为整份旧简历的全量字段。
 * @returns {{ moduleKey, label, maxCount }[]}
 */
export function buildModuleSpecList(templateId, userType) {
  const modules = getRequiredModules(templateId, userType)
  const counts  = getActualRecordCounts(templateId, userType)
  return modules.map(key => ({
    moduleKey: key,
    label:     MODULE_LABELS[key] || key,
    maxCount:  counts[key] || 1,
  }))
}

// 单对象模块（不计条数，AI识别到什么就是什么）
const SINGLE_OBJECT_MODULES = new Set(['basic', 'career', 'self_evaluation', 'hobby', 'exam_info'])

/**
 * 每个列表模块：需要检测的"关键字段"清单
 * 若某条记录中这些字段任意一个为空，即判定为「字段级缺口」
 */
export const MODULE_KEY_FIELDS = {
  education:         ['school', 'major', 'startDate', 'endDate', 'courses'],
  work:              ['company', 'position', 'startDate', 'endDate', 'content'],
  internship:        ['company', 'position', 'startDate', 'endDate', 'content'],
  project:           ['projectName', 'role', 'startDate', 'endDate', 'content'],
  school_experience: ['experienceName', 'role', 'startDate', 'endDate', 'content'],
  skill:             ['skillName', 'level', 'description'],
  certificate:       ['name', 'date', 'issuer'],
  skill_certificate: ['name', 'date', 'issuer'],
}

/** 判断一条记录是否有任意关键字段为空 */
function hasIncompleteFields(moduleKey, record) {
  const keyFields = MODULE_KEY_FIELDS[moduleKey] || []
  return keyFields.some(f => !record[f] || !String(record[f]).trim())
}

/**
 * 检测 extractedData 相对于模板要求的所有空缺（记录级 + 字段级）
 *
 * 返回每条 gap 信息：
 *   - moduleKey / label / maxCount / currentCount / missingCount
 *   - hasFieldGap: 是否存在已识别记录中有字段缺口
 *
 * @param {object} extractedData  - AI提取结果
 * @param {object} recordCounts   - { moduleKey: maxCount }
 * @returns {Array}
 */
/** 识别结果中基本信息仅需关注的核心字段（与 AI 提示、小程序补全一致） */
export const BASIC_CORE_FIELD_KEYS = ['name', 'phone', 'email', 'gender']

const ARRAY_MODULE_KEYS_FOR_CLAMP = [
  'education', 'work', 'internship', 'project', 'school_experience',
  'skill', 'certificate', 'skill_certificate', 'hobby',
]

/**
 * 按模板记录库截断各列表模块条数，防止 AI 多拆条目导致槽位与待填条数错乱
 * （与云函数 recognition_extract_all 提示一致，前后端双保险）
 */
export function normalizeExtractedArrayLengths(extractedData, recordCounts) {
  if (!extractedData || !recordCounts) return extractedData
  const out = { ...extractedData }
  for (const key of ARRAY_MODULE_KEYS_FOR_CLAMP) {
    const max = recordCounts[key]
    if (!max || max <= 0) continue
    const raw = out[key]
    if (!Array.isArray(raw) || raw.length <= max) continue
    out[key] = raw.slice(0, max)
  }
  return out
}

export function detectGaps(extractedData, recordCounts) {
  if (!extractedData || !recordCounts) return []
  const gaps = []
  for (const [moduleKey, maxCount] of Object.entries(recordCounts)) {
    if (!maxCount || maxCount <= 0) continue
    if (SINGLE_OBJECT_MODULES.has(moduleKey)) continue
    const raw = extractedData[moduleKey]
    const records = Array.isArray(raw) ? raw : []
    const currentCount = records.length
    const missingCount = Math.max(0, maxCount - currentCount)

    // 字段级缺口：已识别记录中是否有关键字段为空
    const fieldGapRecordIndices = records
      .map((rec, i) => hasIncompleteFields(moduleKey, rec) ? i : -1)
      .filter(i => i >= 0)

    const hasFieldGap = fieldGapRecordIndices.length > 0

    if (missingCount > 0 || hasFieldGap) {
      gaps.push({
        moduleKey,
        label:        MODULE_LABELS[moduleKey] || moduleKey,
        maxCount,
        currentCount,
        missingCount,
        hasFieldGap,
        fieldGapRecordIndices,
      })
    }
  }
  return gaps
}
