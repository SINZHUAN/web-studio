'use strict'

/**
 * commission_web — 代做工单云函数
 *
 * 路由：/commission_web（HTTP 访问服务）
 *
 * 客户端 actions（凭 openid，无需 JWT）：
 *   client_login            — wx.login code 换 openid
 *   client_create_order     — 创建简历优化工单
 *   client_get_orders       — 查询当前客户的工单列表
 *   client_get_order_detail — 查询单个工单详情（仅进度信息）
 *   client_upload_prepare   — 生成 COS 预签名 POST URL 供直传文档
 *
 * 员工端 actions（需 JWT）：
 *   staff_list_orders       — 列出工单（可按 status 筛选）
 *   staff_claim_order       — 接取工单（含配额检查）
 *   staff_complete_order    — 标记工单完成
 *
 * 管理员 actions（需管理员 JWT）：
 *   admin_assign_order      — 手动将工单分配给指定员工
 *   admin_get_settings      — 读取分配设置
 *   admin_update_settings   — 更新分配设置
 *   admin_get_daily_stats   — 各员工今日接单统计
 *
 * 环境变量（与其他 web 云函数保持一致）：
 *   JWT_SECRET          — JWT 签名密钥
 *   WX_APPID            — 小程序 AppID（覆盖内嵌默认值）
 *   WX_APPSECRET        — 小程序 AppSecret（覆盖内嵌默认值）
 *   TENCENT_SECRET_ID   — 腾讯云 API 密钥 ID
 *   TENCENT_SECRET_KEY  — 腾讯云 API 密钥 Key
 *   TENCENT_REGION      — COS 地域
 *   TENCENT_BUCKET      — COS 存储桶名
 */

const jwt    = require('jsonwebtoken')
const COS    = require('cos-nodejs-sdk-v5')
const axios  = require('axios')
const crypto = require('crypto')
const cloud  = require('wx-server-sdk')

// ── 配置 ──────────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET    || 'studio_jwt_secret_2026_please_change'
const WX_APPID   = process.env.WX_APPID     || 'wx05b48e6f0254308d'
const WX_SECRET  = process.env.WX_APPSECRET || 'e5aa34d246bed2a639aed0c41fd82ff1'

const cosConfig = {
  secretId:  process.env.TENCENT_SECRET_ID  || '',
  secretKey: process.env.TENCENT_SECRET_KEY || '',
  region:    process.env.TENCENT_REGION     || 'ap-shanghai',
  bucket:    process.env.TENCENT_BUCKET     || '',
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
}

const ADMIN_ROLES = ['admin', 'superadmin']

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ── 响应工具 ──────────────────────────────────────────────────────────────────
function respond(statusCode, data) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(data) }
}
function ok(data)        { return respond(200, { success: true,  ...data }) }
function fail(msg, code) { return respond(code || 400, { success: false, message: msg }) }

// ── JWT 工具 ──────────────────────────────────────────────────────────────────
function verifyJWT(event) {
  const auth  = (event.headers?.authorization || event.headers?.Authorization || '')
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw Object.assign(new Error('未登录'), { code: 401 })
  try   { return jwt.verify(token, JWT_SECRET) }
  catch { throw Object.assign(new Error('登录已过期，请重新登录'), { code: 401 }) }
}

// ── COS POST Object 预签名 ─────────────────────────────────────────────────────
// CloudBase 云函数注入的是 STS 临时凭证，POST Object 必须携带 TENCENT_SESSIONTOKEN
function cosPostSign(fileKey) {
  const { secretId, secretKey, bucket, region } = cosConfig
  const sessionToken = process.env.TENCENT_SESSIONTOKEN || ''
  const now     = Math.floor(Date.now() / 1000)
  const expire  = now + 1800
  const keyTime = `${now};${expire}`
  const folder  = fileKey.substring(0, fileKey.lastIndexOf('/') + 1)

  const policyConditions = [
    { bucket },
    { 'success_action_status': '200' },
    { 'q-sign-algorithm': 'sha1' },
    { 'q-ak': secretId },
    { 'q-sign-time': keyTime },
    ['starts-with', '$key', folder],
  ]
  if (sessionToken) {
    policyConditions.push({ 'x-cos-security-token': sessionToken })
  }

  const policy = {
    expiration: new Date(expire * 1000).toISOString(),
    conditions: policyConditions,
  }

  const policyB64  = Buffer.from(JSON.stringify(policy)).toString('base64')
  const signKey    = crypto.createHmac('sha1', secretKey).update(keyTime).digest('hex')
  const strToSign  = crypto.createHash('sha1').update(policyB64).digest('hex')
  const qSig       = crypto.createHmac('sha1', signKey).update(strToSign).digest('hex')

  const formData = {
    key:                     fileKey,
    'success_action_status': '200',
    'q-sign-algorithm':      'sha1',
    'q-ak':                  secretId,
    'q-sign-time':           keyTime,
    'q-key-time':            keyTime,
    policy:                  policyB64,
    'q-signature':           qSig,
  }
  if (sessionToken) {
    formData['x-cos-security-token'] = sessionToken
  }

  return {
    uploadUrl: `https://${bucket}.cos.${region}.myqcloud.com/`,
    formData,
  }
}

