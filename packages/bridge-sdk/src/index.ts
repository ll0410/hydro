import type { BridgeApi } from './api'
import type { BaseBridge } from './core'
import { detectEnv, type BridgeEnv } from './detect-env'
import type { BridgeLogger } from './logger'
import { MockBridge, type MockBridgeOptions } from './mock-bridge'
import { RealBridge, type RealBridgeOptions } from './real-bridge'

export * from '@hydro/shared'
export { createApi, type BridgeApi, type BridgeMethod } from './api'
export {
  BaseBridge,
  BridgeError,
  DEFAULT_TIMEOUT,
  type BridgeOptions,
  type InvokeOptions,
} from './core'
export { detectEnv, type BridgeEnv } from './detect-env'
export { BridgeLogger, type BridgeLogEntry } from './logger'
export { BridgeMetrics, type BridgeMetricItem } from './metrics'
export { MockBridge, type MockBridgeOptions } from './mock-bridge'
export { RealBridge, type BridgeHost, type RealBridgeOptions } from './real-bridge'
export { buildBridgePanelHtml, createBridgePanel, type VConsolePlugin } from './panel'
export {
  createDefaultStorage,
  createFixtures,
  createMemoryStorage,
  type FixtureHandler,
  type StorageLike,
} from './fixtures'

/** 业务侧使用的桥实例：公共方法 + 注册表推导出的命名空间 API */
export type Bridge = BaseBridge & BridgeApi

export interface CreateBridgeOptions {
  /** 强制指定环境，缺省按 window.__HYDRO_BRIDGE__ 自动判定 */
  env?: BridgeEnv
  logger?: BridgeLogger
  mock?: MockBridgeOptions
  real?: RealBridgeOptions
}

/** 按环境构造桥实例（命名空间调用面由 BaseBridge 构造时挂载） */
export function createBridge(options: CreateBridgeOptions = {}): Bridge {
  const logger = options.logger
  const env = options.env ?? detectEnv()
  const impl =
    env === 'shell'
      ? new RealBridge({ ...options.real, logger })
      : new MockBridge({ ...options.mock, logger })
  return impl as unknown as Bridge
}

/** 全局单例：业务代码直接 `import { bridge } from '@hydro/bridge-sdk'` */
export const bridge: Bridge = createBridge()
