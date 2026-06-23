'use strict'
/**
 * doc_processor_web — WPS WebOffice 回调服务
 *
 * 回调接口（WPS 服务器→本函数）：
 *   GET  /v3/3rd/files/:file_id               获取文件信息
 *   GET  /v3/3rd/files/:file_id/download       获取文件下载地址
 *   GET  /v3/3rd/files/:file_id/permission     文档用户权限
 *   GET  /v3/3rd/users                         批量获取用户信息
 *   GET  /v3/3rd/files/:file_id/upload/prepare 三阶段保存-准备
 *   POST /v3/3rd/files/:file_id/upload/address 三阶段保存-获取上传地址
 *   POST /v3/3rd/files/:file_id/upload/complete三阶段保存-完成通知
 *
 * 前端 API（前端→本函数 POST action）：
 *   action: 'get_wps_open_config'   → 返回 WPS 初始化所需 appId/fileId
 *   action: 'get_edited_preview'    → 保存后刷新预览图
 *
 * fileId 规则：
 *   文件路径格式为 documents/enhanced_{timestamp}.docx
 *   fileId = timestamp（13位数字，远小于WPS限制的47位）
 *
 * WPS AppID: SX20260319XTINRE
 * 环境变量：WPS_APP_SECRET, TENCENT_SECRET_ID, TENCENT_SECRET_KEY
 */

const COS = require('cos-nodejs-sdk-v5')
const crypto = require('crypto')
const axios = require('axios')

// ─────────────────────────────────────────────────────────────────
// 配置
// ─────────────────────────────────────────────────────────────────
const WPS_APP_ID     = 'SX20260319XTINRE'
const WPS_APP_SECRET = process.env.WPS_APP_SECRET || ''

// 与 word_processor_web 同一数据万象 COS bucket（存放 documents/ 文件）
const cosConfig = {
  secretId:  process.env.TENCENT_SECRET_ID  || '',
  secretKey: process.env.TENCENT_SECRET_KEY || '',
  bucket:    process.env.COS_BUCKET   || 'cloud1-4g7z1dndd718b661-1340279912',
  region:    process.env.COS_REGION   || 'ap-shanghai'
}

const cos = new COS({ SecretId: cosConfig.secretId, SecretKey: cosConfig.secretKey })

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Weboffice-Token, X-App-Id'
}

// ─────────────────────────────────────────────────────────────────
// 云函数入口
// ─────────────────────────────────────────────────────────────────
exports.main = async (event, context) => {
  const method = (event.httpMethod || 'POST').toUpperCase()
  const path   = event.path || ''
  const qs     = event.queryStringParameters || {}

  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' }
  }

  try {
    // ── WPS 回调路由 ────────────────────────────────────────────
    // 路径示例：/doc_processor_web/v3/3rd/files/1773913341555/download

    // GET /v3/3rd/users  （批量用户信息）
    if (method === 'GET' && path.includes('/v3/3rd/users')) {
      return await handleGetUsers(qs)
    }

    // 匹配 /v3/3rd/files/:file_id 或子路径
    const fileMatch = path.match(/\/v3\/3rd\/files\/([^/]+)(\/.*)?$/)
    if (fileMatch) {
      const fileId   = fileMatch[1]
      const subPath  = fileMatch[2] || ''   // e.g. '/download', '/permission', '/upload/prepare'

      if (method === 'GET' && subPath === '') {
        return await handleGetFileInfo(fileId)
      }
      if (method === 'GET' && subPath === '/download') {
        return await handleGetFileDownload(fileId)
      }
      if (method === 'GET' && subPath === '/permission') {
        return await handleGetFilePermission(fileId, event)
      }
      if (method === 'GET' && subPath === '/upload/prepare') {
        return await handleUploadPrepare(fileId)
      }
      if (method === 'POST' && subPath === '/upload/address') {
        return await handleUploadAddress(fileId, event)
      }
      if (method === 'POST' && subPath === '/upload/complete') {
        return await handleUploadComplete(fileId, event)
      }
    }

    // ── 前端 POST 路由 ──────────────────────────────────────────
    if (method === 'POST') {
      let body = {}
      if (event.body) {
        try { body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body }
        catch (e) { /* ignore */ }
      }
      switch (body.action) {
        case 'get_wps_open_config':  return await handleGetWpsOpenConfig(body)
        case 'get_edited_preview':   return await handleGetEditedPreview(body)
        case 'get_file_base64':      return await handleGetFileBase64(body)
        case 'get_url_base64':       return await handleGetUrlBase64(body)
        case 'word_to_pdf':          return await handleWordToPdf(body)
        default:
          return frontendRes(400, null, '未知操作: ' + (body.action || ''))
      }
    }

    return frontendRes(404, null, 'Not Found: ' + path)

  } catch (err) {
    console.error('[doc_processor_web] 处理失败:', err.message)
    return frontendRes(500, null, err.message)
  }
}

