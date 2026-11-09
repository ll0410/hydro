import type { BridgeNamespace, BridgeRequest } from './protocol'
import { ErrorCode } from './protocol'

const NAMESPACES: readonly BridgeNamespace[] = [
  'ui',
  'device',
  'app',
  'auth',
  'pay',
  'media',
  'util',
]

/** 判断是否为合法命名空间 */
export function isBridgeNamespace(value: unknown): value is BridgeNamespace {
  return typeof value === 'string' && (NAMESPACES as readonly string[]).includes(value)
}

/**
 * 运行时校验 H5 → Native 请求。
 *
 * 原生侧 dispatcher 在路由前必须调用，避免非法报文进入插件层。
 */
export function isBridgeRequest(value: unknown): value is BridgeRequest {
  if (typeof value !== 'object' || value === null) return false
  const req = value as Record<string, unknown>
  if (typeof req.id !== 'string' || req.id.length === 0) return false
  if (!isBridgeNamespace(req.ns)) return false
  if (typeof req.method !== 'string' || req.method.length === 0) return false
  if (typeof req.ts !== 'number' || !Number.isFinite(req.ts)) return false
  if (req.params !== undefined && (typeof req.params !== 'object' || req.params === null)) {
    return false
  }
  return true
}

/** 判断响应是否为成功码 */
export function isSuccessCode(code: unknown): boolean {
  return code === ErrorCode.Success
}
