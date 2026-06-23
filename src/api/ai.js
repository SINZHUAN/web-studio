import request from './request'

// ── 简历优化相关接口 ────────────────────────────────────────────────────────

/**
 * 简历分析
 * 对应小程序：wx.cloud.callFunction({ name: 'ai_service_clo', data: { action: 'enhance_analyze', ... } })
 */
export function enhanceAnalyze(data) {
  return request.post('/ai_service_clo', { action: 'enhance_analyze', ...data })
}

/**
 * 模块识别提取
 * 对应小程序：action: 'enhance_extract_sections'
 */
export function enhanceExtractSections(data) {
  return request.post('/ai_service_clo', { action: 'enhance_extract_sections', ...data })
}

/**
 * 单模块润色
 * 对应小程序：action: 'enhance_polish_section'
 */
export function enhancePolishSection(data) {
  return request.post('/ai_service_clo', {
    action: 'enhance_polish_section',
    ...data
  })
}

/**
 * 润色总结生成
 * 对应小程序：action: 'enhance_generate_summary'
 */
export function enhanceOptimizationSummary(data) {
  return request.post('/ai_service_clo', { action: 'enhance_generate_summary', ...data })
}

// ── 对话创建模式相关接口 ───────────────────────────────────────────────────

/**
 * 发送对话消息，获取 AI 回复
 * 对应小程序：action: 'super_chat_send'
 */
export function chatSend(data) {
  return request.post('/ai_service_clo', { action: 'super_chat_send', ...data })
}

/**
 * AI智能填充某个模块字段
 * 对应小程序：action: 'super_ai_fill'
 */
export function chatAiFill(data) {
  return request.post('/ai_service_clo', { action: 'super_ai_fill', ...data })
}

/**
 * 生成最终润色版本
 * 对应小程序：action: 'super_optimize'
 */
export function chatOptimize(data) {
  return request.post('/ai_service_clo', { action: 'super_optimize', ...data })
}
