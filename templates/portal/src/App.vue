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

async function scan(): Promise<void> {
  loading.value = true
  try {
    const result = (await bridge.device.scan({ types: ['qrCode'] })) as { text: string }
    scanResult.value = result.text
  } catch (error) {
    toastMessage.value = error instanceof Error ? error.message : '扫码失败'
    toastVisible.value = true
    setTimeout(() => (toastVisible.value = false), 2000)
  } finally {
    loading.value = false
  }
}

function toast(): void {
  toastMessage.value = 'Hello Hydro'
  toastVisible.value = true
  setTimeout(() => (toastVisible.value = false), 2000)
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
.result {
  margin-top: 12px;
  font-size: 13px;
  color: #059669;
  word-break: break-all;
}
</style>
