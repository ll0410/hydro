import { describe, expect, it } from 'vitest'
import { API_REGISTRY, getApiSpec, type ApiRegistry } from './api-registry'
import type { PermissionLevel } from './protocol'

const PERMISSIONS: readonly PermissionLevel[] = ['public', 'protected', 'private']

describe('API_REGISTRY', () => {
  it('每个命名空间至少注册一个方法', () => {
    for (const [ns, methods] of Object.entries(API_REGISTRY)) {
      expect(Object.keys(methods).length, `${ns} 为空`).toBeGreaterThan(0)
    }
  })

  it('每个方法的权限级合法', () => {
    const registry = API_REGISTRY as unknown as ApiRegistry
    for (const [ns, methods] of Object.entries(registry)) {
      for (const [method, spec] of Object.entries(methods)) {
        expect(PERMISSIONS, `${ns}.${method}`).toContain(spec.permission)
        expect(spec.description.length, `${ns}.${method}`).toBeGreaterThan(0)
      }
    }
  })

  it('包含后续阶段依赖的关键方法', () => {
    expect(getApiSpec('device', 'scan')?.permission).toBe('protected')
    expect(getApiSpec('auth', 'getToken')?.permission).toBe('private')
    expect(getApiSpec('util', 'report')?.permission).toBe('public')
  })

  it('未注册方法返回 undefined', () => {
    expect(getApiSpec('device', 'unknown')).toBeUndefined()
    expect(getApiSpec('unknown', 'scan')).toBeUndefined()
  })
})
