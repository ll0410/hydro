/** debug 构建注入 vConsole，并挂载 bridge-sdk 的桥接面板。 */

import { bridge, createBridgePanel } from '@hydro/bridge-sdk'
import VConsole from 'vconsole'
import type { HydroConfig } from '../../hydro.config'

let installed = false

export function installDebugBridge(config: Pick<HydroConfig, 'debug'>): void {
  if (!config.debug || installed) return
  installed = true

  try {
    const vconsole = new VConsole({ theme: 'dark' })
    vconsole.addPlugin(createBridgePanel(() => bridge.logger.entries()))
    ;(window as unknown as Record<string, unknown>).__hydroVConsole = vconsole
    console.info('[Hydro] debug 构建：vConsole 与 Bridge 面板已注入')
  } catch (error) {
    console.warn('[Hydro] vConsole 注入失败', error)
  }
}
