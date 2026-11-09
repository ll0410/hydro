import {
  ErrorCode,
  getApiSpec,
  isEventName,
  type BridgeNamespace,
  type BridgeRequest,
  type BridgeResponse,
  type EventHandler,
  type EventMap,
  type EventName,
} from '@hydro/shared'
import { BridgeLogger } from './logger'
import { createApi } from './api'

/** 构造桥接实例时可注入的通用配置 */
export interface BridgeOptions {
  logger?: BridgeLogger
  /** 默认超时，优先级：调用参数 > 注册表 timeout > 此值 */
  timeout?: number
}

/** 单次调用可覆盖的选项 */
export interface InvokeOptions {
  timeout?: number
}

/** 默认超时 15s */
export const DEFAULT_TIMEOUT = 15_000

/** 桥接调用失败异常，携带协议错误码与原始响应 */
export class BridgeError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly response?: BridgeResponse,
  ) {
    super(message ?? `bridge invoke failed with code ${code}`)
    this.name = 'BridgeError'
  }
}

let seq = 0

/** 生成短请求 id（时间片 + 自增，避免同帧碰撞） */
function genId(): string {
  seq = (seq + 1) % 0xffffff
  return (Date.now().toString(16).slice(-4) + seq.toString(16).padStart(4, '0')).slice(-8)
}

/**
 * 双实现桥的公共基座：
 * - 统一构造请求、超时与错误处理
 * - 统一日志环形缓冲
 * - 事件总线 on / off / emit
 */
export abstract class BaseBridge {
  readonly logger: BridgeLogger
  protected readonly defaultTimeout: number
  private readonly listeners = new Map<
    EventName,
    Set<(payload: unknown, name: EventName) => void>
  >()

  constructor(options: BridgeOptions = {}) {
    this.logger = options.logger ?? new BridgeLogger()
    this.defaultTimeout = options.timeout ?? DEFAULT_TIMEOUT
    // 按注册表挂载 bridge.<ns>.<method>() 调用面，所有子类实例自动获得
    Object.assign(this, createApi(this))
  }

  /** 子类实现：把请求发出去并等待响应（不得抛错，异常需转换为 BridgeResponse） */
  protected abstract dispatch(request: BridgeRequest, timeout: number): Promise<BridgeResponse>

  /** 统一调用入口：业务侧一般使用 bridge.<ns>.<method>() */
  async invoke<T = unknown>(
    ns: BridgeNamespace,
    method: string,
    params?: Record<string, unknown>,
    options: InvokeOptions = {},
  ): Promise<T> {
    const id = genId()
    const request: BridgeRequest = { id, ns, method, params, ts: Date.now() }
    const timeout = options.timeout ?? getApiSpec(ns, method)?.timeout ?? this.defaultTimeout
    const startedAt = Date.now()

    let response: BridgeResponse
    try {
      response = await this.dispatch(request, timeout)
    } catch (error) {
      response = {
        id,
        code: ErrorCode.NativeError,
        msg: error instanceof Error ? error.message : String(error),
      }
    }

    this.logger.push({
      id,
      name: `${ns}.${method}`,
      cost: Date.now() - startedAt,
      code: response.code,
      ts: Date.now(),
      request,
      response,
    })

    if (response.code !== ErrorCode.Success) {
      throw new BridgeError(response.code, response.msg, response)
    }
    return response.data as T
  }

  /** 订阅事件，返回取消订阅函数 */
  on<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    let handlers = this.listeners.get(event)
    if (!handlers) {
      handlers = new Set()
      this.listeners.set(event, handlers)
    }
    handlers.add(handler as (payload: unknown, name: EventName) => void)
    return () => this.off(event, handler)
  }

  off<E extends EventName>(event: E, handler: EventHandler<E>): void {
    this.listeners.get(event)?.delete(handler as (payload: unknown, name: EventName) => void)
  }

  /** 原生侧事件下发入口 */
  emit<E extends EventName>(event: E, payload: EventMap[E]): void {
    for (const handler of this.listeners.get(event) ?? []) {
      try {
        handler(payload, event)
      } catch (error) {
        console.error(`[BRIDGE] event handler error: ${event}`, error)
      }
    }
  }

  protected emitFromEnvelope(envelope: unknown): boolean {
    if (typeof envelope !== 'object' || envelope === null) return false
    const { event, payload } = envelope as { event?: unknown; payload?: unknown }
    if (!isEventName(event)) return false
    this.emit(event, payload as EventMap[typeof event])
    return true
  }
}
