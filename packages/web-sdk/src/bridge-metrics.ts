import type { BridgeMetricItem } from '@hydro/bridge-sdk'
import type { Reporter } from './reporter'

/** 指标来源：bridge-sdk 的 BaseBridge.metrics */
export interface MetricsSource {
  metrics: {
    drain(): BridgeMetricItem[]
  }
}

/** 取出当前窗口指标并作为一条 bridge_stats 埋点入缓冲 */
export function flushBridgeMetrics(reporter: Reporter, bridge: MetricsSource): void {
  const items = bridge.metrics.drain()
  if (items.length === 0) return
  reporter.track('bridge_stats', { items })
}

/**
 * 周期性采集 bridge 调用指标 → reporter 缓冲 → 统一上报。
 * 返回停止函数。
 */
export function installBridgeMetricsReporter(
  reporter: Reporter,
  bridge: MetricsSource,
  options: { intervalMs?: number } = {},
): () => void {
  const intervalMs = options.intervalMs ?? 10_000
  const timer = setInterval(() => {
    flushBridgeMetrics(reporter, bridge)
  }, intervalMs)

  if (typeof timer === 'object' && timer && 'unref' in timer) {
    ;(timer as { unref: () => void }).unref()
  }

  return () => clearInterval(timer)
}

export interface HttpTransportOptions {
  /** 服务端 /metrics 地址，如 http://127.0.0.1:8787 */
  url: string
  app?: string
  fetchImpl?: typeof fetch
}

/** 直接 POST 到离线包服务的 /metrics 聚合接口 */
export function createHttpReportTransport(
  options: HttpTransportOptions,
): (events: unknown[]) => Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch
  return async (events) => {
    const response = await fetchImpl(`${options.url.replace(/\/$/, '')}/metrics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app: options.app, events }),
    })
    if (!response.ok) throw new Error(`metrics HTTP ${response.status}`)
    return response.json()
  }
}
