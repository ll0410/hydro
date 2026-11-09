import type { BridgeLogEntry } from './logger'

export interface VConsolePlugin {
  id: string
  name: string
  render(root: Element): void
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatPayload(value: unknown): string {
  try {
    return escapeHtml(JSON.stringify(value, null, 2))
  } catch {
    return '&lt;unserializable&gt;'
  }
}

/** 生成 Bridge 面板 HTML（纯函数，便于单测） */
export function buildBridgePanelHtml(entries: readonly BridgeLogEntry[], now = Date.now()): string {
  if (entries.length === 0) {
    return '<div class="hydro-bridge-empty">暂无桥接调用记录</div>'
  }

  const rows = entries
    .map(
      (entry) => `
      <details class="hydro-bridge-item">
        <summary>
          <span class="id">${escapeHtml(entry.id)}</span>
          <span class="name">${escapeHtml(entry.name)}</span>
          <span class="cost">${entry.cost}ms</span>
          <span class="code ${entry.code === 0 ? 'ok' : 'fail'}">code=${entry.code}</span>
        </summary>
        <pre class="request">${formatPayload(entry.request)}</pre>
        <pre class="response">${formatPayload(entry.response)}</pre>
      </details>`,
    )
    .join('')

  return `<div class="hydro-bridge-panel" data-updated-at="${now}">${rows}</div>`
}

/**
 * 构造 vConsole 自定义 tab：
 * 展示最近 200 条调用，点击可展开完整请求 / 响应报文。
 */
export function createBridgePanel(getEntries: () => readonly BridgeLogEntry[]): VConsolePlugin {
  return {
    id: 'hydro-bridge',
    name: 'Bridge',
    render(root: Element) {
      root.innerHTML = buildBridgePanelHtml(getEntries())
    },
  }
}
