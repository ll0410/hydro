<template>
  <web-view :src="url" @load="onWebViewLoaded" @message="onMessage" @error="onError" />
</template>

<script setup lang="ts">
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { ref } from 'vue'
import hydroConfig from '../../../hydro.config'
import { watchWhiteScreen, type WhiteScreenWatcher } from '../../container/monitor'
import { decideNavigation, openInSystemBrowser } from '../../container/whitelist'
import { webViewPool } from '../../container/webview-pool'

const url = ref(hydroConfig.webEntry)
let slotId = ''
let whiteScreenWatcher: WhiteScreenWatcher | null = null

onLoad((query?: Record<string, string | undefined>) => {
  const target =
    typeof query?.url === 'string' ? decodeURIComponent(query.url) : hydroConfig.webEntry

  if (decideNavigation(target, hydroConfig.whitelist, hydroConfig.debug) === 'external') {
    console.warn(`[Hydro] 非白名单地址，交由系统浏览器打开：${target}`)
    openInSystemBrowser(target)
    return
  }

  const slot = webViewPool.borrow(target)
  slotId = slot.id
  url.value = target
  console.info(`[Hydro] 容器载入 ${target}（${slot.id}）`)

  whiteScreenWatcher = watchWhiteScreen(target, {
    onTimeout: () => {
      uni.showModal({
        title: '页面加载超时',
        content: '疑似白屏，请检查网络或重试',
        confirmText: '重试',
        success: (result) => {
          if (result.confirm) uni.redirectTo({ url: `/pages/webview/index?url=${encodeURIComponent(target)}` })
        },
      })
    },
  })
})

onUnload(() => {
  whiteScreenWatcher?.stop()
  if (slotId) webViewPool.release(slotId)
})

function onWebViewLoaded(): void {
  whiteScreenWatcher?.markLoaded()
  console.info('[Hydro] web-view load 完成')
}

function onMessage(event: { detail?: { data?: unknown[] } }): void {
  console.info('[Hydro] web-view message', event.detail?.data)
}

function onError(event: unknown): void {
  console.warn('[Hydro] web-view load error', event)
}
</script>
