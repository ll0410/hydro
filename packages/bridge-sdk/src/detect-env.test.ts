import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectEnv } from './detect-env'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('detectEnv', () => {
  it('无 window 时为 browser', () => {
    expect(detectEnv()).toBe('browser')
  })

  it('window 存在但无注入对象时为 browser', () => {
    vi.stubGlobal('window', {})
    expect(detectEnv()).toBe('browser')
  })

  it('window.__HYDRO_BRIDGE__ 存在时为 shell', () => {
    vi.stubGlobal('window', { __HYDRO_BRIDGE__: { post: () => {} } })
    expect(detectEnv()).toBe('shell')
  })

  it('支持显式传入候选作用域', () => {
    expect(detectEnv({ __HYDRO_BRIDGE__: { post: () => {} } })).toBe('shell')
    expect(detectEnv({ __HYDRO_BRIDGE__: null })).toBe('browser')
    expect(detectEnv(null)).toBe('browser')
  })
})