// ─────────────────────────────────────────────────────────────────
// WPS 回调实现
// ─────────────────────────────────────────────────────────────────

/** GET /v3/3rd/files/:file_id — 文件基本信息 */
async function handleGetFileInfo(fileId) {
  const fileKey = fileIdToKey(fileId)
  console.log(`[doc_processor_web] getFileInfo: fileId=${fileId} fileKey=${fileKey}`)

  const head = await cosHead(fileKey)
  const size  = parseInt(head.headers['content-length'] || '0')
  const mtime = head.headers['last-modified']
    ? Math.floor(new Date(head.headers['last-modified']).getTime() / 1000)
    : Math.floor(Date.now() / 1000)
  const name = fileKey.split('/').pop()

  return wpsRes({ id: fileId, name, version: 1, size, create_time: mtime, modify_time: mtime, creator_id: 'jianda_staff', modifier_id: 'jianda_staff' })
}

/** GET /v3/3rd/files/:file_id/download — 文件下载地址 */
async function handleGetFileDownload(fileId) {
  const fileKey  = fileIdToKey(fileId)
  console.log(`[doc_processor_web] getFileDownload: fileId=${fileId}`)

  const url = await cosGetSignedUrl(fileKey, 'GET', 3600)
  return wpsRes({ url })
}

/** GET /v3/3rd/files/:file_id/permission — 用户权限 */
async function handleGetFilePermission(fileId, event) {
  // user_id 从 X-Weboffice-Token 或默认值
  const token  = (event.headers || {})['x-weboffice-token'] || 'jianda_staff'
  return wpsRes({
    user_id:  token,
    read:     1,
    update:   1,
    download: 1,
    rename:   0,
    history:  0,
    copy:     1,
    print:    1,
    comment:  0
  })
}

/** GET /v3/3rd/users — 批量用户信息 */
async function handleGetUsers(qs) {
  // user_ids 可能是逗号分隔字符串或重复参数
  const raw = qs.user_ids || ''
  const ids = Array.isArray(raw) ? raw : raw.split(',').filter(Boolean)
  const users = ids.map(id => ({ id: id.trim(), name: '简达工作室员工', avatar_url: '' }))
  return wpsRes(users)
}

// ── 三阶段保存 ──────────────────────────────────────────────────

/**
 * GET /v3/3rd/files/:file_id/upload/prepare
 * 告知 WPS 使用 sha1 校验
 */
async function handleUploadPrepare(fileId) {
  return wpsRes({ digest_types: ['sha1'] })
}

/**
 * POST /v3/3rd/files/:file_id/upload/address
 * WPS 要上传新版本，我们返回一个 COS 预签名 PUT URL
 */
async function handleUploadAddress(fileId, event) {
  const fileKey = fileIdToKey(fileId)

  let body = {}
  if (event.body) {
    try { body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body }
    catch (e) { /* ignore */ }
  }

  console.log(`[doc_processor_web] uploadAddress: fileId=${fileId}, name=${body.name}, size=${body.size}`)

  // 生成 COS 预签名 PUT URL（WPS 将直接 PUT 文件到此 URL）
  const putUrl = await cosGetSignedUrl(fileKey, 'PUT', 1800)

  return wpsRes({ method: 'PUT', url: putUrl })
}

/**
 * POST /v3/3rd/files/:file_id/upload/complete
 * WPS 上传完成后回调，我们确认保存并返回更新的文件信息
 */