// ── 工单编号生成 ──────────────────────────────────────────────────────────────
async function genOrderId(db) {
  const today    = new Date()
  const y        = today.getFullYear()
  const m        = String(today.getMonth() + 1).padStart(2, '0')
  const d        = String(today.getDate()).padStart(2, '0')
  const dateStr  = `${y}${m}${d}`
  const dayStart = new Date(y, today.getMonth(), today.getDate()).toISOString()
  const dayEnd   = new Date(y, today.getMonth(), today.getDate() + 1).toISOString()
  const _        = db.command
  const res      = await db.collection('commission_orders')
    .where({ createdAt: _.gte(dayStart).and(_.lt(dayEnd)) })
    .count()
  return `CO-${dateStr}-${String(res.total + 1).padStart(3, '0')}`
}

// ══════════════════════════════════════════════════════════════════════════════
//  客户端 Actions（无需 JWT）
// ══════════════════════════════════════════════════════════════════════════════

/** wx.login code 换 openid */
async function clientLogin(body) {
  const { code } = body
  if (!code) return fail('code 参数缺失')
  try {
    const url   = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${code}&grant_type=authorization_code`
    const wxRes = await axios.get(url, { timeout: 10000 })
    if (wxRes.data.errcode) return fail(`微信接口错误(${wxRes.data.errcode}): ${wxRes.data.errmsg}`)
    return ok({ openid: wxRes.data.openid })
  } catch (err) {
    return fail('获取 openid 失败: ' + err.message)
  }
}

/** 创建简历优化工单 */
async function clientCreateOrder(body) {
  const {
    openid, email, userIdentity, polishMode, targetPosition,
    polishingIntensity, jobDescription, resumeFileKey, resumeFileName,
  } = body

  if (!openid)             return fail('openid 缺失')
  if (!userIdentity)       return fail('求职者身份不能为空')
  if (!polishMode)         return fail('润色模式不能为空')
  if (!polishingIntensity) return fail('润色强度不能为空')
  if (!resumeFileKey)      return fail('简历文件未上传')
  if (polishMode === 'position' && !targetPosition) return fail('岗位润色需填写目标岗位')

  const db      = cloud.database()
  const orderId = await genOrderId(db)
  const now     = new Date().toISOString()
  const emailNorm = typeof email === 'string' ? email.trim() : ''

  const doc = {
    orderId,
    openid,
    businessType:       'optimize',
    email:              emailNorm,
    userIdentity,
    polishMode,
    targetPosition:     targetPosition     || '',
    polishingIntensity,
    jobDescription:     jobDescription     || '',
    resumeFileKey,
    resumeFileName:     resumeFileName     || '',
    status:             'pending',
    claimedBy:          null,
    claimedByName:      null,
    claimedAt:          null,
    completedAt:        null,
    resultFileKey:      null,
    resultPreviewUrls:  [],
    linkedWorkorderId:  null,
    createdAt:          now,
    updatedAt:          now,
  }

  const addRes = await db.collection('commission_orders').add({ data: doc })
  return ok({ orderId, _id: addRes._id, message: '工单提交成功' })
}

/**
 * client_create_recognition_order — 创建简历定制工单（识别模式）
 * 客户在小程序端完成AI识别+补填后，提交至此接口创建工单
 */
async function clientCreateRecognitionOrder(body) {
  const {
    openid, email,
    userType, selectedTemplateId,
    polishMode, polishingIntensity, targetPosition, jobDescription,
    clientResumeFileKey, clientResumeFileName,
    extractedData,
  } = body

  if (!openid)             return fail('openid 缺失')
  if (!selectedTemplateId) return fail('未选择模板')
  if (!userType)           return fail('身份不能为空')
  if (!clientResumeFileKey) return fail('简历文件未上传')

  const db      = cloud.database()
  const orderId = await genOrderId(db)
  const now     = new Date().toISOString()
  const emailNorm = typeof email === 'string' ? email.trim() : ''

  const doc = {
    orderId,
    openid,
    businessType:         'recognition',
    email:                emailNorm,
    userType,
    userIdentity:         userType,          // 兼容 optimize 字段名
    selectedTemplateId,
    polishMode:           polishMode           || 'self',
    polishingIntensity:   polishingIntensity   || 'standard',
    targetPosition:       targetPosition       || '',
    jobDescription:       jobDescription       || '',
    clientResumeFileKey,
    clientResumeFileName: clientResumeFileName || '',
    resumeFileKey:        clientResumeFileKey,  // 兼容旧字段名
    resumeFileName:       clientResumeFileName  || '',
    extractedData:        extractedData        || null,
    status:               'pending',
    claimedBy:            null,
    claimedByName:        null,
    claimedAt:            null,
    completedAt:          null,
    resultFileKey:        null,
    resultPreviewUrls:    [],
    createdAt:            now,
    updatedAt:            now,
  }

  const addRes = await db.collection('commission_orders').add({ data: doc })
  return ok({ orderId, _id: addRes._id, message: '简历定制工单提交成功' })
}

/** 查询客户自己的工单列表 */
async function clientGetOrders(body) {
  const { openid } = body
  if (!openid) return fail('openid 缺失')
  const db  = cloud.database()
  const res = await db.collection('commission_orders')
    .where({ openid })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get()

  // 只返回列表页所需轻量字段，避免将 clientPreviewUrls 大数组传给客户端
  const list = (res.data || []).map(o => ({
    _id:               o._id,
    orderId:           o.orderId,
    businessType:      o.businessType,
    status:            o.status,
    polishMode:        o.polishMode,
    targetPosition:    o.targetPosition,
    polishingIntensity: o.polishingIntensity,
    resumeFileName:    o.resumeFileName,
    createdAt:         o.createdAt,
    claimedAt:         o.claimedAt    || null,
    completedAt:       o.completedAt  || null,
    previewSentAt:     o.previewSentAt || null,
    // 是否有待确认的预览回传（previewSentAt 存在即代表已回传）
    hasPreview:        !!(o.previewSentAt && o.clientPreviewUrls && o.clientPreviewUrls.length),
    // 是否有简历分析报告回传
    hasAnalysisReport: !!(o.analysisSentAt && o.clientAnalysisData),
    analysisSentAt:    o.analysisSentAt || null,
    // 是否有成品下载回传
    hasResult:         !!(o.resultSentAt && o.clientResultItems && o.clientResultItems.length),
    resultSentAt:      o.resultSentAt || null,
  }))

  return ok({ list })
}

/**
 * client_delete_orders — 客户批量删除自己的订单（仅允许删除自己的订单）
 * 制作中（claimed）的订单不允许删除，其余状态均可
 */
async function clientDeleteOrders(body) {
  const { openid, orderIds } = body
  if (!openid)              return fail('openid 缺失')
  if (!orderIds?.length)    return fail('请选择要删除的订单')

  const db   = cloud.database()
  const _cmd = db.command

  // 查询属于该用户的订单
  const res = await db.collection('commission_orders')
    .where({ openid, orderId: _cmd.in(orderIds) })
    .get()

  if (!res.data.length) return fail('未找到可操作的订单')

  // 制作中的订单不允许删除
  const blocked = res.data.filter(o => o.status === 'claimed')
  if (blocked.length) {
    const ids = blocked.map(o => o.orderId).join('、')
    return fail(`以下订单正在制作中，无法删除：${ids}`)
  }

  // 批量删除
  await Promise.all(res.data.map(o =>
    db.collection('commission_orders').doc(o._id).remove()
  ))

  return ok({ deleted: res.data.length, message: `已删除 ${res.data.length} 个订单` })
}

/** 查询单个工单详情（仅进度字段，保护隐私） */
async function clientGetOrderDetail(body) {
  const { orderId, openid } = body
  if (!orderId || !openid) return fail('参数缺失')
  const db  = cloud.database()
  const res = await db.collection('commission_orders')
    .where({ orderId, openid })
    .limit(1)
    .get()
  if (!res.data.length) return fail('工单不存在', 404)
  const o = res.data[0]
  return ok({
    orderId:            o.orderId,
    businessType:       o.businessType,
    status:             o.status,
    email:              o.email ? o.email.replace(/(.{2}).+(@.+)/, '$1***$2') : '',
    polishMode:         o.polishMode,
    targetPosition:     o.targetPosition,
    polishingIntensity: o.polishingIntensity,
    resumeFileName:     o.resumeFileName,
    createdAt:          o.createdAt,
    claimedAt:          o.claimedAt,
    completedAt:        o.completedAt,
    // 员工回传字段
    clientPreviewUrls:    o.clientPreviewUrls    || [],
    clientOriginalUrls:   o.clientOriginalUrls   || [],
    clientAnalysis:       o.clientAnalysis       || null,
    clientAnalysisReport: o.clientAnalysisReport || null,
    previewSentAt:        o.previewSentAt        || null,
    // 简历分析报告回传字段
    clientAnalysisData:   o.clientAnalysisData   || null,
    analysisSentAt:       o.analysisSentAt       || null,
    // 成品下载回传字段
    clientResultItems:    o.clientResultItems    || [],
    clientIdPhotoUrl:     o.clientIdPhotoUrl     || null,
    resultSentAt:         o.resultSentAt         || null,
    resultWordUrl:        o.resultWordUrl        || null,
    resultWordFileKey:    o.resultWordFileKey    || null,
    resultPdfUrl:         o.resultPdfUrl         || null,   // Word→PDF 转换后的 COS 公共 URL
    resultPdfFileKey:     o.resultPdfFileKey     || null,
    resultAnalysisUrl:    o.resultAnalysisUrl    || null,
  })
}

/** 接收小程序上传的文件（base64 编码），存入 CloudBase 云存储，返回 fileKey */
async function clientUploadFile(body) {
  const { openid, fileName, fileData } = body
  if (!openid)   return fail('未登录')
  if (!fileName) return fail('缺少文件名')
  if (!fileData) return fail('缺少文件数据')

  const ext = (fileName.split('.').pop() || '').toLowerCase()
  if (!['docx', 'doc'].includes(ext)) return fail('仅支持 .docx / .doc 文件')

  let buf
  try {
    buf = Buffer.from(fileData, 'base64')
  } catch {
    return fail('文件数据解析失败')
  }
  if (buf.length > 5 * 1024 * 1024) return fail('文件过大，请上传 5MB 以内的文档')

  const cloudPath = `client_uploads/${openid}/${Date.now()}_${fileName}`
  try {
    const uploadRes = await cloud.uploadFile({ cloudPath, fileContent: buf })
    return ok({ fileKey: cloudPath, fileID: uploadRes.fileID })
  } catch (e) {
    console.error('[clientUploadFile] cloud.uploadFile error:', e)
    return fail('云存储上传失败: ' + (e.message || e))
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  员工端 Actions（需 JWT）
// ══════════════════════════════════════════════════════════════════════════════

/** 列出工单（按状态筛选） */
async function staffListOrders(body) {
  const { status, page = 1, pageSize = 30 } = body
  const db   = cloud.database()
  const cond = status ? { status } : {}
  const skip = (page - 1) * pageSize
  const [list, cnt] = await Promise.all([
    db.collection('commission_orders').where(cond)
      .orderBy('createdAt', 'desc').skip(skip).limit(pageSize).get(),
    db.collection('commission_orders').where(cond).count(),
  ])

  // 补全 claimedByName：针对旧数据中 claimedByName 存的是原始 userId 的情况
  // 收集所有有效的 claimedBy ID，批量查询 users 集合拿到真实 name
  const orders = list.data
  const needLookup = orders.filter(o => o.claimedBy && /^[0-9a-f]{20,}$/i.test(o.claimedByName || ''))
  if (needLookup.length > 0) {
    const ids = [...new Set(needLookup.map(o => o.claimedBy))]
    // CloudBase 单次最多查 100 条，分批查
    const userMap = {}
    const batchSize = 10
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize)
      const uRes = await db.collection('users')
        .where({ _id: db.command.in(batch) })
        .field({ _id: true, name: true, email: true })
        .limit(batchSize)
        .get()
        .catch(() => ({ data: [] }))
      ;(uRes.data || []).forEach(u => { userMap[u._id] = u.name || u.email || u._id })
    }
    // 用查到的真实名字覆盖 claimedByName
    orders.forEach(o => {
      if (o.claimedBy && userMap[o.claimedBy]) {
        o.claimedByName = userMap[o.claimedBy]
      }
    })
  }

  return ok({ list: orders, total: cnt.total })
}

/** 接取工单（含配额检查） */
async function staffClaimOrder(body, auth) {
  const { _id } = body
  if (!_id) return fail('工单 _id 缺失')

  const db   = cloud.database()
  const _cmd = db.command

  // 检查分配设置
  const settRes = await db.collection('commission_settings')
    .doc('global').get().catch(() => ({ data: null }))
  const sett = settRes.data || { distributionMode: 'free', staffQuotas: {} }

  if (sett.distributionMode === 'custom') {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const quota = (sett.staffQuotas || {})[auth.userId] ?? 999
    const cnt   = await db.collection('commission_orders')
      .where({ claimedBy: auth.userId, claimedAt: _cmd.gte(today.toISOString()) })
      .count()
    if (cnt.total >= quota) return fail(`今日配额已满（${cnt.total}/${quota}）`, 403)
  }

  // 原子检查工单状态
  const orderRes = await db.collection('commission_orders').doc(_id).get()
  if (!orderRes.data)                     return fail('工单不存在', 404)
  if (orderRes.data.status !== 'pending') return fail('该工单已被接取', 409)

  const now = new Date().toISOString()
  await db.collection('commission_orders').doc(_id).update({
    data: {
      status:        'claimed',
      claimedBy:     auth.userId,
      claimedByName: auth.name || auth.email || auth.userId,
      claimedAt:     now,
      updatedAt:     now,
    },
  })
  return ok({ message: '接取成功' })
}

/** 标记工单完成 */
/**
 * staffSaveProgress — 保存当前制作进度（不完结工单，仅持久化润色结果快照）
 * 员工可稍后通过「继续制作」按钮恢复到润色对比页
 */
async function staffSaveProgress(body, auth) {
  const { _id, savedProgress } = body
  if (!_id) return fail('工单 _id 缺失')
  const db  = cloud.database()
  const res = await db.collection('commission_orders').doc(_id).get()
  if (!res.data) return fail('工单不存在', 404)
  const isAdmin = ADMIN_ROLES.includes(auth.role)
  if (!isAdmin && res.data.claimedBy !== auth.userId) return fail('无权操作此工单', 403)
  if (res.data.status !== 'claimed') return fail('只有制作中的工单可保存进度', 400)

  const now = new Date().toISOString()
  await db.collection('commission_orders').doc(_id).update({
    data: { savedProgress: savedProgress || null, savedAt: now, updatedAt: now },
  })
  return ok({ message: '进度已保存' })
}

/**
 * staffSendPreview — 将润色对比预览图和分析摘要回传至小程序客户端
 * 客户可在「我的订单」详情页查看
 */
async function staffSendPreview(body, auth) {
  const { _id, clientPreviewUrls, clientOriginalUrls, clientAnalysis, clientAnalysisReport } = body
  if (!_id) return fail('工单 _id 缺失')
  const db  = cloud.database()
  const res = await db.collection('commission_orders').doc(_id).get()
  if (!res.data) return fail('工单不存在', 404)
  const isAdmin = ADMIN_ROLES.includes(auth.role)
  if (!isAdmin && res.data.claimedBy !== auth.userId) return fail('无权操作此工单', 403)

  const now = new Date().toISOString()
  await db.collection('commission_orders').doc(_id).update({
    data: {
      clientPreviewUrls:    clientPreviewUrls    || [],
      clientOriginalUrls:   clientOriginalUrls   || [],
      clientAnalysis:       clientAnalysis       || null,
      // 润色解析报告（summaryData 对象：整体策略、优化重点、面试建议等）
      clientAnalysisReport: clientAnalysisReport || null,
      previewSentAt:        now,
      updatedAt:            now,
    },
  })
  // 异步推送微信订阅消息（不等待结果，不影响接口响应速度）
  if (res.data.openid) {
    sendSubscribeMessage(res.data.openid, res.data)
  }

  return ok({ message: '预览已回传至小程序' })
}

/**
 * staffSendAnalysisReport — 将简历 AI 分析报告回传至小程序客户端
 * 客户可在「我的订单」详情页 → 「简历分析阶段」步骤中查看
 */
async function staffSendAnalysisReport(body, auth) {
  const { _id, clientAnalysisData } = body
  if (!_id) return fail('工单 _id 缺失')
  if (!clientAnalysisData) return fail('分析报告数据缺失')
  const db  = cloud.database()
  const res = await db.collection('commission_orders').doc(_id).get()
  if (!res.data) return fail('工单不存在', 404)
  const isAdmin = ADMIN_ROLES.includes(auth.role)
  if (!isAdmin && res.data.claimedBy !== auth.userId) return fail('无权操作此工单', 403)

  const now = new Date().toISOString()
  await db.collection('commission_orders').doc(_id).update({
    data: {
      clientAnalysisData: clientAnalysisData,
      analysisSentAt:     now,
      updatedAt:          now,
    },
  })
  // 推送微信订阅消息，触发小程序首页通知
  if (res.data.openid) {
    sendSubscribeMessage(res.data.openid, res.data)
  }
  return ok({ message: '分析报告已回传至小程序' })
}

async function staffCompleteOrder(body, auth) {
  const { _id, resultFileKey, resultPreviewUrls, linkedWorkorderId } = body
  if (!_id) return fail('工单 _id 缺失')
  const db  = cloud.database()
  const res = await db.collection('commission_orders').doc(_id).get()
  if (!res.data) return fail('工单不存在', 404)
  // 管理员可完成任意工单；普通员工只能完成自己接取的工单
  const isAdmin = ADMIN_ROLES.includes(auth.role)
  if (!isAdmin && res.data.claimedBy !== auth.userId) return fail('无权操作此工单', 403)
  if (res.data.status !== 'claimed') return fail('工单状态异常', 400)

  const now = new Date().toISOString()
  await db.collection('commission_orders').doc(_id).update({
    data: {
      status:            'completed',
      completedAt:       now,
      resultFileKey:     resultFileKey     || null,
      resultPreviewUrls: resultPreviewUrls || [],
      linkedWorkorderId: linkedWorkorderId || null,
      updatedAt:         now,
    },
  })
  return ok({ message: '工单已完成' })
}

// ══════════════════════════════════════════════════════════════════════════════
//  管理员 Actions
// ══════════════════════════════════════════════════════════════════════════════

/** 手动将工单分配给指定员工 */
async function adminAssignOrder(body) {
  const { _id, targetUserId, targetUserName } = body
  if (!_id || !targetUserId) return fail('参数缺失')
  const db  = cloud.database()
  const now = new Date().toISOString()
  await db.collection('commission_orders').doc(_id).update({
    data: {
      status:        'claimed',
      claimedBy:     targetUserId,
      claimedByName: targetUserName || targetUserId,
      claimedAt:     now,
      updatedAt:     now,
    },
  })
  return ok({ message: '分配成功' })
}

/** 读取工单分配设置 */
async function adminGetSettings() {
  const db  = cloud.database()
  const res = await db.collection('commission_settings')
    .doc('global').get().catch(() => ({ data: null }))
  return ok({
    settings: res.data || { distributionMode: 'free', staffQuotas: {}, updatedAt: null },
  })
}

/** 更新工单分配设置 */
async function adminUpdateSettings(body) {
  const { distributionMode, staffQuotas } = body
  if (!distributionMode) return fail('distributionMode 参数缺失')
  const db  = cloud.database()
  await db.collection('commission_settings').doc('global').set({
    data: { distributionMode, staffQuotas: staffQuotas || {}, updatedAt: new Date().toISOString() },
  })
  return ok({ message: '设置已更新' })
}

// ── 微信 access_token 获取（内存缓存，5 分钟提前刷新） ──────────────────────
// 内存二级缓存（仅用于同一实例同一次冷启动内的复用，跨实例以数据库为准）
let _wxToken = null
let _wxTokenExpiry = 0

/**
 * 获取微信 access_token，优先读取数据库缓存（所有实例共享）
 * 微信限制：同一 AppID 全局只有一个有效 token，多实例并发刷新会互相踢掉对方，
 * 所以必须持久化到数据库而非仅靠内存变量。
 */
async function getWxAccessToken() {
  const now = Date.now()
  // 1. 内存命中（同实例同次冷启动，避免频繁读库）
  if (_wxToken && now < _wxTokenExpiry) return _wxToken

  // 2. 读数据库缓存（跨实例共享）
  const db = cloud.database()
  try {
    const cacheRes = await db.collection('system_cache')
      .where({ key: 'wx_access_token' })
      .limit(1)
      .get()
    if (cacheRes.data && cacheRes.data.length > 0) {
      const record = cacheRes.data[0]
      // 数据库里的 token 仍在有效期内（保留 5 分钟余量）
      if (record.token && record.expiry && now < record.expiry - 5 * 60 * 1000) {
        _wxToken       = record.token
        _wxTokenExpiry = record.expiry
        return _wxToken
      }
    }
  } catch (e) {
    console.warn('[getWxAccessToken] 读数据库缓存失败，降级直接刷新:', e.message)
  }

  // 3. 向微信服务器刷新 token
  const res = await axios.get(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_SECRET}`,
    { timeout: 8000 }
  )
  if (!res.data.access_token) throw new Error(res.data.errmsg || '获取 access_token 失败')

  const token  = res.data.access_token
  const expiry = now + ((res.data.expires_in || 7200) - 300) * 1000   // 提前 5 分钟过期

  // 4. 写入内存缓存
  _wxToken       = token
  _wxTokenExpiry = expiry

  // 5. 写入数据库缓存（异步，不阻塞主流程）
  db.collection('system_cache')
    .where({ key: 'wx_access_token' })
    .get()
    .then(r => {
      const payload = { key: 'wx_access_token', token, expiry, updatedAt: now }
      if (r.data && r.data.length > 0) {
        return db.collection('system_cache').doc(r.data[0]._id).update({ data: payload })
      }
      return db.collection('system_cache').add({ data: payload })
    })
    .catch(e => console.warn('[getWxAccessToken] 写数据库缓存失败:', e.message))

  return _wxToken
}

