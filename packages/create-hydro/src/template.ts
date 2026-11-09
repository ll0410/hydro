import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ManifestFile, TemplateMeta } from './types.js'

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.cjs',
  '.h',
  '.html',
  '.java',
  '.js',
  '.json',
  '.kt',
  '.less',
  '.m',
  '.md',
  '.mjs',
  '.scss',
  '.svg',
  '.swift',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
])

export async function readTemplateMeta(templateDir: string): Promise<TemplateMeta> {
  const raw = await fs.readFile(path.join(templateDir, 'template.json'), 'utf8')
  return JSON.parse(raw) as TemplateMeta
}

/** 模板变量替换：{{key}}，未声明的变量保持原样便于排查 */
export function renderString(content: string, variables: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? variables[key]! : match,
  )
}

export function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

export function shouldIgnore(relativePath: string, ignore: readonly string[]): boolean {
  return ignore.some((pattern) => {
    if (relativePath === pattern) return true
    if (relativePath.startsWith(`${pattern}/`)) return true
    return relativePath.split('/').includes(pattern)
  })
}

function isTextFile(fileName: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(fileName).toLowerCase())
}

export interface CopyTemplateOptions {
  templateDir: string
  targetDir: string
  /** manifest 中的路径前缀，如 apps/shell */
  prefix: string
  variables: Record<string, string>
  meta: TemplateMeta
}

/** 复制模板目录：文本文件渲染变量，二进制原样复制；返回文件 hash 清单 */
export async function copyTemplate(options: CopyTemplateOptions): Promise<ManifestFile[]> {
  const files: ManifestFile[] = []

  async function walk(sourceDir: string, relativeDir: string): Promise<void> {
    const entries = (await fs.readdir(sourceDir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )

    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      if (shouldIgnore(relativePath, options.meta.ignore)) continue

      const sourcePath = path.join(sourceDir, entry.name)
      if (entry.isDirectory()) {
        await walk(sourcePath, relativePath)
        continue
      }

      const raw = await fs.readFile(sourcePath)
      const output = isTextFile(entry.name)
        ? Buffer.from(renderString(raw.toString('utf8'), options.variables), 'utf8')
        : raw

      const targetPath = path.join(options.targetDir, relativePath)
      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.writeFile(targetPath, output)

      files.push({
        path: path.posix.join(options.prefix, relativePath),
        hash: sha256(output),
      })
    }
  }

  await walk(options.templateDir, '')
  return files
}
