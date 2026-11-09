<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import hydroConfig from '../hydro.config'
import { installDebugBridge } from './container/debug-bridge'
import { webViewPool } from './container/webview-pool'

onLaunch(() => {
  installDebugBridge(hydroConfig)
  webViewPool.warmup(hydroConfig.webEntry)
  console.info(`[Hydro] 壳启动，webEntry=${hydroConfig.webEntry} debug=${hydroConfig.debug}`)
})
</script>

<style>
page {
  background-color: #f5f7fa;
  color: #1f2937;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei',
    sans-serif;
}
</style>
