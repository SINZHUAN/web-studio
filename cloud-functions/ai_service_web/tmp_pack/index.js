'use strict'
/**
 * HTTP触发器包装层 - 自动注入JWT验证和CORS支持
 * 由 web-studio 工具自动生成，请勿手动修改此头部
 */
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'studio_jwt_secret_2026_please_change';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};
function _httpRespond(statusCode, data) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

// cloudfunctions_clo/ai_service_clo/index.js
// AI服务云函数 - 将AI功能从前端迁移到云函数以保护API密钥

// ============================================
// 云函数全局日志控制开关（唯一配置入口）
// ============================================
const ENABLE_CLOUD_DEBUG_LOG = false  // ← 改这里！生产环境建议 false
// ============================================
// true  = 开启日志（开发/调试环境）- 帮助定位问题，但会影响性能
// false = 关闭日志（生产环境）- 提升性能 30-50%，减少冷启动时间
// 
// 说明：
// - console.log/info: 受此开关控制
// - console.warn/error: 始终输出（用于异常告警）
// ============================================

// 应用全局日志控制（使用 Object.defineProperty 深度劫持）
if (!ENABLE_CLOUD_DEBUG_LOG) {
  const noop = () => {}
  
  // 保存原始方法（用于 warn 和 error）
  const originalWarn = console.warn
  const originalError = console.error
  
  // 使用 Object.defineProperty 深度劫持 console.log 和 console.info
  Object.defineProperty(console, 'log', {
    value: noop,
    writable: false,
    configurable: false
  })
  
  Object.defineProperty(console, 'info', {
    value: noop,
    writable: false,
    configurable: false
  })
  
  // 确保 warn 和 error 保持不变
  console.warn = originalWarn
  console.error = originalError
}

const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// DeepSeek API 配置 - 从环境变量获取，保持与原配置完全一致
const DEEPSEEK_CONFIG = {
  baseURL: 'https://api.deepseek.com',
  chatModel: 'deepseek-chat',
  reasonerModel: 'deepseek-reasoner',
  apiKey: process.env.DEEPSEEK_API_KEY, // 从环境变量获取
  timeout: 60000, // 60秒超时
  maxTokens: 4000, // 最大token数
  temperature: 0.2, // 数据分析任务用低温度，确保评分准确性
  topP: 0.7, // 控制输出随机性，提高一致性
  topK: 40 // 限制候选词数量，减少随机性
}

/**
 * 云函数入口函数
 */
async function _handleAction(event, context) {
  const wxContext = cloud.getWXContext()
  
  try {
    const { action, prompt, type } = event
    
    switch (action) {
      case 'callAI_optimize':
        // AI优化页面的AI调用（分析/优化功能）
        return await callDeepSeekAPI_Optimize(prompt, type)
      
      case 'callAI_guidance':
        // 信息模块页的AI指引功能
        return await callDeepSeekAPI_Guidance(prompt)
      
      case 'classify_resume_modules':
        // 导入简历功能的ai整理归纳
        return await classifyResumeModules(event)
      
      case 'super_mode_generate':
        // 超级模式话术生成（新功能）
        return await generateSuperModeResume(event)
      
      // ========== 简历优化功能（独立新增，不影响其他功能）==========
      case 'enhance_extract_sections':
        return await enhanceExtractSections(event)
      case 'enhance_polish_section':
        return await enhancePolishSection(event)
      case 'enhance_generate_summary':
        return await enhanceGenerateSummary(event)
      case 'enhance_analyze':
        return await enhanceAnalyze(event)
      // ================================================================

      default:
        throw new Error('未知的操作类型: ' + action)
    }
  } catch (error) {
    console.error('AI服务云函数执行错误:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * AI优化页面的DeepSeek API调用
 * 对应原 ai_optimize_pag.js 中的 callDeepSeekAPI 方法
 * 保持所有参数和提示词完全不变
 */
async function callDeepSeekAPI_Optimize(prompt, type = 'analysis') {
  try {
    // 检查API Key配置
    if (!DEEPSEEK_CONFIG.apiKey) {
      throw new Error('API Key未配置')
    }
    
    // 🆕 优化总结使用R1思考模型，分析评分使用普通模型
    const useReasonerModel = (type === 'polish')
    
    // 构建请求数据
    const requestData = {
      model: useReasonerModel ? DEEPSEEK_CONFIG.reasonerModel : DEEPSEEK_CONFIG.chatModel,
      messages: [
        {
          role: "system", 
          content: "你是一位严格的简历评估专家，具有丰富的HR和职业规划经验。请严格按照评分标准客观分析简历内容，不要给出偏高或偏低的评分。"
        },
        {
          role: "user", 
          content: prompt
        }
      ],
      stream: false
    }
    
    // 🆕 R1模型使用推荐配置，普通模型使用原有配置
    if (useReasonerModel) {
      // R1模型配置（推理模型）
      requestData.max_tokens = 8000  // R1需要更多token用于推理过程
      requestData.temperature = 1.0  // R1官方推荐temperature=1.0
    } else {
      // 普通模型配置（分析评分）
      requestData.max_tokens = DEEPSEEK_CONFIG.maxTokens
      requestData.temperature = DEEPSEEK_CONFIG.temperature
      requestData.top_p = DEEPSEEK_CONFIG.topP
      requestData.top_k = DEEPSEEK_CONFIG.topK
    }
    
    console.log('发送DeepSeek API请求 (优化页面):', {
      url: `${DEEPSEEK_CONFIG.baseURL}/chat/completions`,
      type: type,
      model: useReasonerModel ? 'deepseek-reasoner (R1)' : 'deepseek-chat',
      useReasonerModel: useReasonerModel
    })
    
    // 使用axios发送请求（替代wx.request）
    const response = await axios.post(
      `${DEEPSEEK_CONFIG.baseURL}/chat/completions`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_CONFIG.apiKey}`
        },
        timeout: DEEPSEEK_CONFIG.timeout
      }
    )
    
    console.log('DeepSeek API响应 (优化页面):', response.status)
    
    if (response.status === 200 && response.data && response.data.choices && response.data.choices.length > 0) {
      const content = response.data.choices[0].message.content
      return {
        success: true,
        content: content,
        usage: response.data.usage || null
      }
    } else {
      console.error('DeepSeek API响应格式错误 (优化页面):', response.data)
      throw new Error('API响应格式错误')
    }
    
  } catch (error) {
    console.error('DeepSeek API请求失败 (优化页面):', error)
    throw new Error(`API请求失败: ${error.message || '网络错误'}`)
  }
}

/**
 * 将原始上传简历文本归类为系统的13个模块结构
 */
async function classifyResumeModules(event) {
  const { rawText = '', hints = {} } = event || {}
  if (!rawText || typeof rawText !== 'string') {
    return { ok: false, error: 'rawText为空' }
  }

  if (!DEEPSEEK_CONFIG.apiKey) {
    return { ok: false, error: 'API Key未配置' }
  }

  const schemaInstruction = `严格返回JSON，键名固定：{
    "identity": "work|internship|student",
    "modules": {
      "basic": {"name":"","phone":"","email":"","city":"","education":"","school":""},
      "career": {"position":"","city":"","salary":"","status":""},
      "education": {"items":[{"school":"","major":"","degree":"","startDate":"","endDate":"","gpa":"","courses":"","description":""}]},
      "work": {"items":[{"company":"","department":"","position":"","startDate":"","endDate":"","description":"","salary":"","leaveReason":""}]},
      "internship": {"items":[{"company":"","position":"","startDate":"","endDate":"","description":""}]},
      "project": {"items":[{"name":"","role":"","startDate":"","endDate":"","description":"","technologies":"","achievements":""}]},
      "skill": {"items":[{"name":"","level":"","description":""}]},
      "certificate": {"items":[{"name":"","issuer":"","date":"","description":"","level":""}]},
      "skill_certificate": {"skillCertificates":[{"name":"","issuer":"","date":"","description":""}]},
      "self_evaluation": {"content":""},
      "hobby": {"items":[{"name":"","description":""}]},
      "exam_info": {"items":[{"examName":"","subject":"","score":"","examDate":"","status":""}]},
      "school_experience": {"items":[{"name":"","position":"","startDate":"","endDate":"","description":""}]}
    }
  }。不得新增或删除键；缺失请置空。仅输出JSON。`

  const headingHints = `模块标题与常见关键词（识别到这些标题/关键词时，将其后的段落内容优先归入对应模块）：
  - basic：基本信息、个人信息、联系方式、Contact、Personal Information
  - career：求职意向、目标岗位、职业目标、Career Objective、Target Position
  - education：教育背景、Education
  - work：工作经历、任职经历、Experience、Work Experience
  - internship：实习经历、Internship
  - project：项目经历、Projects、Project Experience
  - skill：技能、技能特长、Skills、Technical Skills
  - certificate：证书、资格证、获奖、荣誉、Awards、Certificates、Certifications（注：Awards/荣誉请归入此模块的items）
  - self_evaluation：自我评价、自我介绍、Summary、Profile
  - hobby：兴趣爱好、Hobbies
  - exam_info：考试信息、语言考试、资格考试、Exams、TOEFL、IELTS、CET
  - school_experience：校园经历、社团经历、学生工作、Campus Experience、Activities、Student Experience
 解析要求：
  - 以上述标题作为分段依据提取内容；遇到中英混排标题（如 教育背景EDUCATION）按教育模块处理。
  - 忽略无意义的散落数字噪声（非日期/手机号/邮箱/分数），不要写入结果。
  - 日期统一为YYYY-MM；无法确定则置空字符串。`

  const userHint = hints && hints.identity ? `用户身份倾向：${hints.identity}` : ''

  const requestData = {
    model: DEEPSEEK_CONFIG.chatModel,
    messages: [
      { role: 'system', content: '你是严格的信息抽取器，只能输出有效JSON，结构必须与给定Schema完全一致。' },
      { role: 'user', content: `${schemaInstruction}\n\n${headingHints}\n\n原始文本（可能包含中英标题）：\n${rawText}\n\n${userHint}` }
    ],
    max_tokens: DEEPSEEK_CONFIG.maxTokens,
    temperature: 0.2,
    stream: false,
    response_format: { type: 'json_object' }
  }

  try {
    const response = await axios.post(
      `${DEEPSEEK_CONFIG.baseURL}/chat/completions`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_CONFIG.apiKey}`
        },
        timeout: DEEPSEEK_CONFIG.timeout
      }
    )

    const content = response?.data?.choices?.[0]?.message?.content?.trim() || ''
    // 解析为JSON（容错处理：去除markdown围栏，截取首尾花括号区间）
    let parsed
    try {
      parsed = JSON.parse(content)
    } catch (_) {
      let jsonText = content
      // 去除```json ... ```围栏
      const fenceMatch = content.match(/```json[\s\S]*?```/i)
      if (fenceMatch) {
        jsonText = fenceMatch[0].replace(/```json/i, '').replace(/```/g, '').trim()
      } else {
        // 截取首个{到最后一个}
        const start = content.indexOf('{')
        const end = content.lastIndexOf('}')
        if (start !== -1 && end !== -1 && end > start) {
          jsonText = content.slice(start, end + 1)
        }
      }
      try {
        parsed = JSON.parse(jsonText)
      } catch (e2) {
        return { ok: false, error: 'AI返回非JSON' }
      }
    }

    // 基础健壮性检查
    if (!parsed.modules || typeof parsed.modules !== 'object') {
      return { ok: false, error: 'modules 缺失' }
    }

    // 基础补全，避免键缺失导致前端合并出错
    const EMPTY = { basic:{}, career:{}, education:{items:[]}, work:{items:[]}, internship:{items:[]}, project:{items:[]}, skill:{items:[]}, certificate:{items:[]}, skill_certificate:{skillCertificates:[]}, self_evaluation:{}, hobby:{items:[]}, exam_info:{items:[]}, school_experience:{items:[]}}
    const mergedModules = { ...EMPTY, ...(parsed.modules || {}) }
    return {
      ok: true,
      identitySuggestion: parsed.identity || '',
      confidence: 0.0,
      modules: mergedModules
    }
  } catch (error) {
    console.error('classify_resume_modules 失败:', error)
    return { ok: false, error: error.message }
  }
}

/**
 * 信息模块页的DeepSeek API调用
 * 对应原 modules_pag.js 中的 callDeepSeekAPI 方法
 * 保持所有参数和提示词完全不变
 */
