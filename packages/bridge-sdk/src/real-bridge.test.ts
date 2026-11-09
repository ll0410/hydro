import { ErrorCode, type BridgeRequest } from '@hydro/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BridgeError } from './core'
import { createBridge, type Bridge } from './index'
import { BridgeLogger } from './logger'
import { RealBridge, type BridgeHost } from './real-bridge'

type ShellBridge = Bridge & Pick<RealBridge, 'handleCallback' | 'destroy'>

afterEach(() => {
  vi.unstubAllGlobals()
})

function setup(options: { timeout?: number; logger?: BridgeLogger } = {}): {
  bridge: ShellBridge
  host: BridgeHost
} {
  const host: BridgeHost = { post: vi.fn() }
  const bridge = createBridge({
    env: 'shell',
    logger: options.logger,
    real: { host, timeout: options.timeout ?? 1000 },
  }) as unknown as ShellBridge
  return { bridge, host }
}

function lastRequest(host: BridgeHost): BridgeRequest {
  const calls = (host.post as unknown as { mock: { calls: [string][] } }).mock.calls
  return JSON.parse(calls.at(-1)![0]) as BridgeRequest
}

describe('RealBridge', () => {
  it('postMessage 下行 + callback 回调上行完成调用闭环', async () => {
    const { bridge, host } = setup()
    const promise = bridge.device.scan({ types: ['qrCode'] })
    const request = lastRequest(host)
    expect(request.ns).toBe('device')
    expect(request.method).toBe('scan')

    bridge.handleCallback(request.id, { code: 0, data: { text: 'real-scan' }, msg: 'ok' })
    await expect(promise).resolves.toEqual({ text: 'real-scan' })
    expect(bridge.logger.entries()[0]?.code).toBe(ErrorCode.Success)
  })

  it('支持字符串形式的回调报文', async () => {
    const { bridge, host } = setup()
    const promise = bridge.auth.getToken()
    const request = lastRequest(host)
    bridge.handleCallback(request.id, JSON.stringify({ code: 0, data: { token: 't' } }))
    await expect(promise).resolves.toEqual({ token: 't' })
  })

  it('非法回调报文返回原生异常', async () => {
    const { bridge, host } = setup()
    const promise = bridge.ui.toast({ message: 'x' })
    const request = lastRequest(host)
    bridge.handleCallback(request.id, 'not-json')
    await expect(promise).rejects.toMatchObject({ code: ErrorCode.NativeError })
  })

  it('非对象回调返回原生异常', async () => {
    const { bridge, host } = setup()
    const promise = bridge.ui.toast()
    const request = lastRequest(host)
    bridge.handleCallback(request.id, 42)
    await expect(promise).rejects.toMatchObject({ code: ErrorCode.NativeError })
  })

  it('超时未回调以 504 reject', async () => {
    const { bridge } = setup({ timeout: 10 })
    const error = await bridge
      .invoke('device', 'scan', undefined, { timeout: 10 })
      .catch((err: unknown) => err)
    expect(error).toBeInstanceOf(BridgeError)
    expect((error as BridgeError).code).toBe(ErrorCode.Timeout)
  })

  it('post 抛错转换为原生异常', async () => {
    const host: BridgeHost = {
      post: () => {
        throw new Error('channel closed')
      },
    }
    const bridge = createBridge({ env: 'shell', real: { host } })
    await expect(bridge.device.scan()).rejects.toMatchObject({
      code: ErrorCode.NativeError,
      message: 'channel closed',
    })
  })

  it('事件信封走事件总线', async () => {
    const { bridge, host } = setup()
    const handler = vi.fn()
    bridge.on('offlinePackageUpdated', handler)
    const promise = bridge.app.getVersion()
    const request = lastRequest(host)
    bridge.handleCallback(request.id, {
      event: 'offlinePackageUpdated',
      payload: { version: '1.2.0' },
      ts: 1,
    })
    expect(handler).toHaveBeenCalledWith({ version: '1.2.0' }, 'offlinePackageUpdated')
    expect(bridge.logger.entries()).toHaveLength(0)
    // 未回调的请求最终会超时，测试内手动补齐回调以释放挂起 Promise
    bridge.handleCallback(request.id, { code: 0, data: {} })
    await promise
  })

  it('未知 id 的回调被忽略', () => {
    const { bridge } = setup()
    expect(() => bridge.handleCallback('nope', { code: 0 })).not.toThrow()
  })

  it('destroy 拒绝所有挂起请求', async () => {
    const { bridge } = setup()
    const promise = bridge.device.scan()
    bridge.destroy()
    await expect(promise).rejects.toMatchObject({ code: ErrorCode.NativeError })
  })

  it('通过 window 注入通道与回调入口', async () => {
    const host: BridgeHost = { post: vi.fn() }
    vi.stubGlobal('window', { __HYDRO_BRIDGE__: host })
    const bridge = createBridge({ env: 'shell', real: { timeout: 100 } }) as unknown as ShellBridge
    const promise = bridge.device.scan()
    const request = lastRequest(host)
    window.__bridgeCallback__!(request.id, { code: 0, data: { text: 'via-window' } })
    await expect(promise).resolves.toEqual({ text: 'via-window' })
    bridge.destroy()
    expect(window.__bridgeCallback__).toBeUndefined()
  })

  it('缺少通道时返回原生异常', async () => {
    const bridge = createBridge({ env: 'shell' })
    await expect(bridge.device.scan()).rejects.toMatchObject({ code: ErrorCode.NativeError })
  })

  it('日志会记录失败调用', async () => {
    const logger = new BridgeLogger()
    const { bridge, host } = setup({ logger })
    const promise = bridge.pay.invoke({ orderId: 'o1' })
    const request = lastRequest(host)
    bridge.handleCallback(request.id, { code: ErrorCode.Forbidden, msg: 'no permission' })
    await expect(promise).rejects.toMatchObject({ code: ErrorCode.Forbidden })
    expect(logger.entries()[0]?.name).toBe('pay.invoke')
    expect(logger.entries()[0]?.code).toBe(ErrorCode.Forbidden)
  })
})
