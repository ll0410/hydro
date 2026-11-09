/** 事件契约：原生 → H5 主动推送，走事件总线分发 */

export interface EventMap {
  /** App 前后台切换 */
  appStateChange: { state: 'active' | 'background' }
  /** token 刷新完成 */
  tokenRefreshed: { token: string; expiresAt: number }
  /** 离线包更新完成 */
  offlinePackageUpdated: { version: string; from?: string }
}

export type EventName = keyof EventMap

/** 事件总线回调 */
export type EventHandler<E extends EventName> = (payload: EventMap[E], name: E) => void

/** 事件信封（原生下发事件时使用） */
export interface BridgeEvent<E extends EventName = EventName> {
  event: E
  payload: EventMap[E]
  ts: number
}

/** 判断是否为合法事件名 */
export function isEventName(value: unknown): value is EventName {
  return (
    value === 'appStateChange' || value === 'tokenRefreshed' || value === 'offlinePackageUpdated'
  )
}