async function callDeepSeekAPI_Guidance(prompt) {
  try {
    // 检查API Key配置
    if (!DEEPSEEK_CONFIG.apiKey) {
      throw new Error('API Key未配置')
    }

    // 完全保持原有的请求数据结构（注意温度参数不同）
    const requestData = {
      model: DEEPSEEK_CONFIG.chatModel,
      messages: [
        {
          role: "system",
          content: "你是一名专业的简历指导专家，擅长为不同职位提供针对性的简历填写建议。你的建议具体、实用、有针对性。"
        },
        {
          role: "user", 
          content: prompt
        }
      ],
      max_tokens: DEEPSEEK_CONFIG.maxTokens,
      temperature: 0.7, // 注意：指引功能使用不同的温度值
      stream: false
    }

    console.log('发送DeepSeek API请求 (信息模块页):', {
      url: `${DEEPSEEK_CONFIG.baseURL}/chat/completions`
    })

    // 使用axios发送请求（替代wx.request）
    const response = await axios.post(
      `${DEEPSEEK_CONFIG.baseURL}/chat/completions`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_CONFIG.apiKey}`
        },
        timeout: DEEPSEEK_CONFIG.timeout
      }
    )

    console.log('DeepSeek API响应 (信息模块页):', response.status)

    if (response.status === 200 && response.data && response.data.choices && response.data.choices.length > 0) {
      const content = response.data.choices[0].message.content.trim()
      return {
        success: true,
        content: content,
        usage: response.data.usage || null
      }
    } else {
      console.error('DeepSeek API响应格式错误 (信息模块页):', response.data)
      throw new Error('API响应格式错误')
    }
    
  } catch (error) {
    console.error('DeepSeek API请求失败 (信息模块页):', error)
    throw new Error(`API请求失败: ${error.message || '网络错误'}`)
  }
}

/**
 * 超级模式：根据用户对话数据润色简历话术（改进版：仅润色简述字段）
 * 流程：采集所有字段 → 只润色简述部分 → 合并固定+润色数据
 */
async function generateSuperModeResume(event) {
  try {
    const { 
      collectedData, 
      modulesList, 
      templateId, 
      userType, 
      targetPosition = '', 
      targetPositionJD = '', 
      polishingIntensity = 'standard' 
    } = event
    
    console.log('=== [云函数] 超级模式：开始润色简历话术 ===')
    console.log('=== [云函数] 润色参数 ===', {
      userType,
      targetPosition: targetPosition || '未提供',
      hasJD: !!targetPositionJD,
      JDLength: targetPositionJD ? targetPositionJD.length : 0,
      polishingIntensity,
      modulesCount: Object.keys(collectedData).length,
      collectedModules: Object.keys(collectedData)
    })
    
    // 检查API Key
    if (!DEEPSEEK_CONFIG.apiKey) {
      throw new Error('API Key未配置')
    }
    
    // 🔧 改进：构建润色提示词（只润色简述字段）
    const prompt = buildPolishPromptForSuperMode(
      collectedData, 
      modulesList, 
      userType, 
      targetPosition, 
      targetPositionJD, 
      polishingIntensity
    )
    
    console.log('=== [云函数] 提示词信息 ===', {
      length: prompt.length,
      hasTargetPosition: !!targetPosition,
      hasJD: !!targetPositionJD,
      intensity: polishingIntensity
    })
    
    // 调用DeepSeek API - 🔧 超级模式润色参数与modules_pag保持完全一致
    const requestData = {
      model: DEEPSEEK_CONFIG.chatModel,
      messages: [
        {
          role: "system",
          content: `你是专业的简历填写指导专家，擅长综合分析目标应聘职位及其行业特性、求职者自身情况、求职者当前身份视角，为求职者提供精准的填写指引和话术升级优化。

【核心能力】
- 精通STAR法则（Situation情境、Task任务、Action行动、Result结果）的应用
- 深度理解不同职位的核心能力要求和行业特性
- 根据求职者身份与求职者整体定位精准调整话术风格
- 擅长补全技术栈、量化数据（如提升%、处理量、时效）与具体成果

【重要任务】
1. ✅ **严格遵守各模块润色升级要求**，使用STAR法则重构，使描述专业且可信，输出内容专业、量化、可执行，禁止空洞口号或堆砌形容词
2. ✅ **严格控制字数**在要求范围内（如120-150字、30-40字等）
3. ✅ **基于用户真实情况**，严格基于用户真实情况，保留时间/公司/职位/学校等事实信息，不虚构
4. ✅ **禁止使用括号标题**（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等，必须输出流畅的段落描述
5. ✅ **提供优化总结**，在JSON最顶层添加optimization_summary对象

【输出规范】
- 严格的JSON格式，包含润色后的简述字段和优化总结
- 使用原始数据中的模块ID和字段名
- 多条记录的序号必须严格对应，绝不能错位
- 语言条理清晰、数据化、可执行，禁止空洞口号或堆砌形容词`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 4000,
      temperature: 0.0, // 🔧 与modules_pag一致：0.0保证输出格式稳定规范
      top_p: 0.95, // 🔧 与modules_pag一致：Top-P采样
      frequency_penalty: 0.0, // 🔧 与modules_pag一致：频率惩罚
      presence_penalty: 0.0, // 🔧 与modules_pag一致：存在惩罚
      stream: false,
      response_format: { type: 'json_object' }
    }
    
    console.log('=== [云函数] 发送DeepSeek API请求（润色简述）===')
    
    const response = await axios.post(
      `${DEEPSEEK_CONFIG.baseURL}/chat/completions`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_CONFIG.apiKey}`
        },
        timeout: 120000 // 🔧 与modules_pag一致：120秒超时
      }
    )
    
    console.log('=== [云函数] DeepSeek API响应 ===:', response.status)
    
    if (response.status === 200 && response.data && response.data.choices && response.data.choices.length > 0) {
      const content = response.data.choices[0].message.content.trim()
      
      // 解析润色后的数据
      let polishedData
      try {
        polishedData = JSON.parse(content)
        
        // 🆕 调试：检查AI返回的数据结构
        console.log('=== [云函数] AI返回的数据结构检查 ===', {
          topLevelKeys: Object.keys(polishedData),
          hasOptimizationSummary: !!polishedData.optimization_summary,
          optimizationSummaryKeys: polishedData.optimization_summary ? Object.keys(polishedData.optimization_summary) : null
        })
        
        // 🆕 如果存在优化总结，打印其内容（前500字）
        if (polishedData.optimization_summary) {
          console.log('=== [云函数] 优化总结内容预览 ===')
          console.log(JSON.stringify(polishedData.optimization_summary, null, 2).substring(0, 500))
        }
      } catch (error) {
        console.error('=== [云函数] JSON解析失败 ===:', error)
        throw new Error('AI返回数据格式错误')
      }
      
      // 🔧 改进：合并原始固定字段 + 润色后的简述字段
      const finalResumeData = mergeOriginalAndPolished(collectedData, polishedData, modulesList)
      
      console.log('=== [云函数] 简历数据生成成功（固定+润色）===')
      
      return {
        success: true,
        resumeData: finalResumeData,
        usage: response.data.usage || null
      }
    } else {
      console.error('=== [云函数] API响应格式错误 ===:', response.data)
      throw new Error('API响应格式错误')
    }
    
  } catch (error) {
    console.error('=== [云函数] 超级模式润色失败 ===:', error)
    return {
      success: false,
      error: error.message || '润色失败'
    }
  }
}



/**
 * 🆕 获取润色强度的文本描述
 */
function getIntensityText(intensity) {
  const intensityMap = {
    'senior': '资深版',
    'standard': '标准版',
    'basic': '基础版'
  }
  return intensityMap[intensity] || '标准版'
}

/**
 * 🆕 构造送检模块列表（告诉AI实际优化了哪些模块）
 */
function getSubmittedModulesList(collectedData, modulesList) {
  const moduleMapping = {
    'work': '工作经历',
    'internship': '实习经历',
    'project': '项目经历',
    'school_experience': '在校经历',  // 🔧 修复：正确的模块ID是school_experience
    'skill': '职业技能',
    'certificate': '奖项证书',
    'skill_certificate': '技能证书',
    'self_evaluation': '自我评价'
  }
  
  const submittedModules = []
  
  modulesList.forEach((module) => {
    const moduleId = module.moduleId
    const moduleData = collectedData[moduleId]
    
    // 检查模块是否有数据
    if (!moduleData || Object.keys(moduleData).length === 0) {
      return
    }
    
    // 根据模块类型判断是否有实际内容
    if (moduleId === 'work' || moduleId === 'internship' || moduleId === 'project' || 
        moduleId === 'school_experience') {
      // 经历类模块：检查content或description
      if (moduleData.items && Array.isArray(moduleData.items) && moduleData.items.length > 0) {
        const hasContent = moduleData.items.some(item => {
          const content = item.content || item.description || ''
          return content.trim().length > 0
        })
        if (hasContent) {
          submittedModules.push(`${moduleMapping[moduleId]}（${moduleData.items.length}条）`)
        }
      }
    } else if (moduleId === 'skill') {
      // 🔧 修复：职业技能模块检查skillName或name字段
      if (moduleData.items && Array.isArray(moduleData.items) && moduleData.items.length > 0) {
        const hasContent = moduleData.items.some(item => {
          const skillName = item.skillName || item.name || ''
          return skillName.trim().length > 0
        })
        if (hasContent) {
          submittedModules.push(`${moduleMapping[moduleId]}（${moduleData.items.length}条）`)
        }
      }
    } else if (moduleId === 'certificate') {
      // 🔧 修复：奖项证书模块检查name字段
      if (moduleData.items && Array.isArray(moduleData.items) && moduleData.items.length > 0) {
        const hasContent = moduleData.items.some(item => {
          const name = item.name || ''
          return name.trim().length > 0
        })
        if (hasContent) {
          submittedModules.push(`${moduleMapping[moduleId]}（${moduleData.items.length}条）`)
        }
      }
    } else if (moduleId === 'skill_certificate') {
      // 🔧 修复：技能证书模块使用skillCertificates数组或items数组
      const items = moduleData.skillCertificates || moduleData.items || []
      if (Array.isArray(items) && items.length > 0) {
        const hasContent = items.some(item => {
          const name = item.name || ''
          return name.trim().length > 0
        })
        if (hasContent) {
          submittedModules.push(`${moduleMapping[moduleId]}（${items.length}条）`)
        }
      }
    } else if (moduleId === 'self_evaluation') {
      // 自我评价（字符串或对象）
      const content = typeof moduleData === 'string' ? moduleData : (moduleData.content || '')
      if (content.trim().length > 0) {
        submittedModules.push(moduleMapping[moduleId])
      }
    }
  })
  
  console.log('=== [云函数] 送检模块列表 ===', {
    totalSubmitted: submittedModules.length,
    modules: submittedModules
  })
  
  return submittedModules
}

/**
 * 🆕 提取用户背景概要（用于优化总结）
 */
function extractUserBackground(collectedData, modulesList) {
  const background = []
  
  // 提取工作/实习年限
  const workData = collectedData.work || {}
  const internData = collectedData.internship || {}
  if (workData.items && workData.items.length > 0) {
    background.push(`${workData.items.length}段工作经历`)
  }
  if (internData.items && internData.items.length > 0) {
    background.push(`${internData.items.length}段实习经历`)
  }
  
  // 提取项目数量
  const projectData = collectedData.project || {}
  if (projectData.items && projectData.items.length > 0) {
    background.push(`${projectData.items.length}个项目`)
  }
  
  // 提取教育背景
  const educationData = collectedData.education || {}
  if (educationData.items && educationData.items.length > 0) {
    const edu = educationData.items[0]
    if (edu.school || edu.major) {
      background.push(`${edu.major || '相关专业'}背景`)
    }
  }
  
  return background.length > 0 ? background.join('、') : '求职者'
}

/**
 * 🔧 完全仿造信息模块页AI指引功能的润色提示词
 * 核心格式：用户自述："XXX"\n要求：基于以上用户真实情况，补充XXX，控制XX字，只输出优化后的完整话术，不要输出用户原文
 */
