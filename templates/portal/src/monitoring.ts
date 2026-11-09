/** 监控接线：bridge 指标 → reporter 缓冲 → /metrics */
import { bridge } from '@hydro/bridge-sdk'
import { Reporter, createHttpReportTransport, installBridgeMetricsReporter } from '@hydro/web-sdk'

const metricsUrl = import.meta.env.VITE_HYDRO_METRICS_URL as string | undefined
const appId = (import.meta.env.VITE_HYDRO_APP as string | undefined) ?? 'portal'

export function setupMonitoring(): () => void {
  const reporter = new Reporter({
    batchSize: 10,
    flushIntervalMs: 10_000,
    transport: metricsUrl
      ? createHttpReportTransport({ url: metricsUrl, app: appId })
      : undefined,
  })

  const stopMetrics = installBridgeMetricsReporter(reporter, bridge)
  const flush = () => {
    void reporter.flush()
  }
  window.addEventListener('pagehide', flush)

  return () => {
    window.removeEventListener('pagehide', flush)
    stopMetrics()
    reporter.stop()
  }
}
