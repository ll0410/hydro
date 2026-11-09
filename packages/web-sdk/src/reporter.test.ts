import { describe, expect, it, vi } from 'vitest'
import { Reporter, installExitFlush, type EventTargetLike, type ReporterBridge } from './reporter'

function makeBridge() {
  const report = vi.fn(async (_params?: Record<string, unknown>) => ({ accepted: true }))
  const bridge = { util: { report } } as unknown as ReporterBridge
  return { bridge, report }
}

describe('Reporter', () => {
  it('track 入缓冲，flush 统一上报并清空', async () => {
    const { bridge, report } = makeBridge()
    const reporter = new Reporter({ bridge, autoFlush: false })
    reporter.track('page_view', { path: '/home' })
    reporter.track('click', { id: 'submit' })
    expect(reporter.pending()).toBe(2)

    await reporter.flush()
    expect(report).toHaveBeenCalledOnce()
    const payload = report.mock.calls[0]![0] as { events: Array<{ name: string }> }
    expect(payload.events.map((event) => event.name)).toEqual(['page_view', 'click'])
    expect(reporter.pending()).toBe(0)
  })

  it('达到 batchSize 自动 flush', async () => {
    const { bridge, report } = makeBridge()
    const reporter = new Reporter({ bridge, batchSize: 3, autoFlush: false })
    reporter.track('a')
    reporter.track('b')
    reporter.track('c')

    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce())
    expect(reporter.pending()).toBe(0)
  })

  it('上报失败时数据回填等待重试', async () => {
    const { bridge } = makeBridge()
    const report = vi.fn().mockRejectedValueOnce(new Error('network'))
    ;(bridge.util as unknown as { report: typeof report }).report = report
    const reporter = new Reporter({ bridge, autoFlush: false })
    reporter.track('a')

    await reporter.flush()
    expect(reporter.pending()).toBe(1)

    report.mockResolvedValueOnce({ accepted: true })
    await reporter.flush()
    expect(reporter.pending()).toBe(0)
  })

  it('空缓冲 flush 不调用上报', async () => {
    const { bridge, report } = makeBridge()
    const reporter = new Reporter({ bridge, autoFlush: false })
    await reporter.flush()
    expect(report).not.toHaveBeenCalled()
  })

  it('stop 关闭定时器', () => {
    const { bridge } = makeBridge()
    const reporter = new Reporter({ bridge, flushIntervalMs: 10 })
    reporter.stop()
    expect(() => reporter.stop()).not.toThrow()
  })
})

describe('installExitFlush', () => {
  function fakeTarget(): {
    target: EventTargetLike
    dispatch: (type: string) => void
    listeners: Map<string, Set<() => void>>
  } {
    const listeners = new Map<string, Set<() => void>>()
    const target: EventTargetLike = {
      addEventListener(type, listener) {
        const set = listeners.get(type) ?? new Set()
        set.add(listener)
        listeners.set(type, set)
      },
      removeEventListener(type, listener) {
        listeners.get(type)?.delete(listener)
      },
    }
    return {
      target,
      listeners,
      dispatch: (type) => listeners.get(type)?.forEach((listener) => listener()),
    }
  }

  it('pagehide / visibilitychange 触发 flush，解绑后不再触发', async () => {
    const { bridge, report } = makeBridge()
    const reporter = new Reporter({ bridge, autoFlush: false })
    const { target, dispatch } = fakeTarget()
    const unbind = installExitFlush(reporter, target)

    reporter.track('exit')
    dispatch('pagehide')
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce())

    reporter.track('again')
    dispatch('visibilitychange')
    await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(2))

    unbind()
    reporter.track('after-unbind')
    dispatch('pagehide')
    expect(reporter.pending()).toBe(1)
  })
})
