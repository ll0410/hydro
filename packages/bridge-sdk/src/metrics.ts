import { ErrorCode } from '@hydro/shared'

/** 单个 ns.method 的聚合指标 */
export interface BridgeMetricItem {
  name: string
  calls: number
  success: number
  fail: number
  timeout: number
  totalCost: number
  maxCost: number
}

/**
 * Bridge 调用指标采集：
 * - 按 ns.method 聚合调用次数 / 成功率 / 超时率 / 耗时；
 * - drain() 取出并清零，便于周期性上报。
 */
export class BridgeMetrics {
  private readonly items = new Map<string, BridgeMetricItem>()
  private readonly totals = new Map<string, BridgeMetricItem>()

  record(name: string, code: ErrorCode, cost: number): void {
    this.accumulate(this.items, name, code, cost)
    this.accumulate(this.totals, name, code, cost)
  }

  private accumulate(
    map: Map<string, BridgeMetricItem>,
    name: string,
    code: ErrorCode,
    cost: number,
  ): void {
    const item = map.get(name) ?? {
      name,
      calls: 0,
      success: 0,
      fail: 0,
      timeout: 0,
      totalCost: 0,
      maxCost: 0,
    }

    item.calls += 1
    item.totalCost += cost
    item.maxCost = Math.max(item.maxCost, cost)
    if (code === ErrorCode.Success) item.success += 1
    else if (code === ErrorCode.Timeout) item.timeout += 1
    else item.fail += 1

    map.set(name, item)
  }

  snapshot(): BridgeMetricItem[] {
    return [...this.items.values()]
      .map((item) => ({ ...item }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /** 全量累计指标（不清零），用于调试面板展示 */
  snapshotTotal(): BridgeMetricItem[] {
    return [...this.totals.values()]
      .map((item) => ({ ...item }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /** 取出并清空窗口指标；totals 保留 */
  drain(): BridgeMetricItem[] {
    const items = this.snapshot()
    this.items.clear()
    return items
  }
}
