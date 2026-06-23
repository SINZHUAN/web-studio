import request from './request'
import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

// 登录接口（不需要 JWT，单独处理）
export async function login({ email, password }) {
  const res = await axios.post(`${BASE_URL}/auth_clo`, {
    action: 'login',
    email,
    password
  }, { timeout: 15000 })
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
  return data
}

// 验证 Token
export async function verifyToken() {
  return request.post('/auth_clo', { action: 'verify' })
}

// 创建员工账号（仅 admin 可用）
export async function createUser({ email, password, name, role = 'editor' }) {
  return request.post('/auth_clo', { action: 'createUser', email, password, name, role })
}

// 获取所有员工列表（仅 admin 可用）
export async function listUsers() {
  return request.post('/auth_clo', { action: 'listUsers' })
}

// 禁用/启用员工账号（仅 admin 可用）
export async function toggleUser({ userId, isActive }) {
  return request.post('/auth_clo', { action: 'toggleUser', userId, isActive })
}

// 修改密码
export async function changePassword({ oldPassword, newPassword }) {
  return request.post('/auth_clo', { action: 'changePassword', oldPassword, newPassword })
}

// 删除员工账号（仅 admin 可用）
export async function deleteUser({ userId }) {
  return request.post('/auth_clo', { action: 'deleteUser', userId })
}

// 管理员重置员工密码（仅 admin 可用）
export async function adminResetPassword({ userId, newPassword }) {
  return request.post('/auth_clo', { action: 'adminResetPassword', userId, newPassword })
}

// 修改员工角色（仅 admin 可用）
export async function changeUserRole({ userId, role }) {
  return request.post('/auth_clo', { action: 'changeUserRole', userId, role })
}

// 解冻员工账号（仅 admin 可用）
export async function unfreezeUser({ userId }) {
  return request.post('/auth_clo', { action: 'unfreezeUser', userId })
}