// ── 微信订阅消息推送 ────────────────────────────────────────────────────────
// 模板 ID: JjmTIHO6iRrDLfRkZNutEfmxo-eLabK5tFmJYVLX8IY（服务完成通知）
// 字段: character_string1=订单编号, thing2=服务类型, time3=完成时间,
//       thing4=温馨提示, thing5=服务项目
const SUBSCRIBE_TMPL_ID = 'JjmTIHO6iRrDLfRkZNutEfmxo-eLabK5tFmJYVLX8IY'

async function sendSubscribeMessage(openid, order) {
  try {
    const token = await getWxAccessToken()

    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const timeStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ` +
                    `${pad(now.getHours())}:${pad(now.getMinutes())}`

    const modeMap = { position: '岗位润色', self: '自身润色' }
    const serviceType = `简历优化-${modeMap[order.polishMode] || order.polishMode || '润色'}`
    const serviceItem = (order.targetPosition || order.polishMode || '简历润色').slice(0, 20)

    const body = {
      touser:      openid,
      template_id: SUBSCRIBE_TMPL_ID,
      // 正式版用 'formal'；微信开发者工具测试时改为 'developer'
      miniprogram_state: 'formal',
      lang: 'zh_CN',
      page: `pages/order-detail/index?orderId=${encodeURIComponent(order.orderId)}`,
      data: {
        character_string1: { value: order.orderId },
        thing2:            { value: serviceType.slice(0, 20) },
        time3:             { value: timeStr },
        thing4:            { value: '润色成品已完成，请前往查看' },
        thing5:            { value: serviceItem },
      },
    }

    const pushRes = await axios.post(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`,
      body,
      { timeout: 8000 }
    )

    if (pushRes.data.errcode && pushRes.data.errcode !== 0) {
      console.warn('[commission_web] 订阅消息发送失败:', pushRes.data.errmsg)
    } else {
      console.log('[commission_web] 订阅消息已推送至', openid, '订单:', order.orderId)
    }
  } catch (err) {
    // 推送失败不影响主流程，仅记录日志
    console.warn('[commission_web] sendSubscribeMessage error:', err.message)
  }
}

