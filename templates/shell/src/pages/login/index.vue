<template>
  <view class="login">
    <view class="title">统一登录</view>
    <view class="subtitle">登录后 token 由壳统一管理，H5 全域可用</view>

    <input class="input" v-model="account" placeholder="账号" />
    <button class="btn" :loading="loading" @click="submit">登录</button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import hydroConfig from '../../../hydro.config'
import { authStore } from '../../store/auth'

const account = ref('demo')
const loading = ref(false)

async function submit(): Promise<void> {
  if (loading.value) return
  loading.value = true
  try {
    await authStore.login(account.value)
    uni.navigateTo({
      url: `/pages/webview/index?url=${encodeURIComponent(hydroConfig.webEntry)}`,
    })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login {
  padding: 96rpx 48rpx;
}
.title {
  font-size: 48rpx;
  font-weight: 700;
}
.subtitle {
  margin-top: 16rpx;
  font-size: 26rpx;
  color: #6b7280;
}
.input {
  margin-top: 64rpx;
  height: 88rpx;
  padding: 0 24rpx;
  border-radius: 16rpx;
  background: #fff;
  border: 1rpx solid #e5e7eb;
}
.btn {
  margin-top: 48rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  background: #2563eb;
  color: #fff;
}
</style>
