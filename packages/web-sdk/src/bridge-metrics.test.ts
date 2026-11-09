import { describe, expect, it, vi } from 'vitest'
import { flushBridgeMetrics } from './bridge-metrics'
import { Reporter, type ReporterBridge } from './reporter'

describe('flushBridgeMetrics', () => {
  it('把 bridge 指标转为 bridge_stats 埋点', async () => {
    const report = vi.fn(async (_params?: Record<string, unknown>) => ({ accepted: true }))
    const reporter = new Reporter({
      bridge: { util: { report } } as unknown as ReporterBridge,
      autoFlush: false,
    })

    const drain = vi.fn(() => [
      {
        name: 'device.scan',
        calls: 2,
        success: 2,
        fail: 0,
        timeout: 0,
        totalCost: 84,
        maxCost: 42,
      },
    ])

    flushBridgeMetrics(reporter, { metrics: { drain } })
    expect(drain).toHaveBeenCalledOnce()
    expect(reporter.pending()).toBe(1)

    await reporter.flush()
    const payload = report.mock.calls[0]![0] as {
      events: Array<{ name: string; props: { items: unknown[] } }>
    }
    expect(payload.events[0]?.name).toBe('bridge_stats')
    expect(payload.events[0]?.props.items).toHaveLength(1)
  })

  it('无指标时不产生埋点', () => {
    const report = vi.fn(async () => ({ accepted: true }))
    const reporter = new Reporter({
      bridge: { util: { report } } as unknown as ReporterBridge,
      autoFlush: false,
    })
    flushBridgeMetrics(reporter, { metrics: { drain: () => [] } })
    expect(reporter.pending()).toBe(0)
  })
})
