import { promises as fs } from 'node:fs'
import type { ChangesFile } from './types.js'

/** 读取随版本发布的 changes.json；不存在时返回 undefined */
export async function readChanges(filePath: string): Promise<ChangesFile | undefined> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as ChangesFile
    if (typeof parsed.version !== 'string' || !Array.isArray(parsed.files)) {
      return undefined
    }
    return parsed
  } catch {
    return undefined
  }
}

/** 渲染为人类可读的迁移报告 */
export function renderChanges(changes: ChangesFile): string {
  const lines: string[] = [`Hydro 更新到 ${changes.version}`]

  lines.push('', '变更文件：')
  if (changes.files.length === 0) {
    lines.push('  （无）')
  } else {
    for (const file of changes.files) {
      if (typeof file === 'string') {
        lines.push(`  - ${file}`)
      } else {
        lines.push(`  - ${file.path}${file.description ? `：${file.description}` : ''}`)
      }
    }
  }

  lines.push('', 'BREAKING：')
  if (changes.breaking.length === 0) {
    lines.push('  （无）')
  } else {
    for (const item of changes.breaking) lines.push(`  - ${item}`)
  }

  return lines.join('\n')
}
