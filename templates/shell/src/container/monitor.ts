/** 壳侧监控：白屏检测 + WebView 崩溃上报 */

import { bridge } from '@hydro/bridge-sdk'

export interface WhiteScreenInfo {
  url: string
  waitedMs: number
}

export interface WhiteScreenWatcher {
  markLoaded(): void
  stop(): void
}

export interface WhiteScreenOptions {
  timeoutMs?: number
  onTimeout?: (info: WhiteScreenInfo) => void
}

/**
 * 白屏检测（MVP）：页面加载超时即视为疑似白屏。
 * 最终判定需要原生截图 / 人工确认，这里先上报并提示。
 */
export function watchWhiteScreen(url: string, options: WhiteScreenOptions = {}): WhiteScreenWatcher {
  const timeoutMs = options.timeoutMs ?? 8_000
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | null = null
  let done = false

  timer = setTimeout(() => {
    if (done) return
    done = true
    const info: WhiteScreenInfo = { url, waitedMs: Date.now() - startedAt }
    console.warn('[Hydro] 疑似白屏：页面加载超时', info)
    void reportMonitor('white_screen', info)
    options.onTimeout?.(info)
  }, timeoutMs)

  return {
    markLoaded() {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
    },
    stop() {
      done = true
      if (timer) clearTimeout(timer)
    },
  }
}

/** 统一走 bridge.util.report，失败不阻塞业务 */
export function reportMonitor(name: string, props: Record<string, unknown>): Promise<unknown> {
  return bridge.util.report({ events: [{ name, ts: Date.now(), props }] }).catch((error) => {
    console.warn('[Hydro] 监控上报失败', error)
  })
}

/** WebView 崩溃上报（原生 onRenderProcessGone / webViewWebContentProcessDidTerminate 调用） */
export function reportWebViewCrash(reason: string): Promise<unknown> {
  return reportMonitor('webview_crash', { reason })
}
