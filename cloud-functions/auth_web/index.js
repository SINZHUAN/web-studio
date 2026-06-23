'use strict'
/**
 * auth_web - 员工认证云函数（HTTP触发器版本）
 *
 * 修改自小程序 auth_clo，去除 wx.getWXContext()，改用 JWT 认证
 *
 * 支持的 action：
 *   login        - 员工登录，返回JWT Token
 *   verify       - 验证Token有效性
 *   createUser   - 创建员工账号（admin权限）
 *   listUsers    - 获取员工列表（admin权限）
 *   toggleUser   - 启用/禁用账号（admin权限）
 *   changePassword - 修改密码
 */

const cloud = require('wx-server-sdk')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// JWT 密钥（建议存入云函数环境变量 process.env.JWT_SECRET）
const JWT_SECRET = process.env.JWT_SECRET || 'studio_jwt_secret_please_change_in_production'
const TOKEN_EXPIRES = '8h'

// CORS 响应头
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
}

exports.main = async (event, context) => {
  // 处理 OPTIONS 预检请求
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

  const { action } = body

  try {
    switch (action) {
      case 'login':
        return await handleLogin(body)
      case 'verify':
        return await handleVerify(event)
      case 'createUser':
        return await handleCreateUser(body, event)
      case 'listUsers':
        return await handleListUsers(body, event)
      case 'toggleUser':
        return await handleToggleUser(body, event)
      case 'changePassword':
        return await handleChangePassword(body, event)
      default:
        return respond(400, { success: false, message: `未知 action: ${action}` })
    }
  } catch (err) {
    console.error('auth_web error:', err)
    return respond(500, { success: false, message: '服务器内部错误', error: err.message })
  }
}

// ── 登录 ──────────────────────────────────────────────────────────────────
async function handleLogin({ email, password }) {
  if (!email || !password) {
    return respond(400, { success: false, message: '邮箱和密码不能为空' })
  }

  const res = await db.collection('studio_users')
    .where({ email: email.toLowerCase().trim() })
    .get()

  if (!res.data.length) {
    return respond(401, { success: false, message: '账号不存在' })
  }

  const user = res.data[0]

  if (!user.isActive) {
    return respond(403, { success: false, message: '账号已被禁用，请联系管理员' })
  }

  const isValid = await bcrypt.compare(password, user.passwordHash)
  if (!isValid) {
    return respond(401, { success: false, message: '密码错误' })
  }

  // 更新最后登录时间
  await db.collection('studio_users').doc(user._id).update({
    data: { lastLoginAt: db.serverDate() }
  })

  const token = jwt.sign(
    { userId: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRES }
  )

  return respond(200, {
    success: true,
    token,
    name: user.name,
    role: user.role
  })
}

// ── 验证 Token ─────────────────────────────────────────────────────────────
async function handleVerify(event) {
  const payload = extractAndVerifyToken(event)
  if (!payload) {
    return respond(401, { success: false, message: 'Token无效或已过期' })
  }
  return respond(200, { success: true, userId: payload.userId, role: payload.role })
}

// ── 创建员工（仅admin）────────────────────────────────────────────────────
async function handleCreateUser({ email, password, name, role = 'editor' }, event) {
  const caller = requireAdmin(event)
  if (!caller) return respond(403, { success: false, message: '无权限' })

  if (!email || !password || !name) {
    return respond(400, { success: false, message: '邮箱、密码、姓名均不能为空' })
  }

  // 检查邮箱是否已存在
  const existing = await db.collection('studio_users').where({ email: email.toLowerCase() }).get()
  if (existing.data.length) {
    return respond(400, { success: false, message: '该邮箱已被注册' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  await db.collection('studio_users').add({
    data: {
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      role,
      isActive: true,
      createdAt: db.serverDate(),
      lastLoginAt: null
    }
  })

  return respond(200, { success: true, message: '员工账号创建成功' })
}

// ── 获取员工列表（仅admin）───────────────────────────────────────────────
async function handleListUsers(body, event) {
  const caller = requireAdmin(event)
  if (!caller) return respond(403, { success: false, message: '无权限' })

  const res = await db.collection('studio_users').orderBy('createdAt', 'desc').get()
  const users = res.data.map(u => ({
    _id: u._id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt
  }))

  return respond(200, { success: true, users })
}

// ── 启用/禁用账号（仅admin）──────────────────────────────────────────────
async function handleToggleUser({ userId, isActive }, event) {
  const caller = requireAdmin(event)
  if (!caller) return respond(403, { success: false, message: '无权限' })

  await db.collection('studio_users').doc(userId).update({ data: { isActive } })
  return respond(200, { success: true, message: isActive ? '账号已启用' : '账号已禁用' })
}

// ── 修改密码 ──────────────────────────────────────────────────────────────
async function handleChangePassword({ oldPassword, newPassword }, event) {
  const payload = extractAndVerifyToken(event)
  if (!payload) return respond(401, { success: false, message: 'Token无效' })

  const res = await db.collection('studio_users').doc(payload.userId).get()
  const user = res.data

  const isValid = await bcrypt.compare(oldPassword, user.passwordHash)
  if (!isValid) return respond(400, { success: false, message: '原密码错误' })

  const newHash = await bcrypt.hash(newPassword, 10)
  await db.collection('studio_users').doc(payload.userId).update({ data: { passwordHash: newHash } })

  return respond(200, { success: true, message: '密码修改成功' })
}

// ── 工具函数 ──────────────────────────────────────────────────────────────
function extractAndVerifyToken(event) {
  const authHeader = (event.headers?.authorization || event.headers?.Authorization || '')
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

function requireAdmin(event) {
  const payload = extractAndVerifyToken(event)
  if (!payload || payload.role !== 'admin') return null
  return payload
}

function respond(statusCode, data) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data)
  }
}
