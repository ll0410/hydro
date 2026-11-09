import { bridge as globalBridge } from '@hydro/bridge-sdk'

/** 埋点事件结构 */
export interface ReporterEvent {
  name: string
  ts: number
  props?: Record<string, unknown>
}

/** 上报依赖的最小桥能力 */
export interface ReporterBridge {
  util: {
    report(params?: Record<string, unknown>): Promise<unknown>
  }
}

export interface ReporterOptions {
  bridge?: ReporterBridge
  /** 攒够多少条自动上报，默认 10 */
  batchSize?: number
  /** 定时上报间隔（毫秒），<= 0 关闭定时器 */
  flushIntervalMs?: number
  /** 当前时间源，测试可注入 */
  now?: () => number
  /** 是否开启定时 flush，默认 true（flushIntervalMs > 0 时生效） */
  autoFlush?: boolean
}

/**
 * 埋点上报器：
 * - 事件进内存缓冲；
 * - 达到 batchSize 或定时器触发时统一走 bridge.util.report()；
 * - 配合 installExitFlush 在页面退出前 flush。
 */
export class Reporter {
  private queue: ReporterEvent[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly bridge: ReporterBridge
  private readonly batchSize: number
  private readonly flushIntervalMs: number
  private readonly now: () => number

  constructor(options: ReporterOptions = {}) {
    this.bridge = options.bridge ?? (globalBridge as unknown as ReporterBridge)
    this.batchSize = Math.max(1, options.batchSize ?? 10)
    this.flushIntervalMs = options.flushIntervalMs ?? 5_000
    this.now = options.now ?? (() => Date.now())

    if ((options.autoFlush ?? true) && this.flushIntervalMs > 0) {
      this.start()
    }
  }

  /** 记录一条埋点；达到批量阈值立即 flush */
  track(name: string, props?: Record<string, unknown>): void {
    this.queue.push({ name, ts: this.now(), props })
    if (this.queue.length >= this.batchSize) {
      void this.flush()
    }
  }

  pending(): number {
    return this.queue.length
  }

  /** 立即上报当前缓冲；失败时保留数据等待下次重试 */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return
    const events = this.queue.splice(0, this.queue.length)
    try {
      await this.bridge.util.report({ events })
    } catch (error) {
      this.queue.unshift(...events)
      console.warn('[Hydro] 埋点上报失败，数据已回填等待重试', error)
    }
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.flush()
    }, this.flushIntervalMs)
    // Node 测试环境避免定时器阻塞进程退出
    if (typeof this.timer === 'object' && this.timer && 'unref' in this.timer) {
      ;(this.timer as { unref: () => void }).unref()
    }
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }
}

export interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

/**
 * 页面退出前 flush：
 * - pagehide（移动端可靠）
 * - visibilitychange（切后台）
 * 返回解绑函数。
 */
export function installExitFlush(reporter: Reporter, target?: EventTargetLike): () => void {
  const scope =
    target ?? (typeof window !== 'undefined' ? (window as unknown as EventTargetLike) : undefined)
  if (!scope) return () => {}

  const flush = () => {
    void reporter.flush()
  }
  scope.addEventListener('pagehide', flush)
  scope.addEventListener('visibilitychange', flush)

  return () => {
    scope.removeEventListener('pagehide', flush)
    scope.removeEventListener('visibilitychange', flush)
  }
}

/** 默认实例 */
export const reporter = new Reporter()
