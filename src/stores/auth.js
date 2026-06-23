import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as apiLogin, verifyToken } from '@/api/auth'

export const useAuthStore = defineStore('auth', () => {
  const token    = ref(localStorage.getItem('studio_token')    || '')
  const userId   = ref(localStorage.getItem('studio_userid')   || '')
  const userName = ref(localStorage.getItem('studio_username') || '')
  const userRole = ref(localStorage.getItem('studio_role')     || '')

  const isLoggedIn    = computed(() => !!token.value)
  const isAdmin       = computed(() => ['admin', 'superadmin'].includes(userRole.value))
  const isSuperAdmin  = computed(() => userRole.value === 'superadmin')

  async function login(email, password) {
    const res = await apiLogin({ email, password })
    if (res.success) {
      token.value    = res.token
      userId.value   = res.userId   || ''
      userName.value = res.name
      userRole.value = res.role || 'editor'
      localStorage.setItem('studio_token',    res.token)
      localStorage.setItem('studio_userid',   res.userId   || '')
      localStorage.setItem('studio_username', res.name)
      localStorage.setItem('studio_role',     res.role || 'editor')
      return { success: true }
    }
    return { success: false, message: res.message || '登录失败' }
  }

  async function checkToken() {
    if (!token.value) return false
    try {
      const res = await verifyToken()
      if (res.success) {
        // 每次验证都刷新 userId，确保持久化
        if (res.userId) {
          userId.value = res.userId
          localStorage.setItem('studio_userid', res.userId)
        }
        return true
      }
      // Token 无效（过期、被顶号等）：清理本地状态
      logout()
      return false
    } catch (err) {
      // HTTP 401 同样视为会话失效
      logout()
      return false
    }
  }

  function logout() {
    token.value    = ''
    userId.value   = ''
    userName.value = ''
    userRole.value = ''
    localStorage.removeItem('studio_token')
    localStorage.removeItem('studio_userid')
    localStorage.removeItem('studio_username')
    localStorage.removeItem('studio_role')
  }

  return { token, userId, userName, userRole, isLoggedIn, isAdmin, isSuperAdmin, login, logout, checkToken }
})
