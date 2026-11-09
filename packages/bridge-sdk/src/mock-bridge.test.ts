import { ErrorCode } from '@hydro/shared'
import { describe, expect, it, vi } from 'vitest'
import { createBridge } from './index'
import { BridgeError } from './core'
import { createMemoryStorage } from './fixtures'
import { BridgeLogger } from './logger'
import type { MockBridgeOptions } from './mock-bridge'

function mockBridge(mock: MockBridgeOptions = {}) {
  const logger = new BridgeLogger()
  return {
    bridge: createBridge({ env: 'browser', logger, mock: { latencyMs: 0, ...mock } }),
    logger,
  }
}

describe('MockBridge', () => {
  it('invoke 成功返回 fixtures 数据并记录日志', async () => {
    const { bridge, logger } = mockBridge()
    const result = (await bridge.device.scan({ types: ['qrCode'] })) as { text: string }
    expect(result.text).toContain('https://')
    const [log] = logger.entries()
    expect(log?.name).toBe('device.scan')
    expect(log?.code).toBe(ErrorCode.Success)
    expect(log?.request?.params).toEqual({ types: ['qrCode'] })
  })

  it('默认 300ms 延迟可被覆盖', async () => {
    const { bridge } = mockBridge({ latencyMs: 10 })
    const started = Date.now()
    await bridge.ui.toast({ message: 'hi' })
    expect(Date.now() - started).toBeGreaterThanOrEqual(10)
  })

  it('按失败率注入错误码', async () => {
    const { bridge } = mockBridge({ failureRate: 1, errorCode: ErrorCode.Forbidden })
    await expect(bridge.auth.getToken()).rejects.toMatchObject({
      name: 'BridgeError',
      code: ErrorCode.Forbidden,
    })
  })

  it('按超时率注入 504', async () => {
    const { bridge } = mockBridge({ timeoutRate: 1 })
    const error = await bridge.device.scan().catch((err: unknown) => err)
    expect(error).toBeInstanceOf(BridgeError)
    expect((error as BridgeError).code).toBe(ErrorCode.Timeout)
  })

  it('未注册 fixture 返回 404', async () => {
    const { bridge } = mockBridge()
    await expect(bridge.invoke('ui', 'unknown')).rejects.toMatchObject({ code: ErrorCode.NotFound })
  })

  it('fixture 抛错转换为原生异常', async () => {
    const { bridge } = mockBridge({
      fixtures: {
        'device.scan': () => {
          throw new Error('fixture boom')
        },
      },
    })
    await expect(bridge.device.scan()).rejects.toMatchObject({
      code: ErrorCode.NativeError,
      message: 'fixture boom',
    })
  })

  it('支持自定义 fixtures', async () => {
    const { bridge } = mockBridge({
      fixtures: { 'device.scan': () => ({ text: 'custom-scan' }) },
    })
    await expect(bridge.device.scan()).resolves.toEqual({ text: 'custom-scan' })
  })

  it('登录态与剪贴板可通过注入 storage 持久化', async () => {
    const storage = createMemoryStorage()
    const { bridge } = mockBridge({ storage })

    const login = (await bridge.auth.login({ account: 'tester' })) as { token: string }
    expect(login.token).toBe('mock-token')
    const token = (await bridge.auth.getToken()) as { token: string }
    expect(token.token).toBe('mock-token')

    await bridge.device.clipboard({ action: 'write', text: 'hydro' })
    await expect(bridge.device.clipboard({ action: 'read' })).resolves.toEqual({ text: 'hydro' })

    await bridge.auth.logout()
    const refreshed = (await bridge.auth.getToken()) as { token: string }
    expect(refreshed.token).toBe('mock-token')
  })

  it('事件总线 on / off / emit', () => {
    const { bridge } = mockBridge()
    const handler = vi.fn()
    const off = bridge.on('tokenRefreshed', handler)

    bridge.emit('tokenRefreshed', { token: 't', expiresAt: 1 })
    expect(handler).toHaveBeenCalledWith({ token: 't', expiresAt: 1 }, 'tokenRefreshed')

    off()
    bridge.emit('tokenRefreshed', { token: 't2', expiresAt: 2 })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('事件回调抛错不影响其他订阅者', () => {
    const { bridge } = mockBridge()
    const good = vi.fn()
    bridge.on('appStateChange', () => {
      throw new Error('bad handler')
    })
    bridge.on('appStateChange', good)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    bridge.emit('appStateChange', { state: 'background' })
    expect(good).toHaveBeenCalledOnce()
    spy.mockRestore()
  })
})
