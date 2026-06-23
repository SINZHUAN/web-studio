import axios from 'axios'
import { ElMessage } from 'element-plus'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

const request = axios.create({
  baseURL: BASE_URL,
  timeout: 120000,  // AI 接口耗时较长，120秒超时
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截：自动携带 JWT Token
request.interceptors.request.use(
  config => {
    const token = localStorage.getItem('studio_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    if (import.meta.env.DEV) {
      console.log(`[API] → ${config.method?.toUpperCase()} ${config.url}`, config.data)
    }
    return config
  },
  error => Promise.reject(error)
)

// 响应拦截：统一错误处理
request.interceptors.response.use(
  res => {
    // 云函数 HTTP 触发器返回结构：{ statusCode, body: '{"success":true,...}' }
    // 或者直接返回 JSON 对象（取决于云函数写法）
    const data = res.data
    let result
    if (typeof data === 'string') {
      try { result = JSON.parse(data) } catch { result = data }
    } else {
      result = data
    }
    if (import.meta.env.DEV) {
      console.log(`[API] ← ${res.config?.url}`, result)
    }
    return result
  },
  error => {
    const status = error.response?.status
    if (import.meta.env.DEV) {
      console.error(`[API] ✕ ${error.config?.url} [${status}]`, error.response?.data)
    }
    if (status === 401) {
      // Token 过期或账号在其他设备登录（单点登录互踢），清除状态并跳回登录页
      let msg = '登录已失效，请重新登录'
      try {
        const body = typeof error.response?.data === 'string'
          ? JSON.parse(error.response.data)
          : error.response?.data
        if (body?.message) msg = body.message
      } catch { /* ignore */ }
      ElMessage.warning(msg)
      localStorage.removeItem('studio_token')
      localStorage.removeItem('studio_userid')
      localStorage.removeItem('studio_username')
      localStorage.removeItem('studio_role')
      setTimeout(() => { window.location.href = '/login' }, 1200)
      return Promise.reject(error)
    }
    if (status === 500) {
      ElMessage.error('服务器错误，请稍后重试')
    } else if (!error.response) {
      ElMessage.error('网络连接失败，请检查网络')
    }
    return Promise.reject(error)
  }
)

export default request