// ── 获取 jk3 文件临时下载链接（内部复用） ─────────────────────────────────────
async function getJk3TempUrl(fileID, accessToken) {
  const dlRes = await axios.post(
    `https://api.weixin.qq.com/tcb/batchdownloadfile?access_token=${accessToken}`,
    { env: 'jk3-2gy9419jcb1c7fb7', file_list: [{ fileid: fileID, max_age: 604800 }] }
  )
  if (dlRes.data.errcode !== 0) throw new Error('生成下载链接失败: ' + dlRes.data.errmsg)
  const url = dlRes.data.file_list?.[0]?.download_url
  if (!url) throw new Error('下载链接为空')
  return url
}

/**
 * staff_send_result — 将打包导出成品信息回传至小程序客户端
 * 在「我的订单」详情页新增「成品下载」区域供客户查看/下载
 */
async function staffSendResult(body, auth) {
  const { _id, clientResultItems, clientIdPhotoUrl, resultWordUrl, resultWordFileKey, resultPdfUrl, resultPdfFileKey, resultAnalysisUrl, resultPreviewUrls } = body
  if (!_id) return fail('工单 _id 缺失')
  if (!clientResultItems || !Array.isArray(clientResultItems)) return fail('clientResultItems 缺失')

  const db  = cloud.database()
  const res = await db.collection('commission_orders').doc(_id).get()
  if (!res.data) return fail('工单不存在', 404)
  const isAdmin = ADMIN_ROLES.includes(auth.role)
  if (!isAdmin && res.data.claimedBy !== auth.userId) return fail('无权操作此工单', 403)

  const now = new Date().toISOString()
  const updateData = {
    clientResultItems:  clientResultItems,
    clientIdPhotoUrl:   clientIdPhotoUrl  || null,
    resultWordUrl:      resultWordUrl     || null,      // 直接 HTTPS 下载地址（优先）
    resultWordFileKey:  resultWordFileKey || null,      // CloudBase 文件 ID（兜底，用 getTempFileURL 兑换）
    resultPdfUrl:       resultPdfUrl      || null,      // Word→PDF 转换后的 COS 公共 HTTPS URL（直接下载）
    resultPdfFileKey:   resultPdfFileKey  || null,      // 旧版 CloudBase fileID（保留兼容）
    resultAnalysisUrl:  resultAnalysisUrl || null,
    resultSentAt:       now,
    updatedAt:          now,
  }
  // 若传入了预览图（images 选中），同步写入 clientPreviewUrls，供小程序端直接下载
  if (Array.isArray(resultPreviewUrls) && resultPreviewUrls.length) {
    updateData.clientPreviewUrls = resultPreviewUrls
    if (!updateData.previewSentAt) updateData.previewSentAt = now
  }
  await db.collection('commission_orders').doc(_id).update({ data: updateData })

  // 异步推送订阅消息通知客户
  if (res.data.openid) {
    sendSubscribeMessage(res.data.openid, {
      ...res.data,
      thing4: '成品文件已交付，请前往查看下载',
    })
  }

  return ok({ message: '成品信息已回传至小程序' })
}

