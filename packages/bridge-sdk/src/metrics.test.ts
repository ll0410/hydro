import { ErrorCode } from '@hydro/shared'
import { describe, expect, it } from 'vitest'
import { BridgeMetrics } from './metrics'

describe('BridgeMetrics', () => {
  it('按方法聚合成功 / 失败 / 超时与耗时', () => {
    const metrics = new BridgeMetrics()
    metrics.record('device.scan', ErrorCode.Success, 42)
    metrics.record('device.scan', ErrorCode.Timeout, 15_000)
    metrics.record('device.scan', ErrorCode.Forbidden, 5)
    metrics.record('auth.getToken', ErrorCode.Success, 8)

    const items = metrics.snapshot()
    expect(items).toHaveLength(2)

    const scan = items.find((item) => item.name === 'device.scan')
    expect(scan).toMatchObject({
      calls: 3,
      success: 1,
      fail: 1,
      timeout: 1,
      totalCost: 15_047,
      maxCost: 15_000,
    })
    expect(items.find((item) => item.name === 'auth.getToken')?.calls).toBe(1)
  })

  it('drain 只清空窗口指标，累计指标保留', () => {
    const metrics = new BridgeMetrics()
    metrics.record('ui.toast', ErrorCode.Success, 3)

    expect(metrics.drain()).toHaveLength(1)
    expect(metrics.snapshot()).toEqual([])
    expect(metrics.snapshotTotal()).toHaveLength(1)
    expect(metrics.snapshotTotal()[0]?.calls).toBe(1)
  })
})