async function handleUploadComplete(fileId, event) {
  const fileKey = fileIdToKey(fileId)

  let body = {}
  if (event.body) {
    try { body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body }
    catch (e) { /* ignore */ }
  }

  const request = body.request || {}
  const name    = request.name || fileKey.split('/').pop()
  const size    = request.size || 0

  console.log(`[doc_processor_web] uploadComplete: fileId=${fileId}, name=${name}, size=${size}`)

  // 从 COS 拿最新文件信息
  let version = 2
  try {
    const head = await cosHead(fileKey)
    const ts   = Math.floor(Date.now() / 1000)
    return wpsRes({
      id:           fileId,
      name,
      version,
      size:         parseInt(head.headers['content-length'] || String(size)),
      create_time:  ts,
      modify_time:  ts,
      creator_id:   'jianda_staff',
      modifier_id:  'jianda_staff'
    })
  } catch (e) {
    const ts = Math.floor(Date.now() / 1000)
    return wpsRes({ id: fileId, name, version, size, create_time: ts, modify_time: ts, creator_id: 'jianda_staff', modifier_id: 'jianda_staff' })
  }
}

// ─────────────────────────────────────────────────────────────────
// 前端 API 实现
// ─────────────────────────────────────────────────────────────────

/**
 * action: 'get_wps_open_config'
 * 返回前端初始化 WPS SDK 所需的 appId 和 fileId
 */
async function handleGetWpsOpenConfig(body) {
  const { fileKey } = body
  if (!fileKey) return frontendRes(400, null, 'fileKey 参数缺失')
  if (!fileKey.startsWith('documents/')) {
    return frontendRes(400, null, '无效的文件路径')
  }

  const fileId = keyToFileId(fileKey)
  console.log(`[doc_processor_web] getWpsOpenConfig: fileKey=${fileKey}, fileId=${fileId}`)

  return frontendRes(200, {
    success:    true,
    appId:      WPS_APP_ID,
    fileId,
    fileKey,
    // token 透传到回调鉴权，这里用固定值（内部工具，无需复杂鉴权）
    token:      'jianda_internal_token'
  })
}

/**
 * action: 'get_edited_preview'
 * WPS 保存后，刷新文档预览图
 */
async function handleGetEditedPreview(body) {
  const { fileKey } = body
  if (!fileKey) return frontendRes(400, null, 'fileKey 参数缺失')

  try {
    const previewResult = await generateDocPreview(fileKey)
    return frontendRes(200, {
      success:          true,
      previewImageUrl:  previewResult.previewImageUrl,
      previewImageUrls: previewResult.previewImageUrls
    })
  } catch (err) {
    console.error('[doc_processor_web] 预览图生成失败:', err.message)
    // 预览刷新失败不影响文档本身，返回软失败
    return frontendRes(200, { success: false, message: '预览图生成失败: ' + err.message })
  }
}

/**
 * action: 'get_file_base64'
 * 从 COS 下载指定 fileKey 文件，以 base64 返回给前端（解决浏览器跨域限制）
 */
async function handleGetFileBase64(body) {
  const { fileKey } = body
  if (!fileKey) return frontendRes(400, null, 'fileKey 参数缺失')
  try {
    const buf = await cosDownloadBuffer(fileKey)
    const ext = fileKey.split('.').pop().toLowerCase()
    const mimeMap = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      pdf:  'application/pdf',
      jpg:  'image/jpeg',
      jpeg: 'image/jpeg',
      png:  'image/png',
    }
    return frontendRes(200, {
      success:  true,
      base64:   buf.toString('base64'),
      mimeType: mimeMap[ext] || 'application/octet-stream',
      fileName: fileKey.split('/').pop()
    })
  } catch (err) {
    console.error('[doc_processor_web] get_file_base64 失败:', err.message)
    return frontendRes(500, null, '文件下载失败: ' + err.message)
  }
}

/**
 * action: 'get_url_base64'
 * 代理下载任意 HTTP URL（如 COS 签名链接），以 base64 返回（解决浏览器跨域限制）
 */
async function handleGetUrlBase64(body) {
  const { url } = body
  if (!url) return frontendRes(400, null, 'url 参数缺失')
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 })
    const buf = Buffer.from(res.data)
    const ct  = res.headers['content-type'] || 'application/octet-stream'
    return frontendRes(200, {
      success:  true,
      base64:   buf.toString('base64'),
      mimeType: ct.split(';')[0].trim()
    })
  } catch (err) {
    console.error('[doc_processor_web] get_url_base64 失败:', err.message)
    return frontendRes(500, null, 'URL 下载失败: ' + err.message)
  }
}

// ─────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────

/**
 * 将文件路径转为 WPS fileId（仅提取时间戳，最多13位，远小于47位限制）
 * documents/enhanced_1773913341555.docx → '1773913341555'
 */
function keyToFileId(fileKey) {
  const m = fileKey.match(/enhanced_(\d+)\.docx$/)
  if (m) return m[1]
  // fallback：截取最后 47 位字母数字下划线（防御性处理）
  return fileKey.replace(/[^a-zA-Z0-9_]/g, '_').slice(-47)
}

