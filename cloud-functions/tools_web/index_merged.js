'use strict'

/**
 * tools_web — 工具事务云函数
 *
 * 路由：/tools_web（HTTP 访问服务）
 *
 * 当前包含功能：
 *   证件照制作（generateIDPhoto / generateAIIDPhoto / getPhotoSizes）
 *   打包邮件发送（sendBundleEmail）
 *
 * 后续工具功能均可在此文件追加 case，不影响 ai_service_web / word_processor_web。
 *
 * 环境变量（腾讯云控制台 → 云函数配置中设置）：
 *   JWT_SECRET          — 与 auth_web 相同的 JWT 签名密钥
 *   TENCENT_SECRET_ID   — 腾讯云 API 密钥 ID
 *   TENCENT_SECRET_KEY  — 腾讯云 API 密钥 Key
 *   TENCENT_REGION      — COS 地域（如 ap-shanghai）
 *   TENCENT_BUCKET      — COS 存储桶名
 *   DOUBAO_API_KEY      — 豆包 AI API 密钥（AI生成模式必填，不填则降级传统模式）
 *   EMAIL_USER          — 发件邮箱地址（QQ邮箱，如 xxx@qq.com）
 *   EMAIL_PASS          — QQ 邮箱 SMTP 授权码（非登录密码）
 */

const jwt        = require('jsonwebtoken')
const COS        = require('cos-nodejs-sdk-v5')
const axios      = require('axios')
const cloud      = require('wx-server-sdk')
const nodemailer     = require('nodemailer')
const JSZip          = require('jszip')
const { PDFDocument } = require('pdf-lib')

// ── 邮件 SMTP 配置 ────────────────────────────────────────────────────────────
const EMAIL_CONFIG = {
  host:   'smtp.qq.com',
  port:   587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || '',   // 发件 QQ 邮箱
    pass: process.env.EMAIL_PASS || '',   // SMTP 授权码（非登录密码）
  },
}

// ── 配置 ──────────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'studio_jwt_secret_2026_please_change'

const cosConfig = {
  secretId:  process.env.TENCENT_SECRET_ID  || '',
  secretKey: process.env.TENCENT_SECRET_KEY || '',
  region:    process.env.TENCENT_REGION     || 'ap-shanghai',
  bucket:    process.env.TENCENT_BUCKET     || '',
}

const DOUBAO_CONFIG = {
  apiKey:   process.env.DOUBAO_API_KEY || '',
  baseUrl:  'https://ark.cn-beijing.volces.com/api/v3',
  model:    'doubao-seedream-4-0-250828',
  timeout:  60000,
  maxRetries: 3,
}

// 证件照尺寸配置（单位：像素，对应实际毫米尺寸）
const PHOTO_SIZES = {
  one_inch:       { name: '一寸照',   width: 295,  height: 413,  desc: '2.5×3.5cm' },
  two_inch:       { name: '二寸照',   width: 413,  height: 579,  desc: '3.5×4.9cm' },
  big_one_inch:   { name: '大一寸',   width: 390,  height: 567,  desc: '3.3×4.8cm' },
  passport:       { name: '护照照片', width: 354,  height: 472,  desc: '3.3×4.8cm' },
  driver_license: { name: '驾驶证',   width: 260,  height: 378,  desc: '2.2×3.2cm' },
  id_card:        { name: '身份证',   width: 358,  height: 441,  desc: '2.6×3.2cm' },
}

const BACKGROUND_COLORS = {
  blue:  { name: '蓝色', hex: '#4A90E2', ciHex: '4A90E2' },
  red:   { name: '红色', hex: '#E74C3C', ciHex: 'E74C3C' },
  white: { name: '白色', hex: '#FFFFFF', ciHex: 'FFFFFF' },
}

const CLOTHING_PROMPTS = {
  formal_suit:   '黑色西服红色领带白色衬衫',
  business_suit: '深蓝色商务套装白色衬衫',
  casual_shirt:  '白色休闲衬衫',
}

const HAIRSTYLE_PROMPTS = {
  keep_original: '保持原有的自然发型',
  high_ponytail: '高马尾的发型在画面中占比很大',
  short_hair:    '整洁的女士短发发型',
  long_hair:     '自然垂落的女士长发发型',
  crew_cut:      '整洁的男士平头发型',
  side_part:     '经典的男士侧分发型',
  business_cut:  '专业的男士商务发型',
}

// ── COS 客户端 ────────────────────────────────────────────────────────────────
function getCosClient() {
  return new COS({
    SecretId:  cosConfig.secretId,
    SecretKey: cosConfig.secretKey,
  })
}

// ── wx-server-sdk 初始化（与其他 web 云函数保持一致）────────────────────────
// DYNAMIC_CURRENT_ENV 自动注入当前 CloudBase 环境，无需手动写 env ID
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * 获取 CloudBase 文件的 CDN 临时 URL
 * 与小程序 cloud.getTempFileURL 完全相同的调用方式
 * 返回的 tcb.qcloud.la CDN URL 可被豆包 API 直接访问
 * @param {string} fileID  cloudbase fileID（cloud://env-id.bucket-id/path/file）
 * @returns {string}       CDN 临时访问 URL
 */
