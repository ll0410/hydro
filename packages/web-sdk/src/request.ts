import { bridge as globalBridge, type Bridge } from '@hydro/bridge-sdk'
import type { EventMap } from '@hydro/shared'

/** 请求层依赖的最小桥能力，便于单测注入 */
export type RequestBridge = Pick<Bridge, 'auth'> & {
  emit?: (event: 'tokenRefreshed', payload: EventMap['tokenRefreshed']) => void
}

export interface HttpClientOptions {
  /** 统一前缀，如 https://api.example.com */
  baseUrl?: string
  bridge?: RequestBridge
  fetchImpl?: typeof fetch
  /** 401 时刷新 token，返回新 token；缺省重新调用 bridge.auth.getToken() */
  refreshToken?: () => Promise<string | null>
  /** 是否在 401 后刷新 token 并重放一次，默认 true */
  retryOnUnauthorized?: boolean
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body?: unknown,
  ) {
    super(`HTTP ${status} for ${url}`)
    this.name = 'HttpError'
  }
}

export type HttpClient = <T = unknown>(path: string, init?: RequestInit) => Promise<T>

async function resolveToken(bridge: RequestBridge): Promise<string | null> {
  try {
    const result = (await bridge.auth.getToken()) as { token?: string } | undefined
    return result?.token ?? null
  } catch {
    return null
  }
}

function buildUrl(baseUrl: string | undefined, path: string): string {
  if (/^https?:\/\//i.test(path) || !baseUrl) return path
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

function applyToken(headers: Headers, token: string | null): void {
  if (!token) return
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json()
  }
  return response.text()
}

/**
 * fetch 封装：
 * - 自动注入 bridge.auth.getToken() 拿到的 token；
 * - 401 时刷新 token 并重放一次，刷新成功广播 tokenRefreshed；
 * - 非 2xx 抛 HttpError。
 */
export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const bridge = options.bridge ?? (globalBridge as unknown as RequestBridge)
  const fetchImpl = options.fetchImpl ?? fetch
  const retryOnUnauthorized = options.retryOnUnauthorized ?? true
  const refreshToken = options.refreshToken ?? (() => resolveToken(bridge))

  return async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const url = buildUrl(options.baseUrl, path)
    const headers = new Headers(init.headers)
    let token = await resolveToken(bridge)
    applyToken(headers, token)

    let response = await fetchImpl(url, { ...init, headers })

    if (response.status === 401 && retryOnUnauthorized) {
      const nextToken = await refreshToken()
      if (nextToken && nextToken !== token) {
        token = nextToken
        headers.set('Authorization', `Bearer ${nextToken}`)
        bridge.emit?.('tokenRefreshed', { token: nextToken, expiresAt: 0 })
        response = await fetchImpl(url, { ...init, headers })
      }
    }

    if (!response.ok) {
      let body: unknown
      try {
        body = await parseBody(response)
      } catch {
        body = undefined
      }
      throw new HttpError(response.status, url, body)
    }

    return (await parseBody(response)) as T
  }
}

/** 默认实例：业务侧一般直接 import { request } */
export const request: HttpClient = createHttpClient()
