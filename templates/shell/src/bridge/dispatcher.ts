import {
  ErrorCode,
  getApiSpec,
  type BridgeNamespace,
  type BridgeResponse,
} from '@hydro/shared'
import { authStore } from '../store/auth'
import { authorizeRequest, type AuthContext } from './auth'
import { parseIncoming } from './protocol-parser'

export type BridgeHandler = (
  params: Record<string, unknown> | undefined,
  context: AuthContext,
) => unknown | Promise<unknown>

/**
 * 原生侧分发器：协议解析 → 鉴权 → 按 ns.method 路由到插件 handler。
 *
 * 真实链路中由原生插件把请求交给本分发器，再用 evalJS 把 BridgeResponse 回传 H5。
 */
export class BridgeDispatcher {
  private readonly handlers = new Map<string, BridgeHandler>()

  register(ns: BridgeNamespace, method: string, handler: BridgeHandler): this {
    this.handlers.set(`${ns}.${method}`, handler)
    return this
  }

  has(ns: BridgeNamespace, method: string): boolean {
    return this.handlers.has(`${ns}.${method}`)
  }

  async dispatch(raw: unknown, context: AuthContext): Promise<BridgeResponse> {
    const parsed = parseIncoming(raw)
    if (!parsed.ok) return parsed.response

    const request = parsed.request
    const spec = getApiSpec(request.ns, request.method)
    if (!spec) {
      return {
        id: request.id,
        code: ErrorCode.NotFound,
        msg: `api not registered: ${request.ns}.${request.method}`,
      }
    }

    const denied = authorizeRequest(request, context)
    if (denied) return denied

    const handler = this.handlers.get(`${request.ns}.${request.method}`)
    if (!handler) {
      return {
        id: request.id,
        code: ErrorCode.NotFound,
        msg: `native handler not registered: ${request.ns}.${request.method}`,
      }
    }

    try {
      const data = await handler(request.params, context)
      return { id: request.id, code: ErrorCode.Success, data, msg: 'ok' }
    } catch (error) {
      return {
        id: request.id,
        code: ErrorCode.NativeError,
        msg: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

/** 默认分发器：壳模板内置的基础能力接线 */
export const dispatcher = new BridgeDispatcher()

dispatcher
  .register('ui', 'toast', (params) => {
    uni.showToast({ title: String(params?.message ?? ''), icon: 'none' })
    return { shown: true }
  })
  .register(
    'ui',
    'alert',
    (params) =>
      new Promise((resolve) => {
        uni.showModal({
          title: String(params?.title ?? '提示'),
          content: String(params?.message ?? ''),
          success: (result) => resolve({ confirmed: result.confirm }),
          fail: () => resolve({ confirmed: false }),
        })
      }),
  )
  .register('ui', 'setTitle', (params) => {
    const title = String(params?.title ?? '')
    uni.setNavigationBarTitle({ title })
    return { title }
  })
  .register('ui', 'navigateTo', (params) => {
    const url = String(params?.url ?? '')
    uni.navigateTo({ url })
    return { path: url }
  })
  .register(
    'device',
    'scan',
    () =>
      new Promise((resolve, reject) => {
        uni.scanCode({
          success: (result) =>
            resolve({ text: result.result, format: result.scanType, types: ['qrCode'] }),
          fail: (error) => reject(new Error(error.errMsg ?? 'scan failed')),
        })
      }),
  )
  .register(
    'device',
    'getLocation',
    () =>
      new Promise((resolve, reject) => {
        uni.getLocation({
          type: 'gcj02',
          success: (result) =>
            resolve({ latitude: result.latitude, longitude: result.longitude }),
          fail: (error) => reject(new Error(error.errMsg ?? 'location failed')),
        })
      }),
  )
  .register('device', 'clipboard', (params) => {
    if (params?.action === 'write') {
      uni.setClipboardData({ data: String(params.text ?? '') })
      return { text: String(params.text ?? '') }
    }
    return new Promise((resolve) => {
      uni.getClipboardData({
        success: (result) => resolve({ text: result.data }),
        fail: () => resolve({ text: '' }),
      })
    })
  })
  .register('app', 'getVersion', () => {
    // #ifdef APP-PLUS
    return { version: plus.runtime.version, build: plus.runtime.versionCode }
    // #endif
    // #ifndef APP-PLUS
    const info = uni.getSystemInfoSync()
    return { version: info.appVersion ?? '1.0.0', build: info.appVersionCode ?? '1' }
    // #endif
  })
  .register('auth', 'getToken', () => ({ token: authStore.getToken(), expiresAt: 0 }))
  .register('util', 'report', () => ({ accepted: true }))
