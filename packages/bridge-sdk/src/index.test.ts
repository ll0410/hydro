import { API_REGISTRY, ErrorCode } from '@hydro/shared'
import { describe, expect, it } from 'vitest'
import { bridge, createBridge } from './index'
import { MockBridge } from './mock-bridge'

describe('createBridge', () => {
  it('浏览器环境默认实例化 MockBridge', () => {
    const instance = createBridge({ env: 'browser' })
    expect(instance).toBeInstanceOf(MockBridge)
  })

  it('壳环境实例化 RealBridge', () => {
    const instance = createBridge({ env: 'shell', real: { host: { post: () => {} } } })
    expect(instance.constructor.name).toBe('RealBridge')
  })

  it('按注册表挂载全部命名空间与方法', () => {
    const instance = createBridge({ env: 'browser', mock: { latencyMs: 0 } })
    for (const [ns, methods] of Object.entries(API_REGISTRY)) {
      const namespace = (instance as unknown as Record<string, Record<string, unknown>>)[ns]
      expect(namespace, ns).toBeDefined()
      for (const method of Object.keys(methods)) {
        expect(typeof namespace?.[method], `${ns}.${method}`).toBe('function')
      }
    }
  })

  it('vitest 环境全局 bridge.device.scan 走 Mock 并返回 fixtures 数据', async () => {
    const result = (await bridge.device.scan({ types: ['qrCode'] })) as { text: string }
    expect(result.text).toContain('https://')
    expect(bridge.logger.entries().at(-1)?.code).toBe(ErrorCode.Success)
  })
})
