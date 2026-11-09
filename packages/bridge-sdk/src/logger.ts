import type { BridgeRequest, BridgeResponse, ErrorCode } from '@hydro/shared'

/** 环形缓冲中的单次调用记录 */
export interface BridgeLogEntry {
  /** 请求 id */
  id: string
  /** ns.method */
  name: string
  /** 耗时（毫秒） */
  cost: number
  /** 响应码 */
  code: ErrorCode
  /** 完成时间戳 */
  ts: number
  /** 完整请求报文 */
  request?: BridgeRequest
  /** 完整响应报文 */
  response?: BridgeResponse
}

/**
 * 桥接调用日志环形缓冲。
 *
 * 默认保留最近 200 条，供 vConsole 面板与线上问题排查使用。
 */
export class BridgeLogger {
  private buffer: BridgeLogEntry[] = []

  constructor(readonly capacity = 200) {}

  push(entry: BridgeLogEntry): void {
    this.buffer.push(entry)
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity)
    }
  }

  /** 按时间正序返回快照 */
  entries(): BridgeLogEntry[] {
    return [...this.buffer]
  }

  last(count = 1): BridgeLogEntry[] {
    return this.buffer.slice(-count)
  }

  clear(): void {
    this.buffer = []
  }
}
