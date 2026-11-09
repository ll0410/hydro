/**
 * WebView 预热池（逻辑池）。
 *
 * uni-app 的 web-view 组件无法直接创建多个隐藏实例，真正的实例创建与复用
 * 由原生插件 HydroBridge 完成；这里的池负责预热计数、借出与归还的调度。
 */

export interface PoolSlot {
  id: string
  url: string
  inUse: boolean
  createdAt: number
}

export interface NativePoolHost {
  preload?: (options: { count: number }) => void
  release?: (id: string) => void
}

function getNativeHost(): NativePoolHost | null {
  // #ifdef APP-PLUS
  try {
    return uni.requireNativePlugin('HydroBridge') as unknown as NativePoolHost
  } catch (error) {
    console.warn('[Hydro] 原生插件 HydroBridge 未注册，WebView 池降级为逻辑池', error)
    return null
  }
  // #endif
  // #ifndef APP-PLUS
  return null
  // #endif
}

export class WebViewPool {
  private slots: PoolSlot[] = []

  constructor(readonly size = 2) {}

  /** 预热指定数量的实例；重复调用幂等 */
  warmup(entryUrl: string): void {
    if (this.slots.length >= this.size) return
    const host = getNativeHost()
    host?.preload?.({ count: this.size - this.slots.length })

    for (let i = this.slots.length; i < this.size; i++) {
      this.slots.push({
        id: `hydro-webview-${i}`,
        url: entryUrl,
        inUse: false,
        createdAt: Date.now() + i,
      })
    }
    console.info(`[Hydro] WebView 池预热完成：${this.size}`)
  }

  /** 借出一个实例：优先空闲，其次回收最旧实例 */
  borrow(url: string): PoolSlot {
    const idle = this.slots.find((slot) => !slot.inUse)
    if (idle) {
      idle.inUse = true
      idle.url = url || idle.url
      return idle
    }

    const oldest = [...this.slots].sort((a, b) => a.createdAt - b.createdAt)[0]
    if (oldest) {
      oldest.inUse = true
      oldest.url = url || oldest.url
      return oldest
    }

    const slot: PoolSlot = {
      id: `hydro-webview-${Date.now()}`,
      url,
      inUse: true,
      createdAt: Date.now(),
    }
    this.slots.push(slot)
    return slot
  }

  /** 归还实例，供后续页面复用 */
  release(id: string): void {
    const slot = this.slots.find((item) => item.id === id)
    if (!slot) return
    slot.inUse = false
    getNativeHost()?.release?.(id)
  }

  snapshot(): readonly PoolSlot[] {
    return this.slots.map((slot) => ({ ...slot }))
  }
}

export const webViewPool = new WebViewPool(2)