function buildPolishPromptForSuperMode(collectedData, modulesList, userType, targetPosition, targetPositionJD, polishingIntensity) {
  console.log('=== [云函数] 构建润色提示词（仿造信息模块页格式）===', {
    targetPosition,
    hasJD: !!targetPositionJD,
    intensity: polishingIntensity,
    modulesCount: modulesList.length,
    collectedModules: Object.keys(collectedData)
  })
  
  // 🆕 生成送检模块列表
  const submittedModules = getSubmittedModulesList(collectedData, modulesList)
  const modulesListText = submittedModules.length > 0 ? submittedModules.join('、') : '无'
  
  // 🆕 提取用户背景概要
  const userBackground = extractUserBackground(collectedData, modulesList)
  
  console.log('=== [云函数] 送检模块文本 ===', modulesListText)
  console.log('=== [云函数] 用户背景概要 ===', userBackground)
  
  // 🔧 生成"求职者整体定位与风格"描述（完全仿造信息模块页）
  const getIntensityDescription = (userType, intensity) => {
    const descriptionMatrix = {
      work: {
        senior: '这是一位【资深全职工作者】。请采用资深职场专业视角，全局侧重体现：(1)职责动词使用"主导"、"负责"、"带领"等强势词汇；(2)成果量化突出"大幅提升30%"、"处理百万级"等显著业绩；(3)专业深度强调"架构设计"、"技术选型"等高阶能力；(4)技术栈描述使用"精通XX"、"深入研究XX"等深度表达。整体风格：突出核心能力、架构设计、团队管理，强调结果与影响力，体现资深专业人士的技术深度与业务价值',
        standard: '这是一位【标准全职工作者】。请采用成熟职场视角，全局侧重体现：(1)职责动词使用"参与"、"协助"、"配合"等协作词汇；(2)成果量化体现"提升10%"、"完成核心模块"等稳健业绩；(3)专业深度突出"功能开发"、"问题解决"等实操能力；(4)技术栈描述使用"熟练使用XX"、"掌握XX"等实用表达。整体风格：平衡专业能力与学习能力，突出独立完成与快速成长，体现职场专业人士的稳健发展',
        basic: '这是一位【基础全职工作者】，专业能力处于基础阶段。请采用职场新人视角，全局侧重体现：(1)职责动词使用"学习"、"辅助"、"支持"等成长词汇；(2)成果量化体现"参与XX项目"、"掌握XX技能"等学习成果；(3)专业深度突出"基础实现"、"需求理解"等入门能力；(4)技术栈描述使用"了解XX"、"学习XX"等学习表达。整体风格：强调学习能力、适应能力与成长潜力，专业能力体现基础扎实，用学习能力强帮助弥补专业能力不足'
      },
      internship: {
        senior: '这是一位【资深实习生】，有较丰富的实习经验。请采用优秀实习生视角，全局侧重体现：(1)职责动词使用"参与"、"协助"、"配合"（避免"主导"），但可突出"独立完成"；(2)成果量化体现"提升30%"、"完成核心模块"等实质贡献；(3)专业深度突出"功能开发"、"问题解决"等实操能力；(4)技术栈描述使用"熟练使用XX"、"掌握XX"等实用表达。整体风格：突出专业能力、独立贡献与技术深度，避免过度夸大，体现优秀实习生的专业素养',
        standard: '这是一位【标准实习生】。请采用学习者视角，全局侧重体现：(1)职责动词使用"参与"、"协助"、"配合"等协作词汇；(2)成果量化体现"完成XX功能"、"掌握XX技能"、"提升10%"等基础工作成果；(3)专业深度突出"功能开发"、"问题解决"等基础实操；(4)技术栈描述使用"熟练使用XX"、"掌握XX"等学习表达。整体风格：平衡实践能力与学习能力，体现参与贡献与快速成长，杜绝"主导""主要负责"等夸大词汇',
        basic: '这是一位【基础实习生】，专业能力处于初学阶段。请采用学习成长视角，全局侧重体现：(1)职责动词使用"学习"、"辅助"、"支持"等学习词汇；(2)成果量化体现"参与XX项目"、"掌握XX技能"等学习收获；(3)专业深度突出"基础实现"、"需求理解"等入门能力；(4)技术栈描述使用"了解XX"、"学习XX"等初学表达。整体风格：强调学习能力、适应能力与潜力发掘，专业能力体现初步掌握，用学习热情和成长潜力弥补经验不足'
      },
      student: {
        senior: '这是一位【活跃在校生】，有丰富的项目和活动经验。请采用活跃在校生视角，全局侧重体现：(1)职责动词使用"参与"、"协助"、"组织"等主动词汇；(2)成果量化体现"完成XX项目"、"组织XX活动"等具体成果；(3)专业深度突出"项目实践"、"技术积累"等学习成果；(4)技术栈描述使用"熟练使用XX"、"掌握XX"等实用表达。整体风格：突出项目经验、技术积累与实践能力，体现在校生的主动性与专业潜力',
        standard: '这是一位【标准在校生】。请采用学习者视角，全局侧重体现：(1)职责动词使用"参与"、"学习"、"实践"等学习词汇；(2)成果量化体现"参与XX项目"、"掌握XX技能"等学习成果；(3)专业深度突出"基础学习"、"项目实践"等在校经验；(4)技术栈描述使用"掌握XX"、"学习XX"等学习表达。整体风格：平衡基础能力与学习潜力，体现成长与适应，展现在校生的学习能力与发展空间',
        basic: '这是一位【基础在校生】，专业学习处于初期阶段。请采用学习探索视角，全局侧重体现：(1)职责动词使用"学习"、"了解"、"接触"等探索词汇；(2)成果量化体现"参与XX课程"、"学习XX知识"等学习过程；(3)专业深度突出"基础认知"、"兴趣探索"等入门状态；(4)技术栈描述使用"了解XX"、"学习XX"等初学表达。整体风格：强调学习能力、兴趣热情与发展潜力，体现在校生的成长空间与学习意愿'
    }
  }
    return descriptionMatrix[userType]?.[intensity] || descriptionMatrix.work.standard
  }
  
  const intensityDescription = getIntensityDescription(userType, polishingIntensity)
  
  let prompt = `你是专业的简历填写指导专家，擅长综合分析目标应聘职位及其行业特性、求职者自身情况、求职者当前身份视角，为求职者提供精准的填写指引和话术润色升级优化。

【目标应聘职位】${targetPosition || '通用职位'}
${targetPositionJD ? `职位JD要求：${targetPositionJD}` : ''}

【话术升级优化生成总体规则】
- **有用户情况的模块**：必须严格基于【用户当前自述情况】的真实内容展开，保留时间/公司/职位/学校等事实信息，结合目标应聘职位与求职者整体定位按照STAR叙事法则要求补全技术栈、行业术语、量化数据（如提升%/处理量/时效）与具体成果，使描述专业且可信
- **求职者整体定位与风格**：${intensityDescription}
- **语言规范**：所有话术需条理清晰、数据化、可执行，必须满足对应字数要求，禁止空洞口号或堆砌形容词
- **格式规范**：输出的话术必须是连贯的自然文本，禁止使用（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等括号标题或分段标记，必须是流畅的段落描述

## 需要优化的内容

`

  let polishCount = 0
  
  // 🔧 核心改变：完全仿造信息模块页的提示词格式
  modulesList.forEach((module) => {
    const moduleData = collectedData[module.moduleId]
    if (!moduleData || Object.keys(moduleData).length === 0) {
      console.log(`=== [云函数] 跳过模块 ${module.label} (${module.moduleId}): 无数据 ===`)
      return
    }
    
    // 根据模块ID确定提示词
    if (module.moduleId === 'work') {
      // ===== 工作经历 =====
      if (moduleData.items && Array.isArray(moduleData.items)) {
        prompt += `### 工作经历\n\n`
        moduleData.items.forEach((item, index) => {
          const content = item.content || item.description || ''
        if (content) {
          polishCount++
            prompt += `第${index + 1}条用户自述："${content}"\n`
            prompt += `要求：基于以上用户真实情况，按照STAR法则（情境-任务-行动-结果）补充技术栈、具体成就、量化数据（提升%、处理量等），输出流畅的段落描述文本，**禁止使用（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等括号标题**，**严格控制100-140字之间（不得少于100字，不得超过140字）**，只输出优化后的完整话术，不要输出用户原文。**重要：第${index + 1}条必须输出为"工作经历-${index + 1}"，序号严格对应，绝不能错位**\n\n`
          }
        })
        }
    } else if (module.moduleId === 'internship') {
      // ===== 实习经历 =====
      if (moduleData.items && Array.isArray(moduleData.items)) {
        prompt += `### 实习经历\n\n`
        moduleData.items.forEach((item, index) => {
          const content = item.content || item.description || ''
          if (content) {
            polishCount++
            prompt += `第${index + 1}条用户自述："${content}"\n`
            prompt += `要求：基于以上用户真实情况，按照STAR法则（情境-任务-行动-结果）补充技术栈、具体成果、量化数据（提升%、处理量等）、导师评价，输出流畅的段落描述文本，**禁止使用（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等括号标题**，**严格控制100-140字之间（不得少于100字，不得超过140字）**，只输出优化后的完整话术，不要输出用户原文。**重要：第${index + 1}条必须输出为"实习经历-${index + 1}"，序号严格对应，绝不能错位**\n\n`
          }
        })
      }
            } else if (module.moduleId === 'project') {
      // ===== 项目经历 =====
      if (moduleData.items && Array.isArray(moduleData.items)) {
        prompt += `### 项目经历\n\n`
        moduleData.items.forEach((item, index) => {
          const content = item.content || item.description || ''
          if (content) {
            polishCount++
            prompt += `第${index + 1}条用户自述："${content}"\n`
            prompt += `要求：基于以上用户真实情况，按照STAR法则（情境-任务-行动-结果）补充技术选型、角色职责、解决方案、量化成果（性能提升、用户量等），输出流畅的段落描述文本，**禁止使用（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等括号标题**，**严格控制100-140字之间（不得少于100字，不得超过140字）**，只输出优化后的完整话术，不要输出用户原文。**重要：第${index + 1}条必须输出为"项目经历-${index + 1}"，序号严格对应，绝不能错位**\n\n`
          }
        })
      }
            } else if (module.moduleId === 'school_experience') {
      // ===== 在校经历 =====
      if (moduleData.items && Array.isArray(moduleData.items)) {
        prompt += `### 在校经历\n\n`
        moduleData.items.forEach((item, index) => {
          const content = item.content || item.description || ''
          if (content) {
            polishCount++
            prompt += `第${index + 1}条用户自述："${content}"\n`
            prompt += `要求：基于以上用户真实情况，按照STAR法则（情境-任务-行动-结果）补充具体职责、成果、团队协作经验，输出流畅的段落描述文本，**禁止使用（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等括号标题**，**严格控制100-140字之间（不得少于100字，不得超过140字）**，只输出优化后的完整话术，不要输出用户原文。**重要：第${index + 1}条必须输出为"在校经历-${index + 1}"，序号严格对应，绝不能错位**\n\n`
          }
        })
      }
    } else if (module.moduleId === 'education') {
      // ===== 教育经历（AI生成描述）=====
      if (moduleData.items && Array.isArray(moduleData.items)) {
        prompt += `### 教育经历\n\n`
        moduleData.items.forEach((item, index) => {
          // 🔧 用户只提供了基本信息（学校、专业、学历），AI需要生成description
          const school = item.school || ''
          const major = item.major || ''
          const degree = item.degree || ''
          if (school && major) {
            polishCount++
            prompt += `第${index + 1}条基本信息：学校"${school}"，专业"${major}"，学历"${degree}"\n`
            prompt += `要求：基于以上学校、专业、学历信息，结合【${targetPosition}】岗位特性和求职者整体定位，生成一句简洁的教育描述，列明核心课程、学术成果或实践项目（如"核心课程：数据结构、算法、数据库，GPA优秀"），**严格控制40-60字之间（不得少于40字，不得超过60字）**，只输出description字段内容，必须保留学校和专业名称。**重要：第${index + 1}条必须输出为"教育经历-${index + 1}"，序号严格对应，绝不能错位**\n\n`
          }
        })
      }
            } else if (module.moduleId === 'skill') {
      // ===== 职业技能（AI生成描述）=====
      if (moduleData.items && Array.isArray(moduleData.items)) {
        prompt += `### 职业技能\n\n`
        moduleData.items.forEach((item, index) => {
          // 🔧 用户只提供了技能名称和熟练度，AI需要生成description
          const skillName = item.skillName || item.name || ''
          const level = item.level || ''
          if (skillName) {
            polishCount++
            prompt += `第${index + 1}条基本信息：技能名称"${skillName}"，熟练度"${level}"\n`
            prompt += `要求：仅基于以上技能名称和熟练度，生成一句专业的技能介绍，强化能力和技术水平精简表述（如"熟练掌握XX技术，具备XX年实战经验，能够完成XX开发/设计/分析等工作"），**严格控制在20字之内（不得超过20字）**，只输出description字段内容。**重要：第${index + 1}条必须输出为"职业技能-${index + 1}"，序号严格对应，绝不能错位**\n\n`
            }
        })
      }
    } else if (module.moduleId === 'certificate') {
      // ===== 奖项证书（AI生成描述）=====
      if (moduleData.items && Array.isArray(moduleData.items)) {
        prompt += `### 奖项证书\n\n`
        moduleData.items.forEach((item, index) => {
          // 🔧 用户只提供了证书/奖项名称，AI需要生成description
          const name = item.name || ''
          if (name) {
            polishCount++
            prompt += `第${index + 1}条基本信息：证书/奖项名称"${name}"\n`
            prompt += `要求：仅基于以上证书/奖项名称，生成一句专业的证书介绍，权威性精简表述（如"掌握XX专业能力和竞争力"），**严格控制20字之内（不得超过20字）**，只输出description字段内容。**重要：第${index + 1}条必须输出为"奖项证书-${index + 1}"，序号严格对应，绝不能错位**\n\n`
          }
        })
      }
    } else if (module.moduleId === 'skill_certificate') {
      // ===== 技能证书（AI生成描述）=====
      if (moduleData.items && Array.isArray(moduleData.items)) {
        prompt += `### 技能证书\n\n`
        moduleData.items.forEach((item, index) => {
          // 🔧 用户只提供了证书名称，AI需要生成description
          const name = item.name || ''
          if (name) {
            polishCount++
            prompt += `第${index + 1}条基本信息：证书名称"${name}"\n`
            prompt += `要求：仅基于以上证书名称，生成一句专业的证书介绍，强化技术能力和认证等级精简表述（如"掌握XX技术能力，能够完成XX工作"），**严格控制20字之内（不得超过20字）**，只输出description字段内容。**重要：第${index + 1}条必须输出为"技能证书-${index + 1}"，序号严格对应，绝不能错位**\n\n`
          }
        })
      }
    } else if (module.moduleId === 'self_evaluation') {
      // ===== 自我评价 =====
      const content = moduleData.content || ''
      if (content) {
        polishCount++
        prompt += `### 自我评价\n\n`
        prompt += `用户自述："${content}"\n`
        prompt += `要求：基于以上用户真实情况，以用户第一人称视角，补充技术能力、项目经验、团队协作、学习能力等自我介绍情况，**严格控制130-170字之间（不得少于130字，不得超过170字）**，只输出优化后的完整话术，不要输出用户原文\n\n`
          }
    }
    
    console.log(`=== [云函数] 处理模块 ${module.label} (${module.moduleId}) === 需润色字段数: ${polishCount}`)
  })
  
  if (polishCount === 0) {
    console.log('=== [云函数] 警告：没有需要润色的内容 ===')
  }
  
  prompt += `\n## 输出格式

**请严格按照以下JSON格式输出，不要有其他文字说明：**

\`\`\`json
{`

  // 🔧 构建输出示例
  const outputExample = []
  
  modulesList.forEach(module => {
    const moduleData = collectedData[module.moduleId]
    if (!moduleData || Object.keys(moduleData).length === 0) return
    
    if (module.moduleId === 'self_evaluation' && moduleData.content) {
      outputExample.push(`
  "${module.moduleId}": {
    "content": "【优化后的自我评价，220-250字】"
  }`)
    } else if (moduleData.items && Array.isArray(moduleData.items)) {
      // 🔧 根据模块类型确定字段名
      let fieldName = 'content'  // 默认使用content
      
      // 这些模块使用description字段（AI生成描述）
      if (['education', 'skill', 'certificate', 'skill_certificate'].includes(module.moduleId)) {
        fieldName = 'description'
      } else {
        // 其他模块检测使用的字段名（优先content，否则description）
        const firstItem = moduleData.items.find(item => item.content || item.description)
        if (firstItem) {
          fieldName = firstItem.content ? 'content' : 'description'
        }
      }
      
      // 检查是否有数据需要处理
      const hasData = moduleData.items.some(item => {
        if (['education', 'skill', 'certificate', 'skill_certificate'].includes(module.moduleId)) {
          // 这些模块有基本信息即可（学校、技能名称、证书名称等）
          return true
        } else {
          // 其他模块需要有content或description
          return item.content || item.description
        }
      })
      
      if (hasData) {
        let itemsExample = '['
        moduleData.items.forEach((item, index) => {
            if (index > 0) itemsExample += ','
            itemsExample += `
      {
        "${fieldName}": "【优化后的话术，按要求字数】"
      }`
        })
        itemsExample += `
    ]`
        
        outputExample.push(`
  "${module.moduleId}": {
    "items": ${itemsExample}
  }`)
      }
    }
  })
  
  prompt += outputExample.join(',')
  prompt += `
}
\`\`\`

**关键提醒：**
1. ✅ 只返回优化后的描述字段（content或description）
2. ❌ 不要返回固定字段（name、company、position、startDate、endDate等）
3. ✅ 严格控制字数在要求范围内
4. ✅ 基于用户真实情况，不虚构
5. ✅ 只输出JSON，不要有其他文字
6. ⚠️ **必须使用原始数据中的模块ID**（如"work"而非"work_experience"）
7. ⚠️ **必须使用原始数据中的字段名**（如"content"或"description"）
8. ⚠️ **多条记录的序号必须严格对应**，绝不能错位

## 优化总结要求

**重要说明：** 在完成以上所有模块的润色后，必须在JSON的**最顶层**添加"optimization_summary"对象。这是为了让求职者清楚了解AI的优化思路、改进重点和核心竞争力，提升简历优化的透明度和可信度。

**核心原则：深度分析 > 套话模板，个性化 > 通用性，贴合实际 > 空洞描述**

**本次优化上下文信息：**
- 目标岗位：${targetPosition}
- 岗位JD：${targetPositionJD || '未提供，需基于岗位名称推断要求'}
- 润色强度：${getIntensityText(polishingIntensity)}
- 用户背景：${userBackground}
- 送检模块：${modulesListText}

### 优化总结结构示例

\`\`\`json
{
  "optimization_summary": {
    "position_analysis": "这里填写岗位分析内容...",
    "overall_strategy": "这里填写整体策略内容...",
    "key_improvements": [
      "【模块名1】：优化重点和思路说明...",
      "【模块名2】：优化重点和思路说明...",
      "【模块名3】：优化重点和思路说明..."
    ],
    "core_strengths": "这里填写核心竞争力内容...",
    "interview_suggestions": "这里填写面试建议内容..."
  },
  "work": [...],
  "internship": [...],
  ... 其他模块数据 ...
}
\`\`\`

### 各字段详细要求

**1. position_analysis（岗位深度分析）**
- **目标：** 深入分析目标职位【${targetPosition}】${targetPositionJD ? '及其JD要求' : '的市场通用要求'}
- **内容要求：** 
  ${targetPositionJD ? 
  `* 从JD中提炼：核心技术栈要求、关键技能点、经验水平要求
  * 分析隐含要求：团队协作能力、问题解决能力、学习能力等
  * 指出关键筛选点：哪些是硬性指标，哪些是加分项` :
  `* 基于岗位名称推断：该岗位的核心技能要求、典型工作场景
  * 分析行业通用要求：技术栈、经验年限、项目复杂度
  * 指出该岗位的关键能力维度`}
- **字数：** 严格控制在80-120字
- **禁止：** 过于笼统的描述（如"该岗位要求较高的技术能力和项目经验"）
- **示例：** "该岗位核心要求Vue3生态深度掌握（Pinia/VueRouter）、组件化设计能力，JD强调'性能优化'和'技术选型'暗示需要有架构经验。隐含要求：带过小团队、code review经验，能独立攻克技术难点"

**2. overall_strategy（整体优化策略）**
- **目标：** 说明**如何基于用户真实情况、结合岗位要求和润色强度**进行优化
- **内容要求：** 
  * **必须结合**：岗位要求 + 用户背景（${userBackground}）+ 润色强度（${getIntensityText(polishingIntensity)}）
  * 说明具体的优化策略：如何调整简历重点、突出哪些优势、如何弥补不足
  * 体现定制化思路：为什么这样优化对该用户匹配该岗位最有效
- **字数：** 严格控制在80-120字
- **禁止：** 模板化语言（如"采用资深版风格，突出技术深度"）
- **示例：** "你的${userBackground}与该岗位匹配度约70%。策略：工作经历突出你负责的XX系统（含50+组件复用），强化架构设计能力；补充webpack优化使首屏提速60%的量化成果；项目经历侧重权限设计和复杂表单处理；技能新增微前端技术栈以弥补经验gap"

**3. key_improvements（关键改进思路）**
- **目标：** 针对【${modulesListText}】中的每个模块，说明**为什么这样改、改了什么、预期效果**
- **格式要求：** 
  * 必须是字符串数组，每个元素对应一个送检模块
  * 格式为"【模块名】：优化思路说明"
  * 数组长度必须与送检模块数量一致
  * 按照送检模块的顺序逐一说明
- **内容要求：** 
  * 说明优化思路：为什么针对该模块这样改（结合岗位要求）
  * 说明改进手法：具体用了什么优化技巧（STAR结构、量化数据、技术栈强化等）
  * 说明预期效果：优化后如何更匹配岗位要求
- **字数：** 每个模块30-50字
- **禁止：** 只说改了什么，不说为什么改
- **示例：** 
  \`\`\`json
  "key_improvements": [
    "【实习经历（2条）】：岗位要求STAR结构展现问题解决能力，补充情境背景和量化成果（响应速度提升40%），强化Vue技术栈描述以匹配JD中的框架要求",
    "【项目经历（1条）】：为匹配岗位的'性能优化'要求，突出webpack打包优化和首屏加载提速成果，增加技术难点攻克过程体现问题解决能力",
    "【职业技能（3条）】：岗位要求'精通Vue'，调整表达从'了解'升级为'熟练使用+项目实践'，增强专业能力证明以达到JD硬性要求",
    "【自我评价】：结合岗位的'团队协作'和'学习能力'要求，整合核心优势，突出快速学习能力和2年Vue实战经验的匹配度"
  ]
  \`\`\`

**4. core_strengths（核心竞争力）**
- **目标：** 提炼用户的核心优势，说明**为什么这些优势能匹配岗位**
- **内容要求：** 
  * 从岗位视角提炼用户的3-4个核心优势
  * **必须说明**：这些优势如何匹配岗位要求
  * 尽量量化能力证明（如"2年Vue经验+3个toB项目"）
- **字数：** 严格控制在60-80字
- **禁止：** 罗列优势但不说明匹配度
- **示例：** "核心优势：①Vue生态实战经验（2年+3个项目）匹配JD的框架要求；②独立负责过组件库开发（50+组件）匹配岗位的组件化能力要求；③有性能优化实战（首屏提速60%）匹配JD强调的性能要求；④学习能力强，能快速掌握新技术"

**5. interview_suggestions（面试建议）**
- **目标：** 针对该岗位，给出**实用、可执行**的面试准备建议
- **内容要求：** 
  * 建议重点准备哪些技术细节（结合岗位JD）
  * 提示可能的技术深挖点（如性能优化原理、组件设计思路）
  * 建议准备哪些项目案例和数据
- **字数：** 严格控制在50-70字
- **禁止：** 过于笼统的建议（如"准备项目经验"）
- **示例：** "重点准备：①Vue组件通信方案和组件库设计思路；②webpack性能优化具体措施和效果数据；③权限系统设计方案；④至少2个技术难点攻克案例。可能会问：Vue3 Composition API的优势、前端性能监控方案"

### 关键提醒

⚠️ **必须深度分析上下文**：目标岗位、岗位JD、用户背景、润色强度，四者结合给出定制化建议
⚠️ **必须避免套话模板**：每次输出都要基于实际情况重新分析，不要用固定句式
⚠️ **必须体现思路分析**：说明"为什么这样优化"，而非只说"优化了什么"
⚠️ **必须严格控制字数**：不得少于最小值，不得超过最大值
⚠️ **key_improvements数组长度必须与送检模块数量一致**
⚠️ **optimization_summary必须位于JSON的最顶层**，与其他模块数据并列
`
  
  console.log('=== [云函数] 润色提示词构建完成 ===', {
    promptLength: prompt.length,
    polishCount,
    totalModules: modulesList.length
  })
  
  // 🔧 关键调试：输出完整提示词（前1000字）
  console.log('=== [云函数] 提示词预览（前1000字）===')
  console.log(prompt.substring(0, 1000))
  console.log('=== [云函数] 提示词预览结束 ===')
  
  return prompt
}

