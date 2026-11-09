<template>
  <view class="launch">
    <view class="logo">H</view>
    <view class="title">Hydro</view>
    <view class="subtitle">企业级通用 App 框架 · 薄壳 + H5</view>

    <view class="actions">
      <button class="btn primary" @click="goLogin">登录并进入</button>
      <button class="btn ghost" @click="openBusiness">直接打开业务</button>
    </view>

    <view class="debug-tip" v-if="config.debug">debug 构建 · 白名单放行</view>
  </view>
</template>

<script setup lang="ts">
import hydroConfig from '../../../hydro.config'
import { decideNavigation, openInSystemBrowser } from '../../container/whitelist'

const config = hydroConfig

function goLogin(): void {
  uni.navigateTo({ url: '/pages/login/index' })
}

function openBusiness(): void {
  const target = config.webEntry
  if (decideNavigation(target, config.whitelist, config.debug) === 'external') {
    openInSystemBrowser(target)
    return
  }
  uni.navigateTo({ url: `/pages/webview/index?url=${encodeURIComponent(target)}` })
}
</script>

<style scoped>
.launch {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 48rpx;
  box-sizing: border-box;
}
.logo {
  width: 144rpx;
  height: 144rpx;
  line-height: 144rpx;
  border-radius: 36rpx;
  background: linear-gradient(135deg, #2563eb, #06b6d4);
  color: #fff;
  font-size: 72rpx;
  font-weight: 700;
  text-align: center;
}
.title {
  margin-top: 32rpx;
  font-size: 56rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
}
.subtitle {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: #6b7280;
}
.actions {
  width: 100%;
  margin-top: 96rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: 30rpx;
}
.btn.primary {
  background: #2563eb;
  color: #fff;
}
.btn.ghost {
  background: #fff;
  color: #2563eb;
  border: 1rpx solid #bfdbfe;
}
.debug-tip {
  margin-top: 48rpx;
  font-size: 24rpx;
  color: #f59e0b;
}
</style>