/**
 * 将 WPS fileId 还原为文件路径
 * '1773913341555' → 'documents/enhanced_1773913341555.docx'
 */
function fileIdToKey(fileId) {
  // 纯数字 → 标准 enhanced 文件
  if (/^\d+$/.test(fileId)) {
    return `documents/enhanced_${fileId}.docx`
  }
  // fallback（若以后有其他格式）
  throw new Error(`无法解析 fileId: ${fileId}`)
}

/**
 * 生成 COS 预签名 URL（支持 GET / PUT）
 */
function cosGetSignedUrl(fileKey, method, expires) {
  return new Promise((resolve, reject) => {
    cos.getObjectUrl(
      { Bucket: cosConfig.bucket, Region: cosConfig.region, Key: fileKey, Method: method, Expires: expires, Sign: true },
      (err, data) => err ? reject(err) : resolve(data.Url)
    )
  })
}

/** COS headObject 封装 */
function cosHead(fileKey) {
  return new Promise((resolve, reject) => {
    cos.headObject(
      { Bucket: cosConfig.bucket, Region: cosConfig.region, Key: fileKey },
      (err, data) => err ? reject(err) : resolve(data)
    )
  })
}

/** COS getObject → Buffer 封装 */
function cosDownloadBuffer(fileKey) {
  return new Promise((resolve, reject) => {
    cos.getObject(
      { Bucket: cosConfig.bucket, Region: cosConfig.region, Key: fileKey },
      (err, data) => {
        if (err) return reject(err)
        resolve(Buffer.isBuffer(data.Body) ? data.Body : Buffer.from(data.Body))
      }
    )
  })
}

/**
 * 文档首页转预览图
 * 复用数据万象 CI doc-preview 能力
 */
async function generateDocPreview(fileKey) {
  const timestamp   = Date.now()
  const downloadUrl = await cosGetSignedUrl(fileKey, 'GET', 3600)

  const previewUrls = []
  const previewKeys = []

  // 逐页抓取，直到 CI 返回非 2xx（文档无此页）
  for (let page = 1; page <= 20; page++) {
    const ciUrl = `${downloadUrl}&ci-process=doc-preview&dstType=png&page=${page}`
    let buf
    try {
      const ciRes = await axios.get(ciUrl, { responseType: 'arraybuffer', timeout: 30000 })
      if (!ciRes.data || ciRes.data.byteLength < 1000) break  // 空响应视为无更多页
      buf = Buffer.from(ciRes.data)
    } catch {
      break  // 4xx/5xx 表示已超出页数范围
    }

    const previewKey = `preview_images/wps_edited_${timestamp}_page${page}.png`
    await new Promise((resolve, reject) => {
      cos.putObject(
        { Bucket: cosConfig.bucket, Region: cosConfig.region, Key: previewKey, Body: buf, ContentType: 'image/png' },
        (err) => err ? reject(err) : resolve()
      )
    })
    const previewUrl = await cosGetSignedUrl(previewKey, 'GET', 86400)
    previewUrls.push(previewUrl)
    previewKeys.push(previewKey)
  }

  return {
    previewImageUrl:  previewUrls[0] || null,
    previewImageUrls: previewUrls,
    previewKeys
  }
}

// ── 响应构造 ──────────────────────────────────────────────────────

/** WPS 标准响应 { code: 0, data: {...} } */
function wpsRes(data, code = 0, message = '') {
  return {
    statusCode: code === 0 ? 200 : 400,
    headers:    { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body:       JSON.stringify({ code, data, message })
  }
}

/** 前端调用响应 { code: httpCode, ... } */
function frontendRes(statusCode, data, message = '') {
  const body = data !== null ? data : { success: false, message }
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body:    JSON.stringify(body)
  }
}

// ─────────────────────────────────────────────────────────────────
// Word → PDF 转换（调用腾讯数据万象 doc-preview CI 接口）
// ─────────────────────────────────────────────────────────────────

/**
 * 生成腾讯云 COS 请求签名（用于数据万象文档预览接口）
 * 与 word_processor_web/convertWordToPDF 中的算法完全一致
 */