/**
 * 🔧 新增：合并原始固定字段 + 润色后的简述字段
 * 确保固定字段保持用户原始输入，只替换简述字段为AI润色后的内容
 * 兼容处理：支持 content 和 description 两种字段名
 */
function mergeOriginalAndPolished(originalData, polishedData, modulesList) {
  console.log('=== [云函数] 开始合并原始数据和润色数据 ===', {
    originalModules: Object.keys(originalData),
    polishedModules: Object.keys(polishedData)
  })
  
  // 🔧 关键调试：输出完整的润色数据
  console.log('=== [云函数] AI返回的完整润色数据 ===')
  console.log(JSON.stringify(polishedData, null, 2))
  console.log('=== [云函数] 润色数据输出结束 ===')
  
  const finalData = {}
  
  // 遍历所有模块
  for (const module of modulesList) {
    const moduleId = module.moduleId
    const original = originalData[moduleId]
    const polished = polishedData[moduleId]
    
    if (!original || Object.keys(original).length === 0) {
      // 原始数据为空，跳过
      continue
    }
    
    console.log(`=== [云函数] 处理模块 ${module.label} (${moduleId}) ===`)
    
    if (moduleId === 'self_evaluation') {
      // 自我评价：单字段content
      finalData[moduleId] = {
        content: polished?.content || original.content || ''
      }
      
      console.log(`  - content字段: ${polished?.content ? '已润色' : '保持原样'}`)
      
    } else if (original.items && Array.isArray(original.items)) {
      // 多条记录模块：处理items数组
      finalData[moduleId] = {
        items: original.items.map((item, index) => {
          const mergedItem = { ...item } // 保留所有固定字段
          
          // 🔧 兼容处理：智能检测并替换描述字段（支持 description 和 content）
          const hasDescription = item.description !== undefined && item.description !== ''
          const hasContent = item.content !== undefined && item.content !== ''
          const polishedDesc = polished?.items?.[index]?.description || polished?.items?.[index]?.content
          
          if (polishedDesc) {
            // AI提供了润色版本
            if (hasDescription) {
              // 原始使用 description，替换它
              mergedItem.description = polishedDesc
              console.log(`  - items[${index}].description: 已润色（${polishedDesc.length}字）`)
            } else if (hasContent) {
              // 原始使用 content，替换它
              mergedItem.content = polishedDesc
              console.log(`  - items[${index}].content: 已润色（${polishedDesc.length}字）`)
            } else {
              // 原始没有描述字段，使用标准的 description
              mergedItem.description = polishedDesc
              console.log(`  - items[${index}].description: 新增润色内容（${polishedDesc.length}字）`)
            }
          } else {
            // AI未提供润色版本，保持原样
            if (hasDescription) {
              console.log(`  - items[${index}].description: 保持原样（无润色版本）`)
            } else if (hasContent) {
              console.log(`  - items[${index}].content: 保持原样（无润色版本）`)
            }
          }
          
          return mergedItem
        })
      }
      
    } else {
      // 固定模块（如basic、career、education固定字段部分）
      // 完全保留原始数据
      finalData[moduleId] = { ...original }
      console.log(`  - 固定模块，完全保留原始数据`)
    }
  }
  
  // 🆕 处理 optimization_summary（如果存在）
  if (polishedData.optimization_summary) {
    finalData.optimization_summary = polishedData.optimization_summary
    console.log('=== [云函数] 检测到优化总结，已添加到最终数据 ===', {
      hasPositionAnalysis: !!polishedData.optimization_summary.position_analysis,
      hasOverallStrategy: !!polishedData.optimization_summary.overall_strategy,
      keyImprovementsCount: polishedData.optimization_summary.key_improvements?.length || 0,
      hasCoreStrengths: !!polishedData.optimization_summary.core_strengths,
      hasInterviewSuggestions: !!polishedData.optimization_summary.interview_suggestions
    })
  } else {
    console.log('⚠️ [云函数] 警告：AI返回的数据中没有 optimization_summary')
  }
  
  console.log('=== [云函数] 数据合并完成 ===', {
    originalModules: Object.keys(originalData).length,
    polishedModules: Object.keys(polishedData).length,
    finalModules: Object.keys(finalData).length,
    hasOptimizationSummary: !!finalData.optimization_summary
  })
  
  return finalData
}

// ============================================================
// 简历优化功能 - 以下为全新独立函数，不影响任何已有功能
// ============================================================

/**
 * AI识别简历段落数组中的各模块（工作/实习/项目/在校/自我评价）
 * @param {object} event - { paragraphs: [{idx, text}] }
 */
