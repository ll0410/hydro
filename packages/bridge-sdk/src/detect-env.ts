/** 运行环境判定 */

export type BridgeEnv = 'shell' | 'browser'

/**
 * 壳原生插件会向 WebView 注入 `window.__HYDRO_BRIDGE__`；
 * 存在即视为运行在壳内，否则为纯浏览器（走 Mock）。
 */
export function detectEnv(candidate?: unknown): BridgeEnv {
  const scope = candidate ?? (typeof window === 'undefined' ? undefined : window)
  if (!scope || typeof scope !== 'object') return 'browser'
  return '__HYDRO_BRIDGE__' in scope && !!(scope as { __HYDRO_BRIDGE__?: unknown }).__HYDRO_BRIDGE__
    ? 'shell'
    : 'browser'
}