/**
 * client_get_result_url — 客户获取成品 Word 文件临时下载链接
 * 通过订单号 + openid 验证身份，返回 resultFileKey 的临时访问 URL
 */
async function clientGetResultUrl(body) {
  const { openid, orderId, fileType = 'word' } = body
  if (!openid || !orderId) return fail('参数缺失')

  const db  = cloud.database()
  const res = await db.collection('commission_orders')
    .where({ orderId, openid }).limit(1).get()
  if (!res.data.length) return fail('工单不存在', 404)

  const order = res.data[0]

  // 第一优先：直接 HTTPS URL（回传时由网页端传入）
  if (fileType === 'analysis' && order.resultAnalysisUrl) {
    return ok({ downloadUrl: order.resultAnalysisUrl })
  }
  if (fileType === 'word' && order.resultWordUrl) {
    return ok({ downloadUrl: order.resultWordUrl })
  }
  if (fileType === 'pdf' && order.resultPdfUrl) {
    return ok({ downloadUrl: order.resultPdfUrl })
  }

  // 第二优先：CloudBase 文件 ID → getTempFileURL 兑换（Word / PDF）
  let cloudFileKey = null
  if (fileType === 'word') cloudFileKey = order.resultWordFileKey || order.resultFileKey || null
  if (fileType === 'pdf')  cloudFileKey = order.resultPdfFileKey  || null
  if (!cloudFileKey && fileType === 'analysis') cloudFileKey = order.resultFileKey || null
  if (cloudFileKey) {
    try {
      const tempRes = await cloud.getTempFileURL({ fileList: [cloudFileKey] })
      const fileUrl = tempRes.fileList?.[0]?.tempFileURL
      if (fileUrl) return ok({ downloadUrl: fileUrl })
    } catch (e) {
      console.warn('[commission_web] getTempFileURL 失败:', e.message)
    }
  }

  return fail('暂无成品文件，请先通过网页端回传成品')
}