async function enhanceExtractSections(event) {
  try {
    const { paragraphs } = event
    if (!paragraphs || !Array.isArray(paragraphs)) throw new Error('paragraphs 参数缺失')

    const paragraphListText = paragraphs.map(p => `[${p.idx}] ${p.text}`).join('\n')

    const prompt = `你是一位专业的简历解析专家。以下是一份简历的段落列表（每行格式为 [索引] 段落内容）：

${paragraphListText}

请完成两件事：
1. 提取简历所有者的姓名（name 字段，通常出现在简历最顶部，若无法识别则返回空字符串）。
2. 严格按照下方模块定义，识别各模块下的经历条目，并按【合并规则】提取内容。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【核心合并规则（最重要，必须严格遵守）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▶ 每一个 item（数组元素）代表简历中的【一个完整的经历条目】，即同一家公司/同一职位/同一项目/同一经历的全部内容。

▶ 同一经历条目下的所有描述性段落，无论分成多少段、是否带序号（1. 2. 3.）、是否分点（• - ※）、是否有小标题（如"涉及技术：""项目介绍："），都必须全部合并为一个 originalText，段落之间用 \\n 连接。

▶ 典型错误示范（绝对禁止）：
   将一份工作经历的19个描述段落拆成19条 item ← 这是严重错误！
   
▶ 正确示范：
   一家公司的全部工作描述（无论多少段）→ 合并为1条 item，originalText 包含所有段落内容

▶ 判断"条目边界"的方法：
   遇到新的【公司名/机构名 + 职位名 + 时间区间】组合出现，才说明一个新条目开始。
   同一条目内出现的序号段落、小标题段落、分点段落，都属于该条目，不要拆分。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【各模块定义与典型标题关键词】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ work（工作经历）
  典型标题关键词：工作经历、工作经验、职业经历、工作履历、Work Experience、Professional Experience
  提取内容：正式入职公司的全部工作描述（含职责、成就、分项说明等）
  ⚠️ 排除：实习经历、教育背景、在校经历、项目经历

■ internship（实习经历）
  典型标题关键词：实习经历、实习经验、实习履历、实习、Internship Experience、Internship
  提取内容：实习期间的全部工作内容（含参与项目、收获等）
  ⚠️ 排除：正式工作经历、教育背景、在校经历

■ project（项目经历）
  典型标题关键词：项目经历、项目经验、项目案例、Project Experience、Projects
  提取内容：项目描述、技术实现、项目成果的全部内容
  ⚠️ 排除：工作经历、实习经历、教育背景

■ school_experience（在校经历）
  典型标题关键词：在校经历、校园经历、校园活动、社团经历、学生工作、课外活动、志愿服务、Campus Experience、Extracurricular
  提取内容：学生社团职务、志愿服务、校园竞赛、学生会工作等全部描述
  ⚠️ 严格排除（绝对不能归入此模块）：
     - 教育背景 / 教育经历 / 学历信息（含学校名称、专业、学位、GPA、课程）
     - 标题含"教育"、"Education"、"学历"、"学位"、"Degree"的段落下的所有内容
     - 仅描述就读时间、专业课程、学习成绩的段落

■ self_evaluation（自我评价）
  典型标题关键词：自我评价、自我介绍、个人简介、个人评价、个人陈述、About Me、Self-Introduction、Summary、个人优势
  提取内容：个人能力综合介绍、职业规划、性格特点等自我描述的全部内容（多段合并为一条）
  ⚠️ 排除：其他任何模块下的描述段落

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【通用提取规则】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- originalText 中每个段落内容必须与原文逐字完全一致，严禁修改、润色或截断任何字符
- 段落间用 \\n 连接，保留原有的序号、符号、换行结构
- 跳过以下边界标记行（不纳入 originalText）：模块标题行、公司名/学校名单独行、职位名/专业名单独行、纯时间段行
- sectionOrder 表示同一模块内第几个经历条目（从0开始，例如第1份工作=0，第2份工作=1）
- ⚠️【多条目规则 - 极其重要】如果同一模块下有多个独立的经历条目（如2段实习、3个项目），必须在数组中返回多个元素！每个独立经历（不同公司/项目/经历）对应1个独立的数组元素，绝对不能将多个独立经历合并到一个 originalText 中！
- 无法确定归属模块时，宁可归入空数组，不得强行归类
- 如果某模块在简历中不存在，对应值返回空数组 []

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【内容格式识别规则（contentFormat 字段）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

每个 item 需严格判断其内容格式，默认为 "paragraph"，仅在满足全部条件时才设为 "subtitle"：

■ "subtitle"（小标题格式）——必须同时满足以下全部条件才可设置：
   ✅ 条件1：存在 2 个及以上独立的"标签行"，每个标签行格式为【短标签（2～8字）+ 全角冒号"："+ 内容】
   ✅ 条件2：这些标签行是结构性分类标题（如"涉及技术：""项目介绍：""负责功能："），而非句子中间的冒号
   ✅ 条件3：标签处于行首或独立成段，不是嵌套在长句子内部
   ✅ 典型示例：
      涉及技术：Springboot、Redis、MySQL
      项目介绍：参与外卖点餐平台全链路测试...
      负责功能：运用等价类边界值方法设计测试用例...

■ "paragraph"（自然段落格式）——以下任意一种情况必须设为 "paragraph"：
   ❌ 连续叙述的自然文本段落（即使段落中含有冒号）
   ❌ 带序号的列表（1. 2. 3. 或 ① ② ③），无论是否含冒号
   ❌ 带项目符号的列表（• - ※ ·），无论是否含冒号
   ❌ 仅1个标签行，或所有"冒号"都出现在长句子内部而非行首位置
   ❌ 自我评价（self_evaluation 模块）永远是 "paragraph"
   ⚠️ 判断原则：有疑问时一律设为 "paragraph"，切勿将自然叙述错判为小标题格式

严格按以下JSON格式返回，不要有任何解释文字，只返回JSON：
（注意：internship、project等数组中可以有多个元素，代表多段独立经历，每个独立经历必须单独成一个元素）
{
  "name": "姓名",
  "work": [
    {"originalText": "第一份工作的全部描述段落（多段用\\n连接）", "sectionOrder": 0, "contentFormat": "paragraph"},
    {"originalText": "第二份工作的全部描述段落（如有）", "sectionOrder": 1, "contentFormat": "paragraph"}
  ],
  "internship": [
    {"originalText": "第一段实习的全部描述段落", "sectionOrder": 0, "contentFormat": "paragraph"},
    {"originalText": "第二段实习的全部描述段落（如有第二段实习，必须单独列出）", "sectionOrder": 1, "contentFormat": "paragraph"}
  ],
  "project": [
    {"originalText": "第一个项目的全部描述段落", "sectionOrder": 0, "contentFormat": "subtitle"},
    {"originalText": "第二个项目的全部描述段落（如有第二个项目，必须单独列出）", "sectionOrder": 1, "contentFormat": "paragraph"}
  ],
  "school_experience": [{"originalText": "第一段在校经历的全部描述段落", "sectionOrder": 0, "contentFormat": "paragraph"}],
  "self_evaluation": [{"originalText": "自我评价的全部内容（多段合并）", "sectionOrder": 0, "contentFormat": "paragraph"}]
}`

    // 使用提取专版调用（temperature:0，不惩罚重复），最大限度保证原文忠实
    const result = await callDeepSeekForExtraction(prompt)

    let sections
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      sections = jsonMatch ? JSON.parse(jsonMatch[0]) : null
    } catch (parseErr) {
      console.error('[enhanceExtractSections] JSON解析失败:', parseErr.message)
      throw new Error('AI返回格式解析失败')
    }

    if (!sections) throw new Error('AI未返回有效的模块识别结果')

    // 将 name 从 sections 中单独提出，保持 sections 只含模块内容
    const resumeName = sections.name || ''
    delete sections.name

    return {
      success: true,
      sections,
      resumeName,
      message: '模块提取成功'
    }

  } catch (error) {
    console.error('[enhanceExtractSections] 失败:', error)
    return { success: false, error: error.message, message: '模块提取失败: ' + error.message }
  }
}

/**
 * AI对单个段落进行润色升级（完全对齐超级模式润色提示词和API参数）
 * @param {object} event - { originalText, moduleType, targetPosition, targetPositionJD, polishingIntensity }
 */
