'use strict'

const jwt     = require('jsonwebtoken')
const bcrypt  = require('bcryptjs')
const crypto  = require('crypto')
const cloud   = require('wx-server-sdk')

const JWT_SECRET    = process.env.JWT_SECRET || 'studio_jwt_secret_2026_please_change'
const BCRYPT_ROUNDS = 10
const JWT_EXPIRES   = '3d'   // Token 有效期：3 天

/** 生成唯一会话 ID（用于单设备登录互踢） */
function genSessionId() {
  return crypto.randomBytes(24).toString('hex')
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
}

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ── 响应工具 ──────────────────────────────────────────────────────────────────

function respond(statusCode, data) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(data) }
}
function ok(data)         { return respond(200, { success: true,  ...data }) }
function fail(msg, code)  { return respond(code || 400, { success: false, message: msg }) }

// ── JWT 工具 ──────────────────────────────────────────────────────────────────

function getToken(event) {
  const auth = (event.headers && (event.headers.Authorization || event.headers.authorization)) || ''
  return auth.replace(/^Bearer\s+/i, '').trim()
}

function verifyJWT(event) {
  const token = getToken(event)
  if (!token) throw Object.assign(new Error('未登录'), { code: 401 })
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    throw Object.assign(new Error('登录已过期，请重新登录'), { code: 401 })
  }
}

// 角色层级：superadmin > admin（副管理员）> editor（员工）
const ADMIN_ROLES = ['admin', 'superadmin']

function requireAdmin(event) {
  const payload = verifyJWT(event)
  if (!ADMIN_ROLES.includes(payload.role))
    throw Object.assign(new Error('无管理员权限'), { code: 403 })
  return payload
}

function requireSuperAdmin(event) {
  const payload = verifyJWT(event)
  if (payload.role !== 'superadmin')
    throw Object.assign(new Error('该操作需要总管理员权限'), { code: 403 })
  return payload
}

