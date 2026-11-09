import { ErrorCode } from '@hydro/shared'
import { describe, expect, it } from 'vitest'
import { buildBridgePanelHtml, createBridgePanel } from './panel'
import type { BridgeLogEntry } from './logger'

const entries: BridgeLogEntry[] = [
  {
    id: '9f2c1a',
    name: 'device.scan',
    cost: 42,
    code: ErrorCode.Success,
    ts: 1,
    request: { id: '9f2c1a', ns: 'device', method: 'scan', ts: 1 },
    response: { id: '9f2c1a', code: 0, data: { text: 'ok' } },
  },
  {
    id: '7d2f9c',
    name: 'pay.invoke',
    cost: 302,
    code: ErrorCode.Forbidden,
    ts: 2,
    request: { id: '7d2f9c', ns: 'pay', method: 'invoke', ts: 2 },
    response: { id: '7d2f9c', code: 403, msg: 'no permission' },
  },
]

describe('buildBridgePanelHtml', () => {
  it('空记录展示占位文案', () => {
    expect(buildBridgePanelHtml([])).toContain('暂无桥接调用记录')
  })

  it('渲染调用列表与状态码', () => {
    const html = buildBridgePanelHtml(entries)
    expect(html).toContain('device.scan')
    expect(html).toContain('42ms')
    expect(html).toContain('code=0')
    expect(html).toContain('code=403')
    expect(html).toContain('class="code fail"')
  })

  it('展开报文并转义 HTML 特殊字符', () => {
    const html = buildBridgePanelHtml([
      {
        ...entries[0]!,
        request: {
          id: '<script>',
          ns: 'ui',
          method: 'toast',
          ts: 1,
          params: { message: '<img src=x>' },
        },
      },
    ])
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;img src=x&gt;')
  })
})

describe('createBridgePanel', () => {
  it('返回 vConsole 插件结构并渲染到容器', () => {
    const panel = createBridgePanel(() => entries)
    expect(panel.id).toBe('hydro-bridge')
    expect(panel.name).toBe('Bridge')

    const root = { innerHTML: '' } as unknown as Element
    panel.render(root)
    expect(root.innerHTML).toContain('device.scan')
  })
})
