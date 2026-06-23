<template>
  <div class="login-page">
    <!-- 左上角品牌标题 -->
    <div class="brand-box">
      <img class="brand-logo" :src="brandLogo" alt="天鹿品牌" />
      <div class="brand-version">Ver. 1.1.5.2026.4</div>
    </div>

    <div class="login-card">
      <!-- 左侧欢迎区 -->
      <div class="login-welcome">
        <img class="welcome-illustration" :src="welcomeImg" alt="welcome" />
      </div>

      <!-- 右侧登录区 -->
      <div class="login-panel">
        <div class="login-header">
          <div class="login-logo"></div>
        </div>

        <p class="login-welcome-text">欢迎回来</p>

        <!-- 登录表单 -->
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          :show-message="false"
          class="login-form"
          @keyup.enter="handleLogin"
        >
          <el-form-item prop="email">
            <el-input
              v-model="form.email"
              placeholder="请输入账号"
              size="large"
              :prefix-icon="User"
              autocomplete="username"
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              size="large"
              :prefix-icon="Lock"
              show-password
              autocomplete="current-password"
            />
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              size="large"
              class="login-btn"
              :loading="loading"
              @click="handleLogin"
            >
              {{ loading ? '登录中...' : '登录' }}
            </el-button>
          </el-form-item>
        </el-form>

        <p class="login-tip">账号由管理员创建，如有问题请联系管理员</p>

        <!-- 测试快速填充（开发环境专用） -->
        <div v-if="isDev" class="dev-quick-fill">
          <span class="dev-label">DEV</span>
          <button class="dev-btn" @click="quickFill">一键填充测试账号</button>
        </div>
      </div>
    </div>

    <!-- 登录页底部品牌图标（仅图标） -->
    <div class="login-brand-icons">
      <img class="brand-icon" :src="brandDouyin" alt="douyin" />
      <img class="brand-icon brand-icon--lg" :src="brandGzh" alt="gongzhonghao" />
      <img class="brand-icon brand-icon--lg" :src="brandTaobao" alt="taobao" />
      <img class="brand-icon brand-icon--lg" :src="brandTianmao" alt="tianmao" />
      <img class="brand-icon" :src="brandXianyu" alt="xianyu" />
      <img class="brand-icon" :src="brandXiaohongshu" alt="xiaohongshu" />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import welcomeImg from '@images/b_max.png'
import brandLogo from '@images/logo.jpg'
import brandDouyin from '../../miniprogram/miniprogramImages/b_douyin.png'
import brandGzh from '@images/b_gongzhonghao.png'
import brandTaobao from '@images/b_taobao.png'
import brandTianmao from '@images/b_tianmao.png'
import brandXianyu from '../../miniprogram/miniprogramImages/b_xianyu.png'
import brandXiaohongshu from '../../miniprogram/miniprogramImages/b_xiaohongshu.png'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const formRef = ref(null)
const loading = ref(false)
const isDev = import.meta.env.DEV

const form = reactive({
  email: '',
  password: ''
})

function quickFill() {
  form.email = 'admin'
  form.password = 'jianda2026'
}

const rules = {
  email: [
    { required: true, message: '请输入账号', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' }
  ]
}

async function handleLogin() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    loading.value = true
    try {
      const res = await authStore.login(form.email, form.password)
      if (res.success) {
        ElMessage.success(`欢迎回来，${authStore.userName}`)
        const redirect = route.query.redirect || '/'
        router.push(redirect)
      } else {
        ElMessage.error(res.message || '登录失败，请检查账号和密码')
      }
    } catch (err) {
      ElMessage.error('登录请求失败，请检查网络连接')
    } finally {
      loading.value = false
    }
  })
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30px 20px 90px;
  position: relative;
}

.brand-logo {
  display: block;
  width: min(320px, 42vw);
  height: auto;
  object-fit: contain;
  user-select: none;
}