/** 为员工生成客户上传文件的临时下载链接（仅用于外部展示/下载，不中转） */
async function staffGetFileUrl(body) {
  const { fileID } = body
  if (!fileID) return fail('缺少 fileID')
  try {
    const accessToken = await getWxAccessToken()
    const downloadUrl = await getJk3TempUrl(fileID, accessToken)
    return ok({ downloadUrl })
  } catch (e) {
    return fail('获取下载链接失败: ' + e.message)
  }
}

/**
 * 从 jk3 微信云开发环境获取客户文件，服务端中转到当前制作环境（web-02），
 * 返回可被 word_processor_web / doc_processor_web 直接使用的 fileId / fileKey。
 * 绕过浏览器 CORS 限制（云函数服务端下载不受限）。
 */
async function staffBridgeFile(body) {
  const { fileID, fileName } = body
  if (!fileID) return fail('缺少 fileID')

  try {
    // 1. 获取微信 access_token 并生成临时下载链接
    const accessToken = await getWxAccessToken()
    const downloadUrl = await getJk3TempUrl(fileID, accessToken)

    // 2. 服务端下载文件（无 CORS 限制）
    const fileRes = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      timeout:      30000,
    })
    const fileBuffer = Buffer.from(fileRes.data)
    if (!fileBuffer.length) throw new Error('下载文件内容为空')

    // 3. 转存到制作环境（commission_web 所在的 web-02 CloudBase 环境）
    const safeFileName = (fileName || 'resume.docx').replace(/[^a-zA-Z0-9._\u4e00-\u9fa5\s-]/g, '')
    const cloudPath    = `commission_bridged/${Date.now()}_${safeFileName}`
    const uploadRes    = await cloud.uploadFile({ cloudPath, fileContent: fileBuffer })

    return ok({ fileId: uploadRes.fileID, fileKey: cloudPath, fileName: safeFileName })
  } catch (e) {
    console.error('[staffBridgeFile] error:', e.message)
    return fail('文件中转失败: ' + (e.message || ''))
  }
}

