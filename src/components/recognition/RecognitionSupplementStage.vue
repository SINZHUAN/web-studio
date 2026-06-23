<template>
  <div class="supplement-stage">

    <!-- 页头 -->
    <div class="supplement-header">
      <div class="supplement-title">内容确认与补充</div>
      <div class="supplement-sub">
        以下模块存在内容缺口，请检查并补充（可跳过留空，对应位置将不填写）
      </div>
    </div>

    <!-- 各模块补填区 -->
    <div class="supplement-body">
      <div
        v-for="gap in store.gaps"
        :key="gap.moduleKey"
        class="gap-section"
      >
        <!-- 模块标题 -->
        <div class="gap-section__head">
          <span class="gap-module-label">{{ gap.label }}</span>
          <span class="gap-progress">
            已识别 {{ gap.currentCount }} 条 / 模板需 {{ gap.maxCount }} 条
          </span>
          <div class="gap-badges">
            <span v-if="gap.missingCount > 0" class="gap-badge gap-badge--count">
              缺 {{ gap.missingCount }} 条记录
            </span>
            <span v-if="gap.hasFieldGap" class="gap-badge gap-badge--field">
              部分字段待补充
            </span>
          </div>
        </div>

        <!-- 所有记录（AI已识别 + 新增槽位），全部可编辑 -->
        <div class="supplement-forms">
          <div
            v-for="(form, fi) in getAllForms(gap.moduleKey)"
            :key="fi"
            :class="['supplement-form-card', form._isNew ? 'supplement-form-card--new' : 'supplement-form-card--existing']"
          >
            <!-- 卡片头部 -->
            <div class="form-card-head">
              <span class="form-card-num">第 {{ fi + 1 }} 条</span>
              <span v-if="!form._isNew" class="form-card-tag form-card-tag--ai">AI已识别</span>
              <span v-else class="form-card-tag form-card-tag--new">新增</span>
              <span v-if="!form._isNew && isFormIncomplete(gap.moduleKey, form)" class="form-card-incomplete">
                ⚠ 有字段待补充
              </span>
              <span class="form-card-optional">{{ form._isNew ? '（选填，可跳过）' : '（可修改）' }}</span>
            </div>

            <!-- 表单字段 -->
            <div class="form-fields">
              <template v-for="field in getFieldSchema(gap.moduleKey)" :key="field.key">
                <div
                  :class="['form-field', field.type === 'textarea' ? 'form-field--full' : '']"
                >
                  <label class="field-label">
                    {{ field.label }}
                    <span v-if="field.required" class="field-required">*</span>
                    <span
                      v-if="!form._isNew && !form[field.key]"
                      class="field-empty-hint"
                    >未识别</span>
                  </label>
                  <textarea
                    v-if="field.type === 'textarea'"
                    v-model="form[field.key]"
                    class="field-textarea"
                    :class="{ 'field--missing': !form._isNew && !form[field.key] }"
                    :placeholder="field.placeholder || ''"
                    rows="3"
                  />
                  <select
                    v-else-if="field.type === 'select'"
                    v-model="form[field.key]"
                    class="field-select"
                    :class="{ 'field--missing': !form._isNew && !form[field.key] }"
                  >
                    <option value="">请选择</option>
                    <option v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</option>
                  </select>
                  <input
                    v-else
                    v-model="form[field.key]"
                    class="field-input"
                    :class="{ 'field--missing': !form._isNew && !form[field.key] }"
                    :placeholder="field.placeholder || ''"
                    type="text"
                  />
                </div>
              </template>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="supplement-footer">
      <button class="back-btn" @click="store.phase = 'confirm'">
        ← 返回确认页
      </button>
      <button class="skip-btn" @click="handleSkipAll">
        全部跳过，直接生成
      </button>
      <button class="proceed-btn" @click="handleProceed">
        确认补充，开始润色并生成
      </button>
    </div>

  </div>
</template>

<script setup>
import { reactive } from 'vue'
import { useRecognitionStore } from '@/stores/recognition'
import { useRecognitionPolish } from '@/composables/useRecognitionPolish'
import { MODULE_KEY_FIELDS } from '@/config/recognitionTemplateConfig'