async function getTempFileUrl(fileID) {
  try {
    const res = await cloud.getTempFileURL({ fileList: [fileID] })
    const file = res && res.fileList && res.fileList[0]
    if (!file || !file.tempFileURL) throw new Error(`getTempFileURL 返回异常: ${JSON.stringify(res)}`)
    console.log('[getTempFileUrl] CDN URL 获取成功:', file.tempFileURL.slice(0, 60) + '...')
    return file.tempFileURL
  } catch (err) {
    throw new Error('获取 CDN 临时 URL 失败: ' + (err.message || err))
  }
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/**
 * 从 cloudbase fileID 提取 COS key
 * fileID: cloud://env-id.bucket-id/path/to/file.jpg → path/to/file.jpg
 */
function getKeyFromFileId(fileId) {
  return fileId.split('/').slice(3).join('/')
}

/**
 * 生成带时效签名的 COS 访问 URL（展示用）
 */
function getSignedUrl(cos, key, expires = 3600) {
  return new Promise((resolve, reject) => {
    cos.getObjectUrl({
      Bucket:  cosConfig.bucket,
      Region:  cosConfig.region,
      Key:     key,
      Sign:    true,
      Expires: expires,
    }, (err, data) => {
      if (err) reject(err)
      else resolve(data.Url)
    })
  })
}

/**
 * 生成带 Content-Disposition:attachment 的签名 URL（下载用）
 * 浏览器访问此 URL 时 COS 返回 attachment 响应头，触发文件下载，无需 fetch/CORS
 */
function getSignedDownloadUrl(cos, key, filename, expires = 3600) {
  return new Promise((resolve, reject) => {
    cos.getObjectUrl({
      Bucket:  cosConfig.bucket,
      Region:  cosConfig.region,
      Key:     key,
      Sign:    true,
      Expires: expires,
      Query: {
        'response-content-disposition': `attachment;filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    }, (err, data) => {
      if (err) reject(err)
      else resolve(data.Url)
    })
  })
}

/**
 * 生成时间戳+随机的文件名前缀
 */
function genFilePrefix() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ── JWT 验证 ──────────────────────────────────────────────────────────────────
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

// ── HTTP 响应包装 ─────────────────────────────────────────────────────────────
function success(data) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
    body: JSON.stringify({ code: 0, success: true, ...data }),
  }
}

function fail(message, statusCode = 400) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
    body: JSON.stringify({ code: -1, success: false, message }),
  }
}

// ── Action 路由 ───────────────────────────────────────────────────────────────
async function _handleAction(action, event) {
  switch (action) {
    case 'getPhotoSizes':              return getPhotoSizes()
    case 'generateIDPhoto':            return await generateIDPhoto(event)
    case 'generateAIIDPhoto':          return await generateAIIDPhoto(event)
    case 'sendBundleEmail':            return await sendBundleEmail(event)
    // ── 工单系统 ──
    case 'createWorkorder':            return await createWorkorder(event)
    case 'updateWorkorderUpload':      return await updateWorkorderUpload(event)
    case 'updateWorkorderStatus':      return await updateWorkorderStatus(event)
    case 'updateEmployeeNote':         return await updateEmployeeNote(event)
    case 'requestDeleteWorkorder':     return await requestDeleteWorkorder(event)
    case 'listMyWorkorders':           return await listMyWorkorders(event)
    case 'getDashboard':               return await getDashboard(event)
    case 'adminListAllWorkorders':     return await adminListAllWorkorders(event)
    case 'adminUpdateWorkorder':       return await adminUpdateWorkorder(event)
    case 'adminDeleteWorkorder':       return await adminDeleteWorkorder(event)
    // ── 安全审计日志 ──
    case 'logSecurityEvent':           return await logSecurityEvent(event)
    case 'adminListSecurityLogs':      return await adminListSecurityLogs(event)
    case 'adminGetHighRiskUsers':      return await adminGetHighRiskUsers(event)
    default:
      return fail(`未知 action: ${action}`)
  }
}

// ── JWT 鉴权工具（工单用）─────────────────────────────────────────────────────
// 注意：此处 event 实际上是主入口解析后的 body 对象，
// JWT payload 已在主入口验证并注入为 body._auth。
function requireAuthPayload(event) {
  const payload = event._auth
  if (!payload) throw Object.assign(new Error('未登录或 Token 已过期'), { code: 401 })
  return payload
}

function requireAdminPayload(event) {
  const payload = requireAuthPayload(event)
  if (!['admin', 'superadmin'].includes(payload.role))
    throw Object.assign(new Error('无管理员权限'), { code: 403 })
  return payload
}

// ── 工单 ID 生成器 ────────────────────────────────────────────────────────────
async function genWorkorderId(db) {
  const today   = new Date()
  const y       = today.getFullYear()
  const m       = String(today.getMonth() + 1).padStart(2, '0')
  const d       = String(today.getDate()).padStart(2, '0')
  const dateStr = `${y}${m}${d}`

  const dayStart = new Date(y, today.getMonth(), today.getDate()).toISOString()
  const dayEnd   = new Date(y, today.getMonth(), today.getDate() + 1).toISOString()
  const _        = db.command

  const countRes = await db.collection('workorders')
    .where({ createdAt: _.gte(dayStart).and(_.lt(dayEnd)) })
    .count()
  const seq = String(countRes.total + 1).padStart(3, '0')
  return `WO-${dateStr}-${seq}`
}

// ════════════════════════════════════════════════════════════════════════════════
//  工单 CRUD
// ════════════════════════════════════════════════════════════════════════════════

/**
 * createWorkorder — 上传成功后由前端调用，创建一条新工单记录
 * Body: { resumeName, uploadedFileKey, polishMode, targetPosition, polishIntensity }
 */
async function createWorkorder(event) {
  const body    = event   // 主入口已解析，event 即 body（含 _auth）
  const payload = requireAuthPayload(event)
  const db      = cloud.database()

  const { resumeName = '', uploadedFileKey = '', polishMode = '', targetPosition = '', polishIntensity = '' } = body

  const now          = new Date().toISOString()
  const workorderId  = await genWorkorderId(db)

  const doc = {
    workorderId,
    userId:          payload.userId,
    userName:        payload.name,
    resumeName,
    uploadedFileKey,
    polishMode,
    targetPosition,
    polishIntensity,
    status:           'uploaded',
    polishedFileKey:  '',
    polishedPreviewUrls: [],
    employeeNote:     '',
    adminNote:        '',
    deleteRequested:  false,
    createdAt:        now,
    updatedAt:        now,
  }

  const res = await db.collection('workorders').add({ data: doc })
  return success({ workorderId, _id: res._id })
}

/**
 * updateWorkorderUpload — 同一工单内重新上传或覆盖简历元数据（不新建记录、不改 status）
 * Body: { _id, resumeName?, uploadedFileKey?, polishMode?, targetPosition?, polishIntensity? }
 */
async function updateWorkorderUpload(event) {
  const body    = event
  const payload = requireAuthPayload(event)
  const db      = cloud.database()

  const { _id, resumeName, uploadedFileKey, polishMode, targetPosition, polishIntensity } = body
  if (!_id) return fail('缺少 _id')

  const docRes = await db.collection('workorders').doc(_id).get()
  if (!docRes.data) return fail('工单不存在')
  if (docRes.data.userId !== payload.userId) return fail('无权限操作他人工单')

  const update = { updatedAt: new Date().toISOString() }
  if (resumeName !== undefined) update.resumeName = resumeName
  if (uploadedFileKey !== undefined) update.uploadedFileKey = uploadedFileKey
  if (polishMode !== undefined) update.polishMode = polishMode
  if (targetPosition !== undefined) update.targetPosition = targetPosition
  if (polishIntensity !== undefined) update.polishIntensity = polishIntensity

  await db.collection('workorders').doc(_id).update({ data: update })
  return success({ message: '工单已更新' })
}

/**
 * updateWorkorderStatus — 前端自动调用（润色完成/打包导出后），更新工单状态
 * Body: { _id, status, polishedFileKey?, polishedPreviewUrls? }
 * 只允许更新自己的工单；状态只能前进（uploaded→polished→exported）
 */
async function updateWorkorderStatus(event) {
  const body    = event
  const payload = requireAuthPayload(event)
  const db      = cloud.database()

  const { _id, status, polishedFileKey, polishedPreviewUrls } = body
  if (!_id || !status) return fail('缺少 _id 或 status')

  const validStatuses = ['polished', 'exported']
  if (!validStatuses.includes(status)) return fail('无效的状态值')

  const docRes = await db.collection('workorders').doc(_id).get()
  if (!docRes.data) return fail('工单不存在')
  if (docRes.data.userId !== payload.userId) return fail('无权限操作他人工单')

  const update = { status, updatedAt: new Date().toISOString() }
  // 同步 resumeName（润色后 AI 解析出来）
  const { resumeName } = body
  if (resumeName) update.resumeName = resumeName
  if (status === 'exported') {
    if (polishedFileKey)     update.polishedFileKey     = polishedFileKey
    if (polishedPreviewUrls) update.polishedPreviewUrls = polishedPreviewUrls
  }

  await db.collection('workorders').doc(_id).update({ data: update })
  return success({ message: '工单状态已更新' })
}

/**
 * updateEmployeeNote — 员工更新自己的工单备注
 * Body: { _id, employeeNote }
 */
async function updateEmployeeNote(event) {
  const body    = event
  const payload = requireAuthPayload(event)
  const db      = cloud.database()

  const { _id, employeeNote = '' } = body
  if (!_id) return fail('缺少 _id')

  const docRes = await db.collection('workorders').doc(_id).get()
  if (!docRes.data) return fail('工单不存在')
  if (docRes.data.userId !== payload.userId) return fail('无权限操作他人工单')

  await db.collection('workorders').doc(_id).update({
    data: { employeeNote: String(employeeNote).slice(0, 500), updatedAt: new Date().toISOString() }
  })
  return success({ message: '备注已更新' })
}

/**
 * requestDeleteWorkorder — 员工申请删除某条工单（标记 deleteRequested: true）
 * Body: { _id }
 */
async function requestDeleteWorkorder(event) {
  const body    = event
  const payload = requireAuthPayload(event)
  const db      = cloud.database()

  const { _id } = body
  if (!_id) return fail('缺少 _id')

  const docRes = await db.collection('workorders').doc(_id).get()
  if (!docRes.data) return fail('工单不存在')
  if (docRes.data.userId !== payload.userId) return fail('无权限操作他人工单')
  if (docRes.data.deleteRequested) return success({ message: '已提交申请，等待管理员审批' })

  await db.collection('workorders').doc(_id).update({
    data: { deleteRequested: true, updatedAt: new Date().toISOString() }
  })
  return success({ message: '已提交删除申请，等待管理员审批' })
}

/**
 * listMyWorkorders — 查询当前登录员工的工单列表
 * Body: { status?, page?, pageSize? }
 */
async function listMyWorkorders(event) {
  const body    = event
  const payload = requireAuthPayload(event)
  const db      = cloud.database()
  const _cmd    = db.command

  const { status, page = 1, pageSize = 50 } = body

  const condition = { userId: payload.userId }
  if (status && status !== 'all') condition.status = status

  const col    = db.collection('workorders').where(condition)
  const skip   = (page - 1) * pageSize
  const [countRes, dataRes] = await Promise.all([
    col.count(),
    col.orderBy('createdAt', 'desc').skip(skip).limit(pageSize).get()
  ])

  return success({ list: dataRes.data, total: countRes.total })
}

/**
 * getDashboard — 获取当前员工的首页仪表盘统计数据
 *
 * 今日制作：本人今天创建的、状态为 uploaded / polished 的工单（每日0点自动清零）
 * 今日导出：本人今天完成导出（status=exported, updatedAt 在今天）的工单（每日0点自动清零）
 * 进行中：本人接取但尚未完成的任务工单（commission_orders status=claimed）
 */
async function getDashboard(event) {
  const payload = requireAuthPayload(event)
  const db      = cloud.database()
  const _       = db.command
  const userId  = payload.userId

  const now      = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const dayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  const [todayMade, todayExported, inProgress] = await Promise.all([
    // 今日制作：本人今天创建、且状态为已上传或已润色（未导出）的工单
    db.collection('workorders')
      .where({
        userId,
        status:    _.in(['uploaded', 'polished']),
        createdAt: _.gte(dayStart).and(_.lt(dayEnd)),
      })
      .count(),

    // 今日导出：本人今天完成导出的工单
    db.collection('workorders')
      .where({
        userId,
        status:    'exported',
        updatedAt: _.gte(dayStart).and(_.lt(dayEnd)),
      })
      .count(),

    // 进行中：任务工单（commission_orders）中本人接取但未完成的工单
    db.collection('commission_orders')
      .where({
        claimedBy: userId,
        status:    'claimed',
      })
      .count(),
  ])

  return success({
    todayMade:     todayMade.total     || 0,
    todayExported: todayExported.total || 0,
    inProgress:    inProgress.total    || 0,
  })
}

/**
 * adminListAllWorkorders — 管理员查询所有工单（可按 userId 筛选）
 * Body: { userId?, status?, page?, pageSize? }
 */
async function adminListAllWorkorders(event) {
  const body    = event
  requireAdminPayload(event)
  const db = cloud.database()

  const { userId, status, page = 1, pageSize = 100 } = body

  const condition = {}
  if (userId) condition.userId = userId
  if (status && status !== 'all') condition.status = status

  const col  = Object.keys(condition).length
    ? db.collection('workorders').where(condition)
    : db.collection('workorders')
  const skip = (page - 1) * pageSize
  const [countRes, dataRes] = await Promise.all([
    col.count(),
    col.orderBy('createdAt', 'desc').skip(skip).limit(pageSize).get()
  ])

  return success({ list: dataRes.data, total: countRes.total })
}

/**
 * adminUpdateWorkorder — 管理员修改工单（状态/管理员备注/撤销删除申请）
 * Body: { _id, status?, adminNote?, deleteRequested? }
 */
async function adminUpdateWorkorder(event) {
  const body    = event
  requireAdminPayload(event)
  const db = cloud.database()

  const { _id, status, adminNote, deleteRequested } = body
  if (!_id) return fail('缺少 _id')

  const update = { updatedAt: new Date().toISOString() }
  if (status !== undefined)          update.status          = status
  if (adminNote !== undefined)       update.adminNote       = String(adminNote).slice(0, 500)
  if (deleteRequested !== undefined) update.deleteRequested = deleteRequested

  await db.collection('workorders').doc(_id).update({ data: update })
  return success({ message: '工单已更新' })
}

/**
 * adminDeleteWorkorder — 管理员永久删除工单
 * Body: { _id }
 */
async function adminDeleteWorkorder(event) {
  const body    = event
  requireAdminPayload(event)
  const db = cloud.database()

  const { _id } = body
  if (!_id) return fail('缺少 _id')

  await db.collection('workorders').doc(_id).remove()
  return success({ message: '工单已删除' })
}

// ────────────────────────────────────────────────────────────────────────────
// 功能一：获取证件照配置（尺寸 + 背景色）
// ────────────────────────────────────────────────────────────────────────────
function getPhotoSizes() {
  const sizes = Object.entries(PHOTO_SIZES).map(([code, cfg]) => ({
    code,
    name:   cfg.name,
    width:  cfg.width,
    height: cfg.height,
    desc:   cfg.desc,
  }))
  const backgrounds = Object.entries(BACKGROUND_COLORS).map(([code, cfg]) => ({
    code,
    name: cfg.name,
    hex:  cfg.hex,
  }))
  const clothings = Object.entries(CLOTHING_PROMPTS).map(([code]) => ({
    code,
    name: { formal_suit: '黑色西服', business_suit: '商务套装', casual_shirt: '休闲衬衫' }[code],
  }))
  const hairstyles = Object.entries(HAIRSTYLE_PROMPTS).map(([code]) => ({
    code,
    name: {
      keep_original: '保持原有发型',
      high_ponytail: '高马尾（女）',
      short_hair:    '短发（女）',
      long_hair:     '长发（女）',
      crew_cut:      '平头（男）',
      side_part:     '侧分（男）',
      business_cut:  '商务发型（男）',
    }[code],
  }))
  return success({ sizes, backgrounds, clothings, hairstyles })
}

// ────────────────────────────────────────────────────────────────────────────
// 功能二：传统抠图生成证件照
// ────────────────────────────────────────────────────────────────────────────
/**
 * 输入：
 *   fileKey         string  原图在 COS 中的路径（前端直传后传入，如 id_photos/originals/xxx.jpg）
 *   photoSize       string  尺寸代码（默认 one_inch）
 *   backgroundColor string  背景色代码（默认 blue，传统模式下不在云端合成，由前端 Canvas 处理）
 *
 * 输出：
 *   { finalUrl, mattingKey, photoConfig: { width, height, name, backgroundColor, needCanvasProcessing } }
 */
async function generateIDPhoto(event) {
  const {
    fileID,                        // CloudBase fileID（cloud://...），用于获取 CDN temp URL
    fileKey,
    photoSize       = 'one_inch',
    backgroundColor = 'blue',
  } = event

  if (!fileID && !fileKey) return fail('缺少 fileID 参数')

  const sizeConfig = PHOTO_SIZES[photoSize]
  if (!sizeConfig) return fail(`不支持的证件照尺寸：${photoSize}`)

  const bgConfig = BACKGROUND_COLORS[backgroundColor] || BACKGROUND_COLORS.blue
  const cos      = getCosClient()
  const prefix   = genFilePrefix()

  try {
    // ── Step 0: 将用户上传的图片搬运到数据万象 bucket ────────────────────────
    // 用户照片上传到 web-2 CloudBase 存储，而 CI 操作必须在数据万象 bucket 上执行。
    // 解法：先获取照片的 CDN 临时 URL，下载后上传到 cosConfig.bucket（数据万象）。
    // 与 AI 模式处理参考图的方式完全一致。
    const cdnUrl   = await getTempFileUrl(fileID)
    console.log(`[generateIDPhoto] cdnUrl=${cdnUrl.substring(0, 80)}...`)

    const imgResp  = await axios.get(cdnUrl, { responseType: 'arraybuffer', timeout: 30000 })
    const imgBuf   = Buffer.from(imgResp.data)

    const ext      = (fileKey || '').split('.').pop() || 'jpg'
    const srcKey   = `web_uploads/id_photos/originals/${prefix}_src.${ext}`

    await new Promise((resolve, reject) => {
      cos.putObject({
        Bucket:      cosConfig.bucket,
        Region:      cosConfig.region,
        Key:         srcKey,
        Body:        imgBuf,
        ContentType: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
      }, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    console.log(`[generateIDPhoto] 原图已上传至数据万象 bucket: ${srcKey}`)

    // ── Step 1: CI 人像抠图（AIPortraitMatting）→ 透明 PNG ──────────────────
    const mattingKey = `web_uploads/id_photos/matting/${prefix}_matting.png`

    const mattingResult = await new Promise((resolve, reject) => {
      const picOps = {
        is_pic_info: 1,
        rules: [{
          fileid: `/${mattingKey}`,
          rule:   'ci-process=AIPortraitMatting&center-layout=1&padding-layout=20x20',
        }],
      }
      cos.request({
        Bucket:  cosConfig.bucket,
        Region:  cosConfig.region,
        Key:     srcKey,
        Method:  'POST',
        Query:   { 'image_process': '' },
        Headers: { 'Pic-Operations': JSON.stringify(picOps) },
      }, (err, data) => {
        if (err) return reject(err)
        const obj   = data?.UploadResult?.ProcessResults?.Object
        const first = Array.isArray(obj) ? obj[0] : obj
        if (!first) return reject(new Error('AIPortraitMatting 返回结构异常'))
        resolve(first)
      })
    })

    const actualMattingKey = mattingResult.Key || mattingKey

    // ── Step 2: CI 裁剪 → 透明 PNG ─────────────────────────────────────────
    const { width, height } = sizeConfig
    const finalPngKey = `web_uploads/id_photos/final/${prefix}_${photoSize}_final.png`

    await new Promise((resolve, reject) => {
      const picOps = {
        is_pic_info: 1,
        rules: [{
          fileid: `/${finalPngKey}`,
          rule:   `imageMogr2/thumbnail/!${width}x${height}r/gravity/center/crop/${width}x${height}/format/png`,
        }],
      }
      cos.request({
        Bucket:  cosConfig.bucket,
        Region:  cosConfig.region,
        Key:     actualMattingKey,
        Method:  'POST',
        Query:   { 'image_process': '' },
        Headers: { 'Pic-Operations': JSON.stringify(picOps) },
      }, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    console.log(`[generateIDPhoto] Step2 裁剪完成: ${finalPngKey}`)

    // ── Step 3: CI 背景填充 → 最终 JPEG ────────────────────────────────────
    // 以独立 POST 规则将透明 PNG 合成背景色并输出 JPEG；
    // 避免将 CI 参数追加到 COS 签名 URL（q-url-param-list 为空时 CI inline 不可靠）
    const finalJpegKey = `web_uploads/id_photos/final/${prefix}_${photoSize}_final.jpg`

    await new Promise((resolve, reject) => {
      const picOps = {
        is_pic_info: 1,
        rules: [{
          fileid: `/${finalJpegKey}`,
          rule:   `imageMogr2/background/0x${bgConfig.ciHex}/format/jpg/quality/95`,
        }],
      }
      cos.request({
        Bucket:  cosConfig.bucket,
        Region:  cosConfig.region,
        Key:     finalPngKey,
        Method:  'POST',
        Query:   { 'image_process': '' },
        Headers: { 'Pic-Operations': JSON.stringify(picOps) },
      }, (err, data) => {
        if (err) {
          console.error('[generateIDPhoto] Step3 背景填充失败:', err.message || err)
          reject(err)
        } else {
          console.log(`[generateIDPhoto] Step3 背景填充完成: ${finalJpegKey}`, JSON.stringify(data?.UploadResult || ''))
          resolve()
        }
      })
    })

    // ── Step 4: 生成展示/下载 URL（纯签名 URL，无需 CI inline 参数）──────────
    const sizeLabel  = sizeConfig.name.replace(/\s+/g, '')
    const bgLabel    = bgConfig.name
    const filename   = `证件照_${sizeLabel}_${bgLabel}.jpg`

    const finalUrl    = await getSignedUrl(cos, finalJpegKey, 3600)
    const downloadUrl = await getSignedDownloadUrl(cos, finalJpegKey, filename, 3600)

    return success({
      finalUrl,
      downloadUrl,
      finalKey: finalJpegKey,
      photoConfig: {
        name:                sizeConfig.name,
        width,
        height,
        backgroundColor:     bgConfig.name,
        backgroundColorHex:  bgConfig.hex,
        needCanvasProcessing: false,
        format:              'jpg',
      },
    })
  } catch (err) {
    console.error('[generateIDPhoto] 失败:', err.message || err)
    return fail('证件照生成失败：' + (err.message || '请重试'))
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 功能三：AI 大模型生成证件照（豆包）
// ────────────────────────────────────────────────────────────────────────────
/**
 * 输入：
 *   fileID          string  参考照片 cloudbase fileID（cloud://...）- 优先
 *   fileKey         string  参考照片 COS 路径（fileID 不可用时的兜底）
 *   clothing        string  服装风格代码
 *   hairstyle       string  发型风格代码
 *   photoSize       string  尺寸代码
 *   backgroundColor string  背景色代码
 *
 * 输出：
 *   { finalUrl, photoConfig, mode }
 *   mode: 'ai_generation' | 'fallback_to_traditional'（AI失败时自动降级）
 */
async function generateAIIDPhoto(event) {
  const {
    fileID,
    fileKey,
    clothing        = 'formal_suit',
    hairstyle       = 'keep_original',
    photoSize       = 'one_inch',
    backgroundColor = 'blue',
  } = event

  if (!fileKey) return fail('缺少 fileKey 参数')

  const sizeConfig = PHOTO_SIZES[photoSize]
  if (!sizeConfig) return fail(`不支持的证件照尺寸：${photoSize}`)

  if (!DOUBAO_CONFIG.apiKey) {
    console.warn('[generateAIIDPhoto] 未配置 DOUBAO_API_KEY，降级为传统抠图')
    const fallback = await generateIDPhoto(event)
    const body = JSON.parse(fallback.body)
    if (body.success) body.mode = 'fallback_to_traditional'
    return { ...fallback, body: JSON.stringify(body) }
  }

  const cos    = getCosClient()
  const prefix = genFilePrefix()
  const bgConfig = BACKGROUND_COLORS[backgroundColor] || BACKGROUND_COLORS.blue
  const { width, height } = sizeConfig
  const aspectRatio = `${width}:${height}`

  try {
    // ── Step 1: 获取参考图 CDN 临时 URL（与小程序 cloud.getTempFileURL 等价）──
    // 必须用 CloudBase CDN URL（tcb.qcloud.la 域），豆包无法访问 COS 签名 URL
    // fileID 由前端上传后获取（cloud://...），云函数用 SDK 换取 CDN temp URL
    if (!fileID) {
      throw new Error('缺少 fileID 参数，前端需在上传后将 cloudbase fileID 传入')
    }
    console.log('[generateAIIDPhoto] 获取 CDN URL, fileID:', fileID)
    const refUrl = await getTempFileUrl(fileID)
    console.log('[generateAIIDPhoto] refUrl 获取成功')

    // ── Step 2: 构建豆包 AI 提示词 ─────────────────────────────────────────
    const clothingPrompt   = CLOTHING_PROMPTS[clothing]   || CLOTHING_PROMPTS.formal_suit
    const hairstylePrompt  = HAIRSTYLE_PROMPTS[hairstyle] || HAIRSTYLE_PROMPTS.keep_original
    const bgPrompt         = backgroundColor === 'white' ? '纯白色背景' :
                             backgroundColor === 'red'   ? '纯红色背景' : '纯蓝色背景'

    const prompt = `帮我生成图片：基于严谨规范的证件照视觉风格，搭配上电影写真风格的明亮光影处理，展示出一位面部清晰、表情自然的人物形象（五官元素不能改动）。人物身着${clothingPrompt}，所有配饰装饰品都取消，${bgPrompt}。正面均匀柔和的光影效果，让人物立体的五官更加突出明显，人物位于画面的中心位置，头部也处于画面的中心。${hairstylePrompt}，画风清晰明亮，完美地衬托出人物如同神仙般的绝佳颜值。横纵比例 ${aspectRatio}。`

    // ── Step 3: 调用豆包 API（最多3次重试）────────────────────────────────
    let aiImageUrl = null
    let lastErr    = null

    for (let i = 0; i < DOUBAO_CONFIG.maxRetries; i++) {
      try {
        const resp = await axios.post(
          `${DOUBAO_CONFIG.baseUrl}/images/generations`,
          {
            model:                               DOUBAO_CONFIG.model,
            prompt,
            response_format:                     'url',
            size:                                '2K',
            stream:                              false,
            logo_info:                           { add_logo: false, position: 0, language: 0, opacity: 0 },
            image:                               [refUrl],  // CDN temp URL（小程序同款方案）
            sequential_image_generation:         'auto',
            sequential_image_generation_options: { max_images: 1 },
          },
          {
            headers: {
              'Authorization': `Bearer ${DOUBAO_CONFIG.apiKey}`,
              'Content-Type':  'application/json',
            },
            timeout: DOUBAO_CONFIG.timeout,
          }
        )
        aiImageUrl = resp.data?.data?.[0]?.url
        if (aiImageUrl) break
      } catch (e) {
        lastErr = e
        console.warn(`[generateAIIDPhoto] 第 ${i + 1} 次调用失败:`, e.message)
        if (i < DOUBAO_CONFIG.maxRetries - 1) {
          await new Promise(r => setTimeout(r, 2000 * (i + 1)))
        }
      }
    }

    if (!aiImageUrl) {
      console.warn('[generateAIIDPhoto] 豆包AI全部重试失败，降级传统抠图')
      const fallback = await generateIDPhoto(event)
      const body = JSON.parse(fallback.body)
      if (body.success) body.mode = 'fallback_to_traditional'
      return { ...fallback, body: JSON.stringify(body) }
    }

    // ── Step 4a: 下载 AI 生成图 → 上传原图到临时路径 ──────────────────────
    // 豆包生成图在边缘带"AI生成"水印，需先存原图再用 CI 裁边去水印+规格化
    const imgResp   = await axios.get(aiImageUrl, { responseType: 'arraybuffer', timeout: 30000 })
    const imgBuffer = Buffer.from(imgResp.data)

    const rawKey   = `web_uploads/id_photos/ai_generated/raw/${prefix}_${photoSize}_ai_raw.jpg`
    const finalKey = `web_uploads/id_photos/ai_generated/${prefix}_${photoSize}_ai.jpg`

    // 先 putObject 存原图（与 generateIDPhoto 保持一致的分步模式）
    await new Promise((resolve, reject) => {
      cos.putObject({
        Bucket:      cosConfig.bucket,
        Region:      cosConfig.region,
        Key:         rawKey,
        Body:        imgBuffer,
        ContentType: 'image/jpeg',
      }, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    // ── Step 4b: CI 缩放至证件照规格 ──────────────────────────────────────
    // 豆包 2K 原图（≈1460×2048px）缩小到证件照尺寸（295×413px）约 7:1 缩放
    // 水印在原图边缘仅约 80px，缩小后约 12px，视觉上完全消失，无需单独裁边
    // 与 generateIDPhoto 使用完全相同的 CI 规则（已验证可用）
    await new Promise((resolve, reject) => {
      const picOps = {
        is_pic_info: 1,
        rules: [{
          fileid: `/${finalKey}`,
          rule: `imageMogr2/thumbnail/!${width}x${height}r/gravity/center/crop/${width}x${height}/format/jpg/quality/95`,
        }],
      }
      cos.request({
        Bucket:  cosConfig.bucket,
        Region:  cosConfig.region,
        Key:     rawKey,
        Method:  'POST',
        Query:   { 'image_process': '' },
        Headers: { 'Pic-Operations': JSON.stringify(picOps) },
      }, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    const sizeLabel   = sizeConfig.name.replace(/\s+/g, '')
    const bgLabel     = bgConfig.name
    const filename    = `证件照_${sizeLabel}_${bgLabel}_AI生成.jpg`
    const finalUrl    = await getSignedUrl(cos, finalKey, 3600)
    const downloadUrl = await getSignedDownloadUrl(cos, finalKey, filename, 3600)

    return success({
      finalUrl,
      downloadUrl,
      finalKey,
      mode: 'ai_generation',
      photoConfig: {
        name:               sizeConfig.name,
        width,
        height,
        backgroundColor:    bgConfig.name,
        backgroundColorHex: bgConfig.hex,
        needCanvasProcessing: false,  // AI生成图已含背景，前端直接展示
        format:             'jpg',
        generatedByAI:      true,
      },
    })
  } catch (err) {
    console.error('[generateAIIDPhoto] 失败:', err.message || err)
    return fail('AI证件照生成失败：' + (err.message || '请重试'))
  }
}

// ── 打包邮件发送 ──────────────────────────────────────────────────────────────

/**
 * COS 文件下载为 Buffer
 * @param {COS} cosClient
 * @param {string} key  COS 文件路径
 */
function cosDownloadBuffer(cosClient, key) {
  return new Promise((resolve, reject) => {
    cosClient.getObject(
      { Bucket: cosConfig.bucket, Region: cosConfig.region, Key: key },
      (err, data) => {
        if (err) return reject(err)
        resolve(Buffer.isBuffer(data.Body) ? data.Body : Buffer.from(data.Body))
      }
    )
  })
}

/**
 * 格式化润色解析 JSON 为可读文本
 */
function formatAnalysisText(summaryJson, resumeName) {
  let obj = {}
  if (typeof summaryJson === 'string') {
    try { obj = JSON.parse(summaryJson) } catch { obj = { overall_strategy: summaryJson } }
  } else {
    obj = summaryJson || {}
  }
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const lines = [
    `简历润色解析报告 — ${resumeName}`,
    `生成时间：${now}`,
    '═'.repeat(40),
    '',
  ]
  if (obj.position_analysis)    lines.push('【岗位分析】', obj.position_analysis, '')
  if (obj.overall_strategy)     lines.push('【整体润色策略】', obj.overall_strategy, '')
  if (obj.key_improvements?.length) {
    lines.push('【各模块优化重点】')
    obj.key_improvements.forEach((item, i) => lines.push(`${i + 1}. ${item}`))
    lines.push('')
  }
  if (obj.core_strengths)       lines.push('【核心竞争力】', obj.core_strengths, '')
  if (obj.interview_suggestions) lines.push('【面试建议】', obj.interview_suggestions, '')
  lines.push('─'.repeat(40), '由简达工作室 AI 润色系统自动生成')
  return lines.join('\n')
}

/**
 * action: 'sendBundleEmail'
 * 将选中的简历成品文件打包为 ZIP 后，通过 SMTP 发送至指定邮箱
 *
 * 请求体：{
 *   recipientEmail: string,
 *   resumeName: string,
 *   selectedItems: Array<{
 *     type: 'word'|'images'|'analysis'|'idphoto',
 *     fileKey?: string,   // word 类型使用
 *     urls?: string[],    // images 类型使用（预览图签名URL数组）
 *     url?: string,       // idphoto 类型使用
 *     summaryJson?: any,  // analysis 类型使用（summaryData 对象）
 *   }>
 * }
 */
async function sendBundleEmail(event) {
  const { recipientEmail, resumeName = '简历', selectedItems = [] } = event

  // ── 基础校验 ───────────────────────────────────────────────────────────────
  if (!recipientEmail) return fail('请填写收件人邮箱', 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return fail('邮箱格式不正确', 400)
  if (!selectedItems.length) return fail('请至少选择一项导出内容', 400)
  if (!EMAIL_CONFIG.auth.user || !EMAIL_CONFIG.auth.pass) {
    return fail('邮件服务未配置，请联系管理员设置 EMAIL_USER / EMAIL_PASS 环境变量', 500)
  }

  const cosClient = getCosClient()
  const zip = new JSZip()
  const name = resumeName.replace(/[<>:"/\\|?*]/g, '_').trim() || '简历'
  const attachmentList = []   // 用于邮件正文中列出附件名

  try {
    for (const item of selectedItems) {
      switch (item.type) {

        // ── 简历 Word ──────────────────────────────────────────────────────
        case 'word': {
          if (!item.fileKey) break
          console.log('[sendBundleEmail] 下载 Word:', item.fileKey)
          const buf = await cosDownloadBuffer(cosClient, item.fileKey)
          const fname = `${name}_成品.docx`
          zip.file(fname, buf)
          attachmentList.push(fname)
          break
        }

        // ── 简历预览图 ──────────────────────────────────────────────────────
        case 'images': {
          const urls = item.urls || []
          if (!urls.length) break
          const folder = urls.length > 1 ? zip.folder(`${name}_预览图`) : zip
          for (let i = 0; i < urls.length; i++) {
            console.log(`[sendBundleEmail] 下载预览图 ${i + 1}/${urls.length}`)
            const res = await axios.get(urls[i], { responseType: 'arraybuffer', timeout: 20000 })
            const ct  = res.headers['content-type'] || 'image/jpeg'
            const ext = ct.includes('png') ? 'png' : 'jpg'
            const fname = urls.length > 1 ? `第${i + 1}页.${ext}` : `${name}_成品.${ext}`
            folder.file(fname, Buffer.from(res.data))
          }
          attachmentList.push(urls.length > 1 ? `${name}_预览图/（${urls.length}张）` : `${name}_成品.jpg`)
          break
        }

        // ── 润色解析文本 ───────────────────────────────────────────────────
        case 'analysis': {
          const text = formatAnalysisText(item.summaryJson, name)
          const fname = `${name}_润色解析.txt`
          zip.file(fname, Buffer.from(text, 'utf-8'))
          attachmentList.push(fname)
          break
        }

        // ── 证件照 ──────────────────────────────────────────────────────────
        case 'idphoto': {
          if (!item.url) break
          console.log('[sendBundleEmail] 下载证件照')
          const res = await axios.get(item.url, { responseType: 'arraybuffer', timeout: 20000 })
          const ct  = res.headers['content-type'] || 'image/jpeg'
          const ext = ct.includes('png') ? 'png' : 'jpg'
          const fname = `${name}_证件照.${ext}`
          zip.file(fname, Buffer.from(res.data))
          attachmentList.push(fname)
          break
        }

        default: break
      }
    }

    // ── 生成 ZIP Buffer ─────────────────────────────────────────────────────
    console.log('[sendBundleEmail] 生成 ZIP，包含文件:', attachmentList)
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    const zipFileName = `${name}_成品交付包.zip`

    // ── 构造邮件 HTML ───────────────────────────────────────────────────────
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    const fileListHtml = attachmentList.map(f =>
      `<li style="margin:4px 0;color:#444;">${f}</li>`
    ).join('')

    const html = `
<div style="font-family:'PingFang SC',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f5f7fb;border-radius:12px;">
  <div style="background:#1565C0;border-radius:10px 10px 0 0;padding:20px 24px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">📦 简历成品交付包</h2>
    <p style="color:#b3d1f7;margin:4px 0 0;font-size:13px;">来自 简达工作室 · 简历优化系统</p>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 10px 10px;">
    <p style="color:#333;margin:0 0 16px;font-size:14px;">您好，以下是 <strong>${name}</strong> 的简历成品交付包，请查收附件。</p>

    <div style="background:#f0f5ff;border-radius:8px;padding:16px 20px;margin-bottom:16px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1565C0;">附件包含以下文件：</p>
      <ul style="margin:0;padding-left:18px;font-size:13px;">
        ${fileListHtml}
      </ul>
    </div>

    <p style="color:#888;font-size:12px;margin:0;">发送时间：${now}</p>
    <hr style="border:none;border-top:1px solid #f0f0f0;margin:16px 0;">
    <p style="color:#aaa;font-size:11px;margin:0;text-align:center;">此邮件由 <strong>简达工作室</strong> 简历优化系统自动发送</p>
  </div>
</div>`

    // ── 发送邮件 ────────────────────────────────────────────────────────────
    const transporter = nodemailer.createTransport(EMAIL_CONFIG)
    const mailResult = await transporter.sendMail({
      from:    { name: '简达工作室', address: EMAIL_CONFIG.auth.user },
      to:      recipientEmail,
      subject: `【简达工作室】${name} 简历成品交付包`,
      html,
      attachments: [{ filename: zipFileName, content: zipBuffer, contentType: 'application/zip' }],
    })

    if (Array.isArray(mailResult.rejected) && mailResult.rejected.length > 0) {
      throw new Error(`收件服务器拒收：${mailResult.rejected.join(', ')}`)
    }

    console.log('[sendBundleEmail] 发送成功 messageId:', mailResult.messageId)
    return success({
      messageId: mailResult.messageId,
      message:   `成品包已发送至 ${recipientEmail}`,
      fileCount: attachmentList.length,
    })

  } catch (err) {
    console.error('[sendBundleEmail] 发送失败:', err.message)
    // 错误分类
    const msg = err.message || ''
    let friendly = '邮件发送失败，请稍后重试'
    if (/auth|EAUTH/i.test(msg))         friendly = '邮件服务认证失败，请联系管理员检查邮箱配置'
    else if (/timeout|ETIMEDOUT/i.test(msg)) friendly = '网络超时，请稍后重试'
    else if (/550|551|user unknown|no such/i.test(msg)) friendly = '收件邮箱不存在或被拒收，请检查邮箱地址'
    else if (/554|blocked|spam/i.test(msg)) friendly = '邮件被对方服务器拒收，请尝试其他邮箱'
    else if (msg) friendly = msg
    return fail(friendly)
  }
}

// ── COS 文件下载 Buffer ────────────────────────────────────────────────────────
function cosDownloadBuffer(cos, key) {
  return new Promise((resolve, reject) => {
    cos.getObject(
      { Bucket: cosConfig.bucket, Region: cosConfig.region, Key: key },
      (err, data) => {
        if (err) return reject(err)
        resolve(Buffer.isBuffer(data.Body) ? data.Body : Buffer.from(data.Body))
      }
    )
  })
}

// ── 打包邮件发送 ──────────────────────────────────────────────────────────────

/**
 * action: 'sendBundleEmail'
 * 将选中的简历成品打包为 ZIP，通过 SMTP 发送到指定邮箱。
 *
 * event.selectedItems 数组元素格式：
 *   { type: 'word',     fileKey: 'documents/enhanced_xxx.docx' }
 *   { type: 'images',   urls: ['https://...', ...] }
 *   { type: 'analysis', text: '润色解析纯文本...' }
 *   { type: 'idphoto',  url: 'https://...' }
 *
 * 注：PDF 为纯客户端 jsPDF 生成，服务端暂不重新生成，邮件中以预览图代替。
 */
async function sendBundleEmail(event) {
  const { recipientEmail, resumeName = '简历', selectedItems = [] } = event

  // ── 参数校验 ──────────────────────────────────────────────────────────────
  if (!recipientEmail) return fail('收件人邮箱不能为空', 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return fail('邮箱格式不正确', 400)
  if (!selectedItems.length) return fail('请至少选择一项导出内容', 400)
  if (!EMAIL_CONFIG.auth.user || !EMAIL_CONFIG.auth.pass) {
    return fail('邮件服务未配置，请联系管理员设置 EMAIL_USER / EMAIL_PASS 环境变量', 500)
  }

  const cos = getCosClient()
  const zip = new JSZip()
  // 清理文件名中的非法字符
  const safeName = resumeName.replace(/[<>:"/\\|?*]/g, '_').trim() || '简历'

  const attachedTypes = []

  try {
    for (const item of selectedItems) {
      switch (item.type) {

        // ── Word ──────────────────────────────────────────────────────────
        case 'word': {
          if (!item.fileKey) break
          console.log('[sendBundleEmail] 下载 Word:', item.fileKey)
          const buf = await cosDownloadBuffer(cos, item.fileKey)
          zip.file(`${safeName}_成品.docx`, buf)
          attachedTypes.push('Word 文档')
          break
        }

        // ── 简历预览图 ────────────────────────────────────────────────
        case 'images': {
          const urls = item.urls || (item.url ? [item.url] : [])
          if (!urls.length) break
          const folder = urls.length > 1 ? zip.folder(`${safeName}_预览图`) : null
          for (let i = 0; i < urls.length; i++) {
            console.log('[sendBundleEmail] 下载预览图:', urls[i].slice(0, 60))
            const res = await axios.get(urls[i], { responseType: 'arraybuffer', timeout: 20000 })
            const buf = Buffer.from(res.data)
            const ext = (res.headers['content-type'] || '').includes('png') ? 'png' : 'jpg'
            const fname = urls.length > 1 ? `第${i + 1}页.${ext}` : `${safeName}_成品.${ext}`
            ;(folder || zip).file(fname, buf)
          }
          attachedTypes.push('简历预览图')
          break
        }

        // ── PDF（下载预览图 → pdf-lib 合成真实 PDF） ─────────────────
        case 'pdf': {
          const urls = item.urls || (item.url ? [item.url] : [])
          if (!urls.length) break
          console.log('[sendBundleEmail] 生成 PDF，共', urls.length, '页')
          const pdfDoc = await PDFDocument.create()
          for (let i = 0; i < urls.length; i++) {
            console.log('[sendBundleEmail] 下载 PDF 页图:', urls[i].slice(0, 60))
            const res  = await axios.get(urls[i], { responseType: 'arraybuffer', timeout: 20000 })
            const buf  = Buffer.from(res.data)
            const isPng = (res.headers['content-type'] || '').includes('png')
            const img  = isPng ? await pdfDoc.embedPng(buf) : await pdfDoc.embedJpg(buf)
            // A4 尺寸（单位：pt）595.28 × 841.89
            const page = pdfDoc.addPage([595.28, 841.89])
            page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 })
          }
          const pdfBytes = await pdfDoc.save()
          zip.file(`${safeName}_成品.pdf`, Buffer.from(pdfBytes))
          attachedTypes.push('简历成品 PDF')
          break
        }

        // ── 润色解析 ──────────────────────────────────────────────────────
        case 'analysis': {
          const text = item.text || ''
          if (!text) break
          zip.file(`${safeName}_润色解析.txt`, text)
          attachedTypes.push('润色解析报告')
          break
        }

        // ── 证件照 ────────────────────────────────────────────────────────
        case 'idphoto': {
          const url = item.url
          if (!url) break
          console.log('[sendBundleEmail] 下载证件照:', url.slice(0, 60))
          const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 })
          const buf = Buffer.from(res.data)
          const ext = (res.headers['content-type'] || '').includes('png') ? 'png' : 'jpg'
          zip.file(`${safeName}_证件照.${ext}`, buf)
          attachedTypes.push('证件照')
          break
        }
      }
    }

    // ── 生成 ZIP Buffer ────────────────────────────────────────────────────
    console.log('[sendBundleEmail] 生成 ZIP，包含:', attachedTypes)
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    console.log('[sendBundleEmail] ZIP 大小:', zipBuf.length, 'bytes')

    // ── 构建邮件 HTML ──────────────────────────────────────────────────────
    const now = new Date().toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    })
    const attachedList = attachedTypes.map(t => `<li style="margin:4px 0;">${t}</li>`).join('')

    const htmlBody = `
<div style="font-family:'PingFang SC',Arial,sans-serif;max-width:580px;margin:0 auto;color:#333;">
  <div style="background:linear-gradient(135deg,#1565C0,#0d47a1);padding:28px 32px;border-radius:12px 12px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:20px;letter-spacing:1px;">📦 简历成品交付包</h2>
    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">来自 简达简历工作室</p>
  </div>
  <div style="background:#f8f9ff;padding:24px 32px;border-left:1px solid #e0e8ff;border-right:1px solid #e0e8ff;">
    <p style="margin:0 0 16px;">您好，</p>
    <p style="margin:0 0 16px;">以下是 <strong>${safeName}</strong> 的简历成品打包文件，请查收附件 <code style="background:#e8f0fe;padding:2px 6px;border-radius:4px;font-size:13px;">${safeName}_成品交付包.zip</code>。</p>
    <div style="background:#fff;border:1px solid #e0e8ff;border-radius:8px;padding:16px 20px;margin:16px 0;">
      <p style="margin:0 0 8px;font-weight:600;color:#1565C0;">📋 附件包含</p>
      <ul style="margin:0;padding-left:20px;color:#444;font-size:14px;">${attachedList}</ul>
    </div>
    <p style="margin:16px 0 0;color:#888;font-size:12px;">发送时间：${now}</p>
  </div>
  <div style="background:#f0f4ff;padding:16px 32px;border-radius:0 0 12px 12px;border:1px solid #e0e8ff;border-top:none;">
    <p style="margin:0;color:#999;font-size:12px;text-align:center;">此邮件由 <strong>简达简历工作室内部系统</strong> 自动发送，请勿直接回复。</p>
  </div>
</div>`

    // ── 发送邮件 ──────────────────────────────────────────────────────────
    const transporter = nodemailer.createTransport(EMAIL_CONFIG)
    const result = await transporter.sendMail({
      from: { name: '简达简历工作室', address: EMAIL_CONFIG.auth.user },
      to:   recipientEmail,
      subject: `【简达工作室】${safeName} 简历成品交付包`,
      html:    htmlBody,
      attachments: [{
        filename:    `${safeName}_成品交付包.zip`,
        content:     zipBuf,
        contentType: 'application/zip',
      }],
    })

    if (Array.isArray(result.rejected) && result.rejected.length > 0) {
      throw new Error(`收件服务器拒收：${result.rejected.join(', ')}`)
    }

    console.log('[sendBundleEmail] 发送成功 messageId:', result.messageId)
    return success({ messageId: result.messageId, attachedTypes })

  } catch (err) {
    console.error('[sendBundleEmail] 失败:', err.message)
    // 友好错误分类
    const msg = err.message || ''
    if (/EAUTH/.test(msg))            return fail('邮件授权码无效，请联系管理员检查 EMAIL_PASS 配置', 500)
    if (/timeout|ETIMEDOUT/i.test(msg)) return fail('连接邮件服务器超时，请稍后重试')
    if (/550|551|552|553|554/.test(msg)) return fail('收件地址被服务器拒收，请确认邮箱地址是否有效')
    if (/invalid/i.test(msg))          return fail('邮箱地址无效，请检查后重试')
    return fail('邮件发送失败：' + msg)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  安全审计日志
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 上报安全事件（无需登录，前端尽力上报）
 * 字段：userId, userName, eventType, detail, pageUrl
 */
// 触发自动冻结计数的事件类型（截图 + 所有主动泄露尝试行为）
// 不含 copy / drag（仅记录，不计入冻结）
const FREEZE_EVENT_TYPES = [
  'printscreen',   // Windows 截图
  'save_page',     // Ctrl+S 保存网页
  'print_page',    // Ctrl+P 打印/存PDF
  'view_source',   // Ctrl+U 查看源码
  'devtools',      // F12 / DevTools
]

async function logSecurityEvent(event) {
  const { userId, userName, eventType, detail, pageUrl } = event
  const db = cloud.database()
  try {
    await db.collection('security_logs').add({
      data: {
        userId:    String(userId    || '').slice(0, 64),
        userName:  String(userName  || '').slice(0, 32),
        eventType: String(eventType || '').slice(0, 32),
        detail:    String(detail    || '').slice(0, 256),
        pageUrl:   String(pageUrl   || '').slice(0, 128),
        createdAt: new Date().toISOString(),
      }
    })

    // ── 自动冻结：1小时内截屏超过3次（管理员豁免）─────────────────────────
    let autoFrozen = false
    if (userId && FREEZE_EVENT_TYPES.includes(String(eventType))) {
      try {
        // 先查询该用户角色，管理员不受自动冻结限制
        const userDoc = await db.collection('users')
          .doc(String(userId).slice(0, 64))
          .get()
        const isAdmin = userDoc.data && ['admin', 'superadmin'].includes(userDoc.data.role)

        if (!isAdmin) {
          const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
          // 若管理员曾手动解冻，只统计解冻时间之后的截屏记录
          // 这样解冻操作等同于重置计数器，避免历史记录触发再次冻结
          const unfrozenAt  = userDoc.data?.unfrozenAt || null
          const countFrom   = (unfrozenAt && unfrozenAt > oneHourAgo) ? unfrozenAt : oneHourAgo
          const countRes = await db.collection('security_logs')
            .where({
              userId:    String(userId).slice(0, 64),
              eventType: db.command.in(FREEZE_EVENT_TYPES),
              createdAt: db.command.gte(countFrom)
            })
            .count()
          if (countRes.total >= 3) {
            await db.collection('users')
              .doc(String(userId).slice(0, 64))
              .update({
                data: {
                  frozen:       true,
                  frozenAt:     new Date().toISOString(),
                  frozenReason: `1小时内截屏超过3次（自动冻结）`
                }
              })
            autoFrozen = true
          }
        }
      } catch (freezeErr) {
        console.error('[logSecurityEvent] 自动冻结检查失败:', freezeErr.message)
      }
    }

    return success({ message: '已记录', autoFrozen })
  } catch (e) {
    return fail('记录安全日志失败: ' + e.message)
  }
}

/**
 * 管理员查询近1小时高危用户（截屏频繁，按截屏次数降序）
 */
async function adminGetHighRiskUsers(event) {
  requireAdminPayload(event)
  const db = cloud.database()
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
  try {
    const res = await db.collection('security_logs')
      .where({
        eventType: db.command.in(FREEZE_EVENT_TYPES),
        createdAt: db.command.gte(oneHourAgo)
      })
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get()

    const userMap = {}
    for (const log of res.data || []) {
      if (!log.userId) continue
      const uid = log.userId
      if (!userMap[uid]) {
        userMap[uid] = { userId: uid, userName: log.userName || '未知', count: 0, lastAt: log.createdAt }
      }
      userMap[uid].count++
      if (log.createdAt > userMap[uid].lastAt) userMap[uid].lastAt = log.createdAt
    }

    const list = Object.values(userMap).sort((a, b) => b.count - a.count)
    return success({ list })
  } catch (e) {
    return fail('查询高危用户失败: ' + e.message)
  }
}

/**
 * 管理员查询安全日志（需管理员权限）
 * 支持按 userId 筛选、分页
 */
async function adminListSecurityLogs(event) {
  requireAdminPayload(event)
  const db = cloud.database()
  const { filterUser = '', pageSize = 100 } = event
  try {
    const conditions = {}
    if (filterUser) conditions.userId = filterUser
    const res = await db.collection('security_logs')
      .where(conditions)
      .orderBy('createdAt', 'desc')
      .limit(Math.min(Number(pageSize) || 100, 200))
      .get()
    return success({ list: res.data || [], total: (res.data || []).length })
  } catch (e) {
    return fail('查询安全日志失败: ' + e.message)
  }
}

// ── 主入口（HTTP 访问服务触发）────────────────────────────────────────────────
exports.main = async (event) => {
  // OPTIONS 预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    }
  }

  // 解析请求体
  let body = {}
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {})
  } catch {
    return fail('请求体 JSON 解析失败', 400)
  }

  // JWT 验证（以下 action 无需登录，其余均需要）
  const { action } = body
  const NO_AUTH_ACTIONS = ['getPhotoSizes', 'logSecurityEvent']
  if (!NO_AUTH_ACTIONS.includes(action)) {
    const authHeader = event.headers?.authorization || event.headers?.Authorization || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const payload = token ? verifyToken(token) : null
    if (!payload) {
      return fail('未授权，请重新登录', 401)
    }
    // 将解码后的 JWT payload 注入 body，供工单等 action 直接使用（不再重复读 headers）
    body._auth = payload
  }

  return await _handleAction(action, body)
}