/**
 * client_bridge_resume_file — 简历定制专用：将 jk3 文件中转到 web-02
 *
 * 背景：小程序只能通过 wx.cloud.uploadFile 上传到 jk3 环境（小程序绑定环境），
 *       但 word_processor_web 运行在 web-02 环境，跨环境 downloadFile 会报 -501001。
 *       复用已有的 staffBridgeFile 逻辑，以客户端身份（仅需 openid）完成文件中转。
 *
 * 输入：{ openid, fileID, fileName }
 * 输出：{ success, fileId }  ← web-02 环境的 cloud:// fileId
 */
async function clientBridgeResumeFile(body) {
  const { openid, fileID, fileName } = body
  if (!openid)  return fail('未识别用户身份')
  if (!fileID)  return fail('缺少 fileID')
  return staffBridgeFile({ fileID, fileName })
}

/** 各员工今日接单统计 */
async function adminGetDailyStats() {
  const db    = cloud.database()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const _cmd  = db.command
  const res   = await db.collection('commission_orders')
    .where({ claimedAt: _cmd.gte(today.toISOString()), status: _cmd.in(['claimed', 'completed']) })
    .limit(200).get()
  const map = {}
  for (const o of res.data) {
    if (!o.claimedBy) continue
    map[o.claimedBy] = map[o.claimedBy] || { userId: o.claimedBy, name: o.claimedByName, count: 0 }
    map[o.claimedBy].count++
  }
  return ok({ stats: Object.values(map) })
}