const store = useRecognitionStore()
const { runPolishAndGenerate } = useRecognitionPolish()

// ── 各模块的表单字段定义 ────────────────────────────────────────────────────
const FIELD_SCHEMAS = {
  education: [
    { key: 'school',    label: '学校名称', placeholder: '如：北京大学', required: true },
    { key: 'college',   label: '学院',     placeholder: '如：计算机学院' },
    { key: 'major',     label: '专业',     placeholder: '如：计算机科学与技术' },
    { key: 'degree',    label: '学历',     type: 'select',
      options: ['本科', '硕士', '博士', '专科', '高中及以下'] },
    { key: 'startDate', label: '入学时间', placeholder: '如：2020.09' },
    { key: 'endDate',   label: '毕业时间', placeholder: '如：2024.06' },
    { key: 'courses',   label: '主修课程', placeholder: '如：数据结构、操作系统、算法' },
    { key: 'gpa',       label: '学业成绩', placeholder: '如：3.8/4.0 或 88分' },
  ],
  work: [
    { key: 'company',    label: '公司名称', placeholder: '如：字节跳动',  required: true },
    { key: 'department', label: '部门',     placeholder: '如：技术中台部' },
    { key: 'position',   label: '职位',     placeholder: '如：前端工程师' },
    { key: 'startDate',  label: '开始时间', placeholder: '如：2022.07' },
    { key: 'endDate',    label: '结束时间', placeholder: '如：2024.01 或 至今' },
    { key: 'content',    label: '工作内容', type: 'textarea',
      placeholder: '请描述主要工作职责和成果...' },
  ],
  internship: [
    { key: 'company',   label: '公司名称', placeholder: '如：腾讯',  required: true },
    { key: 'position',  label: '职位',     placeholder: '如：产品实习生' },
    { key: 'startDate', label: '开始时间', placeholder: '如：2023.07' },
    { key: 'endDate',   label: '结束时间', placeholder: '如：2023.09' },
    { key: 'content',   label: '实习内容', type: 'textarea',
      placeholder: '请描述主要实习工作和收获...' },
  ],
  project: [
    { key: 'projectName', label: '项目名称', placeholder: '如：校园二手交易平台', required: true },
    { key: 'role',        label: '担任角色', placeholder: '如：前端负责人' },
    { key: 'startDate',   label: '开始时间', placeholder: '如：2023.03' },
    { key: 'endDate',     label: '结束时间', placeholder: '如：2023.06' },
    { key: 'content',     label: '项目内容', type: 'textarea',
      placeholder: '请描述项目背景、你的工作和成果...' },
  ],
  school_experience: [
    { key: 'experienceName', label: '经历名称', placeholder: '如：学生会宣传部',  required: true },
    { key: 'role',           label: '担任角色', placeholder: '如：部长' },
    { key: 'startDate',      label: '开始时间', placeholder: '如：2021.09' },
    { key: 'endDate',        label: '结束时间', placeholder: '如：2022.06' },
    { key: 'content',        label: '经历内容', type: 'textarea',
      placeholder: '请描述参与的工作和取得的成果...' },
  ],
  skill: [
    { key: 'skillName',   label: '技能名称',    placeholder: '如：Python', required: true },
    { key: 'level',       label: '掌握程度',    type: 'select',
      options: ['入门', '初级', '熟练', '精通', '专家'] },
    { key: 'description', label: '技能描述', placeholder: '如：熟悉常用框架，有实际项目经验' },
  ],
  certificate: [
    { key: 'name',   label: '证书/奖项名称', placeholder: '如：全国英语竞赛一等奖', required: true },
    { key: 'date',   label: '获得时间',      placeholder: '如：2023.05' },
    { key: 'issuer', label: '颁发机构',      placeholder: '如：教育部' },
  ],
  skill_certificate: [
    { key: 'name',   label: '证书名称', placeholder: '如：计算机二级证书', required: true },
    { key: 'date',   label: '获得时间', placeholder: '如：2022.12' },
    { key: 'issuer', label: '颁发机构', placeholder: '如：教育部考试中心' },
  ],
}

