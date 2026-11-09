import { ErrorCode, type BridgeRequest, type BridgeResponse } from '@hydro/shared'
import { BaseBridge, type BridgeOptions } from './core'
import {
  createDefaultStorage,
  createFixtures,
  fixtureKey,
  type FixtureHandler,
  type StorageLike,
} from './fixtures'

export interface MockBridgeOptions extends BridgeOptions {
  /** 模拟网络延迟，默认 300ms */
  latencyMs?: number
  /** 失败率 0~1（返回错误码） */
  failureRate?: number
  /** 超时率 0~1（返回 504） */
  timeoutRate?: number
  /** failureRate 命中时使用的错误码，默认 500 */
  errorCode?: ErrorCode
  /** 随机源，测试可注入确定性函数 */
  random?: () => number
  /** 模拟持久化存储（登录态 / 剪贴板） */
  storage?: StorageLike
  /** 自定义 fixtures，按 `ns.method` 注册 */
  fixtures?: Record<string, FixtureHandler>
}

/**
 * 浏览器 Mock 桥：
 * - fixtures 数据对齐 `@hydro/shared`
 * - 默认 300ms 模拟延迟
 * - 可注入失败率 / 超时率 / 错误码，让 loading 与失败分支在浏览器里可调
 */
export class MockBridge extends BaseBridge {
  private readonly latencyMs: number
  private readonly failureRate: number
  private readonly timeoutRate: number
  private readonly errorCode: ErrorCode
  private readonly random: () => number
  private readonly storage: StorageLike
  private readonly fixtures: Record<string, FixtureHandler>

  constructor(options: MockBridgeOptions = {}) {
    super(options)
    this.latencyMs = options.latencyMs ?? 300
    this.failureRate = Math.min(Math.max(options.failureRate ?? 0, 0), 1)
    this.timeoutRate = Math.min(Math.max(options.timeoutRate ?? 0, 0), 1)
    this.errorCode = options.errorCode ?? ErrorCode.NativeError
    this.random = options.random ?? Math.random
    this.storage = options.storage ?? createDefaultStorage()
    this.fixtures = { ...createFixtures(this.storage), ...options.fixtures }
  }

  protected async dispatch(request: BridgeRequest, _timeout: number): Promise<BridgeResponse> {
    await delay(this.latencyMs)

    const roll = this.random()
    if (roll < this.timeoutRate) {
      return {
        id: request.id,
        code: ErrorCode.Timeout,
        msg: 'mock timeout',
      }
    }
    if (roll < this.timeoutRate + this.failureRate) {
      return {
        id: request.id,
        code: this.errorCode,
        msg: `mock failure (code=${this.errorCode})`,
      }
    }

    const handler = this.fixtures[fixtureKey(request.ns, request.method)]
    if (!handler) {
      return {
        id: request.id,
        code: ErrorCode.NotFound,
        msg: `mock fixture not found: ${request.ns}.${request.method}`,
      }
    }

    try {
      const data = handler(request.params, { storage: this.storage })
      return { id: request.id, code: ErrorCode.Success, data, msg: 'ok' }
    } catch (error) {
      return {
        id: request.id,
        code: ErrorCode.NativeError,
        msg: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}
