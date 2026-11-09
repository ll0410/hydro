/** 导航白名单与安全策略：容器拦截所有跳转，非白名单走系统浏览器。 */

export type NavigationDecision = 'allow' | 'external'

/** 规则归一化为 hostname：支持 `https://cdn.example.com`、`cdn.example.com`、`*.example.com` */
export function normalizeRule(rule: string): string {
  const trimmed = rule.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    return url.hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** hostname 是否命中单条白名单规则 */
export function matchesHost(hostname: string, rule: string): boolean {
  const normalized = normalizeRule(rule)
  if (!normalized) return false
  if (normalized.startsWith('*.')) {
    const suffix = normalized.slice(1) // .example.com
    return hostname === normalized.slice(2) || hostname.endsWith(suffix)
  }
  return hostname === normalized
}

/**
 * URL 是否允许在容器内打开。
 *
 * - 仅 http / https；
 * - 生产环境强制 https 且必须命中白名单；
 * - debug 构建放行任意 host（http 会打告警），但仍拒绝非 web 协议。
 */
export function isUrlAllowed(
  rawUrl: string,
  whitelist: readonly string[],
  debug = false,
): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false

  if (debug) {
    if (url.protocol === 'http:') {
      console.warn(`[Hydro] debug 构建放行 http 页面：${url.hostname}`)
    }
    return true
  }

  if (url.protocol !== 'https:') return false
  return whitelist.some((rule) => matchesHost(url.hostname, rule))
}

/** 容器导航决策：允许内嵌或交给系统浏览器 */
export function decideNavigation(
  rawUrl: string,
  whitelist: readonly string[],
  debug = false,
): NavigationDecision {
  return isUrlAllowed(rawUrl, whitelist, debug) ? 'allow' : 'external'
}

/** 用系统浏览器打开（防止钓鱼页内嵌） */
export function openInSystemBrowser(url: string): void {
  // #ifdef APP-PLUS
  plus.runtime.openURL(url)
  // #endif
  // #ifdef H5
  window.open(url, '_blank', 'noopener')
  // #endif
}
