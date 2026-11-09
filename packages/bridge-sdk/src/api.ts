import {
  API_REGISTRY,
  type ApiMethods,
  type ApiNamespace,
  type BridgeNamespace,
} from '@hydro/shared'
import type { InvokeOptions } from './core'

/** 单个桥接方法的前端签名 */
export type BridgeMethod = (
  params?: Record<string, unknown>,
  options?: InvokeOptions,
) => Promise<unknown>

/** 按注册表推导的命名空间调用面：bridge.device.scan() */
export type BridgeApi = {
  [N in ApiNamespace]: {
    [M in ApiMethods<N>]: BridgeMethod
  }
}

/** 构造命名空间方法代理（方法列表完全来自 @hydro/shared 注册表） */
export function createApi(core: {
  invoke: (
    ns: BridgeNamespace,
    method: string,
    params?: Record<string, unknown>,
    options?: InvokeOptions,
  ) => Promise<unknown>
}): BridgeApi {
  const api: Record<string, Record<string, BridgeMethod>> = {}

  for (const ns of Object.keys(API_REGISTRY) as ApiNamespace[]) {
    const methods: Record<string, BridgeMethod> = {}
    for (const method of Object.keys(API_REGISTRY[ns])) {
      methods[method] = (params, options) => core.invoke(ns, method, params, options)
    }
    api[ns] = methods
  }

  return api as BridgeApi
}
