import { describe, expect, it, vi } from 'vitest'
import { HttpError, createHttpClient, type RequestBridge } from './request'

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function mockFetch() {
  return vi.fn<FetchFn>()
}

function makeBridge(token: string | null = 'token-1') {
  const getToken = vi.fn(async () => (token ? { token, expiresAt: 0 } : undefined))
  const emit = vi.fn()
  const bridge = {
    auth: { getToken, login: vi.fn(), logout: vi.fn() },
    emit,
  } as unknown as RequestBridge
  return { bridge, getToken, emit }
}

describe('createHttpClient', () => {
  it('自动注入 bridge token 并拼接 baseUrl', async () => {
    const { bridge } = makeBridge()
    const fetchImpl = mockFetch()
    fetchImpl.mockResolvedValueOnce(jsonResponse({ ok: true }))

    const client = createHttpClient({
      baseUrl: 'https://api.example.com/',
      bridge,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const data = await client<{ ok: boolean }>('/orders')

    expect(data).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://api.example.com/orders')
    expect((init?.headers as Headers).get('Authorization')).toBe('Bearer token-1')
  })

  it('已有 Authorization 时不覆盖', async () => {
    const { bridge } = makeBridge()
    const fetchImpl = mockFetch()
    fetchImpl.mockResolvedValueOnce(jsonResponse({}))

    const client = createHttpClient({ bridge, fetchImpl: fetchImpl as unknown as typeof fetch })
    await client('/orders', { headers: { Authorization: 'Custom abc' } })

    const headers = fetchImpl.mock.calls[0]![1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Custom abc')
  })

  it('取 token 失败时仍可发起匿名请求', async () => {
    const { bridge, getToken } = makeBridge()
    getToken.mockRejectedValueOnce(new Error('no login'))
    const fetchImpl = mockFetch()
    fetchImpl.mockResolvedValueOnce(jsonResponse({}))

    const client = createHttpClient({ bridge, fetchImpl: fetchImpl as unknown as typeof fetch })
    await client('/public')

    const headers = fetchImpl.mock.calls[0]![1]?.headers as Headers
    expect(headers.has('Authorization')).toBe(false)
  })

  it('401 → 刷新 token → 重放请求并广播 tokenRefreshed', async () => {
    const { bridge, emit } = makeBridge('old-token')
    const fetchImpl = mockFetch()
    fetchImpl
      .mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))

    const client = createHttpClient({
      bridge,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      refreshToken: async () => 'new-token',
    })

    const data = await client('/orders', { method: 'POST' })
    expect(data).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect((fetchImpl.mock.calls[1]![1]?.headers as Headers).get('Authorization')).toBe(
      'Bearer new-token',
    )
    expect(emit).toHaveBeenCalledWith('tokenRefreshed', { token: 'new-token', expiresAt: 0 })
  })

  it('刷新后仍 401 则抛 HttpError', async () => {
    const { bridge } = makeBridge('old-token')
    const fetchImpl = mockFetch()
    fetchImpl
      .mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: 'still expired' }, 401))

    const client = createHttpClient({
      bridge,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      refreshToken: async () => 'new-token',
    })

    await expect(client('/orders')).rejects.toMatchObject({
      name: 'HttpError',
      status: 401,
    })
  })

  it('刷新 token 未变化时不重放', async () => {
    const { bridge } = makeBridge('same-token')
    const fetchImpl = mockFetch()
    fetchImpl.mockResolvedValueOnce(jsonResponse({}, 401))

    const client = createHttpClient({
      bridge,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      refreshToken: async () => 'same-token',
    })

    await expect(client('/orders')).rejects.toBeInstanceOf(HttpError)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('可关闭 401 重试', async () => {
    const { bridge } = makeBridge()
    const fetchImpl = mockFetch()
    fetchImpl.mockResolvedValueOnce(jsonResponse({}, 401))

    const client = createHttpClient({
      bridge,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryOnUnauthorized: false,
    })
    await expect(client('/orders')).rejects.toMatchObject({ status: 401 })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('非 JSON 响应按文本返回，204 返回 undefined', async () => {
    const { bridge } = makeBridge()
    const fetchImpl = mockFetch()
    fetchImpl
      .mockResolvedValueOnce(new Response('plain', { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const client = createHttpClient({ bridge, fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(client('/text')).resolves.toBe('plain')
    await expect(client('/empty')).resolves.toBeUndefined()
  })
})
