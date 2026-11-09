import type { BridgeHost } from './real-bridge'

declare global {
  interface Window {
    /** 壳原生插件注入的双向通道对象 */
    __HYDRO_BRIDGE__?: BridgeHost
    /** 原生 → H5 回调入口 */
    __bridgeCallback__?: (id: string, payload: unknown) => void
  }
}