// 副管理员只能操作 editor 账号；总管理员可操作 admin/editor（不能操作 superadmin）
function assertCanManage(operator, targetRole) {
  if (targetRole === 'superadmin')
    throw Object.assign(new Error('无法操作总管理员账号'), { code: 403 })
  if (operator.role === 'admin' && targetRole !== 'editor')
    throw Object.assign(new Error('副管理员只能操作员工账号'), { code: 403 })
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

exports.main = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(204, {})

  let body = {}
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {})
  } catch {
    return fail('请求格式错误')
  }

  const { action } = body
  const db    = cloud.database()
  const users = db.collection('users')

  try {

    // ════════════════════════════════════════════════════════════════════════
    //  初始化：首次部署时创建第一个管理员账号（一次性，此后自动禁用）
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'seed') {
      // 集合不存在（首次使用）时，count 会报错，视为没有管理员，直接继续
      let hasAdmin = false
      try {
        const adminCount = await users.where({ role: 'admin' }).count()
        hasAdmin = adminCount.total > 0
      } catch (e) {
        if (!String(e.message).includes('-502005')) throw e
        // 集合不存在 → 肯定没有管理员，继续创建
      }
      if (hasAdmin) return fail('已存在管理员账号，seed 已禁用')

      const { email, password, name } = body
      if (!email || !password || !name) return fail('缺少 email / password / name')
      if (password.length < 6) return fail('密码不能少于6位')

      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
      await users.add({
        data: {
          email, name, password: hash,
          role: 'admin', isActive: true,
          createdAt: new Date().toISOString(),
          lastLoginAt: null
        }
      })
      return ok({ message: '管理员账号已创建，seed 接口已自动关闭' })
    }

    // ════════════════════════════════════════════════════════════════════════
    //  公开接口
    // ════════════════════════════════════════════════════════════════════════

    if (action === 'login') {
      const { email, password } = body
      if (!email || !password) return fail('请输入账号和密码')

      let res
      try {
        res = await users.where({ email }).limit(1).get()
      } catch (e) {
        if (String(e.message).includes('-502005')) return fail('账号不存在，请先联系管理员创建账号')
        throw e
      }
      if (res.data.length === 0) return fail('账号不存在')

      const user = res.data[0]
      if (!user.isActive) return fail('账号已被停用，请联系管理员')
      if (user.frozen)    return fail('账号已被安全系统冻结，请联系管理员解冻')

      const match = await bcrypt.compare(password, user.password)
      if (!match) return fail('密码错误')

      // 生成新会话 ID（覆盖旧值，令其他已登录设备的 Token 在下次 verify 时失效）
      const sessionId = genSessionId()

      const token = jwt.sign(
        { userId: user._id, email: user.email, name: user.name, role: user.role, sessionId },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      )

      await users.doc(user._id).update({
        data: { lastLoginAt: new Date().toISOString(), sessionId }
      })

      return ok({ token, userId: user._id, name: user.name, role: user.role })
    }

    if (action === 'verify') {
      const payload = verifyJWT(event)
      // 校验会话 ID，防止同一账号多设备同时登录
      const userDoc = await users.doc(payload.userId).get()
      if (!userDoc.data) return fail('账号不存在', 401)
      if (!userDoc.data.isActive) return fail('账号已被停用，请联系管理员', 401)
      if (userDoc.data.frozen)    return fail('账号已被安全系统冻结，请联系管理员解冻', 401)
      if (payload.sessionId && userDoc.data.sessionId && payload.sessionId !== userDoc.data.sessionId) {
        return fail('您的账号已在其他设备登录，当前会话已失效，请重新登录', 401)
      }
      return ok({ userId: payload.userId, name: payload.name, role: payload.role })
    }

    // ════════════════════════════════════════════════════════════════════════
    //  需要登录的接口
    // ════════════════════════════════════════════════════════════════════════

    if (action === 'changePassword') {
      const payload   = verifyJWT(event)
      const { oldPassword, newPassword } = body
      if (!oldPassword || !newPassword) return fail('参数缺失')
      if (newPassword.length < 6) return fail('新密码不能少于6位')

      const userRes = await users.doc(payload.userId).get()
      const match   = await bcrypt.compare(oldPassword, userRes.data.password)
      if (!match) return fail('原密码错误')

      const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
      await users.doc(payload.userId).update({ data: { password: hash } })
      return ok({ message: '密码修改成功' })
    }

    // ════════════════════════════════════════════════════════════════════════
    //  管理员专属接口
    // ════════════════════════════════════════════════════════════════════════

    if (action === 'listUsers') {
      const payload = requireAdmin(event)
      // 副管理员只能看 editor 账号；总管理员看全部
      const query = payload.role === 'admin'
        ? users.where({ role: 'editor' }).orderBy('createdAt', 'desc').limit(200)
        : users.orderBy('createdAt', 'desc').limit(200)
      const res  = await query.get()
      const list = res.data.map(u => ({
        userId:       u._id,
        email:        u.email,
        name:         u.name,
        role:         u.role,
        isActive:     u.isActive,
        frozen:       u.frozen       || false,
        frozenAt:     u.frozenAt     || null,
        frozenReason: u.frozenReason || null,
        createdAt:    u.createdAt,
        lastLoginAt:  u.lastLoginAt  || null
      }))
      return ok({ list })
    }

    if (action === 'createUser') {
      const payload = requireAdmin(event)
      const { email, password, name, role = 'editor' } = body
      if (!email || !password || !name) return fail('缺少必要参数（email/password/name）')
      if (password.length < 6)         return fail('密码不能少于6位')
      if (role === 'superadmin')        return fail('不能创建总管理员账号')
      if (!['admin', 'editor'].includes(role)) return fail('角色无效')
      // 副管理员只能创建 editor
      if (payload.role === 'admin' && role !== 'editor') return fail('副管理员只能创建员工账号')

      const exists = await users.where({ email }).count()
      if (exists.total > 0) return fail('该账号已存在')

      const hash   = await bcrypt.hash(password, BCRYPT_ROUNDS)
      const result = await users.add({
        data: {
          email, name, password: hash,
          role, isActive: true,
          createdAt: new Date().toISOString(),
          lastLoginAt: null
        }
      })
      return ok({ userId: result._id, message: '账号创建成功' })
    }

    if (action === 'toggleUser') {
      const payload = requireAdmin(event)
      const { userId, isActive } = body
      if (!userId || typeof isActive !== 'boolean') return fail('参数错误')
      const target = await users.doc(userId).get()
      if (!target.data) return fail('用户不存在')
      assertCanManage(payload, target.data.role)
      await users.doc(userId).update({ data: { isActive } })
      return ok({ message: isActive ? '账号已启用' : '账号已停用' })
    }

    if (action === 'deleteUser') {
      const payload = requireAdmin(event)
      const { userId } = body
      if (!userId) return fail('缺少 userId')
      if (userId === payload.userId) return fail('不能删除自己的账号')
      const target = await users.doc(userId).get()
      if (!target.data) return fail('用户不存在')
      assertCanManage(payload, target.data.role)
      await users.doc(userId).remove()
      return ok({ message: '账号已删除' })
    }

    if (action === 'adminResetPassword') {
      const payload = requireAdmin(event)
      const { userId, newPassword } = body
      if (!userId || !newPassword) return fail('参数缺失')
      if (newPassword.length < 6)  return fail('新密码不能少于6位')
      const target = await users.doc(userId).get()
      if (!target.data) return fail('用户不存在')
      assertCanManage(payload, target.data.role)
      const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
      await users.doc(userId).update({ data: { password: hash } })
      return ok({ message: '密码已重置' })
    }

    if (action === 'unfreezeUser') {
      const payload = requireAdmin(event)
      const { userId } = body
      if (!userId) return fail('缺少 userId')
      const target = await users.doc(userId).get()
      if (!target.data) return fail('用户不存在')
      assertCanManage(payload, target.data.role)
      await users.doc(userId).update({
        data: {
          frozen:       false,
          frozenAt:     null,
          frozenReason: null,
          unfrozenAt:   new Date().toISOString()
        }
      })
      return ok({ message: '账号已解冻' })
    }

    if (action === 'changeUserRole') {
      // 只有总管理员才能改角色
      const payload = requireSuperAdmin(event)
      const { userId, role } = body
      if (!userId || !role) return fail('参数缺失')
      if (role === 'superadmin') return fail('不能将账号设置为总管理员')
      if (!['admin', 'editor'].includes(role)) return fail('角色无效')
      if (userId === payload.userId) return fail('不能修改自己的角色')
      const target = await users.doc(userId).get()
      if (!target.data) return fail('用户不存在')
      if (target.data.role === 'superadmin') return fail('不能修改总管理员的角色')
      await users.doc(userId).update({ data: { role } })
      return ok({ message: '角色已更新' })
    }

    return fail('未知操作: ' + action)

  } catch (e) {
    if (e.code === 401 || e.code === 403) return respond(e.code, { success: false, message: e.message })
    console.error('[auth_clo] error:', e.message)
    return respond(500, { success: false, message: '服务器错误: ' + e.message })
  }
}
