import { ErrorCode, type BridgeRequest, type BridgeResponse } from '@hydro/shared'
import { BaseBridge, type BridgeOptions } from './core'

/** 壳原生插件注入的通道对象 */
export interface BridgeHost {
  /** H5 → Native：发送序列化后的请求报文 */
  post(message: string): void
}

export interface RealBridgeOptions extends BridgeOptions {
  /** 可注入通道（默认取 window.__HYDRO_BRIDGE__），便于单测 */
  host?: BridgeHost
}

interface PendingEntry {
  resolve: (response: BridgeResponse) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * 壳内真实桥：
 * - 下行：`host.post(JSON.stringify(request))`
 * - 上行：原生调用 `window.__bridgeCallback__(id, response)`
 * - `id → pending Promise` 映射，超时自动以 504 reject
 */
export class RealBridge extends BaseBridge {
  private readonly pending = new Map<string, PendingEntry>()
  private readonly explicitHost?: BridgeHost

  constructor(options: RealBridgeOptions = {}) {
    super(options)
    this.explicitHost = options.host
    if (typeof window !== 'undefined') {
      window.__bridgeCallback__ = (id, payload) => this.handleCallback(id, payload)
    }
  }

  private get host(): BridgeHost {
    if (this.explicitHost) return this.explicitHost
    if (typeof window !== 'undefined' && window.__HYDRO_BRIDGE__) {
      return window.__HYDRO_BRIDGE__
    }
    throw new Error('window.__HYDRO_BRIDGE__ is not injected')
  }

  protected dispatch(request: BridgeRequest, timeout: number): Promise<BridgeResponse> {
    let host: BridgeHost
    try {
      host = this.host
    } catch (error) {
      return Promise.resolve({
        id: request.id,
        code: ErrorCode.NativeError,
        msg: error instanceof Error ? error.message : String(error),
      })
    }

    return new Promise<BridgeResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id)
        resolve({
          id: request.id,
          code: ErrorCode.Timeout,
          msg: `bridge invoke timeout after ${timeout}ms`,
        })
      }, timeout)

      this.pending.set(request.id, { resolve, timer })

      try {
        host.post(JSON.stringify(request))
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(request.id)
        resolve({
          id: request.id,
          code: ErrorCode.NativeError,
          msg: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }

  /** 原生回调入口（由 window.__bridgeCallback__ 调用，单测可直接注入） */
  handleCallback(id: string, payload: unknown): void {
    let data = payload
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch {
        this.settle(id, { id, code: ErrorCode.NativeError, msg: 'invalid callback payload' })
        return
      }
    }

    // 事件信封：{ event, payload, ts }，走事件总线
    if (this.emitFromEnvelope(data)) return

    if (typeof data !== 'object' || data === null) {
      this.settle(id, { id, code: ErrorCode.NativeError, msg: 'invalid callback payload' })
      return
    }

    const response = data as BridgeResponse
    this.settle(id, { ...response, id })
  }

  private settle(id: string, response: BridgeResponse): void {
    const entry = this.pending.get(id)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pending.delete(id)
    entry.resolve(response)
  }

  /** 释放监听（页面销毁时调用） */
  destroy(): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.resolve({ id, code: ErrorCode.NativeError, msg: 'bridge destroyed' })
    }
    this.pending.clear()
    if (typeof window !== 'undefined') {
      delete window.__bridgeCallback__
    }
  }
}
