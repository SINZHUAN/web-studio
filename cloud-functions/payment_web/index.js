'use strict'
// =============================================================================
// payment_web — 微信支付处理云函数
// 部署环境：web-02-7gsm40y513e0dd07
// HTTP 触发路径：/payment_web
//
// 环境变量（在 CloudBase 控制台 → 云函数 → payment_web → 环境变量 处配置）：
//   WECHAT_APPID       小程序 AppID（默认已填入，可通过环境变量覆盖）
//   WECHAT_MCH_ID      微信支付商户号（必须配置）
//   WECHAT_API_KEY     微信支付 API v2 密钥（必须配置）
//   WECHAT_NOTIFY_URL  支付异步回调 URL（默认自动构造，可通过环境变量覆盖）
// =============================================================================

const cloud  = require('wx-server-sdk')
const crypto = require('crypto')
const axios  = require('axios')
const xml2js = require('xml2js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// =============================================================================
// ⚠️  支付配置 — 调整金额或开关在此处修改
//
//   PAYMENT_ENABLED：
//     true  = 正常收费流程（生产环境）
//     false = 跳过支付，直接允许提交工单（测试/免费模式）
//
//   SERVICE_PRICES 中的 price 单位为"分"（人民币），例如：
//     1200 = 12.00 元  |  1900 = 19.00 元  |  1 = 0.01 元（测试用）
//
//   ⚠️  修改 price 后，同步更新 miniprogram/pages/order-submit/optimize.js
//       顶部的 PAYMENT_DISPLAY 常量，保持前端展示金额一致。
// =============================================================================
const PAYMENT_ENABLED = true

const SERVICE_PRICES = {
  resume_optimize: {
    name:        '简历优化',
    price:       1,     // 分（1 = 0.01 元，测试用；正式上线改为 1200 = 12.00 元）
    description: '天鹿文化工作室-简历优化服务',
  },
  resume_customize: {
    name:        '简历定制',
    price:       1,     // 分（1 = 0.01 元，测试用；正式上线改为 1900 = 19.00 元）
    description: '天鹿文化工作室-简历定制服务',
  },
}
// =============================================================================

// 微信支付核心配置
const APPID      = process.env.WECHAT_APPID      || ''
const MCH_ID     = process.env.WECHAT_MCH_ID     || ''
const API_KEY    = process.env.WECHAT_API_KEY     || ''
const NOTIFY_URL = process.env.WECHAT_NOTIFY_URL  ||
  'https://jiandacom-prod-d2gnxqxs93455d5d7-1340279912.ap-shanghai.app.tcloudbase.com/payment_web'

// ─── 云函数入口 ───────────────────────────────────────────────────────────────

exports.main = async (event, context) => {
  const rawBody = event.body || ''

  // 微信支付异步通知：body 为原始 XML（以 <xml> 开头，无 action 字段）
  if (typeof rawBody === 'string' && rawBody.trimStart().startsWith('<xml>')) {
    return handlePaymentNotify(rawBody)
  }

  // 普通 JSON API 调用
  let body
  try {
    body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody
  } catch {
    body = event  // 兼容直接传递对象的调用方式
  }

  const { action, openid } = body || {}

  try {
    switch (action) {
      case 'client_create_payment':
        return await clientCreatePayment(openid, body)
      case 'client_query_payment':
        return await clientQueryPayment(openid, body)
      default:
        return { success: false, message: `未知操作: ${action}` }
    }
  } catch (err) {
    console.error('[payment_web] 执行失败:', err.message)
    return { success: false, message: err.message || '服务异常' }
  }
}

// ─── 创建支付订单 ──────────────────────────────────────────────────────────────

async function clientCreatePayment(openid, data) {
  if (!openid) throw new Error('用户身份未识别，请重试')

  const serviceType = data.serviceType || 'resume_optimize'
  const service = SERVICE_PRICES[serviceType]
  if (!service) throw new Error('不支持的服务类型')

  // 支付开关关闭时，返回 skip 标记，前端直接跳过支付步骤提交工单
  if (!PAYMENT_ENABLED) {
    return { success: true, skip: true, message: '支付已关闭，跳过支付步骤' }
  }

  if (!MCH_ID || !API_KEY) {
    throw new Error('微信支付配置不完整，请联系管理员')
  }

  const orderNo    = generateOrderNo()
  const expireTime = new Date(Date.now() + 30 * 60 * 1000)  // 30 分钟内有效

  // 写入本地待支付订单记录
  const orderResult = await db.collection('payment_orders').add({
    data: {
      orderNo,
      openid,
      serviceType,
      serviceName:   service.name,
      totalAmount:   service.price,
      status:        'pending',
      paymentType:   'wechat_jsapi',
      paymentStatus: 'pending',
      createTime:    db.serverDate(),
      expireTime,
      updateTime:    db.serverDate(),
    },
  })

  // 调用微信支付统一下单 API
  const prepayResult = await wechatUnifiedOrder({
    openid,
    orderNo,
    totalAmount:  service.price,
    description:  service.description,
  })

  // 回写 prepayId
  await db.collection('payment_orders').doc(orderResult._id).update({
    data: { prepayId: prepayResult.prepay_id, updateTime: db.serverDate() },
  })

  // 生成小程序端 wx.requestPayment 所需参数
  const paymentParams = generatePaymentParams(prepayResult.prepay_id)

  return {
    success:       true,
    skip:          false,
    orderNo,
    paymentParams,
    amount:        service.price,
    serviceName:   service.name,
  }
}

// ─── 查询支付结果（主动查询，用于支付后确认） ─────────────────────────────────

async function clientQueryPayment(openid, data) {
  const { orderNo } = data
  if (!orderNo) throw new Error('订单号不能为空')

  // 先查本地库，已标记为 paid 直接返回
  const orderQuery = await db.collection('payment_orders').where({ orderNo, openid }).get()
  if (orderQuery.data.length === 0) throw new Error('订单不存在')

  const order = orderQuery.data[0]
  if (order.status === 'paid') {
    return { success: true, paid: true, orderNo }
  }

  if (!MCH_ID || !API_KEY) throw new Error('微信支付配置不完整')

  // 向微信支付查询实时状态
  const params = {
    appid:        APPID,
    mch_id:       MCH_ID,
    out_trade_no: orderNo,
    nonce_str:    generateNonceStr(),
  }
  params.sign = generateSign(params)

  const response = await axios.post(
    'https://api.mch.weixin.qq.com/pay/orderquery',
    objectToXml(params),
    { headers: { 'Content-Type': 'application/xml' } }
  )
  const result = await parseXml(response.data)

  if (result.return_code === 'SUCCESS' && result.trade_state === 'SUCCESS') {
    // 同步更新本地订单状态
    await db.collection('payment_orders').doc(order._id).update({
      data: {
        status:        'paid',
        paymentStatus: 'success',
        transactionId: result.transaction_id,
        payTime:       db.serverDate(),
        updateTime:    db.serverDate(),
      },
    })
    return { success: true, paid: true, orderNo }
  }

  return {
    success:    true,
    paid:       false,
    tradeState: result.trade_state || 'NOTPAY',
    orderNo,
  }
}

// ─── 微信支付异步通知处理 ──────────────────────────────────────────────────────

async function handlePaymentNotify(xmlBody) {
  try {
    const notifyData = await parseXml(xmlBody)

    if (!verifySign(notifyData)) {
      console.error('[payment_web] 支付回调签名验证失败')
      return xmlResponse('FAIL', '签名验证失败')
    }

    if (notifyData.return_code !== 'SUCCESS' || notifyData.result_code !== 'SUCCESS') {
      return xmlResponse('FAIL', '支付失败')
    }

    const orderNo       = notifyData.out_trade_no
    const transactionId = notifyData.transaction_id
    const totalFee      = parseInt(notifyData.total_fee)

    const orderQuery = await db.collection('payment_orders').where({ orderNo }).get()
    if (orderQuery.data.length === 0) {
      console.error('[payment_web] 找不到订单:', orderNo)
      return xmlResponse('FAIL', '订单不存在')
    }

    const order = orderQuery.data[0]

    // 幂等处理：已处理过则直接返回成功
    if (order.status === 'paid') {
      return xmlResponse('SUCCESS', 'OK')
    }

    if (order.totalAmount !== totalFee) {
      console.error('[payment_web] 金额不匹配:', { expected: order.totalAmount, got: totalFee })
      return xmlResponse('FAIL', '金额不匹配')
    }

    await db.collection('payment_orders').doc(order._id).update({
      data: {
        status:        'paid',
        paymentStatus: 'success',
        transactionId,
        payTime:       db.serverDate(),
        updateTime:    db.serverDate(),
      },
    })

    console.log('[payment_web] 支付回调处理成功:', orderNo)
    return xmlResponse('SUCCESS', 'OK')

  } catch (err) {
    console.error('[payment_web] 支付回调处理失败:', err.message)
    return xmlResponse('FAIL', '处理失败')
  }
}

// ─── 微信支付工具函数 ──────────────────────────────────────────────────────────

async function wechatUnifiedOrder({ openid, orderNo, totalAmount, description }) {
  const params = {
    appid:            APPID,
    mch_id:           MCH_ID,
    nonce_str:        generateNonceStr(),
    body:             description,
    out_trade_no:     orderNo,
    total_fee:        totalAmount,
    spbill_create_ip: '127.0.0.1',
    notify_url:       NOTIFY_URL,
    trade_type:       'JSAPI',
    openid,
  }
  params.sign = generateSign(params)

  const response = await axios.post(
    'https://api.mch.weixin.qq.com/pay/unifiedorder',
    objectToXml(params),
    { headers: { 'Content-Type': 'application/xml' } }
  )
  const result = await parseXml(response.data)

  if (result.return_code !== 'SUCCESS') {
    throw new Error(`统一下单通信失败: ${result.return_msg}`)
  }
  if (result.result_code !== 'SUCCESS') {
    throw new Error(`统一下单业务失败: ${result.err_code_des || result.err_code}`)
  }
  return result
}

function generatePaymentParams(prepayId) {
  const timeStamp = Math.floor(Date.now() / 1000).toString()
  const nonceStr  = generateNonceStr()
  const pkg       = `prepay_id=${prepayId}`
  const signStr   = `appId=${APPID}&nonceStr=${nonceStr}&package=${pkg}&signType=MD5&timeStamp=${timeStamp}&key=${API_KEY}`
  const paySign   = crypto.createHash('md5').update(signStr).digest('hex').toUpperCase()
  return { appId: APPID, timeStamp, nonceStr, package: pkg, signType: 'MD5', paySign }
}

function generateSign(params) {
  const str = Object.keys(params)
    .filter(k => k !== 'sign' && params[k] !== '' && params[k] != null)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&')
  return crypto.createHash('md5').update(`${str}&key=${API_KEY}`).digest('hex').toUpperCase()
}

function verifySign(params) {
  const { sign, ...rest } = params
  return sign === generateSign(rest)
}

function generateOrderNo() {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const d   = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const r   = Math.random().toString(36).substring(2, 10).toUpperCase()
  return `PAY${d}${r}`
}

function generateNonceStr() {
  return Math.random().toString(36).substring(2, 18).toUpperCase()
}

function objectToXml(obj) {
  const inner = Object.entries(obj)
    .map(([k, v]) => `<${k}><![CDATA[${v}]]></${k}>`)
    .join('')
  return `<xml>${inner}</xml>`
}

async function parseXml(xmlStr) {
  const raw    = await xml2js.parseStringPromise(xmlStr, { explicitArray: false })
  const xmlObj = raw.xml || raw
  const result = {}
  for (const [k, v] of Object.entries(xmlObj)) {
    result[k] = typeof v === 'object' && v !== null && v._ != null ? v._ : String(v)
  }
  return result
}

function xmlResponse(returnCode, returnMsg) {
  return `<xml><return_code><![CDATA[${returnCode}]]></return_code><return_msg><![CDATA[${returnMsg}]]></return_msg></xml>`
}