async function enhancePolishSection(event) {
  try {
    const {
      originalText,
      moduleType,
      polishMode = 'position',    // 'position'(岗位润色) | 'self'(自身润色)
      targetPosition = '',
      targetPositionJD = '',
      polishingIntensity = 'standard',
      userType = '',              // 前端传入用户身份，优先使用
      wordCountRange = null,      // { min, max } 动态字数范围，null 时按模块默认值
      contentFormat = 'paragraph' // 'paragraph'(自然段落) | 'subtitle'(小标题格式)
    } = event
    if (!originalText) throw new Error('originalText 参数缺失')

    // 动态字数范围：优先使用前端传入的 wordCountRange，否则按模块默认
    const defaultWordCount = moduleType === 'self_evaluation'
      ? { min: 130, max: 170 }
      : { min: 100, max: 140 }
    const baseWc = (wordCountRange && wordCountRange.min && wordCountRange.max)
      ? wordCountRange
      : defaultWordCount

    // 小标题格式字数提升：
    // 自然段模式总字数 = 一整段内容，而小标题模式将内容分散到 2-5 个小标题，
    // 每个小标题需要约 50-60 字才能饱满填满两行，因此整体扩容 ×1.5。
    // 自我评价不受此影响（始终使用自然段）。
    const wc = (contentFormat === 'subtitle' && moduleType !== 'self_evaluation')
      ? { min: Math.round(baseWc.min * 1.5), max: Math.round(baseWc.max * 1.5) }
      : baseWc
    const wcStr = `${wc.min}-${wc.max}`  // 用于 prompt 中替换字数约束

    const moduleLabels = {
      work: '工作经历',
      internship: '实习经历',
      project: '项目经历',
      school_experience: '在校经历',
      self_evaluation: '自我评价'
    }
    const moduleLabel = moduleLabels[moduleType] || moduleType

    // ── 身份确定：优先使用前端传入的 userType，否则按模块类型推断兜底 ──────
    // 兜底逻辑：work→全职, internship→实习, 其余→在校（仅在前端未设置身份时使用）
    const inferredUserType =
      moduleType === 'work' ? 'work' :
      moduleType === 'internship' ? 'internship' :
      'student'
    const effectiveUserType = (userType && ['work', 'internship', 'student'].includes(userType))
      ? userType
      : inferredUserType

    const descriptionMatrix = {
      work: {
        senior: '这是一位【资深全职工作者】。请采用资深职场专业视角，全局侧重体现：(1)职责动词使用"主导"、"负责"、"带领"等强势词汇；(2)成果量化突出"大幅提升30%"、"处理百万级"等显著业绩；(3)专业深度强调"架构设计"、"技术选型"等高阶能力；(4)技术栈描述使用"精通XX"、"深入研究XX"等深度表达。整体风格：突出核心能力、架构设计、团队管理，强调结果与影响力，体现资深专业人士的技术深度与业务价值',
        standard: '这是一位【标准全职工作者】。请采用成熟职场视角，全局侧重体现：(1)职责动词使用"参与"、"协助"、"配合"等协作词汇；(2)成果量化体现"提升10%"、"完成核心模块"等稳健业绩；(3)专业深度突出"功能开发"、"问题解决"等实操能力；(4)技术栈描述使用"熟练使用XX"、"掌握XX"等实用表达。整体风格：平衡专业能力与学习能力，突出独立完成与快速成长，体现职场专业人士的稳健发展',
        basic: '这是一位【基础全职工作者】，专业能力处于基础阶段。请采用职场新人视角，全局侧重体现：(1)职责动词使用"学习"、"辅助"、"支持"等成长词汇；(2)成果量化体现"参与XX项目"、"掌握XX技能"等学习成果；(3)专业深度突出"基础实现"、"需求理解"等入门能力；(4)技术栈描述使用"了解XX"、"学习XX"等学习表达。整体风格：强调学习能力、适应能力与成长潜力，专业能力体现基础扎实，用学习能力强帮助弥补专业能力不足'
      },
      internship: {
        senior: '这是一位【资深实习生】，有较丰富的实习经验。请采用优秀实习生视角，全局侧重体现：(1)职责动词使用"参与"、"协助"、"配合"（避免"主导"），但可突出"独立完成"；(2)成果量化体现"提升30%"、"完成核心模块"等实质贡献；(3)专业深度突出"功能开发"、"问题解决"等实操能力；(4)技术栈描述使用"熟练使用XX"、"掌握XX"等实用表达。整体风格：突出专业能力、独立贡献与技术深度，避免过度夸大，体现优秀实习生的专业素养',
        standard: '这是一位【标准实习生】。请采用学习者视角，全局侧重体现：(1)职责动词使用"参与"、"协助"、"配合"等协作词汇；(2)成果量化体现"完成XX功能"、"掌握XX技能"、"提升10%"等基础工作成果；(3)专业深度突出"功能开发"、"问题解决"等基础实操；(4)技术栈描述使用"熟练使用XX"、"掌握XX"等学习表达。整体风格：平衡实践能力与学习能力，体现参与贡献与快速成长，杜绝"主导""主要负责"等夸大词汇',
        basic: '这是一位【基础实习生】，专业能力处于初学阶段。请采用学习成长视角，全局侧重体现：(1)职责动词使用"学习"、"辅助"、"支持"等学习词汇；(2)成果量化体现"参与XX项目"、"掌握XX技能"等学习收获；(3)专业深度突出"基础实现"、"需求理解"等入门能力；(4)技术栈描述使用"了解XX"、"学习XX"等初学表达。整体风格：强调学习能力、适应能力与潜力发掘，专业能力体现初步掌握，用学习热情和成长潜力弥补经验不足'
      },
      student: {
        senior: '这是一位【活跃在校生】，有丰富的项目和活动经验。请采用活跃在校生视角，全局侧重体现：(1)职责动词使用"参与"、"协助"、"组织"等主动词汇；(2)成果量化体现"完成XX项目"、"组织XX活动"等具体成果；(3)专业深度突出"项目实践"、"技术积累"等学习成果；(4)技术栈描述使用"熟练使用XX"、"掌握XX"等实用表达。整体风格：突出项目经验、技术积累与实践能力，体现在校生的主动性与专业潜力',
        standard: '这是一位【标准在校生】。请采用学习者视角，全局侧重体现：(1)职责动词使用"参与"、"学习"、"实践"等学习词汇；(2)成果量化体现"参与XX项目"、"掌握XX技能"等学习成果；(3)专业深度突出"基础学习"、"项目实践"等在校经验；(4)技术栈描述使用"掌握XX"、"学习XX"等学习表达。整体风格：平衡基础能力与学习潜力，体现成长与适应，展现在校生的学习能力与发展空间',
        basic: '这是一位【基础在校生】，专业学习处于初期阶段。请采用学习探索视角，全局侧重体现：(1)职责动词使用"学习"、"了解"、"接触"等探索词汇；(2)成果量化体现"参与XX课程"、"学习XX知识"等学习过程；(3)专业深度突出"基础认知"、"兴趣探索"等入门状态；(4)技术栈描述使用"了解XX"、"学习XX"等初学表达。整体风格：强调学习能力、兴趣热情与发展潜力，体现在校生的成长空间与学习意愿'
      }
    }
    const intensityDescription = descriptionMatrix[effectiveUserType]?.[polishingIntensity] || descriptionMatrix.work.standard

    // ══════════════════════════════════════════════════════════════════════════
    // 润色提示词四分支体系
    // ──────────────────────────────────────────────────────────────────────────
    // 三大核心依据 & 适用分支：
    //   ① 求职者身份与定位（intensityDescription） → 全部四种情况均生效
    //   ② 目标岗位名称（positionRef）              → 岗位润色分支（一、三）生效
    //   ③ 岗位JD要求（targetPositionJD）            → 岗位润色分支（一、三）生效
    //
    //   分支一：岗位润色 × 自然段落  → moduleSpecificReq     （依据①②③）
    //   分支二：自身润色 × 自然段落  → selfModeModuleReq      （依据①）
    //   分支三：岗位润色 × 小标题    → subtitlePositionReq    （依据①②③）
    //   分支四：自身润色 × 小标题    → subtitleSelfReq        （依据①）
    //
    // 规则：每个分支的模块专属要求必须在行动句中显式引用适用的核心依据，
    //       确保 AI 在处理具体模块时主动激活这些约束，而不仅依赖 prompt 头部声明。
    // ══════════════════════════════════════════════════════════════════════════
    const positionRef = `【${targetPosition || '通用职位'}】`

    // ── 分支一：岗位润色 × 自然段落格式 ──────────────────────────────────────
    // 依据①②③全部生效：模块要求中显式引用"目标应聘职位（参考岗位JD要求）与求职者整体定位与风格"
    const moduleSpecificReq = {
      work: `用户自述："${originalText}"
要求：基于以上用户真实情况，结合目标应聘职位${positionRef}（参考岗位JD要求）与求职者整体定位与风格，按照STAR法则（情境-任务-行动-结果）补充技术栈、具体成就、量化数据（提升%、处理量等），输出流畅的段落描述文本，**禁止使用（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等括号标题**，**严格控制${wcStr}字之间（不得少于${wc.min}字，不得超过${wc.max}字）**，只输出优化后的完整话术，不要输出用户原文。`,
      internship: `用户自述："${originalText}"
要求：基于以上用户真实情况，结合目标应聘职位${positionRef}（参考岗位JD要求）与求职者整体定位与风格，按照STAR法则（情境-任务-行动-结果）补充技术栈、具体成果、量化数据（提升%、处理量等）、导师评价，输出流畅的段落描述文本，**禁止使用（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等括号标题**，**严格控制${wcStr}字之间（不得少于${wc.min}字，不得超过${wc.max}字）**，只输出优化后的完整话术，不要输出用户原文。`,
      project: `用户自述："${originalText}"
要求：基于以上用户真实情况，结合目标应聘职位${positionRef}（参考岗位JD要求）与求职者整体定位与风格，按照STAR法则（情境-任务-行动-结果）补充技术选型、角色职责、解决方案、量化成果（性能提升、用户量等），输出流畅的段落描述文本，**禁止使用（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等括号标题**，**严格控制${wcStr}字之间（不得少于${wc.min}字，不得超过${wc.max}字）**，只输出优化后的完整话术，不要输出用户原文。`,
      school_experience: `用户自述："${originalText}"
要求：基于以上用户真实情况，结合目标应聘职位${positionRef}（参考岗位JD要求）与求职者整体定位与风格，按照STAR法则（情境-任务-行动-结果）补充具体职责、成果、团队协作经验，输出流畅的段落描述文本，**禁止使用（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等括号标题**，**严格控制${wcStr}字之间（不得少于${wc.min}字，不得超过${wc.max}字）**，只输出优化后的完整话术，不要输出用户原文。`,
      self_evaluation: `用户自述："${originalText}"
要求：基于以上用户真实情况，结合目标应聘职位${positionRef}（参考岗位JD要求）与求职者整体定位与风格，以用户第一人称视角，补充技术能力、项目经验、团队协作、学习能力等自我介绍情况，**严格控制${wcStr}字之间（不得少于${wc.min}字，不得超过${wc.max}字）**，只输出优化后的完整话术，不要输出用户原文。`
    }
    const moduleReq = moduleSpecificReq[moduleType] || moduleSpecificReq.work

    // ── 分支二：自身润色 × 自然段落格式 ──────────────────────────────────────
    // 依据①生效：模块要求中显式引用"求职者整体定位与风格"；②③不参与（不结合目标岗位）
    const selfModeModuleReq = {
      work: `用户自述："${originalText}"
要求：仅基于以上工作经历原文，结合求职者整体定位与风格，按照STAR法则（情境-任务-行动-结果）重构叙述，补全该工作本身相关的技术栈和工具、量化成就数据（提升%、处理量、时效等），使内容专业可信，输出流畅的段落描述文本，**禁止使用（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等括号标题**，**严格控制${wcStr}字之间（不得少于${wc.min}字，不得超过${wc.max}字）**，只输出优化后的完整话术，不要输出用户原文。`,
      internship: `用户自述："${originalText}"
要求：仅基于以上实习经历原文，结合求职者整体定位与风格，按照STAR法则（情境-任务-行动-结果）重构叙述，补全该实习本身相关的技术栈、具体成果和量化数据，使内容专业可信，输出流畅的段落描述文本，**禁止使用（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等括号标题**，**严格控制${wcStr}字之间（不得少于${wc.min}字，不得超过${wc.max}字）**，只输出优化后的完整话术，不要输出用户原文。`,
      project: `用户自述："${originalText}"
要求：仅基于以上项目经历原文，结合求职者整体定位与风格，按照STAR法则（情境-任务-行动-结果）重构叙述，补全项目本身涉及的技术选型、角色职责、解决方案和量化成果（性能提升、用户量等），输出流畅的段落描述文本，**禁止使用（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等括号标题**，**严格控制${wcStr}字之间（不得少于${wc.min}字，不得超过${wc.max}字）**，只输出优化后的完整话术，不要输出用户原文。`,
      school_experience: `用户自述："${originalText}"
要求：仅基于以上在校经历原文，结合求职者整体定位与风格，按照STAR法则（情境-任务-行动-结果）重构叙述，补全具体职责、活动成果和团队协作经验，量化参与人数/活动规模等数据，输出流畅的段落描述文本，**禁止使用（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等括号标题**，**严格控制${wcStr}字之间（不得少于${wc.min}字，不得超过${wc.max}字）**，只输出优化后的完整话术，不要输出用户原文。`,
      self_evaluation: `用户自述："${originalText}"
要求：仅基于以上自我评价原文，结合求职者整体定位与风格，以用户第一人称视角，重构表述，补全技术能力、项目经验、团队协作、学习能力等自我介绍内容，使语言更专业有力，**严格控制${wcStr}字之间（不得少于${wc.min}字，不得超过${wc.max}字）**，只输出优化后的完整话术，不要输出用户原文。`
    }

    // 构建 user prompt
    let prompt
    // 字数约束段（前置+重复，作为最高优先级硬性约束）
    const wcConstraint = `⚠️【字数硬性约束 - 最高优先级】⚠️
输出总字数必须严格控制在 ${wc.min}～${wc.max} 字之间。
- 不得少于 ${wc.min} 字（内容不足请适当补充细节）
- 不得超过 ${wc.max} 字（超出请主动截断或精简）
- 字数统计以中文字符为准，标点符号不计入
- 此为最高优先级约束，内容质量服从字数限制`

    // ── 小标题格式分支（contentFormat === 'subtitle'）─────────────────────────
    // AI 自由定义小标题（岗位润色：与岗位核心能力对应；自身润色：提炼内容结构）
    // 输出格式为 "小标题：内容\n小标题：内容"，分隔符必须使用全角冒号"："
    if (contentFormat === 'subtitle') {
      const subtitleOutputRule = `
【输出格式规定（小标题格式，必须严格遵守）】
- 每个小标题占独立一行，严格格式为"小标题名称：该小标题全部内容（同一行，不换行）"
- 行与行之间仅用换行符分隔，禁止多余空行或空白行
- 小标题名称精练简洁（2～6字为宜），后接中文全角冒号"："（必须是全角）
- 小标题数量 2～5 个，数量应与内容丰富度匹配
- 禁止输出任何解释文字、前缀说明或原文片段
- **整体字数（所有行合计）严格控制在 ${wcStr} 字之间（不得少于${wc.min}字，不得超过${wc.max}字）**
- **每个小标题的内容字数建议在 45～65 字之间**：内容要充实饱满，描述要具体详细，不得用一句话草草收尾；要做到每个小标题的内容都能完整填满两行文字，避免第二行结尾过早留有大量空白
- **内容密度要求**：每项小标题内容须包含 主体动作 + 具体方式/工具/方法 + 可量化结果或效果说明，三要素齐全，使内容充实可信`

      // ── 分支四：自身润色 × 小标题格式 ──────────────────────────────────────
      // 依据①生效：行动句中显式引用"求职者整体定位与风格"；②③不参与（不结合目标岗位）
      const subtitleSelfReq = {
        work: `用户自述（工作经历原文）："${originalText}"
要求：根据以上工作经历原文，结合求职者整体定位与风格，**自由提炼 2～5 个最能概括该段工作价值的小标题**。
重点维度参考（AI可自由取舍并重命名）：
  • 核心职责 → 承担的主要工作职能与负责范围
  • 技术能力 → 实际掌握并运用的技术栈/工具/方法论
  • ⭐ 工作成果（必选，内容篇幅最大）→ **量化业绩是核心**：必须包含具体数值（如性能提升X%、处理规模X万、完成X项、节省X小时等），若原文缺乏量化数据则主动基于上下文合理推导补充，禁止用"显著""有效""较大"等模糊表述替代数字
  • 协作贡献 → 跨团队配合/带领成员/推动落地等协作价值
**结果量化强化原则**：工作成果相关小标题的内容字数应占整体的 40%～60%，用具体数字和可衡量结果说话，体现真实业务影响力。
结合求职者整体定位与风格，对各小标题下的内容进行专业润色、技术栈补全和量化数据强化，在保留真实工作经历的基础上提升表达的专业度与说服力。`,

        internship: `用户自述（实习经历原文）："${originalText}"
要求：根据以上实习经历原文，结合求职者整体定位与风格，**自由提炼 2～4 个最能体现实习价值的小标题**。
重点维度参考（AI可自由取舍并重命名）：
  • 实习职责 → 具体参与的项目/任务/工作内容
  • 技术实践 → 学习并实际运用的技术工具与方法
  • ⭐ 成果贡献（必选，内容篇幅最大）→ **量化成果是核心**：必须呈现具体数字（完成X个功能/问题/模块、代码/任务量X、效率提升X%等），若原文未提及则基于实习场景合理推导补充，体现"做了什么、做成了什么、达到了什么程度"
  • 成长收获 → 技能提升/获得认可/自我成长等
**结果量化强化原则**：成果贡献相关小标题的内容字数应占整体的 35%～55%，以可衡量的具体成果数据展现实习期间的主动贡献与实践价值。
结合求职者整体定位与风格，对各小标题下的内容进行专业润色，适度补充技术细节和量化数据，体现实习期间的实践能力与主动贡献。`,

        project: `用户自述（项目经历原文）："${originalText}"
要求：根据以上项目经历原文，结合求职者整体定位与风格，**自由提炼 2～5 个最能体现项目价值的小标题**。
重点维度参考（AI可自由取舍并重命名）：
  • 项目概述 → 项目背景/类型/应用场景/规模
  • 技术选型 → 使用的技术栈/框架/工具/语言
  • 负责内容 → 具体承担的模块/功能/角色职责
  • ⭐ 项目成果（必选，内容篇幅最大）→ **量化交付是核心**：必须包含可测量指标（性能提升X%、并发量/吞吐量X、测试覆盖率X%、缺陷发现数X、上线X个功能/版本等），若原文数据不足则基于项目类型合理推导补充，禁止仅描述"完成了"而不说明"完成到什么程度"
**结果量化强化原则**：项目成果相关小标题的内容字数应占整体的 40%～60%，用可衡量的数字和交付物说明项目的真实技术价值与业务影响。
结合求职者整体定位与风格，对各小标题下的内容进行专业润色和量化强化，清晰呈现用户在项目中的技术贡献与可交付成果。`,

        school_experience: `用户自述（在校经历原文）："${originalText}"
要求：根据以上在校经历原文，结合求职者整体定位与风格，**自由提炼 2～4 个最能体现在校经历价值的小标题**。
重点维度参考（AI可自由取舍并重命名）：
  • 担任职务 → 具体职位/角色/负责部门
  • 主要职责 → 承担的核心任务与工作事项
  • 活动成果 → 量化成效（组织规模/参与人数/获奖荣誉等）
  • 能力收获 → 领导力/沟通协调/执行力等软硬技能积累
结合求职者整体定位与风格，对各小标题下的内容进行专业润色，清晰呈现在校经历中的组织能力、责任担当与个人贡献。`
      }
      const subtitleSelfModuleReq = subtitleSelfReq[moduleType] || subtitleSelfReq.work

      // ── 分支三：岗位润色 × 小标题格式 ──────────────────────────────────────
      // 依据①②③全部生效：行动句中显式引用"目标应聘职位、岗位JD要求与求职者整体定位与风格"
      // 使用外层 positionRef（已在上方统一声明，无需重复定义）
      const subtitlePositionReq = {
        work: `用户自述（工作经历原文）："${originalText}"
要求：结合目标应聘职位${positionRef}（参考岗位JD要求）与求职者整体定位与风格，为该段工作经历**自由定义 2～5 个精准对应岗位核心能力的小标题**。
重点维度参考（AI可根据目标岗位自由取舍、重命名为更贴合的表达）：
  • 核心职责 → 与目标岗位直接匹配的职能与负责范围
  • 技术能力 → 与岗位JD高度相关的技术栈/工具/方法论（优先突出岗位要求的技术）
  • ⭐ 工作成果（必选，内容篇幅最大）→ **量化业绩是核心**：必须包含与岗位JD直接相关的具体数值（如性能提升X%、处理规模X万、节省成本X%、完成X项等），若原文缺乏量化数据则基于业务上下文合理推导补充，禁止用"显著""有效""较大"等模糊表述替代数字
  • 协作影响 → 跨部门协作、推动落地、带领团队等体现综合能力的内容
**结果量化强化原则**：工作成果相关小标题的内容字数应占整体的 40%～60%，用与目标岗位${positionRef}高度相关的可衡量数字说明工作影响力，增强岗位匹配说服力。
结合目标应聘职位${positionRef}的岗位JD要求与求职者整体定位与风格，对各小标题下的内容进行专业润色、技术栈补全和量化数据强化，使每个小标题都精准体现求职者在该工作中积累的、与目标岗位高度契合的核心竞争力。`,

        internship: `用户自述（实习经历原文）："${originalText}"
要求：结合目标应聘职位${positionRef}（参考岗位JD要求）与求职者整体定位与风格，为该段实习经历**自由定义 2～4 个精准对应岗位需求的小标题**。
重点维度参考（AI可根据目标岗位自由取舍并重命名）：
  • 实习职责 → 与目标岗位方向相关的具体工作参与内容
  • 技术应用 → 实习中学习并实践的、与岗位JD匹配的技术工具与方法
  • ⭐ 成果贡献（必选，内容篇幅最大）→ **量化成果是核心**：必须呈现与目标岗位相关的具体数字（完成X个功能/需求、效率提升X%、测试覆盖X个场景等），若原文未提及则基于实习场景合理推导补充，体现"做了什么、做成了什么、达到了什么程度"
  • 成长收获 → 技能提升/获导师认可/主动承担额外职责等展现潜力的内容
**结果量化强化原则**：成果贡献相关小标题的内容字数应占整体的 35%～55%，以与目标岗位${positionRef}相关的可衡量数据展现实习贡献，突出实习生身份下对目标岗位需求的最大匹配度。
结合目标应聘职位${positionRef}的岗位JD要求与求职者整体定位与风格，对各小标题下的内容进行专业润色，突出实习生身份下对目标岗位需求的最大匹配度。`,

        project: `用户自述（项目经历原文）："${originalText}"
要求：结合目标应聘职位${positionRef}（参考岗位JD要求）与求职者整体定位与风格，为该项目经历**自由定义 2～5 个精准对应岗位核心能力的小标题**。
重点维度参考（AI可根据目标岗位自由取舍并重命名）：
  • 项目背景 → 项目类型/业务场景/规模（突出与目标岗位行业/领域的相关性）
  • 技术选型 → 与岗位JD高度相关的技术栈/框架/工具（主动对齐岗位所需技术）
  • 负责功能 → 具体承担的模块/功能点/角色职责（体现独立性与技术深度）
  • ⭐ 项目成果（必选，内容篇幅最大）→ **量化交付是核心**：必须包含与目标岗位${positionRef}相关的可测量指标（性能提升X%、并发量/吞吐量X、测试覆盖率X%、缺陷发现数X、上线X个功能/版本等），若原文数据不足则基于项目类型合理推导补充，禁止仅描述"完成了"而不说明"完成到什么程度"
**结果量化强化原则**：项目成果相关小标题的内容字数应占整体的 40%～60%，用与目标岗位${positionRef}高度匹配的可衡量指标和交付物，说明项目的真实技术价值与业务影响。
结合目标应聘职位${positionRef}的岗位JD要求与求职者整体定位与风格，对各小标题下的内容进行专业润色、技术栈补全和量化强化，突出用户在项目中与目标岗位高度契合的技术贡献。`,

        school_experience: `用户自述（在校经历原文）："${originalText}"
要求：结合目标应聘职位${positionRef}（参考岗位JD要求）与求职者整体定位与风格，为该段在校经历**自由定义 2～4 个能体现与目标岗位素质关联性的小标题**。
重点维度参考（AI可根据目标岗位自由取舍并重命名）：
  • 担任职务 → 具体职位/角色/负责范围
  • 核心职责 → 与目标岗位所需能力（组织/沟通/技术/执行）相关的工作事项
  • 活动成果 → 量化成效（规模/人数/覆盖面/获奖等）
  • 能力迁移 → 该经历中培养的、可迁移到目标岗位的核心素质
结合目标应聘职位${positionRef}的岗位JD要求与求职者整体定位与风格，对各小标题下的内容进行专业润色，体现该经历与目标岗位所需素质的强关联性。`
      }

      if (polishMode === 'self') {
        // 分支四：自身润色 × 小标题格式（仅依据①：求职者整体定位与风格）
        prompt = `你是专业的简历填写指导专家，擅长对简历经历内容进行深度重构和表达升级。

${wcConstraint}

【核心依据】
① 求职者身份与定位：${intensityDescription}

【自身润色升级总体规则】
- **严格基于经历原文真实内容**展开，保留时间/公司/职位/学校等事实信息，不虚构
- **求职者整体定位与风格**：${intensityDescription}
- **技术栈和量化**：补全经历本身相关的技术工具、行业术语，以及量化数据
- **语言规范**：条理清晰、数据化、可执行，禁止空洞口号或堆砌形容词
${subtitleOutputRule}

### ${moduleLabel}

${subtitleSelfModuleReq}

再次提醒：整体输出必须严格控制在 ${wc.min}～${wc.max} 字之间，不得超出。`
      } else {
        // 分支三：岗位润色 × 小标题格式（positionRef 来自外层统一声明，无需重复定义）
        const subtitlePositionModuleReq = subtitlePositionReq[moduleType] || subtitlePositionReq.work
        prompt = `你是专业的简历填写指导专家，擅长综合分析目标应聘职位及求职者自身情况，为求职者提供精准的话术润色升级优化。

${wcConstraint}

【三大核心依据】
① 求职者身份与定位：${intensityDescription}
② 目标应聘职位：${targetPosition || '通用职位'}
${targetPositionJD ? `③ 岗位JD要求：${targetPositionJD}` : '③ 岗位JD要求：未提供，以通用岗位能力为准'}

【话术升级优化总体规则】
- **严格基于用户真实情况**展开，保留时间/公司/职位/学校等事实信息，不虚构
- **结合目标职位需求**：补全与${positionRef}相关的技术栈、行业术语和量化数据
- **求职者整体定位与风格**：${intensityDescription}
- **语言规范**：条理清晰、数据化、可执行，禁止空洞口号或堆砌形容词
${subtitleOutputRule}

### ${moduleLabel}

${subtitlePositionModuleReq}

再次提醒：整体输出必须严格控制在 ${wc.min}～${wc.max} 字之间，不得超出。`
      }

      const subtitleSystemPrompt = `你是专业的简历填写指导专家，擅长综合分析目标应聘职位及其行业特性、求职者自身情况，为求职者提供精准的填写指引和话术润色升级优化。

【核心能力】
- 能根据目标职位核心能力要求或内容结构，自主设计最合适的小标题体系
- 深度理解不同职位的核心能力要求和行业特性
- 擅长补全技术栈、量化数据（如提升%、处理量、时效）与具体成果

【重要任务】
1. ✅ **自主定义小标题**：根据目标职位需求（岗位润色）或内容结构（自身润色）自由设计小标题，每行格式严格为"小标题：内容"
2. ✅ **分隔符必须使用中文全角冒号"："**，不得使用半角冒号":"或其他符号
3. ✅ **字数为最高优先级约束**：严格控制在 user 消息指定的字数范围内，所有行合计字数超出范围视为不合格
4. ✅ **基于用户真实情况**，严格保留时间/公司/职位/学校等事实信息，不虚构
5. ✅ **禁止输出解释、原文或多余格式**，只输出润色后的小标题结构内容`

      const requestData = {
        model: DEEPSEEK_CONFIG.chatModel,
        messages: [
          { role: 'system', content: subtitleSystemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: 4000,
        temperature: 0.0,
        top_p: 0.95,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
        stream: false
      }

      const response = await axios.post(
        `${DEEPSEEK_CONFIG.baseURL}/chat/completions`,
        requestData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_CONFIG.apiKey}`
          },
          timeout: 120000
        }
      )

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const polishedText = response.data.choices[0].message.content.trim()
        console.log(`[enhancePolishSection] 分支三/四(小标题) 完整提示词:\n${prompt}`)
        return {
          success: true,
          originalText,
          polishedText,
          moduleType,
          contentFormat: 'subtitle',
          debugPrompt: prompt,
          message: '润色完成（小标题格式）'
        }
      }
      throw new Error('API 返回数据格式异常')
    }

    if (polishMode === 'self') {
      // 分支二：自身润色 × 自然段落格式（仅依据①：求职者整体定位与风格）
      const selfReq = selfModeModuleReq[moduleType] || selfModeModuleReq.work
      prompt = `你是专业的简历填写指导专家，擅长对简历经历内容进行深度重构和表达升级。

${wcConstraint}

【核心依据】
① 求职者身份与定位：${intensityDescription}

【自身润色升级总体规则】
- **严格基于经历原文真实内容**展开，保留时间/公司/职位/学校等事实信息，不虚构、不参考任何目标岗位
- **STAR法则重构**：将原文重新组织为情境（S）→任务（T）→行动（A）→结果（R）的叙述逻辑
- **求职者整体定位与风格**：${intensityDescription}
- **技术栈和量化**：补全经历本身相关的技术工具、行业术语，以及量化数据（如提升%/处理量/时效/人数规模等）
- **语言规范**：条理清晰、数据化、可执行，禁止空洞口号或堆砌形容词
- **格式规范**：输出连贯的自然文本段落，禁止括号标题或分段标记

### ${moduleLabel}

${selfReq}

再次提醒：输出必须严格控制在 ${wc.min}～${wc.max} 字之间，不得超出。`
    } else {
      // 分支一：岗位润色 × 自然段落格式（依据①②③全部生效）
      prompt = `你是专业的简历填写指导专家，擅长综合分析目标应聘职位及其行业特性、求职者自身情况、求职者当前身份视角，为求职者提供精准的填写指引和话术润色升级优化。

${wcConstraint}

【三大核心依据】
① 求职者身份与定位：${intensityDescription}
② 目标应聘职位：${targetPosition || '通用职位'}
${targetPositionJD ? `③ 岗位JD要求：${targetPositionJD}` : '③ 岗位JD要求：未提供，以通用岗位能力为准'}

【话术升级优化生成总体规则】
- **有用户情况的模块**：必须严格基于【用户当前自述情况】的真实内容展开，保留时间/公司/职位/学校等事实信息，结合目标应聘职位与求职者整体定位按照STAR叙事法则要求补全技术栈、行业术语、量化数据（如提升%/处理量/时效）与具体成果，使描述专业且可信
- **求职者整体定位与风格**：${intensityDescription}
- **语言规范**：所有话术需条理清晰、数据化、可执行，禁止空洞口号或堆砌形容词
- **格式规范**：输出的话术必须是连贯的自然文本，禁止使用（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等括号标题或分段标记，必须是流畅的段落描述

### ${moduleLabel}

${moduleReq}

再次提醒：输出必须严格控制在 ${wc.min}～${wc.max} 字之间，不得超出。`
    }

    // ── API 参数完全复用超级模式设置 ──────────────────────────────────────
    const requestData = {
      model: DEEPSEEK_CONFIG.chatModel,
      messages: [
        {
          role: 'system',
          content: `你是专业的简历填写指导专家，擅长综合分析目标应聘职位及其行业特性、求职者自身情况、求职者当前身份视角，为求职者提供精准的填写指引和话术润色升级优化。

【核心能力】
- 精通STAR法则（Situation情境、Task任务、Action行动、Result结果）的应用
- 深度理解不同职位的核心能力要求和行业特性
- 根据求职者身份与求职者整体定位精准调整话术风格
- 擅长补全技术栈、量化数据（如提升%、处理量、时效）与具体成果

【重要任务】
1. ✅ **严格遵守各模块润色升级要求**，使用STAR法则重构，使描述专业且可信，输出内容专业、量化、可执行，禁止空洞口号或堆砌形容词
2. ✅ **字数为最高优先级约束**：严格控制在 user 消息指定的字数范围内，超出范围视为不合格输出
3. ✅ **基于用户真实情况**，严格基于用户真实情况，保留时间/公司/职位/学校等事实信息，不虚构
4. ✅ **禁止使用括号标题**（S）（T）（A）（R）或【背景】【任务】【行动】【结果】等，必须输出流畅的段落描述`
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 4000,
      temperature: 0.0,
      top_p: 0.95,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
      stream: false
    }

    const response = await axios.post(
      `${DEEPSEEK_CONFIG.baseURL}/chat/completions`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_CONFIG.apiKey}`
        },
        timeout: 120000
      }
    )

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      const polishedText = response.data.choices[0].message.content.trim()
      console.log(`[enhancePolishSection] 分支一/二(段落) 完整提示词:\n${prompt}`)
      return {
        success: true,
        originalText,
        polishedText,
        moduleType,
        debugPrompt: prompt,
        message: '润色完成'
      }
    }
    throw new Error('API 返回数据格式异常')

  } catch (error) {
    console.error('[enhancePolishSection] 失败:', error)
    return { success: false, error: error.message, message: '润色失败: ' + error.message }
  }
}

