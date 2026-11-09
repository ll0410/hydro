/** 按 URL 参数 ?vconsole=1 或 debug 环境启用 vConsole */

export interface VConsoleOptions {
  /** debug 构建强制开启 */
  debug?: boolean
  /** 可注入 location.search，测试用 */
  search?: string
  /** 可注入加载器，默认动态 import('vconsole') */
  load?: () => Promise<unknown>
}

export function shouldEnableVConsole(
  options: Pick<VConsoleOptions, 'debug' | 'search'> = {},
): boolean {
  if (options.debug) return true
  const search = options.search ?? (typeof location !== 'undefined' ? location.search : '')
  if (!search) return false
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  return params.get('vconsole') === '1'
}

/** 动态加载并实例化 vConsole；未命中条件时返回 null */
export async function installVConsole(options: VConsoleOptions = {}): Promise<unknown | null> {
  if (!shouldEnableVConsole(options)) return null

  const load = options.load ?? (() => import('vconsole'))
  const mod = (await load()) as { default?: new (config?: Record<string, unknown>) => unknown }
  const VConsoleCtor = mod.default ?? (mod as unknown as new (config?: unknown) => unknown)
  const instance = new VConsoleCtor({ theme: 'dark' })
  console.info('[Hydro] vConsole 已启用')
  return instance
}
