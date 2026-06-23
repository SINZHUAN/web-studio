/**
 * ai_service_web - HTTP触发器包装层
 *
 * 使用方式：
 * 将此文件内容与小程序 ai_service_clo/index.js 合并部署：
 * 1. 将 ai_service_clo/index.js 的 exports.main 重命名为 handleAction
 * 2. 用下方的 exports.main 替换原来的入口函数
 *
 * 改动说明：
 * - 原 exports.main(event) 直接处理小程序调用格式
 * - 新 exports.main(event) 先处理 HTTP 触发器格式，验证 JWT，再调用原逻辑
 * - 原业务代码（handleAction 函数及所有 AI 调用逻辑）完全不变
 */

const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'studio_jwt_secret_please_change_in_production'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
}

/**
 * 将此函数替换原 ai_service_clo 的 exports.main
 * 同时将原 exports.main 的函数体内容提取到 handleAction 函数中
 */
async function httpMain(event, context, handleAction) {
  // 处理 CORS 预检
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' }
  }

  // 解析请求体
  let body = {}
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {})
  } catch {
    return respond(400, { success: false, message: '请求体解析失败' })
  }

  // 验证 JWT Token
  const authHeader = (event.headers?.authorization || event.headers?.Authorization || '')
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) {
    return respond(401, { success: false, message: '未提供认证Token' })
  }
  try {
    jwt.verify(token, JWT_SECRET)
  } catch {
    return respond(401, { success: false, message: 'Token无效或已过期' })
  }

  // 调用原有业务逻辑（handleAction = 原来的 exports.main 函数体）
  try {
    const result = await handleAction(body, context)
    return respond(200, result)
  } catch (err) {
    console.error('ai_service_web error:', err)
    return respond(500, { success: false, message: '服务器错误', error: err.message })
  }
}

function respond(statusCode, data) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data)
  }
}

module.exports = { httpMain }