function _generateCosAuthorization(method, objectKey, queryParams) {
  const now     = Math.floor(Date.now() / 1000)
  const expired = now + 3600
  const signTime = `${now};${expired}`
  const sortedKeys = Object.keys(queryParams || {}).sort()
  const queryString = sortedKeys.map(k => `${k.toLowerCase()}=${queryParams[k]}`).join('&')
  const httpString = [method.toLowerCase(), objectKey, queryString, '', ''].join('\n')
  const signKey    = crypto.createHmac('sha1', cosConfig.secretKey).update(signTime).digest('hex')
  const sha1Http   = crypto.createHash('sha1').update(httpString).digest('hex')
  const stringToSign = `sha1\n${signTime}\n${sha1Http}\n`
  const signature  = crypto.createHmac('sha1', signKey).update(stringToSign).digest('hex')
  return [
    'q-sign-algorithm=sha1',
    `q-ak=${cosConfig.secretId}`,
    `q-sign-time=${signTime}`,
    `q-key-time=${signTime}`,
    'q-header-list=',
    `q-url-param-list=${sortedKeys.map(k => k.toLowerCase()).join(';')}`,
    `q-signature=${signature}`
  ].join('&')
}

/**
 * action: 'word_to_pdf'
 * 将 COS 上已有的 Word 文件转换为 PDF，上传到 COS，返回公共可访问的 HTTPS URL
 * @param {object} body
 * @param {string} body.wordFileKey  - COS 文件路径，如 documents/enhanced_xxx.docx
 * @param {string} [body.orderId]    - 可选，用于生成 PDF 文件路径
 */
async function handleWordToPdf(body) {
  const { wordFileKey, orderId } = body
  if (!wordFileKey || String(wordFileKey).trim() === '') {
    return frontendRes(400, null, '缺少 wordFileKey 参数')
  }

  const queryParams = { 'ci-process': 'doc-preview', 'dstType': 'pdf' }
  const baseUrl     = `https://${cosConfig.bucket}.cos.${cosConfig.region}.myqcloud.com/${wordFileKey}`
  const queryString = Object.keys(queryParams).map(k => `${k}=${queryParams[k]}`).join('&')
  const fullUrl     = `${baseUrl}?${queryString}`
  const authorization = _generateCosAuthorization('GET', `/${wordFileKey}`, queryParams)

  console.log('[word_to_pdf] 开始转换, wordFileKey:', wordFileKey)

  let pdfBuffer
  try {
    const response = await axios.get(fullUrl, {
      timeout: 90000,
      responseType: 'arraybuffer',
      headers: {
        'Authorization': authorization,
        'Host': `${cosConfig.bucket}.cos.${cosConfig.region}.myqcloud.com`
      }
    })

    if (response.headers['x-ci-error-code']) {
      const errCode = response.headers['x-ci-error-code']
      const errMsg  = response.headers['x-ci-error-message'] || '未知错误'
      console.error('[word_to_pdf] CI 错误:', errCode, errMsg)
      return frontendRes(500, null, `PDF 转换失败: ${errCode} - ${errMsg}`)
    }

    if (response.status !== 200 || !response.data || !response.data.length) {
      return frontendRes(500, null, `PDF 转换返回异常状态: ${response.status}`)
    }
    pdfBuffer = Buffer.from(response.data)
    console.log('[word_to_pdf] CI 返回 PDF 大小:', pdfBuffer.length, 'bytes')
  } catch (e) {
    console.error('[word_to_pdf] CI 请求失败:', e.message)
    return frontendRes(500, null, 'PDF 转换请求失败: ' + e.message)
  }

  // 上传 PDF 到 COS（公共读）
  const tag     = orderId ? orderId : Date.now().toString()
  const pdfKey  = `commission_pdfs/${tag}_${Date.now()}_resume.pdf`
  try {
    await new Promise((resolve, reject) => {
      cos.putObject({
        Bucket: cosConfig.bucket, Region: cosConfig.region,
        Key: pdfKey, Body: pdfBuffer,
        ContentType: 'application/pdf', ACL: 'public-read'
      }, (err, data) => err ? reject(err) : resolve(data))
    })
    const pdfUrl = `https://${cosConfig.bucket}.cos.${cosConfig.region}.myqcloud.com/${pdfKey}`
    console.log('[word_to_pdf] PDF 上传成功, pdfUrl:', pdfUrl)
    return frontendRes(200, { success: true, pdfUrl, pdfKey })
  } catch (e) {
    console.error('[word_to_pdf] COS 上传失败:', e.message)
    return frontendRes(500, null, 'PDF 上传失败: ' + e.message)
  }
}
