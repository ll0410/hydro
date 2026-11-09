import type { API, FileInfo } from 'jscodeshift'

/**
 * 示例 codemod：bridge.device.scanCode() → bridge.device.scan()
 *
 * 演示破坏性 API 重命名迁移，由 hydro codemod --yes 在业务文件上执行。
 */
export default function transform(file: FileInfo, api: API): string {
  const j = api.jscodeshift
  const root = j(file.source)
  let changed = false

  root.find(j.MemberExpression).forEach((path) => {
    const property = path.node.property
    if (property.type === 'Identifier' && property.name === 'scanCode') {
      property.name = 'scan'
      changed = true
    }
  })

  return changed ? root.toSource() : file.source
}