.brand-box {
  position: absolute;
  top: 32px;
  left: 40px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.brand-version {
  display: inline-block;
  font-size: 16px;
  font-weight: 500;
  color: rgba(21, 101, 192, 0.72);
  letter-spacing: 0.02em;
  line-height: 1.15;
  white-space: nowrap;
  transform: scale(0.92);
  transform-origin: left top;
}

.login-card {
  background: #fff;
  border-radius: 24px;
  padding: 0;
  width: 100%;
  max-width: 900px;
  min-height: 470px;
  margin-top: 69px;
  box-shadow: 0 30px 78px rgba(16, 24, 40, 0.22);
  border: 1px solid #edf1f7;
  display: grid;
  grid-template-columns: 1fr 1fr;
  overflow: hidden;
}

.login-welcome {
  background: #fff;
  border-right: 1px solid #edf1f7;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
}

.welcome-illustration {
  width: 100%;
  max-width: 450px;
  max-height: 490px;
  object-fit: contain;
  transform: translateY(16px);
}

.login-panel {
  padding: 52px 42px 34px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.login-header {
  text-align: center;
  margin-bottom: 20px;
}

.login-logo {
  font-size: 48px;
  margin-bottom: 12px;
  line-height: 1;
}

.login-title {
  font-size: 24px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 6px;
}

.login-subtitle {
  font-size: 13px;
  color: #999;
  margin: 0;
}

.login-form {
  margin-bottom: 16px;
}

.login-welcome-text {
  margin: 0 0 14px 13px;
  font-size: 21px;
  font-weight: 700;
  color: #1565C0;
  text-align: left;
  letter-spacing: 0.5px;
}

.login-btn {
  width: 100%;
  height: 48px;
  font-size: 16px;
  border-radius: 999px;
  background: #1565C0;
  border: none !important;
  --el-button-bg-color: #1565C0;
  --el-button-border-color: transparent;
  --el-button-hover-bg-color: #1565C0;
  --el-button-hover-border-color: transparent;
  --el-button-active-bg-color: #1565C0;
  --el-button-active-border-color: transparent;
}

.login-btn:hover {
  opacity: 0.9;
}

.login-tip {
  text-align: center;
  font-size: 12px;
  color: #bbb;
  margin: 0;
}

:deep(.el-input__wrapper) {
  border-radius: 999px;
  padding: 4px 12px;
}

/* 登录页不显示常驻红色告警样式，避免未操作时视觉干扰 */
:deep(.el-form-item.is-error .el-input__wrapper) {
  box-shadow: 0 0 0 1px #dcdfe6 inset !important;
}

.dev-quick-fill {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 10px 14px;
  background: rgb(230, 245, 255);
  border: 1px dashed rgb(61, 161, 255);
  border-radius: 999px;
}

.dev-label {
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: rgb(6, 91, 122);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.dev-btn {
  font-size: 13px;
  color: rgb(15, 82, 181);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.dev-btn:hover {
  color: rgb(40, 106, 250);
}

.login-brand-icons {
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
}

.brand-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  opacity: 0.92;
}

.brand-icon--lg {
  width: 32px;
  height: 32px;
}

@media (max-width: 980px) {
  .login-page {
    padding: 20px 14px 86px;
    align-items: flex-start;
  }

  .brand-box {
    position: static;
    align-self: flex-start;
    margin: 2px 0 12px;
  }

  .brand-logo {
    width: min(212px, 62vw);
  }

  .brand-version {
    font-size: 13px;
    transform: none;
  }

  .login-card {
    max-width: 760px;
    min-height: 0;
    grid-template-columns: 1fr;
  }

  .login-welcome {
    border-right: none;
    border-bottom: 1px solid #edf1f7;
    padding: 18px 16px;
  }

  .welcome-illustration {
    max-height: 220px;
  }

  .login-panel {
    padding: 26px 18px 22px;
  }

  .login-brand-icons {
    bottom: 18px;
    width: min(92vw, 360px);
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
  }

  .brand-icon {
    width: 24px;
    height: 24px;
    justify-self: center;
  }
}
</style>
