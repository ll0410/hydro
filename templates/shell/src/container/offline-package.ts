/**
 * 离线包管理（壳侧）。
 *
 * 下载 / 校验 / 解压 / 落盘由 HydroBridge 原生插件完成；这里负责版本协商、
 * 回滚策略与事件广播。浏览器环境（无原生插件）自动跳过安装。
 */

import { bridge } from '@hydro/bridge-sdk'

export interface OfflinePackageMeta {
  version: string
  from?: string
  installedAt: number
}

export interface OfflineLatest {
  app: string
  channel: string
  version: string
  downloadUrl: string
  signature: string
  deliverySignature: string
  diffAvailable: boolean
}

export interface OfflineNativeHost {
  current(): Promise<OfflinePackageMeta | null>
  download(url: string): Promise<{ path: string; crc?: string }>
  verify(zipPath: string, signature: string): Promise<boolean>
  install(zipPath: string): Promise<void>
  activate(version: string): Promise<void>
  /** 保留旧版本用于回滚 */
  rollback(): Promise<void>
  /** 命中离线包时返回本地地址，未命中返回 null */
  resolveRequest(url: string): Promise<string | null>
}

export interface OfflineCheckOptions {
  serverUrl: string
  app: string
  channel: string
  fetchImpl?: typeof fetch
  /** 调试用：跳过版本相同判断 */
  force?: boolean
}

export interface OfflineCheckResult {
  updated: boolean
  version?: string
  from?: string
  reason?: string
}

function nativeHost(): OfflineNativeHost | null {
  // #ifdef APP-PLUS
  try {
    return uni.requireNativePlugin('HydroBridge') as unknown as OfflineNativeHost
  } catch (error) {
    console.warn('[Hydro] 离线包原生插件不可用', error)
    return null
  }
  // #endif
  // #ifndef APP-PLUS
  return null
  // #endif
}

export class OfflinePackageManager {
  constructor(private readonly host: OfflineNativeHost | null = nativeHost()) {}

  /** 启动 / 进前台时检查更新：差量不可用时服务端回退全量包 */
  async checkUpdate(options: OfflineCheckOptions): Promise<OfflineCheckResult> {
    if (!this.host) {
      return { updated: false, reason: '浏览器环境跳过离线包安装' }
    }

    const fetchImpl = options.fetchImpl ?? fetch
    const query = `app=${encodeURIComponent(options.app)}&channel=${encodeURIComponent(options.channel)}`
    const response = await fetchImpl(`${options.serverUrl.replace(/\/$/, '')}/latest?${query}`)
    if (!response.ok) {
      return { updated: false, reason: `版本查询失败：HTTP ${response.status}` }
    }

    const latest = (await response.json()) as OfflineLatest
    const current = await this.host.current()
    if (!options.force && current?.version === latest.version) {
      return { updated: false, version: current.version, reason: '已是最新版本' }
    }

    const downloadUrl = latest.downloadUrl.startsWith('http')
      ? latest.downloadUrl
      : `${options.serverUrl.replace(/\/$/, '')}${latest.downloadUrl}`
    const downloaded = await this.host.download(downloadUrl)
    const verified = await this.host.verify(downloaded.path, latest.signature)
    if (!verified) {
      throw new Error('离线包校验失败（CRC / 签名不匹配）')
    }

    await this.host.install(downloaded.path)
    await this.host.activate(latest.version)

    bridge.emit('offlinePackageUpdated', {
      version: latest.version,
      from: current?.version,
    })

    return { updated: true, version: latest.version, from: current?.version }
  }

  /** 回滚到上一版本（保留旧包） */
  async rollback(): Promise<void> {
    if (!this.host) return
    await this.host.rollback()
  }

  /** 容器拦截：命中离线包返回本地地址，否则保持原 URL */
  async resolveRequest(url: string): Promise<string> {
    if (!this.host) return url
    const local = await this.host.resolveRequest(url)
    return local ?? url
  }
}

export const offlinePackageManager = new OfflinePackageManager()
