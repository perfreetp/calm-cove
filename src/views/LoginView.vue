<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="brand">
        <div class="logo">◈</div>
        <h1>无人机灯光秀<br />编队编排与运营后台</h1>
      </div>
      <el-form label-position="top" @submit.prevent="onLogin">
        <el-form-item label="账号">
          <el-input v-model="username" placeholder="请输入账号" size="large" :prefix-icon="User" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="password" type="password" show-password placeholder="请输入密码" size="large"
            :prefix-icon="Lock" @keyup.enter="onLogin" />
        </el-form-item>
        <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="onLogin">登 录</el-button>
      </el-form>

      <el-divider>演示账号（密码均为 123456）</el-divider>
      <div class="quick">
        <el-tag v-for="u in demoUsers" :key="u.username" class="quick-tag" @click="fill(u.username)">
          {{ roleText(u.role) }} · {{ u.username }}
        </el-tag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { useStore } from '@/store'
import { ROLE_LABEL } from '@/lib/labels'
import type { Role } from '@/types'

const router = useRouter()
const store = useStore()
const username = ref('planner1')
const password = ref('123456')
const loading = ref(false)

const demoUsers = [
  { username: 'planner1', role: 'planner' as Role },
  { username: 'pilot1', role: 'pilot' as Role },
  { username: 'admin', role: 'admin' as Role }
]

function roleText(r: Role) {
  return ROLE_LABEL[r]
}
function fill(name: string) {
  username.value = name
  password.value = '123456'
}
function onLogin() {
  loading.value = true
  const u = store.login(username.value.trim(), password.value)
  loading.value = false
  if (!u) {
    ElMessage.error('账号或密码错误')
    return
  }
  ElMessage.success(`欢迎，${u.name}`)
  router.push({ name: 'workbench' })
}
</script>

<style scoped>
.login-wrap {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(1200px 500px at 70% -10%, rgba(76, 141, 255, 0.18), transparent),
    radial-gradient(900px 500px at 10% 110%, rgba(255, 77, 109, 0.12), transparent),
    var(--bg-deep);
}

.login-card {
  width: 420px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 34px 32px 26px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
}

.brand {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 22px;
}

.logo {
  font-size: 40px;
  color: var(--accent);
  text-shadow: 0 0 24px rgba(76, 141, 255, 0.7);
}

h1 {
  font-size: 19px;
  line-height: 1.45;
  margin: 0;
}

.quick {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.quick-tag {
  cursor: pointer;
}
</style>