/**
 * 生成润色总结报告（简历优化功能专用，完全对齐超级模式的 optimization_summary）
 * @param {object} event - { polishedList, polishMode, targetPosition, targetPositionJD, polishingIntensity }
 */
async function enhanceGenerateSummary(event) {
  try {
    const {
      polishedList = [],
      polishMode = 'position',
      targetPosition = '',
      targetPositionJD = '',
      polishingIntensity = 'standard'
    } = event

    if (!polishedList || polishedList.length === 0) {
      throw new Error('polishedList 参数缺失或为空')
    }

    const intensityLabels = { senior: '高强度', standard: '标准', basic: '轻度' }
    const intensityLabel = intensityLabels[polishingIntensity] || '标准'

    const moduleLabels = {
      work: '工作经历',
      internship: '实习经历',
      project: '项目经历',
      school_experience: '在校经历',
      self_evaluation: '自我评价'
    }

    // 使用前端传来的带序号 moduleLabel（如"工作经历1"、"项目经历2"）构建摘要
    const doneItems = polishedList.filter(item => item.status === 'done')

    const sectionsSummary = doneItems
      .map(item => {
        // moduleLabel 已在前端赋值为带序号的名称（如"工作经历1"）
        const label = item.moduleLabel || (moduleLabels[item.moduleType] || item.moduleType)
        return `【${label}】\n润色前：${item.originalText}\n润色后：${item.polishedText}`
      })
      .join('\n\n')

    // 按顺序列出每个带序号的 label（不去重），保证与 key_improvements 一一对应
    const modulesListText = doneItems
      .map(item => item.moduleLabel || (moduleLabels[item.moduleType] || item.moduleType))
      .join('、')

    // 动态生成 key_improvements 格式示例（用实际 label）
    const improvementsExample = doneItems
      .map(item => {
        const label = item.moduleLabel || (moduleLabels[item.moduleType] || item.moduleType)
        return `    "【${label}】：优化重点和思路说明..."`
      })
      .join(',\n')

    let summaryOutputFields = ''
    if (polishMode === 'position') {
      summaryOutputFields = `"position_analysis": "岗位分析内容...",
  "overall_strategy": "整体润色策略...",
  "key_improvements": [
${improvementsExample}
  ],
  "core_strengths": "核心竞争力亮点...",
  "interview_suggestions": "面试建议..."`
    } else {
      summaryOutputFields = `"overall_strategy": "整体润色策略...",
  "key_improvements": [
${improvementsExample}
  ],
  "core_strengths": "核心竞争力亮点..."`
    }

    const prompt = polishMode === 'position'
      ? `你是专业的简历填写指导专家，擅长综合分析目标应聘职位及其行业特性、求职者自身情况，为求职者提供精准的话术润色升级优化总结。

【目标应聘职位】${targetPosition || '通用职位'}
${targetPositionJD ? `【职位JD要求】${targetPositionJD}` : ''}
【润色强度】${intensityLabel}

【已润色模块清单（共${doneItems.length}条，按顺序）】${modulesListText}

【润色对比内容（供分析参考）】
${sectionsSummary}

请基于以上润色内容，生成一份专业的 AI 润色总结报告，包含：
1. position_analysis（岗位分析）：结合目标岗位和 JD，分析岗位核心诉求和技能侧重
2. overall_strategy（整体策略）：说明本次润色的整体思路和方向
3. key_improvements（关键改进）：针对每个已润色模块逐一说明，格式严格为"【模块名（含序号）】：说明"，模块名必须与【已润色模块清单】中的名称完全一致
4. core_strengths（核心竞争力）：总结求职者在本份简历中最突出的竞争优势
5. interview_suggestions（面试建议）：结合目标岗位，给出 2-3 条面试准备建议

**字段要求：**
- key_improvements 必须是字符串数组，数组长度必须等于 ${doneItems.length}（与已润色模块数量严格一致）
- key_improvements 中每个元素的模块名称必须与已润色模块清单顺序一一对应，不得合并或跳过
- 所有内容必须贴合实际，禁止套话
- 严格按以下 JSON 格式返回，不要有任何解释文字，只返回 JSON：
{
  ${summaryOutputFields}
}`
      : `你是专业的简历填写指导专家，擅长对简历内容进行深度重构和表达升级。

【润色模式】自身润色（无目标岗位，聚焦内容本身）
【润色强度】${intensityLabel}

【已润色模块清单（共${doneItems.length}条，按顺序）】${modulesListText}

【润色对比内容（供分析参考）】
${sectionsSummary}

请基于以上润色内容，生成一份专业的 AI 润色总结报告，包含：
1. overall_strategy（整体策略）：说明本次自身润色的整体思路，包括 STAR 法则重构、技术栈补全、结果量化等方向
2. key_improvements（关键改进）：针对每个已润色模块逐一说明，格式严格为"【模块名（含序号）】：说明"，模块名必须与【已润色模块清单】中的名称完全一致
3. core_strengths（核心竞争力）：总结求职者在本份简历中最突出的竞争优势和亮点

**字段要求：**
- key_improvements 必须是字符串数组，数组长度必须等于 ${doneItems.length}（与已润色模块数量严格一致）
- key_improvements 中每个元素的模块名称必须与已润色模块清单顺序一一对应，不得合并或跳过
- 所有内容必须贴合实际，禁止套话
- 严格按以下 JSON 格式返回，不要有任何解释文字，只返回 JSON：
{
  ${summaryOutputFields}
}`

    const requestData = {
      model: DEEPSEEK_CONFIG.chatModel,
      messages: [
        {
          role: 'system',
          content: '你是专业的简历填写指导专家，擅长综合分析简历优化结果，为求职者提供精准的润色总结和竞争力分析。你必须严格按照 JSON 格式返回，不包含任何 markdown 标记或额外说明文字。'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      top_p: 0.95,
      stream: false,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    }

    const response = await axios.post(
      `${DEEPSEEK_CONFIG.baseURL}/chat/completions`,
      requestData,
      { headers: { Authorization: `Bearer ${DEEPSEEK_CONFIG.apiKey}`, 'Content-Type': 'application/json' }, timeout: DEEPSEEK_CONFIG.timeout }
    )

    const content = response.data.choices[0].message.content.trim()
    let summaryData
    try {
      const jsonStr = content.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim()
      summaryData = JSON.parse(jsonStr)
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        summaryData = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('AI 返回数据格式错误')
      }
    }

    return {
      success: true,
      optimizationSummary: summaryData,
      message: '润色总结生成成功'
    }

  } catch (error) {
    console.error('[enhanceGenerateSummary] 失败:', error)
    return { success: false, error: error.message, message: '润色总结生成失败: ' + error.message }
  }
}

/**
 * AI分析简历（基于段落文本和目标岗位，返回分析报告）
 * @param {object} event - { paragraphs: [{idx, text}], targetPosition: string }
 */
async function enhanceAnalyze(event) {
  try {
    const { fullText: fullTextParam, paragraphs, targetPosition, polishMode, userType } = event

    // 优先使用前端预拼接的 fullText 字符串（避免大数组序列化丢失）
    // 兼容旧调用方式（直接传 paragraphs 数组）
    let fullText = ''
    if (fullTextParam && typeof fullTextParam === 'string') {
      fullText = fullTextParam
    } else if (paragraphs && Array.isArray(paragraphs)) {
      fullText = paragraphs.map(p => p.text || '').filter(t => t).join('\n')
    }

    if (!fullText) throw new Error('简历内容为空，无法分析')

    // ── 用户身份映射（明确告知AI，不让其自行猜测） ──────────────────
    const userTypeMap = {
      work:       '全职求职者（有正式工作经验）',
      internship: '实习求职者（在校生/应届生，寻找实习岗位）',
      student:    '在校学生（无正式工作经验，侧重在校经历）'
    }
    const userIdentityDesc = userTypeMap[userType] || '求职者（身份未指定）'

    // ── 自身润色模式：专注简历自身质量，4个维度 + 身份用词，无五维图 ──
    if (polishMode === 'self') {
      const selfPrompt = `你是一位资深简历优化师，请从以下5个维度深入分析这份简历的自身质量，并给出综合质量评分。

【求职者身份】${userIdentityDesc}（请在【身份用词】维度中严格依据此身份进行评判，不再自行猜测）

简历内容：
${fullText}

请按以下5个维度分析，并给出1-100的综合质量评分：
1：【STAR叙事】分析各段经历的叙事逻辑是否符合STAR法则（情境Situation-任务Task-行动Action-结果Result），指出叙事逻辑混乱、表达不清晰或缺少关键要素的具体段落
2：【结果量化】分析简历是否以结果为导向，量化数据是否充分且有依据（指出缺失量化数据、数据过于模糊或难以信服的具体内容）
3：【技术栈补全】分析简历中描述的技术栈是否完整、与经历相符，判断是否有常见相关技术遗漏，给出具体补全建议
4：【身份用词】基于求职者身份"${userIdentityDesc}"，逐一核查简历中的动词和表述是否与该身份相符。例如：实习/在校身份应使用"辅助""参与""协助""学习"等词，而非"主导""全面负责""独立推进"；全职身份则相反，应体现主动性和主导权，避免过度谦虚。指出具体不恰当的用词用句并给出替换建议
5：【综合评价与改进建议】对简历整体质量给出综合评价，并针对以上问题提供具体可操作的改进建议（详细，每点以"；"结尾，以数字+":"开头）
6：综合质量评分（综合考量以上5个维度对简历自身质量打分，纯数字，如：72）

请严格按照以下格式返回，共6条：
1: [STAR叙事分析]
2: [结果量化分析]
3: [技术栈补全建议]
4: [身份用词分析]
5: [详细综合评价与改进建议]
6: [纯数字评分]

直接返回这6条，不要有其他说明。`

      const selfResult = await callDeepSeekForEnhance(selfPrompt)
      const selfLines = selfResult.split('\n').filter(l => l.trim())

      const getLine = (n) => {
        const line = selfLines.find(l => l.match(new RegExp(`^${n}[：:]`)))
        return line ? line.replace(new RegExp(`^${n}[：:]\\s*`), '').trim() : ''
      }

      const scoreLine6 = selfLines.find(l => l.match(/^6[：:]/))
      const scoreText6 = scoreLine6 ? scoreLine6.replace(/^6[：:]\s*/, '').trim() : '0'
      const score = parseInt(scoreText6.replace(/[^0-9]/g, '')) || 0

      return {
        success: true,
        analysis: {
          item1: getLine(1),   // STAR叙事
          item2: getLine(2),   // 结果量化
          item3: getLine(3),   // 技术栈补全
          item4: getLine(4),   // 身份用词（自身模式也有此维度）
          item5: '',
          item6: getLine(5),   // 综合评价（复用 item6 的"综合改进建议"区域）
          score,
          dimensionScores: null,  // 自身润色模式无五维图
          mode: 'self'
        },
        message: '简历分析完成'
      }
    }

    // ── 岗位润色模式：6个维度 + 五维图评分 ─────────────────────────
    const prompt = `你是一位资深HR兼简历优化师，请深度分析以下简历与目标岗位的匹配情况。

【求职者身份】${userIdentityDesc}（请在【身份用词】维度中严格依据此身份进行评判，不再自行猜测）

目标岗位：${targetPosition || '未指定'}

简历内容：
${fullText}

请按以下7个维度深入分析，并给出1-100的整体匹配度评分，以及5个维度的独立评分：
1：【岗位契合】分析简历整体是否与目标职位基本契合，重点检查技术栈是否与目标岗位相关（是否存在技术栈缺失、过时或与岗位完全无关的情况）
2：【共同亮点】分析简历与目标职位有哪些共性亮点和优势匹配点，列举具体契合之处
3：【STAR叙事】分析简历各经历的叙事逻辑是否遵循STAR法则（情境Situation-任务Task-行动Action-结果Result），指出叙事逻辑混乱、表达不清晰或缺少关键要素的具体段落
4：【核心要求】分析简历是否突出体现职位的核心要求，是否有与岗位核心要求脱节或重点不突出的描述
5：【结果量化】分析简历是否以结果为导向，量化数据是否充分且有依据（指出缺失量化数据、数据过于模糊或难以信服的具体内容）
6：【身份用词】基于求职者身份"${userIdentityDesc}"，逐一核查简历中的动词和表述是否与该身份相符。例如：实习/在校身份应使用"辅助""参与""协助""学习"等词，而非"主导""全面负责""独立推进"；全职身份则相反，应体现主动性和主导权，避免过度谦虚。指出具体不恰当的用词用句并给出替换建议
7：综合分析简历的整体情况与改进方向，重点围绕【技术栈匹配度】【STAR叙事逻辑】【结果量化质量】【身份用词合理性】四个核心维度给出具体可操作的改进建议（详细，每点以"；"结尾，以数字+":"开头）
8：整体匹配度评分（综合考量岗位契合度、技术栈相关性、STAR叙事逻辑、结果量化充分性、身份用词合理性等因素打分，纯数字，如：72）
9：五维独立评分（对维度1-5分别给出1到5分的评分，严格按此格式：岗位契合:X,共同亮点:X,STAR叙事:X,核心要求:X,结果量化:X，X为1到5的整数）

请严格按照以下格式返回，共9条：
1: [分析内容]
2: [分析内容]
3: [分析内容]
4: [分析内容]
5: [分析内容]
6: [身份用词分析]
7: [详细综合分析]
8: [纯数字评分]
9: 岗位契合:X,共同亮点:X,STAR叙事:X,核心要求:X,结果量化:X

直接返回这9条，不要有其他说明。`

    const result = await callDeepSeekForEnhance(prompt)

    // 解析返回的9条结果（7条分析 + 1条评分 + 1条五维评分）
    const lines = result.split('\n').filter(l => l.trim())
    const analysisItems = []
    for (let i = 1; i <= 7; i++) {
      const line = lines.find(l => l.match(new RegExp(`^${i}[：:](.*)`)))
      if (line) {
        analysisItems.push(line.replace(new RegExp(`^${i}[：:]\\s*`), '').trim())
      } else {
        analysisItems.push('')
      }
    }
    // 第8条：整体评分
    const scoreLine = lines.find(l => l.match(/^8[：:]/))
    const scoreText = scoreLine ? scoreLine.replace(/^8[：:]\s*/, '').trim() : '0'
    const score = parseInt(scoreText.replace(/[^0-9]/g, '')) || 0

    // 第9条：五维独立评分（1-5分）
    const dimKeyMap = {
      '岗位契合': 'fit',
      '共同亮点': 'highlight',
      'STAR叙事': 'star',
      '核心要求': 'core',
      '结果量化': 'quantify'
    }
    let dimensionScores = null
    const dimLine = lines.find(l => l.match(/^9[：:]/))
    if (dimLine) {
      const dimText = dimLine.replace(/^9[：:]\s*/, '').trim()
      const parsed = {}
      dimText.split(',').forEach(part => {
        const colonIdx = part.lastIndexOf(':')
        if (colonIdx === -1) return
        const key = part.slice(0, colonIdx).trim()
        const val = Math.max(1, Math.min(5, parseInt(part.slice(colonIdx + 1).trim()) || 3))
        const mappedKey = dimKeyMap[key]
        if (mappedKey) parsed[mappedKey] = val
      })
      // 所有5个维度都解析到才算有效
      if (Object.keys(parsed).length === 5) {
        dimensionScores = parsed
      }
    }

    return {
      success: true,
      analysis: {
        item1: analysisItems[0] || '',
        item2: analysisItems[1] || '',
        item3: analysisItems[2] || '',
        item4: analysisItems[3] || '',
        item5: analysisItems[4] || '',
        item6: analysisItems[5] || '',  // 身份用词
        item7: analysisItems[6] || '',  // 综合改进建议（原 item6，整体后移一位）
        score,
        dimensionScores,  // { fit, highlight, star, core, quantify } 各 1-5 分，或 null
        mode: 'position'
      },
      message: '简历分析完成'
    }

  } catch (error) {
    console.error('[enhanceAnalyze] 失败:', error)
    return { success: false, error: error.message, message: '简历分析失败: ' + error.message }
  }
}

/**
 * 简历优化专用DeepSeek调用 - 通用版（分析/润色/总结，允许适度创意）
 */
async function callDeepSeekForEnhance(prompt) {
  const requestData = {
    model: DEEPSEEK_CONFIG.chatModel,
    messages: [
      {
        role: 'system',
        content: '你是一位严格的简历评估专家，具有丰富的HR和职业规划经验。请严格按照评分标准客观分析简历内容，不要给出偏高或偏低的评分。'
      },
      { role: 'user', content: prompt }
    ],
    max_tokens: DEEPSEEK_CONFIG.maxTokens,
    temperature: DEEPSEEK_CONFIG.temperature,
    top_p: DEEPSEEK_CONFIG.topP,
    stream: false
  }

  const response = await axios.post(
    `${DEEPSEEK_CONFIG.baseURL}/chat/completions`,
    requestData,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_CONFIG.apiKey}`
      },
      timeout: 60000
    }
  )

  if (response.data && response.data.choices && response.data.choices.length > 0) {
    return response.data.choices[0].message.content || ''
  }
  throw new Error('DeepSeek API 返回数据格式异常')
}

/**
 * 简历优化专用DeepSeek调用 - 提取专版
 * 参数说明（DeepSeek 官方文档推荐的"忠实提取"配置）：
 *   temperature: 0    → 完全确定性输出，最大程度减少幻觉和文字改动
 *   top_p: 1.0        → temperature=0 时 top_p 不起决定性作用，保持默认
 *   frequency_penalty: 0  → 不惩罚重复字符，允许 AI 原样复制原文
 *   presence_penalty: 0   → 同上，避免 AI 为"避免重复"而改写原文字符
 */
async function callDeepSeekForExtraction(prompt) {
  const requestData = {
    model: DEEPSEEK_CONFIG.chatModel,
    messages: [
      {
        role: 'system',
        content: '你是一位专业的文档解析专家。你的唯一任务是从用户提供的文本中精确提取内容。提取的文本必须与原文逐字逐句完全一致，严禁修改、增删、润色或重排任何字符。'
      },
      { role: 'user', content: prompt }
    ],
    max_tokens: DEEPSEEK_CONFIG.maxTokens,
    temperature: 0.0,           // 最大确定性，减少幻觉
    top_p: 1.0,
    frequency_penalty: 0,     // 允许重复原文字符，不惩罚
    presence_penalty: 0,      // 同上
    stream: false
  }

  const response = await axios.post(
    `${DEEPSEEK_CONFIG.baseURL}/chat/completions`,
    requestData,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_CONFIG.apiKey}`
      },
      timeout: DEEPSEEK_CONFIG.timeout
    }
  )

  if (response.data && response.data.choices && response.data.choices.length > 0) {
    return response.data.choices[0].message.content || ''
  }
  throw new Error('DeepSeek API 返回数据格式异常')
}


// ── HTTP触发器入口（替换原 exports.main）──────────────────────────────────
exports.main = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  let body = {};
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
  } catch {
    return _httpRespond(400, { success: false, message: '请求体解析失败' });
  }
  // 验证JWT（登录接口无需验证）
  const authHeader = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return _httpRespond(401, { success: false, message: '未提供认证Token，请先登录' });
  }
  try { jwt.verify(token, JWT_SECRET); } catch {
    return _httpRespond(401, { success: false, message: 'Token无效或已过期，请重新登录' });
  }
  try {
    const result = await _handleAction(body, context);
    return _httpRespond(200, result);
  } catch (err) {
    console.error('ai_service_web error:', err);
    return _httpRespond(500, { success: false, message: '服务器错误', error: err.message });
  }
};
