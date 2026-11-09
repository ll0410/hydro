import { describe, expect, it, vi } from 'vitest'
import { installVConsole, shouldEnableVConsole } from './vconsole'

describe('shouldEnableVConsole', () => {
  it('debug 环境强制开启', () => {
    expect(shouldEnableVConsole({ debug: true })).toBe(true)
  })

  it('URL 参数 ?vconsole=1 开启', () => {
    expect(shouldEnableVConsole({ search: '?vconsole=1' })).toBe(true)
    expect(shouldEnableVConsole({ search: 'vconsole=1' })).toBe(true)
    expect(shouldEnableVConsole({ search: '?vconsole=0' })).toBe(false)
    expect(shouldEnableVConsole({ search: '' })).toBe(false)
  })
})

describe('installVConsole', () => {
  it('未命中条件时返回 null 且不加载', async () => {
    const load = vi.fn()
    await expect(installVConsole({ search: '', load })).resolves.toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it('命中条件时动态加载并实例化', async () => {
    const instance = { id: 'vc' }
    class FakeVConsole {
      constructor(readonly config?: Record<string, unknown>) {
        Object.assign(this, instance)
      }
    }
    const load = vi.fn(async () => ({ default: FakeVConsole }))
    const result = await installVConsole({ debug: true, load })
    expect(result).toBeInstanceOf(FakeVConsole)
  })
})
