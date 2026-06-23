<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router    = useRouter()

onMounted(async () => {
  // 应用启动时验证本地 token 是否仍有效
  // 避免"有 token 就直接进主页、但 token 已过期"的问题
  if (authStore.isLoggedIn) {
    const valid = await authStore.checkToken()
    if (!valid) {
      // checkToken 内部已调用 logout() 清空 localStorage
      router.replace({ name: 'Login' })
    }
  }
})
</script>