// ── 每个 gap 模块维护「全量」表单数据（AI已有 + 新增） ─────────────────────
// formsMap: { moduleKey: reactive([{ ...fields, _isNew: bool }]) }
const formsMap = reactive({})

/**
 * 获取某模块的全量表单列表（AI记录预填 + 缺口空白）
 * 首次调用时初始化
 */
function getAllForms(moduleKey) {
  if (formsMap[moduleKey]) return formsMap[moduleKey]

  const gap     = store.gaps.find(g => g.moduleKey === moduleKey)
  if (!gap) return []

  const schema  = FIELD_SCHEMAS[moduleKey] || []
  const existing = getExistingRecords(moduleKey)
  const forms   = []

  // 已识别记录：预填 AI 数据，可编辑
  for (const rec of existing) {
    const form = reactive({ _isNew: false })
    schema.forEach(f => { form[f.key] = rec[f.key] || '' })
    forms.push(form)
  }

  // 缺口槽位：空白表单
  for (let i = 0; i < gap.missingCount; i++) {
    const form = reactive({ _isNew: true })
    schema.forEach(f => { form[f.key] = '' })
    forms.push(form)
  }

  formsMap[moduleKey] = forms
  return forms
}

function getExistingRecords(moduleKey) {
  const data = store.extractedData
  if (!data) return []
  const raw = data[moduleKey]
  return Array.isArray(raw) ? raw : []
}

function getFieldSchema(moduleKey) {
  return FIELD_SCHEMAS[moduleKey] || []
}

/** 判断已识别记录是否有关键字段缺失（用于标记 ⚠） */
function isFormIncomplete(moduleKey, form) {
  if (form._isNew) return false
  const keyFields = MODULE_KEY_FIELDS[moduleKey] || []
  return keyFields.some(f => !form[f] || !String(form[f]).trim())
}

// ── 提交 ────────────────────────────────────────────────────────────────────

/**
 * 将每个 gap 模块的全量表单收集为 supplementData
 * 格式：{ moduleKey: allRecords[] }
 * 在 runPolishAndGenerate 中将「替换」对应模块的 extractedData
 */
function collectSupplementData() {
  const result = {}
  for (const gap of store.gaps) {
    const forms = formsMap[gap.moduleKey] || getAllForms(gap.moduleKey)
    // 只收集「有必填字段」的记录（排除完全空白的新增槽）
    const validForms = forms
      .map(f => {
        const plain = {}
        getFieldSchema(gap.moduleKey).forEach(field => { plain[field.key] = f[field.key] || '' })
        return plain
      })
      .filter(plain => {
        // 已识别记录永远保留（即使字段为空，至少留位置）
        const correspondingForm = forms[forms.indexOf(forms.find(
          f => Object.keys(plain).every(k => f[k] === plain[k])
        ))]
        // 判断是否为新增且完全空白
        const isBlankNew = !correspondingForm?._isNew
          ? false
          : Object.values(plain).every(v => !v || !String(v).trim())
        return !isBlankNew
      })
    result[gap.moduleKey] = validForms
  }
  return result
}

/**
 * 更健壮的版本：直接遍历 formsMap
 */
function collectAll() {
  const result = {}
  for (const gap of store.gaps) {
    const forms = formsMap[gap.moduleKey] || getAllForms(gap.moduleKey)
    const records = []
    for (const form of forms) {
      const plain = {}
      getFieldSchema(gap.moduleKey).forEach(f => { plain[f.key] = form[f.key] || '' })
      // 新增且完全为空 → 跳过
      if (form._isNew) {
        const hasAny = Object.values(plain).some(v => v && String(v).trim())
        if (!hasAny) continue
      }
      records.push(plain)
    }
    result[gap.moduleKey] = records
  }
  return result
}

async function handleProceed() {
  store.supplementData = collectAll()
  await runPolishAndGenerate()
}

async function handleSkipAll() {
  store.supplementData = {}
  await runPolishAndGenerate()
}
</script>