// ══════════════════════════════════════════════════════════════════════════════
//  主入口
// ══════════════════════════════════════════════════════════════════════════════

const CLIENT_ACTIONS = new Set([
  'client_login', 'client_create_order', 'client_create_recognition_order', 'client_get_orders',
  'client_get_order_detail', 'client_get_result_url', 'client_delete_orders',
  'client_bridge_resume_file',  // 简历定制：将 jk3 文件中转到 web-02 供 word_processor_web 使用
])

const ADMIN_ONLY_ACTIONS = new Set([
  'admin_assign_order', 'admin_get_settings',
  'admin_update_settings', 'admin_get_daily_stats',
])

exports.main = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' }
  }

  let body = {}
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {})
  } catch {
    return fail('请求体解析失败', 400)
  }

  const { action } = body

  // 客户端 action：不需要 JWT
  if (CLIENT_ACTIONS.has(action)) {
    try {
      switch (action) {
        case 'client_login':            return await clientLogin(body)
        case 'client_create_order':               return await clientCreateOrder(body)
        case 'client_create_recognition_order':   return await clientCreateRecognitionOrder(body)
        case 'client_get_orders':       return await clientGetOrders(body)
        case 'client_get_order_detail': return await clientGetOrderDetail(body)
        case 'client_get_result_url':   return await clientGetResultUrl(body)
        case 'client_delete_orders':         return await clientDeleteOrders(body)
        case 'client_bridge_resume_file':    return await clientBridgeResumeFile(body)
        default:                             return fail('未知 action', 400)
      }
    } catch (err) {
      console.error(`[commission_web] client.${action}:`, err.message)
      return fail(err.message || '服务器错误', 500)
    }
  }

  // 员工 / 管理员 action：需要 JWT
  let auth
  try { auth = verifyJWT(event) } catch (err) { return fail(err.message, err.code || 401) }

  if (ADMIN_ONLY_ACTIONS.has(action) && !ADMIN_ROLES.includes(auth.role)) {
    return fail('无管理员权限', 403)
  }

  try {
    switch (action) {
      case 'staff_list_orders':     return await staffListOrders(body)
      case 'staff_claim_order':     return await staffClaimOrder(body, auth)
      case 'staff_complete_order':  return await staffCompleteOrder(body, auth)
      case 'staff_save_progress':   return await staffSaveProgress(body, auth)
      case 'staff_send_preview':    return await staffSendPreview(body, auth)
      case 'staff_send_analysis':   return await staffSendAnalysisReport(body, auth)
      case 'staff_send_result':     return await staffSendResult(body, auth)
      case 'staff_get_file_url':    return await staffGetFileUrl(body)
      case 'staff_bridge_file':     return await staffBridgeFile(body)
      case 'admin_assign_order':    return await adminAssignOrder(body)
      case 'admin_get_settings':    return await adminGetSettings()
      case 'admin_update_settings': return await adminUpdateSettings(body)
      case 'admin_get_daily_stats': return await adminGetDailyStats()
      default:                      return fail('未知 action', 400)
    }
  } catch (err) {
    console.error(`[commission_web] ${action}:`, err.message)
    return fail(err.message || '服务器错误', 500)
  }
}
