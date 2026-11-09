<template>
  <div class="portal">
    <NavBar title="业务门户" :show-back="false" />

    <main class="content">
      <h1>{{projectName}}</h1>
      <p class="subtitle">Hydro 业务模块模板 · 浏览器内 bridge 走 Mock</p>

      <section class="card">
        <h2>桥接能力</h2>
        <button class="btn" :disabled="loading" @click="scan">扫码（Mock）</button>
        <p v-if="scanResult" class="result">扫码结果：{{ scanResult }}</p>
      </section>

      <section class="card">
        <h2>e2e 链路</h2>
        <p class="hint">壳内依次验证：原生登录 → H5 → 扫码 → 弱网离线包兜底 → 升级提示</p>
        <div class="actions">
          <button class="btn ghost" @click="loadToken">读取登录态</button>
          <button class="btn ghost" @click="checkUpdate">检查更新</button>
          <button class="btn ghost" @click="showStats">Bridge 指标</button>
        </div>
        <p v-if="token" class="result">token：{{ token }}</p>
        <p v-if="updateStatus" class="result">更新：{{ updateStatus }}</p>
        <p v-if="stats" class="result">指标：{{ stats }}</p>
        <p class="hint">弱网场景：离线包命中时由壳容器直接读本地资源，未命中回退网络。</p>
      </section>

      <section class="card">
        <h2>公共 SDK</h2>
        <button class="btn ghost" @click="toast">Toast 提示</button>
      </section>
    </main>

    <Toast :visible="toastVisible" :message="toastMessage" />
    <Loading :visible="loading" text="调用中" />
  </div>
</template>

<script setup lang="ts">
import { bridge } from '@hydro/bridge-sdk'
import { Loading, NavBar, Toast } from '@hydro/web-sdk'
import { ref } from 'vue'

const loading = ref(false)
const scanResult = ref('')
const toastVisible = ref(false)
const toastMessage = ref('')
const token = ref('')
const stats = ref('')
const updateStatus = ref('')

function showToast(message: string): void {
  toastMessage.value = message
  toastVisible.value = true
  setTimeout(() => (toastVisible.value = false), 2000)
}

async function loadToken(): Promise<void> {
  loading.value = true
  try {
    const result = (await bridge.auth.getToken()) as { token?: string }
    token.value = result.token ?? '（未登录）'
  } catch (error) {
    showToast(error instanceof Error ? error.message : '读取登录态失败')
  } finally {
    loading.value = false
  }
}

async function checkUpdate(): Promise<void> {
  loading.value = true
  try {
    const result = (await bridge.app.checkUpdate()) as { hasUpdate?: boolean; latest?: string }
    updateStatus.value = result.hasUpdate ? `发现新版本 ${result.latest ?? ''}` : '已是最新版本'
    showToast(updateStatus.value)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '检查更新失败')
  } finally {
    loading.value = false
  }
}

function showStats(): void {
  const items = bridge.metrics.snapshotTotal()
  stats.value = items.length
    ? items.map((item) => `${item.name} ${item.calls} 次 / 成功 ${item.success}`).join('；')
    : '暂无调用'
}

async function scan(): Promise<void> {
  loading.value = true
  try {
    const result = (await bridge.device.scan({ types: ['qrCode'] })) as { text: string }
    scanResult.value = result.text
  } catch (error) {
    showToast(error instanceof Error ? error.message : '扫码失败')
  } finally {
    loading.value = false
  }
}

function toast(): void {
  showToast('Hello Hydro')
}
</script>

<style>
.portal {
  min-height: 100vh;
  background: #f5f7fa;
  color: #1f2937;
}
.content {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 20px 64px;
}
h1 {
  font-size: 28px;
  margin: 8px 0;
}
.subtitle {
  color: #6b7280;
  font-size: 14px;
}
.card {
  margin-top: 24px;
  padding: 20px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
}
.card h2 {
  font-size: 16px;
  margin: 0 0 16px;
}
.btn {
  height: 40px;
  padding: 0 20px;
  border: none;
  border-radius: 20px;
  background: #2563eb;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
.btn.ghost {
  background: #eff6ff;
  color: #2563eb;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.hint {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.6;
}
.result {
  margin-top: 12px;
  font-size: 13px;
  color: #059669;
  word-break: break-all;
}
</style>