<style scoped>
.supplement-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Header ── */
.supplement-header {
  padding: 24px 36px 16px;
  border-bottom: 1px solid #e8f0fe;
  flex-shrink: 0;
}
.supplement-title {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a1a;
  margin-bottom: 4px;
}
.supplement-sub {
  font-size: 13px;
  color: #888;
}

/* ── Body ── */
.supplement-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 36px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* ── Gap section ── */
.gap-section {
  background: #fff;
  border: 1px solid #e0eaff;
  border-radius: 12px;
  overflow: hidden;
}
.gap-section__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  background: #f5f8ff;
  border-bottom: 1px solid #e0eaff;
  flex-wrap: wrap;
}
.gap-module-label {
  font-size: 15px;
  font-weight: 600;
  color: #1565C0;
}
.gap-progress {
  font-size: 12px;
  color: #888;
}
.gap-badges {
  margin-left: auto;
  display: flex;
  gap: 6px;
}
.gap-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}
.gap-badge--count {
  color: #d97706;
  background: #fef3c7;
}
.gap-badge--field {
  color: #7c3aed;
  background: #ede9fe;
}

/* ── Forms list ── */
.supplement-forms {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Form card ── */
.supplement-form-card {
  border-radius: 10px;
  padding: 14px 16px;
}
.supplement-form-card--existing {
  background: #f8faff;
  border: 1px solid #bfdbfe;
}
.supplement-form-card--new {
  background: #fafbff;
  border: 1px dashed #93c5fd;
}

.form-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.form-card-num {
  font-size: 13px;
  font-weight: 600;
  color: #1565C0;
}
.form-card-tag {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 8px;
  font-weight: 500;
}
.form-card-tag--ai {
  background: #dcfce7;
  color: #15803d;
}
.form-card-tag--new {
  background: #e0f2fe;
  color: #0369a1;
}
.form-card-incomplete {
  font-size: 11px;
  color: #d97706;
  font-weight: 500;
}
.form-card-optional {
  font-size: 11px;
  color: #aaa;
  margin-left: auto;
}

/* ── Form fields grid ── */
.form-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-field--full {
  grid-column: 1 / -1;
}
.field-label {
  font-size: 12px;
  font-weight: 500;
  color: #555;
  display: flex;
  align-items: center;
  gap: 4px;
}
.field-required {
  color: #ef4444;
}
.field-empty-hint {
  font-size: 10px;
  color: #d97706;
  font-weight: 400;
  background: #fef3c7;
  padding: 0 5px;
  border-radius: 4px;
}
.field-input,
.field-select {
  height: 34px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 10px;
  font-size: 13px;
  color: #1a1a1a;
  background: #fff;
  outline: none;
  transition: border-color 0.15s;
}
.field-input:focus,
.field-select:focus {
  border-color: #3b82f6;
}
.field-textarea {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  color: #1a1a1a;
  background: #fff;
  outline: none;
  resize: vertical;
  min-height: 72px;
  line-height: 1.5;
  font-family: inherit;
  transition: border-color 0.15s;
}
.field-textarea:focus {
  border-color: #3b82f6;
}
/* 高亮未识别字段 */
.field--missing {
  border-color: #fbbf24;
  background: #fffbeb;
}
.field--missing:focus {
  border-color: #f59e0b;
}

/* ── Footer ── */
.supplement-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 36px;
  border-top: 1px solid #e8f0fe;
  flex-shrink: 0;
}
.back-btn {
  margin-right: auto;
  background: transparent;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 9px 18px;
  font-size: 13px;
  color: #555;
  cursor: pointer;
  transition: border-color 0.15s;
}
.back-btn:hover { border-color: #9ca3af; }
.skip-btn {
  background: transparent;
  border: 1px solid #93c5fd;
  border-radius: 8px;
  padding: 9px 18px;
  font-size: 13px;
  color: #1565C0;
  cursor: pointer;
  transition: background 0.15s;
}
.skip-btn:hover { background: #eff6ff; }
.proceed-btn {
  background: linear-gradient(135deg, #1565C0, #1976D2);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 24px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.proceed-btn:hover { opacity: 0.9; }
</style>
