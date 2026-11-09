/** Mock 数据源：所有返回值对齐 `@hydro/shared` 协议，编译期即可发现字段漂移。 */

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface FixtureContext {
  storage?: StorageLike
}

export type FixtureHandler = (
  params: Record<string, unknown> | undefined,
  ctx: FixtureContext,
) => unknown

export const TOKEN_KEY = 'hydro:token'
export const TOKEN_EXPIRES_KEY = 'hydro:token:expiresAt'
export const CLIPBOARD_KEY = 'hydro:clipboard'

const TOKEN_TTL = 2 * 60 * 60 * 1000

function now(): number {
  return Date.now()
}

function issueToken(ctx: FixtureContext): { token: string; expiresAt: number } {
  const token = 'mock-token'
  const expiresAt = now() + TOKEN_TTL
  ctx.storage?.setItem(TOKEN_KEY, token)
  ctx.storage?.setItem(TOKEN_EXPIRES_KEY, String(expiresAt))
  return { token, expiresAt }
}

/** 创建 Mock fixtures（storage 用于模拟登录态 / 剪贴板持久化） */
export function createFixtures(storage?: StorageLike): Record<string, FixtureHandler> {
  const ctx: FixtureContext = { storage }

  return {
    'ui.toast': (params) => ({ shown: true, message: params?.message ?? '' }),
    'ui.alert': () => ({ confirmed: true }),
    'ui.setTitle': (params) => ({ title: params?.title ?? '' }),
    'ui.navigateTo': (params) => ({ path: params?.url ?? '' }),

    'device.scan': (params) => ({
      text: 'https://hydro.example.com/scan/9f2c1a',
      format: 'QR_CODE',
      types: params?.types ?? ['qrCode'],
    }),
    'device.getLocation': () => ({
      latitude: 31.2304,
      longitude: 121.4737,
      accuracy: 10,
      provider: 'mock',
    }),
    'device.bluetooth': () => ({ enabled: true, devices: [] }),
    'device.clipboard': (params) => {
      if (params?.action === 'write') {
        ctx.storage?.setItem(CLIPBOARD_KEY, String(params.text ?? ''))
        return { text: String(params.text ?? '') }
      }
      return { text: ctx.storage?.getItem(CLIPBOARD_KEY) ?? '' }
    },

    'app.getVersion': () => ({ version: '1.0.0', build: '100', platform: 'browser' }),
    'app.checkUpdate': () => ({ hasUpdate: false, latest: '1.0.0' }),
    'app.restart': () => ({ ok: true }),

    'auth.getToken': () => {
      const token = ctx.storage?.getItem(TOKEN_KEY)
      const expiresAt = Number(ctx.storage?.getItem(TOKEN_EXPIRES_KEY) ?? 0)
      if (token && expiresAt > now()) return { token, expiresAt }
      return issueToken(ctx)
    },
    'auth.login': (params) => ({
      ...issueToken(ctx),
      account: params?.account ?? 'mock-user',
    }),
    'auth.logout': () => {
      ctx.storage?.removeItem(TOKEN_KEY)
      ctx.storage?.removeItem(TOKEN_EXPIRES_KEY)
      return { ok: true }
    },

    'pay.invoke': (params) => ({ orderId: params?.orderId ?? 'mock-order', status: 'success' }),
    'pay.getStatus': () => ({ status: 'success' }),

    'media.takePhoto': () => ({ path: 'mock://photo.jpg' }),
    'media.recordVideo': () => ({ path: 'mock://video.mp4' }),
    'media.chooseImage': () => ({ paths: ['mock://image-1.jpg'] }),

    'util.report': (params) => ({
      accepted: true,
      received: Array.isArray(params?.events) ? params.events.length : 1,
    }),
    'util.log': () => ({ ok: true }),
  }
}

/** 内存版 storage（Node / 测试环境兜底） */
export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

/** 浏览器优先使用 localStorage，不可用时退回内存实现 */
export function createDefaultStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // 隐私模式等场景访问 localStorage 会抛错
  }
  return createMemoryStorage()
}

export function fixtureKey(ns: string, method: string): string {
  return `${ns}.${method}`
}
