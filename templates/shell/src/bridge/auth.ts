import {
  ErrorCode,
  getApiSpec,
  type BridgeRequest,
  type BridgeResponse,
} from '@hydro/shared'
import { isUrlAllowed } from '../container/whitelist'

export interface AuthContext {
  /** 当前页面 origin（由原生插件从 WebView 取到） */
  origin: string
  whitelist: readonly string[]
  debug: boolean
  /** 原生安全存储中是否存在登录 token */
  hasToken: boolean
}

/**
 * 每次 invoke 前的鉴权：域名白名单 + 方法权限级。
 *
 * 返回 null 表示放行；否则返回可直接回传给 H5 的错误响应。
 */
export function authorizeRequest(
  request: BridgeRequest,
  context: AuthContext,
): BridgeResponse | null {
  const spec = getApiSpec(request.ns, request.method)
  if (!spec) {
    return { id: request.id, code: ErrorCode.NotFound, msg: `api not registered: ${request.ns}.${request.method}` }
  }

  if (spec.permission === 'public') return null

  const originAllowed = isUrlAllowed(context.origin, context.whitelist, context.debug)
  if (!originAllowed) {
    return {
      id: request.id,
      code: ErrorCode.Forbidden,
      msg: `origin not allowed: ${context.origin}`,
    }
  }

  if (spec.permission === 'private' && !context.hasToken) {
    return { id: request.id, code: ErrorCode.AuthFailed, msg: 'login required' }
  }

  return null
}
